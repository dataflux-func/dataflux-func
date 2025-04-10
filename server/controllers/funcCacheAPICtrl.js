'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');

/* Init */
var LIST_KEY_LIMIT = 50;

/* Handlers */

function getFuncCacheKey(key) {
  var parsedKey          = toolkit.parseCacheKey(key);
  var funcCacheKeyPrefix = toolkit.getWorkerCacheKey('funcCache', parsedKey.name, [ 'key' ]);
  var funcCacheKey = key.replace(funcCacheKeyPrefix, '').replace(/:$/g, '');
  return funcCacheKey;
}

exports.list = function(req, res, next) {
  var fuzzySearch = req.query._fuzzySearch || '';
  var scope       = req.query.scope        || '';
  var key         = req.query.key          || '';

  var data = [];
  async.series([
    // Get related key (Search by fuzzySearch)
    function(asyncCallback) {
      if (!fuzzySearch) return asyncCallback();

      fuzzySearch = toolkit.strf('*{0}*', fuzzySearch);

      var keys = [];

      var cacheKeyPatterns = [
        toolkit.getWorkerCacheKey('funcCache', fuzzySearch, [ 'key', '*' ]),
        toolkit.getWorkerCacheKey('funcCache', '*', [ 'key', fuzzySearch ]),
      ]
      cacheKeyPatterns = toolkit.noDuplication(cacheKeyPatterns);

      async.eachSeries(cacheKeyPatterns, function(cacheKeyPattern, eachCallback) {
        res.locals.cacheDB.keys(cacheKeyPattern, LIST_KEY_LIMIT, function(err, _keys) {
          if (err) return eachCallback(err);

          keys = keys.concat(_keys);

          return eachCallback();
        })
      }, function(err) {
        if (err) return asyncCallback(err);

        keys.sort();
        keys = toolkit.noDuplication(keys);
        keys = keys.slice(0, LIST_KEY_LIMIT);
        keys.forEach(function(key) {
          var parsedKey    = toolkit.parseCacheKey(key);
          var funcCacheKey = getFuncCacheKey(key);

          data.push({
            fullKey: key,
            scope  : parsedKey.name,
            key    : funcCacheKey,
          });
        });

        return asyncCallback();
      });
    },
    // Get related key (Search by scope, key)
    function(asyncCallback) {
      if (fuzzySearch) return asyncCallback();

      scope = scope ? toolkit.strf('*{0}*', scope) : '*';
      key   = key   ? toolkit.strf('*{0}*', key)   : '*';

      var cacheKeyPattern = toolkit.getWorkerCacheKey('funcCache', scope, [ 'key', key ]);
      res.locals.cacheDB.keys(cacheKeyPattern, LIST_KEY_LIMIT, function(err, keys) {
        if (err) return asyncCallback(err);

        keys.sort();
        keys.forEach(function(key) {
          var parsedKey    = toolkit.parseCacheKey(key);
          var funcCacheKey = getFuncCacheKey(key);

          data.push({
            fullKey: key,
            scope  : parsedKey.name,
            key    : funcCacheKey,
          });
        });

        return asyncCallback();
      })
    },
    // Get data type
    function(asyncCallback) {
      async.eachLimit(data, 10, function(d, eachCallback) {
        res.locals.cacheDB.type(d.fullKey, function(err, cacheRes) {
          if (err) return eachCallback(err);

          d.type = cacheRes;

          return eachCallback()
        });
      }, asyncCallback);
    },
    // Get TTL
    function(asyncCallback) {
      async.eachLimit(data, 10, function(d, eachCallback) {
        res.locals.cacheDB.ttl(d.fullKey, function(err, cacheRes) {
          if (err) return eachCallback(err);

          d.ttl = parseInt(cacheRes);

          return eachCallback()
        });
      }, asyncCallback);
    },
    // Get memory usage
    function(asyncCallback) {
      async.eachLimit(data, 10, function(d, eachCallback) {
        res.locals.cacheDB.run('MEMORY', 'USAGE', d.fullKey, 'SAMPLES', '0', function(err, cacheRes) {
          // Don't stop even when errors occur.
          if (err) return eachCallback();

          d.memoryUsage = parseInt(cacheRes);

          return eachCallback()
        });
      }, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(data);
    return res.locals.sendJSON(ret);
  })
};

exports.get = function(req, res, next) {
  var scope = req.params.scope;
  var key   = req.params.key;

  var preferJSON = req.query.preferJSON;

  var cacheKey = toolkit.getWorkerCacheKey('funcCache', scope, [ 'key', key ]);

  var contentType = null;
  var content     = null;
  async.series([
    // Get data type
    function(asyncCallback) {
      res.locals.cacheDB.type(cacheKey, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        contentType = cacheRes;

        return asyncCallback();
      })
    },
    // Get data
    function(asyncCallback) {
      if (content) return asyncCallback();

      switch (contentType) {
        case 'string':
          res.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
            if (err) return asyncCallback(err);

            content = cacheRes;

            if (preferJSON) {
              try { content = JSON.parse(content); } catch(_) {}
            }

            return asyncCallback();
          });
          break;

        case 'list':
          res.locals.cacheDB.lrange(cacheKey, 0, -1, function(err, cacheRes) {
            if (err) return asyncCallback(err);

            content = cacheRes;

            if (preferJSON) {
              for (let i = 0; i < content.length; i++) {
                try { content[i] = JSON.parse(content[i]); } catch(_) {}
              }
            }

            return asyncCallback();
          });
          break;

        case 'hash':
          res.locals.cacheDB.hgetall(cacheKey, function(err, cacheRes) {
            if (err) return asyncCallback(err);

            content = cacheRes;

            if (preferJSON) {
              for (let k in content) {
                try { content[k] = JSON.parse(content[k]); } catch(_) {}
              }
            }

            return asyncCallback();
          });
          break;

        case 'set':
          res.locals.cacheDB.client.smembers(cacheKey, function(err, cacheRes) {
            if (err) return asyncCallback(err);

            content = cacheRes;

            if (preferJSON) {
              for (let i = 0; i < content.length; i++) {
                try { content[i] = JSON.parse(content[i]); } catch(_) {}
              }
            }

            return asyncCallback();
          });
          break;

        case 'zset':
          res.locals.cacheDB.client.zrange(cacheKey, 0, -1, 'WITHSCORES', function(err, cacheRes) {
            if (err) return asyncCallback(err);

            content = [];
            for (let i = 0; i < cacheRes.length / 2; i++) {
              var score = parseFloat(cacheRes[i * 2 + 1]);
              var value = cacheRes[i * 2];

              if (preferJSON) {
                try { value = JSON.parse(value); } catch(_) {}
              }

              content.push({ score, value });
            }

            return asyncCallback();
          });
          break;

        default:
          content = `<Getting type of ${contentType} data is not supported>`;
          return asyncCallback();
      }
    },
  ], function(err) {
    if (err) return next(err);

    let ret = toolkit.initRet(content)
    return res.locals.sendJSON(ret);
  });
};

exports.delete = function(req, res, next) {
  var scope = req.params.scope;
  var key   = req.params.key;

  var cacheKey = toolkit.getWorkerCacheKey('funcCache', scope, [ 'key', key ]);

  res.locals.cacheDB.del(cacheKey, function(err) {
    if (err) return next(err);

    return res.locals.sendJSON();
  });
};
