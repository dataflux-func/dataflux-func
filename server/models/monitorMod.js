'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async  = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');
var routeLoader = require('../utils/routeLoader');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
};

exports.createModel = function(locals) {
  return new EntityModel(locals);
};

var EntityModel = exports.EntityModel = modelHelper.createSubModel(TABLE_OPTIONS);

var GROUP_TIME = 10 * 60;

/*
 * System stats data in Redis
 */
EntityModel.prototype.getSystemMetrics = function(callback) {
  var self = this;

  var data = {};

  self.locals.cacheDB.skipLog = true;

  // All queues
  var queues = toolkit.range(10);

  // All hostnames
  var hostnames = [];

  // All DB tables
  var tables = [];

  // Recent called Func IDs
  var recentCalledFuncIds = [];

  async.series([
    // Get all hostnames
    function(asyncCallback) {
      var cacheKey = toolkit.getMonitorCacheKey('heartbeat', 'serviceInfo');
      self.locals.cacheDB.hkeysExpires(cacheKey, CONFIG._MONITOR_REPORT_EXPIRES, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        hostnames = toolkit.noDuplication(cacheRes.map(function(field) {
          return toolkit.parseColonTags(field).hostname;
        }));

        return asyncCallback();
      });
    },
    // Get all DB table names
    function(asyncCallback) {
      self.locals.db.tables(function(err, _tables) {
        if (err) return asyncCallback(err);

        tables = _tables;

        return asyncCallback();
      });
    },
    // Get recent called Func IDs
    function(asyncCallback) {
      var cacheKey = toolkit.getMonitorCacheKey('monitor', 'recentCalledFuncIds')
      self.locals.cacheDB.hgetallExpires(cacheKey, CONFIG.REDIS_TS_MAX_AGE, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        recentCalledFuncIds = Object.keys(cacheRes);

        return asyncCallback();
      })
    },
    // Query metric data
    function(asyncCallback) {
      async.parallel([
        // Get CPU / Memory usage
        function(parallelCallback) {
          var metricScaleMap = {
            serverCPUPercent        : 1,
            serverMemoryRSS         : 1024 * 1024,
            serverMemoryHeapTotal   : 1024 * 1024,
            serverMemoryHeapUsed    : 1024 * 1024,
            serverMemoryHeapExternal: 1024 * 1024,
            workerCPUPercent        : 1,
            workerMemoryPSS         : 1024 * 1024,
          };

          async.eachOfSeries(metricScaleMap, function(scale, metric, eachCallback) {
            data[metric] = {};

            var cacheKeys = hostnames.map(function(hostname) {
              return toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric, 'hostname', hostname]);
            });

            var opt = { timeUnit: 'ms', groupTime: GROUP_TIME, scale: scale, fillZero: true };
            self.locals.cacheDB.tsMget(cacheKeys, opt, function(err, tsDataMap) {
              if (err) return eachCallback(err);

              for (var k in tsDataMap) {
                if (toolkit.isNothing(tsDataMap[k])) continue;

                var hostname = toolkit.parseCacheKey(k).tags.hostname;
                data[metric][hostname] = tsDataMap[k];
              }

              return eachCallback();
            });
          }, parallelCallback);
        },
        // Get DB Disk usage
        function(parallelCallback) {
          var dbMetrics = [
            'dbTableTotalSize',
            'dbTableDataSize',
            'dbTableIndexSize',
          ];
          async.eachSeries(dbMetrics, function(metric, eachCallback) {
            data[metric] = {};

            var cacheKeys = tables.map(function(table) {
              return toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric, 'table', table]);
            });

            var opt = { timeUnit: 'ms', groupTime: GROUP_TIME, scale: 1024 * 1024, fillZero: true };
            self.locals.cacheDB.tsMget(cacheKeys, opt, function(err, tsDataMap) {
              if (err) return eachCallback(err);

              for (var k in tsDataMap) {
                var table = toolkit.parseCacheKey(k).tags.table;
                data[metric][table] = tsDataMap[k];
              }

              return eachCallback();
            });
          }, parallelCallback);
        },
        // Get Cache DB usage
        function(parallelCallback) {
          var metricScaleMap = {
            cacheDBKeyUsed   : 1,
            cacheDBMemoryUsed: 1024 * 1024,
          };

          async.eachOfSeries(metricScaleMap, function(scale, metric, eachCallback) {
            var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric]);
            var opt = { timeUnit: 'ms', groupTime: GROUP_TIME, scale: scale, fillZero: true };

            self.locals.cacheDB.tsGet(cacheKey, opt, function(err, tsData) {
              if (err) return eachCallback(err);

              data[metric] = tsData;
              return eachCallback();
            });
          }, parallelCallback);
        },
        // Get Func call count
        function(parallelCallback) {
          var metric = 'funcCallCount';

          data[metric] = {};

          var cacheKeys = recentCalledFuncIds.map(function(funcId) {
            return toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric, 'funcId', funcId]);
          });

          var opt = { timeUnit: 'ms', groupTime: GROUP_TIME, agg: 'sum', fillZero: true };
          self.locals.cacheDB.tsMget(cacheKeys, opt, function(err, tsDataMap) {
            if (err) return parallelCallback(err);

            for (var k in tsDataMap) {
              var funcId = toolkit.parseCacheKey(k).tags.funcId;
              data[metric][funcId] = tsDataMap[k];
            }

            return parallelCallback();
          });
        },
        // Get Delay queue length
        function(parallelCallback) {
          var metric = 'delayQueueLength';

          data[metric] = {};

          var cacheKeys = queues.map(function(queue) {
            return toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric, 'queue', queue]);
          });

          var opt = { timeUnit: 'ms', groupTime: GROUP_TIME, fillZero: true };
          self.locals.cacheDB.tsMget(cacheKeys, opt, function(err, tsDataMap) {
            if (err) return parallelCallback(err);

            for (var k in tsDataMap) {
              var queue = toolkit.parseCacheKey(k).tags.queue;
              data[metric][queue] = tsDataMap[k];
            }

            return parallelCallback();
          });
        },
        // Get Worker queue length
        function(parallelCallback) {
          var metric = 'workerQueueLength';

          data[metric] = {};

          var cacheKeys = queues.map(function(queue) {
            return toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric, 'queue', queue]);
          });

          var opt = { timeUnit: 'ms', groupTime: GROUP_TIME, fillZero: true };
          self.locals.cacheDB.tsMget(cacheKeys, opt, function(err, tsDataMap) {
            if (err) return parallelCallback(err);

            for (var k in tsDataMap) {
              var queue = toolkit.parseCacheKey(k).tags.queue;
              data[metric][queue] = tsDataMap[k];
            }

            return parallelCallback();
          });
        },
        // Get Matched route count
        function(parallelCallback) {
          var metric = 'matchedRouteCount';

          var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', ['metric', metric, 'date', toolkit.getDateString()]);

          self.cacheDB.hgetall(cacheKey, function(err, cacheRes) {
            if (err) return parallelCallback(err);

            var parsedData = [];
            for (var route in cacheRes) {
              var count = parseInt(cacheRes[route]) || 0;
              parsedData.push([route, count]);
            }
            parsedData.sort(function(a, b) {
              return b[1] - a[1];
            });

            data[metric] = parsedData;

            return parallelCallback();
          });
        },
      ], asyncCallback)
    },
  ], function(err) {
    self.locals.cacheDB.skipLog = false;

    if (err) return callback(err);
    return callback(null, data);
  });
};

EntityModel.prototype.listAbnormalRequests = function(type, callback) {
  var self = this;

  var listData     = null;
  var listPageInfo = null;

  async.series([
    // Get data
    function(asyncCallback) {
      var cacheKey = toolkit.getMonitorCacheKey('monitor', 'abnormalRequest', ['type', type]);
      var paging   = self.locals.paging;
      self.locals.cacheDB.pagedList(cacheKey, paging, function(err, cacheRes, pageInfo) {
        if (err) return asyncCallback(err);

        listData     = cacheRes;
        listPageInfo = pageInfo;

        return asyncCallback();
      });
    },
    // Add user info
    function(asyncCallback) {
      var userIds = listData.reduce(function(acc, x) {
        if (x.userId) {
          acc.push(x.userId);
        }
        return acc;
      }, []);

      if (toolkit.isNothing(userIds)) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          sql.FIELD('u.id',       'u_id'),
          sql.FIELD('u.username', 'u_username'),
          sql.FIELD('u.name',     'u_name'),
          sql.FIELD('u.mobile',   'u_mobile'),
        ])
        .FROM('wat_main_user', 'u')
        .WHERE({
          'u.id': userIds,
        });

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        var userIdMap = toolkit.arrayElementMap(dbRes, 'u_id');

        listData.forEach(function(d) {
          var user = userIdMap[d.userId];
          if (user) {
            Object.assign(d, user);
          }
        });

        return asyncCallback();
      });
    },
    // Add route info
    function(asyncCallback) {
      listData.forEach(function(d) {
        var key   = `${d.reqMethod.toUpperCase()} ${d.reqRoute}`;
        var route = routeLoader.getRoute(key);
        if (route) {
          d.reqRouteName = route.name;
        }
      });

      return asyncCallback();
    },
  ], function(err) {
    if (err) return callback(err);
    return callback(null, listData, listPageInfo);
  })
};
