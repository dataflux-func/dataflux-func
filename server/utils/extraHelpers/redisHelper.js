'use strict';

/* 3rd-party Modules */
var redis  = require('redis');
var async  = require('async');
var moment = require('moment-timezone');

/* Project Modules */
var CONFIG    = require('../yamlResources').get('CONFIG');
var toolkit   = require('../toolkit');
var logHelper = require('../logHelper');

/* Lua */
var LUA_UNLOCK_SCRIPT_KEY_COUNT = 1;
var LUA_UNLOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/* Init */

function getConfig(c, retryStrategy) {
  var config = {
    host: c.host,
    port: c.port,
    db  : c.db || c.database || 0,
    tls : c.useTLS ? { rejectUnauthorized: false } : null,
  };

  if (retryStrategy) {
    config.retry_strategy = retryStrategy;
  }

  if (c.password) {
    if (!c.user) {
      // Only password
      config.password = c.password;

    } else {
      // user and password
      if (c.authType === 'aliyun') {
        // Aliyun special auth type
        config.password = `${c.user}:${c.password}`;

      } else {
        // Default auth type
        config.user     = c.user;
        config.password = c.password;
      }
    }
  }

  return config;
};

/* Singleton Client */
var CLIENT_CONFIG  = null;
var CLIENT         = null;
var DEFAULT_LOGGER = logHelper.createHelper(null, null, 'DEFAULT_REDIS_CLIENT');

var SUB_CLIENT           = null;
var TASK_ON_RESPONSE_MAP = {};

/**
 * @constructor
 * @param  {Object} [logger=null]
 * @param  {Object} [config=null]
 * @return {Object} - Redis Helper
 */
var RedisHelper = function(logger, config) {
  var self = this;

  self.logger = logger || logHelper.createHelper();

  self.isDryRun = false;
  self.skipLog  = false;
  self.checkedKeyMap = {};

  self.retryStrategy = function(options) {
    if (self.client && self.client === CLIENT) {
      // Restart system only for system Redis connecting error eccured
      self.logger.error(`Redis: ${options.error}`)
      self.logger.error('Redis connection error, system exit');
      toolkit.sysExitRestart();

    } else {
      // Normal behavior for other Redis
      self.logger.warning('[REDIS] Reconnect...');
      return Math.min(options.attempt * 100, 3000);
    }
  };

  if (config) {
    var _retryStrategy = config.disableRetry ? null : self.retryStrategy;

    self.config = toolkit.noNullOrWhiteSpace(config);

    self.config.tsMaxAge      = config.tsMaxAge      || 3600 * 24;
    self.config.tsMaxPeriod   = config.tsMaxPeriod   || 3600 * 24 * 3;
    self.config.tsMinInterval = config.tsMinInterval || 60;

    self.client = redis.createClient(getConfig(self.config, _retryStrategy));

    // Error handling
    self.client.on('error', function(err) {
      self.logger.error(`[REDIS ERROR] ${err}`);

      if ('function' === typeof config.errorCallback) {
        config.errorCallback(err);
      }
    });

  } else {
    if (!CLIENT) {
      CLIENT_CONFIG = toolkit.noNullOrWhiteSpace({
        host    : CONFIG.REDIS_HOST,
        port    : CONFIG.REDIS_PORT,
        db      : CONFIG.REDIS_DATABASE,
        user    : CONFIG.REDIS_USER,
        password: CONFIG.REDIS_PASSWORD,
        useTLS  : CONFIG.REDIS_USE_TLS,
        authType: CONFIG.REDIS_AUTH_TYPE,
      });

      CLIENT_CONFIG.tsMaxAge      = CONFIG.REDIS_TS_MAX_AGE;
      CLIENT_CONFIG.tsMaxPeriod   = CONFIG.REDIS_TS_MAX_PERIOD;
      CLIENT_CONFIG.tsMinInterval = CONFIG.REDIS_TS_MIN_INTERVAL;

      CLIENT = redis.createClient(getConfig(CLIENT_CONFIG, self.retryStrategy));

      // Error handling
      CLIENT.on('error', function(err) {
        DEFAULT_LOGGER.error(`[REDIS ERROR] ${err}`);
      });
    }

    self.config = CLIENT_CONFIG;
    self.client = CLIENT;
  }

  // Handling pub-sub message
  self.topicHandlerMap = {};

  // Get server time diff
  self.timeDiffMs = 0;
  self.client.time(function(_, redisTime) {
    var redisTimeMs = parseInt(parseInt(redisTime[0]) * 1000 + parseInt(redisTime[1]) / 1000);
    var localTimeMs = Date.now();
    self.timeDiffMs = localTimeMs - redisTimeMs;
  })
};

/**
 * Init Redis sub client.
 */
RedisHelper.prototype.initSubClient = function() {
  var self = this;

  if (self.subClient) return;

  self.subClient = self.client.duplicate();
  self.subBuffer = toolkit.createLimitedBuffer(CONFIG._SUB_BUFFER_LIMIT);

  self.subClient.on('pmessage', function(_pattern, _channel, _message) {
    if (!self.topicHandlerMap[_pattern]) return;

    if (!self.skipLog) {
      self.logger.debug('[REDIS] Receive <- Topic: `{0}`, Length: {1}', _channel, _message.length);
    }

    // Put Sub Buffer
    var task = {
      handlerKey: _pattern,
      topic     : _channel,
      message   : _message,
    }
    self.subBuffer.put(task);
  });

  self.subClient.on('error', function(err) {
    self.logger.error(`[REDIS ERROR] ${err}`);
  });
};

RedisHelper.prototype.end = function() {
  this.logger.info(`[REDIS] End`);

  if (this.client) {
    this.client.end(true);
  }
  this.client = null;

  if (this.subClient) {
    this.subClient.end(true);
  }
  this.subClient = null;
};

/**
 * Run a Redis command.
 *
 * @param  {String} command - Redis command
 * @param  {...*} arguments - Redis command arguments
 * @return {undefined}
 */
RedisHelper.prototype.run = function() {
  var args = Array.prototype.slice.call(arguments);
  var command = args.shift();

  if (!this.skipLog) {
    if (args[0]) {
      var debugArgs = '';
      if ('string' === typeof args[0]) {
        debugArgs = toolkit.toDebugText(args[0])
      } else if (Array.isArray(args[0])) {
        debugArgs = toolkit.toDebugText(args[0].join(' '))
      }

      var nonFnArgs = args.filter(function(arg) {
        return 'function' !== typeof arg;
      });
      if (nonFnArgs.length > 1) debugArgs += ' ...';

      this.logger.debug('[REDIS] Run `{0} {1}`', command.toUpperCase(), debugArgs);
    } else {
      this.logger.debug('[REDIS] Run `{0}`', command.toUpperCase());
    }
  }

  return this.client[command].apply(this.client, args);
};

// DB
RedisHelper.prototype.dbsize = function(callback) {
  return this.run('dbsize', callback);
};

RedisHelper.prototype.info = function(callback) {
  return this.run('info', callback);
};

// Generic
RedisHelper.prototype.getTimestampMs = function() {
  return parseInt(Date.now() - this.timeDiffMs);
};

RedisHelper.prototype.getTimestamp = function(ndigits) {
  var t = this.getTimestampMs() / 1000;

  ndigits = ndigits || 0;
  if (ndigits === 0) {
    return parseInt(t);
  } else {
    return parseFloat(t.toFixed(ndigits));
  }
};

RedisHelper.prototype.type = function(key, callback) {
  this.run('type', key, function(err, cacheRes) {
    if (err) return callback(err);

    var dataType = cacheRes;
    if (dataType === 'none') return callback(null, null);

    return callback(null, dataType);
  });
};

RedisHelper.prototype.keys = function(pattern, limit, callback) {
  if ('function' === typeof limit && !callback) {
    callback  = limit;
    limit = null;
  }

  var self = this;

  var ITER_LIMIT = 1000;

  var foundKeys  = {};
  var nextCursor = 0;
  async.doUntil(function(untilCallback) {
    self.run('scan', nextCursor, 'MATCH', pattern, 'COUNT', ITER_LIMIT, function(err, dbRes) {
      if (err) return untilCallback(err);

      nextCursor = dbRes[0];

      var keys = dbRes[1];
      if (Array.isArray(keys) && keys.length > 0) {
        keys.forEach(function(k) {
          foundKeys[k] = true;
        });
      }

      return untilCallback();
    });

  }, function() {
    return parseInt(nextCursor) === 0 || (limit && Object.keys(foundKeys).length >= limit);

  }, function(err) {
    if (err) return callback(err);

    foundKeys = Object.keys(foundKeys);
    if (limit) foundKeys = foundKeys.slice(0, limit);

    return callback(null, foundKeys);
  });
};

RedisHelper.prototype.exists = function(key, callback) {
  this.run('exists', key, function(err, cacheRes) {
    if (err) return callback(err);
    return callback(err, toolkit.toBoolean(cacheRes));
  });
};

RedisHelper.prototype.expire = function(key, expires, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if (expires <= 0) expires = 1;
  return this.run('expire', key, expires, callback);
};

RedisHelper.prototype.expireat = function(key, timestamp, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('expireat', key, timestamp, callback);
};

RedisHelper.prototype.ttl = function(key, callback) {
  return this.run('ttl', key, callback);
};

RedisHelper.prototype.pttl = function(key, callback) {
  return this.run('pttl', key, callback);
};

RedisHelper.prototype.del =
RedisHelper.prototype.delete = function(keys, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  keys = toolkit.asArray(keys);
  if (toolkit.isNothing(keys)) return callback(null, 0);

  return this.run('del', keys, callback);
};

// String
RedisHelper.prototype.set = function(key, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('set', key, value, callback);
};

RedisHelper.prototype.setex = function(key, maxAge, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if (maxAge <= 0) maxAge = 1;
  return this.run('setex', key, maxAge, value, callback);
};

RedisHelper.prototype.setnx = function(key, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('setnx', key, value, callback);
};

RedisHelper.prototype.mset = function(keyValues, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if (toolkit.isNothing(keyValues)) return callback(null, 0);

  if (!Array.isArray(keyValues)) {
    var tmp = []
    for (var k in keyValues) {
      tmp.push(k, keyValues[k]);
    }
    keyValues = tmp;
  }
  return this.run('mset', keyValues, callback);
};

RedisHelper.prototype.get = function(key, callback) {
  return this.run('get', key, callback);
};

RedisHelper.prototype.mget = function(keys, callback) {
  keys = toolkit.asArray(keys);
  if (toolkit.isNothing(keys)) return callback(null, {});

  return this.run('mget', keys, callback);
};

RedisHelper.prototype.getset = function(key, value, callback) {
  if (this.isDryRun) {
    return this.run('get', key, callback);
  } else {
    return this.run('getset', key, value, callback);
  }
};

RedisHelper.prototype.incr = function(key, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('incr', key, callback);
};

RedisHelper.prototype.incrby = function(key, step, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if ('undefined' === typeof step) step = 1;
  return this.run('incrby', key, step, callback);
};

// Hash
RedisHelper.prototype.hkeys = function(key, pattern, callback) {
  var self = this;

  var result = {};

  var ITER_LIMIT = 1000;
  var nextCursor  = 0;
  async.doUntil(function(untilCallback) {
    self.run('hscan', key, nextCursor, 'MATCH', pattern, 'COUNT', ITER_LIMIT, function(err, dbRes) {
      if (err) return untilCallback(err);

      nextCursor = dbRes[0];

      var keyValues = dbRes[1];
      if (Array.isArray(keyValues) && keyValues.length > 0) {
        for (var i = 0; i < keyValues.length; i += 2) {
          var key   = keyValues[i];
          var value = keyValues[i + 1];
          result[key] = value;
        }
      }

      return untilCallback();
    });

  }, function() {
    return parseInt(nextCursor) === 0;

  }, function(err) {
    if (err) return callback(err);
    return callback(null, Object.keys(result));
  });
};

RedisHelper.prototype.hset = function(key, field, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('hset', key, field, value, callback);
};

RedisHelper.prototype.hmset = function(key, fieldValues, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if (toolkit.isNothing(fieldValues)) return callback(null, 0);
  return this.run('hmset', key, fieldValues, callback);
};

RedisHelper.prototype.hsetnx = function(key, field, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('hsetnx', key, field, value, callback);
};

RedisHelper.prototype.hget = function(key, field, callback) {
  return this.run('hget', key, field, callback);
};

RedisHelper.prototype.hmget = function(key, fields, callback) {
  fields = toolkit.asArray(fields);
  if (toolkit.isNothing(fields)) return callback(null, {});

  return this.run('hmget', key, fields, function(err, cacheRes) {
    if (err) return callback(err);

    var res = {};
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i];
      var v = cacheRes[i];
      res[k] = v;
    }

    return callback(null, res);
  });
};

RedisHelper.prototype.hgetall = function(key, callback) {
  return this.run('hgetall', key, callback);
};

RedisHelper.prototype.hincr = function(key, field, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('hincrby', key, field, 1, callback);
};

RedisHelper.prototype.hincrby = function(key, field, step, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if ('undefined' === typeof step) step = 1;
  return this.run('hincrby', key, field, step, callback);
};

RedisHelper.prototype.hdel = function(key, field, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  var fields = toolkit.asArray(field);
  if (toolkit.isNothing(fields)) return callback(null, 0);
  return this.run('hdel', key, fields, callback);
};

// List
RedisHelper.prototype.lpush =
RedisHelper.prototype.push = function(key, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  var values = toolkit.asArray(value);
  if (toolkit.isNothing(values)) return callback(null, 0);

  return this.run('lpush', key, values, callback);
};
RedisHelper.prototype.pushLimit = function(key, value, limit, callback) {
  var self = this;

  if (self.isDryRun) return callback(null, 'OK');

  var values = toolkit.asArray(value);
  if (toolkit.isNothing(values)) return callback(null, 0);

  return self.run('lpush', key, values, function(err) {
    if (err) return callback(err);

    self.run('ltrim', key , 0, limit, callback);
  });
};

RedisHelper.prototype.rpush = function(key, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  var values = toolkit.asArray(value);
  if (toolkit.isNothing(values)) return callback(null, 0);

  return this.run('rpush', key, values, callback);
};

RedisHelper.prototype.lpop = function(key, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('lpop', key, callback);
};

RedisHelper.prototype.rpop =
RedisHelper.prototype.pop = function(key, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('rpop', key, callback);
};

RedisHelper.prototype.rpoplpush = function(key, destKey, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('rpoplpush', key, destKey, callback);
};

RedisHelper.prototype.llen = function(key, callback) {
  return this.run('llen', key, callback);
};

RedisHelper.prototype.lrange = function(key, start, stop, callback) {
  return this.run('lrange', key, start, stop, callback);
};

RedisHelper.prototype.ltrim = function(key, start, stop, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  return this.run('ltrim', key, start, stop, callback);
};

// Set
RedisHelper.prototype.sadd = function(key, member, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  var members = toolkit.asArray(member);
  if (toolkit.isNothing(members)) return callback(null, 0);

  return this.run('sadd', key, members, callback);
};

RedisHelper.prototype.srem = function(key, member, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  var members = toolkit.asArray(member);
  if (toolkit.isNothing(members)) return callback(null, 0);

  return this.run('srem', key, members, callback);
};

RedisHelper.prototype.scard = function(key, callback) {
  return this.run('scard', key, callback);
};

RedisHelper.prototype.smembers = function(key, callback) {
  return this.run('smembers', key, callback);
};

RedisHelper.prototype.sismember = function(key, member, callback) {
  return this.run('sismember', key, member, callback);
};

// ZSet
RedisHelper.prototype.zadd = function(key, memberScores, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if (!Array.isArray(memberScores)) {
    var tmp = []
    for (var k in memberScores) {
      tmp.push(memberScores[k], k);
    }
    memberScores = tmp;
  }
  return this.run('zadd', key, memberScores, callback);
};

RedisHelper.prototype.zrem = function(key, member, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  var members = toolkit.asArray(member);
  if (toolkit.isNothing(members)) return callback(null, 0);

  return this.run('zrem', key, members, callback);
};

RedisHelper.prototype.zcard = function(key, callback) {
  return this.run('zcard', key, callback);
};

RedisHelper.prototype.zrange = function(key, start, stop, withScores, callback) {
  if ('function' === typeof withScores && !callback) {
    callback   = withScores;
    withScores = false;
  }

  if (toolkit.isNothing(start)) start = 0;
  if (toolkit.isNothing(stop))  stop  = -1;

  var args = [ start, stop ];
  if (withScores) args.push('WITHSCORES');

  return this.run('zrange', key, args, callback);
};

// Pub / Sub
/**
 * Publish to topic
 *
 * @param  {String}        topic
 * @param  {String|buffer} message
 * @param  {Object}        options *No options for Redis.pub*
 * @param  {Function}      callback
 * @return {undefined}
 */
RedisHelper.prototype.publish
RedisHelper.prototype.pub = function(topic, message, options, callback) {
  var self = this;

  options = options || {};

  if (!this.skipLog) {
    this.logger.debug('[REDIS] Pub -> `{0}`', topic);
  }

  return this.client.publish(topic, message, callback);
};

// Extend
RedisHelper.prototype._keys = function(pattern, callback) {
  var self = this;

  var ITER_LIMIT = 1000;

  var foundKeys  = {};
  var nextCursor = 0;
  async.doUntil(function(untilCallback) {
    self.client.scan(nextCursor, 'MATCH', pattern, 'COUNT', ITER_LIMIT, function(err, dbRes) {
      if (err) return untilCallback(err);

      nextCursor = dbRes[0];

      var keys = dbRes[1];
      if (Array.isArray(keys) && keys.length > 0) {
        keys.forEach(function(k) {
          foundKeys[k] = true;
        });
      }

      return untilCallback();
    });

  }, function() {
    return parseInt(nextCursor) === 0;

  }, function(err) {
    if (err) return callback(err);

    foundKeys = Object.keys(foundKeys);
    return callback(null, foundKeys);
  });
};

RedisHelper.prototype.setexnx = function(key, maxAge, value, callback) {
  if (this.isDryRun) return callback(null, 'OK');

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] SETEXNX `{0}`', key);
  }

  if (maxAge <= 0) maxAge = 1;
  return this.client.set(key, value, 'EX', maxAge, 'NX', callback);
};

RedisHelper.prototype.getWithTTL = function(key, callback) {
  var self = this;

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] GET with TTL `{0}`', key);
  }

  var result = {
    value: null,
    ttl  : null,
  }
  async.series([
    function(asyncCallback) {
      self.client.get(key, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (!cacheRes) return callback(null, result);

        try {
          cacheRes = JSON.parse(cacheRes)
        } catch(err) {
          // Nope
        }

        result.value = cacheRes;

        return asyncCallback();
      });
    },
    function(asyncCallback) {
      self.client.ttl(key, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        result.ttl = cacheRes;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);
    return callback(null, result);
  });
};

/**
 * Get keys by pattern.
 *
 * @param  {String} pattern - Key pattern
 * @param  {Function} callback
 * @return {undefined}
 */
RedisHelper.prototype.getPattern = function(pattern, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] GET pattern `{0}`', pattern);
  }

  self._keys(pattern, function(err, keys) {
    if (err) return callback && callback(err);

    if (keys.length <= 0) {
      return callback && callback();
    } else {
      return self.client.mget(keys, function(err, cacheRes) {
        if (Array.isArray(cacheRes)) {
          var ret = {};
          for (var i = 0; i < keys.length; i++) {
            if (toolkit.isNullOrUndefined(cacheRes[i])) continue;
            ret[keys[i]] = cacheRes[i];
          }
          return callback(null, ret);

        } else {
          return callback(null, cacheRes);
        }
      });
    }
  });
};

/**
 * Delete keys by pattern.
 *
 * @param  {String} pattern - Key pattern
 * @param  {Function} callback
 * @return {undefined}
 */
RedisHelper.prototype.deletePattern = function(pattern, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] DEL pattern `{0}`', pattern);
  }

  self._keys(pattern, function(err, keys) {
    if (err) return callback && callback(err);

    if (keys.length <= 0) {
      return callback && callback();
    } else {
      self.client.del(keys, function(err, count) {
        return callback && callback(err, count, keys);
      });
    }
  });
};

RedisHelper.prototype._hkeys = function(key, pattern, callback) {
  var self = this;

  var result = {};

  var ITER_LIMIT = 1000;
  var nextCursor  = 0;
  async.doUntil(function(untilCallback) {
    self.client.hscan(key, nextCursor, 'MATCH', pattern, 'COUNT', ITER_LIMIT, function(err, dbRes) {
      if (err) return untilCallback(err);

      nextCursor = dbRes[0];

      var keyValues = dbRes[1];
      if (Array.isArray(keyValues) && keyValues.length > 0) {
        for (var i = 0; i < keyValues.length; i += 2) {
          var key   = keyValues[i];
          var value = keyValues[i + 1];
          result[key] = value;
        }
      }

      return untilCallback();
    });

  }, function() {
    return parseInt(nextCursor) === 0;

  }, function(err) {
    if (err) return callback(err);

    return callback(null, result);
  });
};

/**
 * Get hash fields by pattern.
 *
 * @param  {String} key
 * @param  {String} pattern - field pattern
 * @param  {Function} callback
 * @return {undefined}
 */
RedisHelper.prototype.hgetPattern = function(key, pattern, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] HGET pattern `{0}` `{1}`', key, pattern);
  }

  self._hkeys(key, pattern, function(err, fieldValues) {
    if (err) return callback && callback(err);
    return callback(null, fieldValues);
  });
};

RedisHelper.prototype.hkeysExpires = function(key, expires, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] HKEYS expires `{0}` `{1}` `{2}`', key, expires);
  }

  var now = toolkit.getTimestamp();

  self.client.hgetall(key, function(err, fieldValues) {
    if (err) return callback && callback(err);

    var res = {};
    for (var k in fieldValues) {
      var v = JSON.parse(fieldValues[k]);

      if (!expires) {
        res[k] = v;
      } else {
        var ts = v.ts || v.timestamp;
        if (ts && ts + expires > now) res[k] = v;
      }
    }

    return callback(null, Object.keys(res));
  });
};

RedisHelper.prototype.hgetExpires = function(key, field, expires, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] HGET expires `{0}` `{1}` `{2}`', key, field, expires);
  }

  var now = toolkit.getTimestamp();

  self.client.hget(key, field, function(err, cacheRes) {
    if (err) return callback(err);
    if (!cacheRes) return callback();

    cacheRes = JSON.parse(cacheRes);

    if (!expires) {
      return callback(null, cacheRes);
    } else {
      var ts = cacheRes.ts || cacheRes.timestamp;
      if (ts && ts + expires > now) return callback(null, cacheRes);
    }

    return callback();
  })
};

RedisHelper.prototype.hgetallExpires = function(key, expires, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] HGETALL expires `{0}` `{1}`', key, expires);
  }

  var now = toolkit.getTimestamp();

  self.client.hgetall(key, function(err, fieldValues) {
    if (err) return callback && callback(err);

    var res = {};
    for (var k in fieldValues) {
      var v = JSON.parse(fieldValues[k]);

      if (!expires) {
        res[k] = v;
      } else {
        var ts = v.ts || v.timestamp;
        if (ts && ts + expires > now) res[k] = v;
      }
    }

    return callback(null, res);
  });
};

RedisHelper.prototype.hgetPatternExpires = function(key, pattern, expires, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] HGET pattern expires `{0}` `{1}` `{2}`', key, pattern, expires);
  }

  var now = toolkit.getTimestamp();

  self._hkeys(key, pattern, function(err, fieldValues) {
    if (err) return callback && callback(err);

    var res = {};
    for (var k in fieldValues) {
      var v = JSON.parse(fieldValues[k]);

      if (!expires) {
        res[k] = v;
      } else {
        var ts = v.ts || v.timestamp;
        if (ts && ts + expires > now) res[k] = v;
      }
    }

    return callback(null, res);
  });
};

/**
 * Delete hash fields by pattern.
 * @param  {String} key
 * @param  {String} pattern - field pattern
 * @param  {Function} callback
 * @return {undefined}
 */
RedisHelper.prototype.hdelPattern = function(key, pattern, callback) {
  var self = this;

  if (self.isDryRun) return callback();

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] HDEL pattern `{0}` `{1}`', key, pattern);
  }

  self._hkeys(key, pattern, function(err, fieldValues) {
    if (err) return callback && callback(err);

    var fields = Object.keys(fieldValues);

    if (fields.length <= 0) {
      return callback && callback();
    } else {
      self.client.hdel(key, fields, function(err, count) {
        return callback && callback(err, count, fields);
      });
    }
  });
};

RedisHelper.prototype.pagedList = function(key, paging, callback) {
  var self = this;

  paging = {
    pageSize  : paging.pageSize   || 20,
    pageNumber: paging.pageNumber || 1,
  };

  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] PAGED LIST `{0}` PageNumber={1}, pageSize={2}', key, paging.pageNumber, paging.pageSize);
  }

  var data = null;
  var pageInfo = {
    pagingStyle: 'normal',
    pageSize   : paging.pageSize,
    count      : null,
    totalCount : null,
    pageNumber : paging.pageNumber,
    pageCount  : null,
    isFirstPage: paging.pageNumber <= 1,
  }

  async.series([
    // Get total length
    function(asyncCallback) {
      self.client.llen(key, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        var listLength = parseInt(cacheRes);
        pageInfo.totalCount = listLength;
        pageInfo.pageCount  = Math.ceil(listLength / paging.pageSize);

        return asyncCallback();
      });
    },
    // Get data
    function(asyncCallback) {
      var start = (paging.pageNumber - 1) * paging.pageSize;
      var stop  = start + paging.pageSize - 1;
      self.client.lrange(key, start, stop, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        data = cacheRes;
        for (let i = 0; i < data.length; i++) {
          try { data[i] = JSON.parse(data[i]); } catch(_) {}
        }

        pageInfo.count = data.length;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);
    return callback(null, data, pageInfo);
  });
};

/**
 * Subscribe from topic
 *
 * @param  {String}    topic
 * @param  {Function}  handler
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.sub = function(topic, handler, callback) {
  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] SUB `{0}`', topic);
  }

  this.initSubClient();
  this.topicHandlerMap[topic] = handler;

  return this.subClient.psubscribe(topic, callback);
};

/**
 * Unsubscribe from topic
 *
 * @param  {String}    topic
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.unsub = function(topic, callback) {
  if (!this.skipLog) {
    this.logger && this.logger.debug('[REDIS EXT] UNSUB `{0}`', topic);
  }

  this.initSubClient();
  delete this.topicHandlerMap[topic];

  return this.subClient.punsubscribe(topic, callback);
};

/**
 * Consume message from buffer
 *
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.consume = function(callback) {
  for (var i = 0; i < this.subBuffer.length; i++) {
    var task = this.subBuffer.get();

    if (!this.skipLog) {
      if (task) {
        this.logger && this.logger.debug('[REDIS EXT] CONSUME `{0}`', task.topic);
      } else {
        this.logger && this.logger.debug('[REDIS EXT] CONSUME nothing');
      }
    }

    if (!task) return callback();

    var handler = this.topicHandlerMap[task.handlerKey];
    if (!handler) continue;

    return handler(task.topic, task.message, null, function(err, taskResp) {
      var handleInfo = {
        message : task.message.toString(),
        taskResp: taskResp,
        error   : err,
      }
      return callback(null, handleInfo);
    });
  }

  return callback();
};

/**
 * Lock by key
 *
 * @param  {String}    lockKey
 * @param  {String}    lockValue
 * @param  {Integer}   maxLockTime
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.lock = function(lockKey, lockValue, maxLockTime, callback) {
  if (!this.skipLog) {
    this.logger && this.logger.debug('[REDIS EXT] LOCK `{0}`', lockKey);
  }

  if (maxLockTime <= 0) maxLockTime = 1;
  return this.client.set(lockKey, lockValue, 'EX', maxLockTime, 'NX', callback);
};

/**
 * Lock by key (blocking)
 *
 * @param  {String}    lockKey
 * @param  {String}    lockValue
 * @param  {Integer}   maxLockTime
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.lockWait = function(lockKey, lockValue, maxLockTime, maxWaitTime, callback) {
  var self = this;

  if (!this.skipLog) {
    this.logger && this.logger.debug('[REDIS EXT] LOCK wait `{0}`', lockKey);
  }

  if (maxLockTime <= 0) maxLockTime = 1;
  if (maxWaitTime <= 0) maxWaitTime = 1;

  var interval = 300;
  var times    = Math.ceil(maxWaitTime * 1000 / interval);

  async.retry({ times: times, interval: interval }, function(asyncCallback) {
    self.client.set(lockKey, lockValue, 'EX', maxLockTime, 'NX', function(err, cacheRes) {
      if (err) return asyncCallback(err);

      if (!cacheRes) {
        return asyncCallback(new Error('Lock holded by other'));
      } else {
        return asyncCallback(null, 'OK');
      }
    });
  }, function(err) {
    if (err) return callback(new Error('Wait Lock timeout.'));
    return callback();
  });
};

/**
 * Extend lock time
 *
 * @param  {String}    lockKey
 * @param  {String}    lockValue
 * @param  {Integer}   maxLockTime
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.extendLockTime = function(lockKey, lockValue, maxLockTime, callback) {
  var self = this;

  if (!this.skipLog) {
    this.logger && this.logger.debug('[REDIS EXT] LOCK extend `{0}`', lockKey);
  }

  if (maxLockTime <= 0) maxLockTime = 1;
  self.client.get(lockKey, function(err, cacheRes) {
    if (err) return callback && callback(err);

    if (cacheRes !== lockValue) {
      return callback && callback(new Error('Not lock owner'));
    }

    return self.client.expire(lockKey, maxLockTime, callback);
  });
};

/**
 * Unlock by key
 *
 * @param  {String}    lockKey
 * @param  {String}    lockValue
 * @param  {Function}  callback
 * @return {undefined}
 */
RedisHelper.prototype.unlock = function(lockKey, lockValue, callback) {
  if (!this.skipLog) {
    this.logger && this.logger.debug('[REDIS EXT] UNLOCK `{0}`', lockKey);
  }

  return this.run('EVAL', LUA_UNLOCK_SCRIPT, LUA_UNLOCK_SCRIPT_KEY_COUNT, lockKey, lockValue, callback);
};

/**
 * Add time-series point
 *
 * @param  {String}   key
 * @param  {Object}   options
 * @param  {Integer}  options.timestamp
 * @param  {*}        options.value
 * @param  {String}   options.mode
 * @param  {Function} callback
 * @return {undefined}
 */
RedisHelper.prototype.tsAdd = function(key, options, callback) {
  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] TS Add `{0}`', key);
  }

  var self = this;

  if (arguments.length === 2) {
    callback = options;
    options  = null;
  }

  options = options || {};
  var timestamp = options.timestamp || toolkit.getTimestamp();
  var value     = options.value     || 0;
  var mode      = options.mode      || 'update';

  // Align timestamp according to min interval
  timestamp = parseInt(timestamp / this.config.tsMinInterval) * this.config.tsMinInterval;

  if (self.isDryRun) return callback(null, 'OK');

  async.series([
    function(asyncCallback) {
      if (self.checkedKeyMap[key]) return asyncCallback();

      self.client.type(key, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        self.checkedKeyMap[key] = true;

        if (cacheRes !== 'zset') {
          return self.client.del(key, asyncCallback);
        }

        return asyncCallback();
      });
    },
    function(asyncCallback) {
      if (mode.toLowerCase() !== 'addup') return asyncCallback();

      self.client.zrangebyscore(key, timestamp, timestamp, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (toolkit.isNothing(cacheRes)) return asyncCallback();

        var p = cacheRes[0];
        var sepIndex  = p.indexOf(',');
        var prevValue = JSON.parse(p.slice(sepIndex + 1));

        value += parseFloat(prevValue);

        return asyncCallback();
      });
    },
    function(asyncCallback) {
      return self.client.zremrangebyscore(key, timestamp, timestamp, asyncCallback);
    },
    function(asyncCallback) {
      value = JSON.stringify(value);
      var data = [timestamp, value].join(',');
      self.client.zadd(key, timestamp, data, asyncCallback);
    },
    function(asyncCallback) {
      self.client.expire(key, self.config.tsMaxAge, asyncCallback);
    },
    function(asyncCallback) {
      if (!self.config.tsMaxPeriod) return asyncCallback();

      var minTimestamp = toolkit.getTimestamp() - self.config.tsMaxPeriod;
      self.client.zremrangebyscore(key, '-inf', minTimestamp, asyncCallback);
    },
  ], function(err) {
    if (err) return callback(err);
    return callback();
  });
};

/**
 * Get time-series points
 *
 * @param  {String}   key
 * @param  {Object}   options
 * @param  {Integer}  options.start
 * @param  {Integer}  options.stop
 * @param  {Integer}  options.groupTime   Group by seconds
 * @param  {String}   options.agg         count, avg, sum, min, max
 * @param  {Integer}  options.scale
 * @param  {Integer}  options.ndigits
 * @param  {Integer}  options.timeUnit        ms, s
 * @param  {Boolean}  options.dictOutput
 * @param  {Integer}  options.limit
 * @param  {Function} callback
 * @return {undefined}
 */
RedisHelper.prototype.tsGet = function(key, options, callback) {
  if (!this.skipLog) {
    this.logger.debug('[REDIS EXT] TS Get `{0}`', key);
  }

  var self = this;

  if (arguments.length === 2) {
    callback = options;
    options  = null;
  }

  options = options || {};
  options.start      = options.start      || '-inf';
  options.stop       = options.stop       || '+inf';
  options.groupTime  = options.groupTime  || 1;
  options.agg        = options.agg        || 'avg';
  options.scale      = options.scale      || 1;
  options.ndigits    = options.ndigits    || 2;
  options.timeUnit   = options.timeUnit   || 's';
  options.dictOutput = options.dictOutput || false;
  options.limit      = options.limit      || null;
  options.fillZero   = options.fillZero   || false;

  var tsData = [];
  async.series([
    function(asyncCallback) {
      self.client.type(key, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (cacheRes !== 'zset') {
          return self.client.del(key, asyncCallback);
        }

        return asyncCallback();
      });
    },
    function(asyncCallback) {
      self.client.zrangebyscore(key, options.start, options.stop, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        tsData = cacheRes.map(function(p) {
          var sepIndex  = p.indexOf(',');
          var timestamp = parseInt(p.slice(0, sepIndex));
          var value     = JSON.parse(p.slice(sepIndex + 1));
          return [timestamp, value];
        });

        if (tsData.length > 0 && options.groupTime && options.groupTime >= 1) {
          var temp = [];

          // var latestTimestamp = tsData[tsData.length - 1][0];
          tsData.forEach(function(d) {
            var groupedTimestamp = parseInt(d[0] / options.groupTime) * options.groupTime;
            // var groupedTimestamp = latestTimestamp - parseInt((latestTimestamp - d[0]) / options.groupTime) * options.groupTime

            if (temp.length <= 0 || temp[temp.length - 1][0] !== groupedTimestamp) {
              temp.push([groupedTimestamp, [d[1]]]);
            } else {
              temp[temp.length - 1][1].push(d[1]);
            }
          });

          temp.forEach(function(d) {
            switch(options.agg) {
              case 'count':
                d[1] = d[1].length;
                break;

              case 'avg':
                var count = d[1].length;
                d[1] = d[1].reduce(function(acc, x) {
                  return acc + x;
                }, 0) / count;
                break;

              case 'sum':
                d[1] = d[1].reduce(function(acc, x) {
                  return acc + x;
                }, 0);
                break;

              case 'min':
                d[1] = Math.min.apply(null, d[1]);

                break;
              case 'max':
                d[1] = Math.max.apply(null, d[1]);
                break;
            }
          });

          if (options.fillZero) {
            var zeroFillMap = temp.reduce(function(acc, d) {
              acc[d[0]] = d[1];
              return acc;
            }, {});

            var _nextTemp = []
            for (var ts = temp[0][0]; ts <= temp[temp.length - 1][0]; ts += options.groupTime) {
              _nextTemp.push([ts, zeroFillMap[ts] || 0]);
            }
            temp = _nextTemp;
          }

          tsData = temp;
        }

        if (options.limit) {
          tsData = tsData.slice(-1 * options.limit);
        }

        tsData.forEach(function(d) {
          if ('number' === typeof d[1]) {
            if (options.scale && options.scale != 1) {
              d[1] = d[1] / options.scale;
            }

            if (options.ndigits > 0) {
              d[1] = parseFloat(d[1].toFixed(options.ndigits));
            } else {
              d[1] = parseInt(d[1]);
            }
          }

          if (options.timeUnit === 'ms') {
            d[0] = d[0] * 1000;
          }
        });

        if (options.dictOutput) {
          tsData = tsData.map(function(d) {
            return { t: d[0], v: d[1] };
          });
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);
    return callback(null, tsData);
  });
};

RedisHelper.prototype.tsMget = function(keys, options, callback) {
  var self = this;

  var tsDataMap = {};

  if (toolkit.isNothing(keys)) return callback(null, tsDataMap);

  async.eachLimit(keys, 5, function(key, eachCallback) {
    self.tsGet(key, options, function(err, tsData) {
      if (err) return eachCallback(err);

      tsDataMap[key] = tsData;

      return eachCallback();
    });
  }, function(err) {
    if (err) return callback(err);
    return callback(err, tsDataMap);
  });
};

RedisHelper.prototype.tsGetPattern = function(pattern, options, callback) {
  var self = this;

  var tsDataMap = {};
  var keys = null;
  async.series([
    function(asyncCallback) {
      self._keys(pattern, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        keys = cacheRes;
        return asyncCallback();
      });
    },
    function(asyncCallback) {
      self.tsMget(keys, options, function(err, _tsDataMap) {
        if (err) return asyncCallback(err);

        tsDataMap = _tsDataMap;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return asyncCallback(err);
    return callback(err, tsDataMap);
  });
};

RedisHelper.prototype.putTask = function(taskReq, callback) {
  var self = this;

  taskReq  = taskReq || {};
  callback = toolkit.ensureFn(callback);

  if (!taskReq.name) {
    return callback(new Error('taskReq.name is required.'));
  }

  // Init task response sub client
  if (!SUB_CLIENT) {
    SUB_CLIENT = self.client.duplicate();
    TASK_ON_RESPONSE_MAP = {};

    var taskRespTopic = toolkit.getGlobalCacheKey('task', 'response');
    SUB_CLIENT.subscribe(taskRespTopic);

    SUB_CLIENT.on('message', function(channel, message) {
      var taskResp = message;

      if (taskResp) {
        try {
          taskResp = JSON.parse(taskResp);
        } catch(ex) {
          return;
        }
      }

      var onResponse = TASK_ON_RESPONSE_MAP[taskResp.id];
      delete TASK_ON_RESPONSE_MAP[taskResp.id];

      if ('function' !== typeof onResponse) return;

      onResponse(taskResp);
    });
  }

  // Prepare
  if (taskReq.ignoreResult === true) {
    delete taskReq.onResponse;
  } else {
    taskReq.ignoreResult = !!!taskReq.onResponse;
  }

  // Push task
  taskReq.id          = taskReq.id          || toolkit.genTaskId();
  taskReq.triggerTime = taskReq.triggerTime || self.getTimestamp(3);

  if (toolkit.isNothing(taskReq.queue)) {
    taskReq.queue = CONFIG._TASK_QUEUE_DEFAULT;
  }

  if (taskReq.onResponse) {
    TASK_ON_RESPONSE_MAP[taskReq.id] = taskReq.onResponse;
    delete taskReq.onResponse;

    // Waiting for response
    var _timeout = taskReq.timeout || CONFIG._TASK_TIMEOUT_DEFAULT;
    _timeout = Math.min(_timeout, CONFIG._TASK_RESULT_WAIT_TIMEOUT_MAX);

    // Leave time for response
    _timeout += 10;

    setTimeout(function() {
      var onResponse = TASK_ON_RESPONSE_MAP[taskReq.id];
      delete TASK_ON_RESPONSE_MAP[taskReq.id];

      if (onResponse) {
        var taskResp = {
          name  : taskReq.name,
          id    : taskReq.id,
          kwargs: taskReq.kwargs,

          triggerTime: taskReq.triggerTime,

          status: 'noResponse',
        }
        onResponse(taskResp);
      }
    }, _timeout * 1000);
  }

  var taskReqDumps = JSON.stringify(taskReq);

  // Compute run time
  var runTime = 0;
  if (taskReq.eta || taskReq.delay) {
    if (taskReq.eta) {
      // Prefer eta
      runTime = moment(taskReq.eta).unix();
      delete taskReq.delay;

    } else if (taskReq.delay) {
      runTime = taskReq.triggerTime + taskReq.delay;
      delete taskReq.eta;
    }
  }

  // Send Task
  if (runTime <= moment().unix()) {
    var workerQueue = toolkit.getWorkerQueue(taskReq.queue);
    return self.client.lpush(workerQueue, taskReqDumps, function(err) {
      if (err) return callback(err);
      return callback(null, taskReq.id);
    });

  } else {
    var delayQueue = toolkit.getDelayQueue(taskReq.queue);
    return self.client.zadd(delayQueue, runTime, taskReqDumps, function(err) {
      if (err) return callback(err);
      return callback(null, taskReq.id);
    });
  }
};

exports.RedisHelper = RedisHelper;
exports.createHelper = function(logger, config) {
  return new RedisHelper(logger, config);
};

exports.getConfig = getConfig;
