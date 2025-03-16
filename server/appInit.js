'use strict';

/* Built-in Modules */
var os   = require('os');
var path = require('path');

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E             = require('./utils/serverError');
var yamlResources = require('./utils/yamlResources');
var toolkit       = require('./utils/toolkit');
var routeLoader   = require('./utils/routeLoader');

var ROUTE      = yamlResources.get('ROUTE');
var CONFIG     = yamlResources.get('CONFIG');
var IMAGE_INFO = yamlResources.get('IMAGE_INFO');

exports.convertJSONResponse = function(ret) {
  // Will disabled by `"X-Wat-Disable-Json-Response-Converting"` Header
  return ret;
};

exports.prepare = function(callback) {
  // UV thread pool
  process.env.UV_THREADPOOL_SIZE = parseInt(CONFIG._NODE_UV_THREADPOOL_SIZE);

  // Init toolkit
  var APP_NAME_SERVER  = CONFIG.APP_NAME + '-server';
  var APP_NAME_WORKER  = CONFIG.APP_NAME + '-worker';
  var APP_NAME_MONITOR = CONFIG.APP_NAME + '-monitor';
  var APP_NAME_GLOBAL  = CONFIG.APP_NAME + '-global';

  toolkit.getCacheKey = function(topic, name, tags, appName) {
    var cacheKey = toolkit._getCacheKey(topic, name, tags);

    // Add app name to cache key
    appName = appName || APP_NAME_SERVER;
    var cacheKeyWithAppName = `${appName}#${cacheKey}`;
    return cacheKeyWithAppName;
  };

  toolkit.getWorkerCacheKey = function(topic, name, tags) {
    return toolkit.getCacheKey(topic, name, tags, APP_NAME_WORKER);
  };

  toolkit.getMonitorCacheKey = function(topic, name, tags) {
    return toolkit.getCacheKey(topic, name, tags, APP_NAME_MONITOR);
  };

  toolkit.getGlobalCacheKey = function(topic, name, tags) {
    return toolkit.getCacheKey(topic, name, tags, APP_NAME_GLOBAL);
  };

  toolkit.parseCacheKey = function(cacheKey) {
    var cacheKeyInfo = toolkit._parseCacheKey(cacheKey);

    var appNameTopicParts = cacheKeyInfo.topic.split('#');
    cacheKeyInfo.appName = appNameTopicParts[0];
    cacheKeyInfo.topic   = appNameTopicParts[1];

    return cacheKeyInfo;
  };

  toolkit.getWorkerQueue = function(name) {
    return `${APP_NAME_WORKER}#${toolkit._getWorkerQueue(name)}`;
  };

  toolkit.getDelayQueue = function(name) {
    return `${APP_NAME_WORKER}#${toolkit._getDelayQueue(name)}`;
  };

  return callback();
};

exports.afterServe = function(app, server) {
  var hostname = os.hostname();

  // Record service info
  function recordServiceInfo() {
    var now = toolkit.getTimestamp();

    var serviceName = process.argv[1].split('/').pop();
    if ('app.js' === serviceName) {
      serviceName = 'server';
    }

    var redisTimestampMs = app.locals.cacheDB.getTimestampMs();
    var localTimestampMs = toolkit.getTimestampMs();

    var serviceInfo = {
      ts        : now,
      name      : serviceName,
      version   : IMAGE_INFO.VERSION,
      edition   : IMAGE_INFO.EDITION,
      uptime    : toolkit.sysUpTime(),
      timeDiffMs: localTimestampMs - redisTimestampMs,
    }

    var cacheKey   = toolkit.getMonitorCacheKey('heartbeat', 'serviceInfo')
    var cacheField = toolkit.getColonTags([ 'hostname', hostname, 'pid', process.pid ]);
    return app.locals.cacheDB.hset(cacheKey, cacheField, JSON.stringify(serviceInfo));
  }
  setInterval(recordServiceInfo, CONFIG._HEARTBEAT_INTERVAL * 1000);
  recordServiceInfo();

  // System Metrics
  var startCPUUsage = process.cpuUsage();
  function recordSystemMetrics() {
    var now = toolkit.getTimestamp();

    var currentCPUUsage    = process.cpuUsage(startCPUUsage);
    var currentMemoryUsage = process.memoryUsage();

    var cpuPercent = (currentCPUUsage.user + currentCPUUsage.system) * 100 / (CONFIG._HEARTBEAT_INTERVAL * 1000 * 1000);
    cpuPercent = parseFloat(cpuPercent.toFixed(2));

    // Update `startCPUUsage` for next tick.
    startCPUUsage = process.cpuUsage();

    async.series([
      function(asyncCallback) {
        var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', [ 'metric', 'serverCPUPercent', 'hostname', hostname ]);
        var opt = { timestamp: now, value: cpuPercent };
        return app.locals.cacheDB.tsAdd(cacheKey, opt, asyncCallback);
      },
      function(asyncCallback) {
        var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', [ 'metric', 'serverMemoryRSS', 'hostname', hostname ]);
        var opt = { timestamp: now, value: currentMemoryUsage.rss };
        return app.locals.cacheDB.tsAdd(cacheKey, opt, asyncCallback);
      },
      function(asyncCallback) {
        var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', [ 'metric', 'serverMemoryHeapTotal', 'hostname', hostname ]);
        var opt = { timestamp: now, value: currentMemoryUsage.heapTotal };
        return app.locals.cacheDB.tsAdd(cacheKey, opt, asyncCallback);
      },
      function(asyncCallback) {
        var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', [ 'metric', 'serverMemoryHeapUsed', 'hostname', hostname ]);
        var opt = { timestamp: now, value: currentMemoryUsage.heapUsed };
        return app.locals.cacheDB.tsAdd(cacheKey, opt, asyncCallback);
      },
      function(asyncCallback) {
        var cacheKey = toolkit.getMonitorCacheKey('monitor', 'systemMetrics', [ 'metric', 'serverMemoryHeapExternal', 'hostname', hostname ]);
        var opt = { timestamp: now, value: currentMemoryUsage.external };
        return app.locals.cacheDB.tsAdd(cacheKey, opt, asyncCallback);
      },
    ], function(err) {
      if (err) return app.locals.logger.logError(err);
    });
  };
  setInterval(recordSystemMetrics, CONFIG._HEARTBEAT_INTERVAL * 1000);
  recordSystemMetrics();

  var fs = require('fs-extra');

  /***** Auto-run on startup *****/
  function printError(err) {
    if (!err || 'string' !== typeof err.stack) return;

    if (err.isWarning) {
      app.locals.logger.warning(err.message);
    } else {
      err.stack.split('\n').forEach(function(line) {
        app.locals.logger.error(line);
      });
    }
  }

  // Init DataFlux Func ID
  async.series([
    // Lock
    function(asyncCallback) {
      var lockKey   = toolkit.getCacheKey('lock', 'initDataFluxFuncId');
      var lockValue = toolkit.genRandString();
      var lockAge   = CONFIG._INIT_DATAFLUX_FUNC_ID_LOCK_AGE;

      app.locals.cacheDB.lock(lockKey, lockValue, lockAge, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (!cacheRes) {
          var e = new Error('Task "Init DataFlux Func ID" is just launched');
          e.isWarning = true;
          return asyncCallback(e);
        }

        return asyncCallback();
      });
    },
    // Auto-gen DataFlux Func ID
    function(asyncCallback) {
      var id = 'DATAFLUX_FUNC_ID';

      var sql = app.locals.db.createSQLBuilder();
      sql
        .SELECT_COUNT()
        .FROM('wat_main_system_setting')
        .WHERE({
          id: id,
        });

      app.locals.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes[0].count > 0) {
          var sql = app.locals.db.createSQLBuilder();
          sql
            .UPDATE('wat_main_system_setting')
            .SET({
              value: sql.FUNC('REPLACE', [ sql.FIELD('value'), '-', '' ])
            })
            .WHERE({
              id: id,
            });

          app.locals.db.query(sql, function(err) {
            return asyncCallback(err);
          });

        } else {
          var value = `DFF${toolkit.genUUID({ noHyphen: true }).toUpperCase()}`;

          var sql = app.locals.db.createSQLBuilder();
          sql
            .INSERT_INTO('wat_main_system_setting')
            .VALUES({
              id   : id,
              value: JSON.stringify(value),
            });

          app.locals.db.query(sql, asyncCallback);
        }
      });
    },
  ], printError);

  // Update Script Market data
  async.series([
    // Lock
    function(asyncCallback) {
      var lockKey   = toolkit.getCacheKey('lock', 'updateOfficialScriptMarket');
      var lockValue = toolkit.genRandString();
      var lockAge   = CONFIG._UPDATE_OFFICIAL_SCRIPT_MARKET_LOCK_AGE;

      app.locals.cacheDB.lock(lockKey, lockValue, lockAge, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (!cacheRes) {
          var e = new Error('Task "Update Official Script Market" is just launched');
          e.isWarning = true;
          return asyncCallback(e);
        }

        return asyncCallback();
      });
    },
    // Force to update Official Script Market
    function(asyncCallback) {
      var sql = app.locals.db.createSQLBuilder();
      sql
        .UPDATE('biz_main_script_market')
        .SET({
          type      : 'httpService',
          configJSON: JSON.stringify({ "url": CONFIG._OFFICIAL_SCRIPT_MARKET_URL }),
        })
        .WHERE({
          id: CONFIG._OFFICIAL_SCRIPT_MARKET_ID,
        })
        .LIMIT(1)

      app.locals.db.query(sql, asyncCallback);
    },
  ], printError);

  // Run init scripts
  if (!CONFIG._DISABLE_INIT_SCRIPTS) {
    async.series([
      // Lock
      function(asyncCallback) {
        var lockKey   = toolkit.getCacheKey('lock', 'initScripts');
        var lockValue = toolkit.genRandString();
        var lockAge   = CONFIG._INIT_SCRIPTS_LOCK_AGE;

        app.locals.cacheDB.lock(lockKey, lockValue, lockAge, function(err, cacheRes) {
          if (err) return asyncCallback(err);

          if (!cacheRes) {
            var e = new Error('Task "Run Init Script" is just launched');
            e.isWarning = true;
            return asyncCallback(e);
          }

          return asyncCallback();
        });
      },
      // Wait some seconds
      function(asyncCallback) {
        setTimeout(asyncCallback, 3000);
      },
      // Run init scripts
      function(asyncCallback) {
        var localhostAuthToken = toolkit.safeReadFileSync(CONFIG._WEB_LOCALHOST_AUTH_TOKEN_PATH).trim();

        var initScriptDir = path.join(__dirname, '../init-scripts/');
        var scripts = fs.readdirSync(initScriptDir).filter(function(filename) {
          return !toolkit.startsWith(filename, '.')
                && (toolkit.endsWith(filename, '.sh') || toolkit.endsWith(filename, '.py'));
        });

        async.eachSeries(scripts, function(script, eachCallback) {
          var cmd = null;
          if (toolkit.endsWith(script, '.sh')) {
            cmd = 'bash';
          } else if (toolkit.endsWith(script, '.py')) {
            cmd = 'python';
          }

          var baseURL = CONFIG.GUANCE_FUNC_BASE_URL;
          if (!baseURL) {
            var protocol = toolkit.toBoolean(process.env['GUANCE_SELF_TLS_ENABLE']) ? 'https' : 'http';
            var webBind = CONFIG.WEB_BIND === '0.0.0.0' ? 'localhost' : CONFIG.WEB_BIND;
            baseURL = `${protocol}://${webBind}:${CONFIG.WEB_PORT}`;
          }

          var scriptPath  = path.join(initScriptDir, script);
          var projectPath = path.join(__dirname, '..');
          var opt = {
            cwd: initScriptDir,
            env: {
              BASE_URL   : baseURL,
              AUTH_HEADER: CONFIG._WEB_LOCALHOST_AUTH_TOKEN_HEADER,
              AUTH_TOKEN : localhostAuthToken,
              PATH       : process.env.PATH,
              PYTHONPATH : `.:${projectPath}`,
            }
          }
          toolkit.childProcessSpawn(cmd, [ scriptPath ], opt, function(err, stdout) {
            if (err) return eachCallback(err);

            app.locals.logger.warning(`[INIT SCRIPT] ${script}: Run`);
            app.locals.logger.warning(`[INIT SCRIPT] ${script}: ${stdout}`);

            return eachCallback();
          });
        }, asyncCallback);
      },
    ], printError);
  }
};

exports.beforeReponse = function(req, res, reqCost, statusCode, respContent, respType) {
  var shouldRecordOperation = true;

  // Operation record
  var operationRecord = res.locals.operationRecord;

  var key   = `${req.method.toUpperCase()} ${req.route.path}`;
  var route = routeLoader.getRoute(key);

  if (!operationRecord || !route) {
    // Do not record if not hit operationRecordMid or no matched route
    shouldRecordOperation = false;

  } else if (route.response === 'html') {
    // Do not record if responsed an HTML page
    shouldRecordOperation = false;

  } else if (route.method === 'post' && route.url === ROUTE.authAPI.signIn.url) {
    // Record if it's sign-in API
    try { operationRecord.username = req.body.signIn.username } catch(_) {};
    try { operationRecord.userId   = respContent.data.userId } catch(_) {};

  } else if (route.method === 'post' && route.url === ROUTE.mainAPI.integratedSignIn.url) {
    // Record if it's integration sign-in API
    try { operationRecord.username = req.body.signIn.username } catch(_) {};
    try { operationRecord.userId = respContent.data.userId } catch(_) {};

  } else if(!route.privilege || !toolkit.endsWith(route.privilege, '_w')) {
    // Do not record if it's not a write operation
    shouldRecordOperation = false;

  } else if (req.route.path === ROUTE.scriptAPI.modify.url
      && (operationRecord.reqBodyJSON.data.codeDraft || operationRecord.reqBodyJSON.data.codeDraftBase64)
      && operationRecord.reqBodyJSON.prevCodeDraftMD5) {
    // [Special] Skip record Script Saving operation since auto-save can cause large amount of calls
    shouldRecordOperation = false;
  }

  if (shouldRecordOperation) {
    operationRecord.reqCost        = reqCost;
    operationRecord.respStatusCode = statusCode || 200;
    operationRecord.respBodyJSON   = respType === 'json' ? toolkit.jsonCopy(respContent) : null;

    require('./models/operationRecordMod').createModel(res.locals).add(operationRecord);
  }
};
