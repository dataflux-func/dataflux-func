'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var fs    = require('fs-extra');
var async = require('async');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');

/* Init */

/* Handlers */
exports.pullSystemLogs = function(req, res, next) {
  var startPosition = parseInt(req.query.position);

  var nextPosition = null;
  var logs        = null;
  async.series([
    // Determine start / end position
    function(asyncCallback) {
      fs.stat(CONFIG.LOG_FILE_PATH, function(err, stat) {
        if (err) return asyncCallback(err);

        nextPosition = stat.size;

        if (!startPosition) {
          // Reads from the tail by default
          startPosition = stat.size - (1024 * 100);
        }

        if (startPosition < 0) {
          startPosition = 0;
        }
        if (startPosition > nextPosition - 1) {
          startPosition = nextPosition - 1;
        }

        return asyncCallback();
      });
    },
    // Read logs
    function(asyncCallback) {
      var logContent = '';

      var opt = {
        start: startPosition,
        end  : nextPosition - 1,
      }

      if (opt.start === opt.end) {
        // No more logs
        logs = [];
        return asyncCallback();
      }

      // Read new log from file
      var steam = fs.createReadStream(CONFIG.LOG_FILE_PATH, opt)
      steam.on('data', function(chunk) {
        logContent += chunk;
      });
      steam.on('end', function() {
        logContent = logContent.toString().trim();

        if (!logContent) {
          logs = [];
        } else {
          logs = logContent.split('\n');
          if (!req.query.position) {
            logs = logs.slice(1);
          }
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      nextPosition: nextPosition,
      logs        : logs,
    });
    return res.locals.sendJSON(ret, { muteLog: true });
  });
};

exports.putTask = function(req, res, next) {
  var taskReq = req.body;
  taskReq.onResponse = function(taskResp) {
    res.locals.sendJSON(taskResp);
  }

  return res.locals.cacheDB.putTask(taskReq);
};

exports.testAPIBehavior = function(req, res, next) {
  var scenario = req.query.scenario;

  switch(scenario) {
    case 'ok':
      res.locals.sendJSON({ message: 'ok' });
      break;

    case 'error':
      next(Error('Test Error'));
      break;

    case 'unhandledError':
      throw new Error('Test Unhandled Error');
      break;

    case 'unhandledAsyncError':
      async.series([
        function(asyncCallback) {
          throw new Error('Test Unhandled Async Error');
        },
      ], function(err) {
        if (err) return next(err);
        res.locals.sendJSON();
      });
      break;

    case 'slowResponse':
      setTimeout(function() {
        res.locals.sendJSON();
      }, 3 * 1000);
      break;
  }
};

exports.clearWorkerQueues = function(req, res, next) {
  var workerQueues = req.body.workerQueues || toolkit.range(CONFIG._WORKER_QUEUE_COUNT);
  async.eachLimit(workerQueues, 5, function(q, eachCallback) {
    var workerQueue = toolkit.getWorkerQueue(q);
    res.locals.cacheDB.del(workerQueue, eachCallback);

  }, function(err) {
    if (err) return next(err);
    return res.locals.sendJSON();
  });
};

exports.clearLogCacheTables = function(req, res, next) {
  var all_tables = [];
  async.series([
    function(asyncCallback) {
      res.locals.db.tables(function(err, _tables) {
        if (err) return asyncCallback(err);

        all_tables = _tables;

        return asyncCallback();
      })
    },
    function(asyncCallback) {
      async.eachSeries(CONFIG._DBDATA_LOG_CACHE_TABLE_LIST, function(t, eachCallback) {
        if (all_tables.indexOf(t) < 0) return eachCallback();

        var sql = res.locals.db.createSQLBuilder().TRUNCATE(t);

        res.locals.db.query(sql, eachCallback);
      }, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);
    return res.locals.sendJSON();
  });
};

exports.getRecentWebSocketMessages = function(req, res, next) {
  var cacheKey = toolkit.getCacheKey('cache', 'recentWebSocketMessages');
  res.locals.cacheDB.lrange(cacheKey, 0, -1, function(err, cacheRes) {
    if (err) return next(err);

    var messages = cacheRes.reverse().map(function(d, index) {
      d = JSON.parse(d);
      d.seq = index + 1;
      return d;
    });

    var ret = toolkit.initRet(messages);
    res.locals.sendJSON(ret);
  });
};
