'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async      = require('async');
var sortedJSON = require('sorted-json');

/* Project Modules */
var E       = require('./utils/serverError');
var CONFIG  = require('./utils/yamlResources').get('CONFIG');
var toolkit = require('./utils/toolkit');

var connectorMod = require('./models/connectorMod');
var mainAPICtrl = require('./controllers/mainAPICtrl');

/* Init */
var IS_MASTER_NODE           = null;
var MASTER_LOCK_EXPIRES      = 15;
var CONNECTOR_CHECK_INTERVAL = 3 * 1000;

var CONNECTOR_HELPER_MAP = {
  redis: require('./utils/extraHelpers/redisHelper'),
  mqtt : require('./utils/extraHelpers/mqttHelper'),
  kafka: require('./utils/extraHelpers/kafkaHelper'),
};

var CONNECTOR_TOPIC_FUNC_MAP = {}; // Abbr: C.T.F

function createMessageHandler(locals, connectorId, handlerFuncId) {
  return function(topic, message, packet, callback) {
    // Send Task
    var taskReq  = null;
    var taskResp = null;
    async.series([
      // Gen Task request
      function(asyncCallback) {
        var opt = {
          funcId: handlerFuncId,
          funcCallKwargs: {
            topic  : topic.toString(),
            message: message,
            // NOTE In general, the `topic` and `message` parameters are enough.
            // To minimize the amount of data transferred, the `packet` parameter is not provided.
            // packet : packet,
          },
          origin  : 'connector',
          originId: connectorId,
          queue   : CONFIG._FUNC_TASK_QUEUE_SUB_HANDLER,
        }
        mainAPICtrl.createFuncRunnerTaskReq(locals, opt, function(err, _taskReq) {
          if (err) return asyncCallback(err);

          taskReq = _taskReq;

          return asyncCallback();
        });
      },
      // Send Task
      function(asyncCallback) {
        mainAPICtrl.callFuncRunner(locals, taskReq, function(err, _taskResp) {
          locals.logger.debug('[SUB] TOPIC: `{0}` -> FUNC: `{1}`', topic, handlerFuncId);

          // Get Task response
          taskResp = _taskResp;
          if (err) {
            locals.logger.debug('[SUB] FUNC Error: `{0}` -> `{1}`', handlerFuncId, err);
          } else {
            locals.logger.debug('[SUB] FUNC {0}: `{1}` -> `{2}`', taskResp.status, handlerFuncId, JSON.stringify(taskResp.result.returnValue))
          }

          // Do not abort event Task fails
          return asyncCallback();
        });
      },
    ], function(err) {
      if (err) locals.logger.logError(err);
      return callback(err, taskResp);
    });
  }
};

exports.runListener = function runListener(app) {
  var lockKey   = toolkit.getCacheKey('lock', 'subClient');
  var lockValue = toolkit.genRandString();
  app.locals.logger.info('Start subscribers... Lock: `{0}`', lockValue);

  // Check Connectors regularly
  function connectorChecker() {
    // Connector clients to be recreate
    var nextConnectorTopicFuncMap = {};
    async.series([
      // Lock
      function(asyncCallback) {
        app.locals.cacheDB.lock(lockKey, lockValue, MASTER_LOCK_EXPIRES, function() {
          // Failure to lock may be due to:
          //  1. The lock is acquired by other node
          //  2. The lock is acquired by this node
          // So ignore lock error
          return asyncCallback();
        });
      },
      // Extend lock time
      function(asyncCallback) {
        app.locals.cacheDB.extendLockTime(lockKey, lockValue, MASTER_LOCK_EXPIRES, function(err) {
          if (!err) {
            // Succeed to extend lock time,
            // the lock was acquired by this node, do next
            if (IS_MASTER_NODE === null || IS_MASTER_NODE === false) {
              app.locals.logger.debug('[SUB] Master Node');
            }

            IS_MASTER_NODE = true;

          } else {
            // The lock was acquired by other node,
            // For safety reasons, clean up all single-sub clients in this node
            if (IS_MASTER_NODE === null || IS_MASTER_NODE === true) {
              app.locals.logger.debug('[SUB] Non-Master Node');
            }

            IS_MASTER_NODE = false;

            for (var ctfKey in CONNECTOR_TOPIC_FUNC_MAP) {
              var connector = CONNECTOR_TOPIC_FUNC_MAP[ctfKey];
              if (connector && !connector.configJSON.multiSubClient) {
                connector.client.end();
                delete CONNECTOR_TOPIC_FUNC_MAP[ctfKey];
              }
            }
          }

          return asyncCallback();
        });
      },
      // Get Connector list
      function(asyncCallback) {
        var connectorModel = connectorMod.createModel(app.locals);
        connectorModel.decipher = true;

        var opt = {
          fields: [
            'cnct.id',
            'cnct.type',
            'cnct.configJSON',
          ],
          filters: {
            'cnct.type': { in: Object.keys(CONNECTOR_HELPER_MAP) },
          },
        };
        connectorModel.list(opt, function(err, dbRes) {
          if (err) return asyncCallback(err);

          dbRes.forEach(function(d) {
            d.configJSON = d.configJSON || {};
            d.configMD5  = toolkit.getMD5(d.configJSON);

            // Ignore if no topic handlers
            if (toolkit.isNothing(d.configJSON.topicHandlers)) return;

            // Ignore if the Connector is single-sub and this node is not a master node
            if (!IS_MASTER_NODE && !d.configJSON.multiSubClient) return;

            // Add to Connector client map
            d.configJSON.topicHandlers.forEach(function(th) {
              // Ignore disabled topic handler
              if (th.isDisabled) return;

              var ctfKey = sortedJSON.sortify({
                'id'    : d.id,
                'topic' : th.topic,
                'funcId': th.funcId,
              }, {
                stringify: true,
              })
              nextConnectorTopicFuncMap[ctfKey] = toolkit.jsonCopy(d);
            });
          });

          return asyncCallback();
        });
      },
      // Update Connector client map
      function(asyncCallback) {
        // Clear Connector that not exists
        for (var ctfKey in CONNECTOR_TOPIC_FUNC_MAP) {
          if ('undefined' === typeof nextConnectorTopicFuncMap[ctfKey]) {
            CONNECTOR_TOPIC_FUNC_MAP[ctfKey].client.end();
            delete CONNECTOR_TOPIC_FUNC_MAP[ctfKey];

            app.locals.logger.debug('[SUB] Client removed: `{0}`', ctfKey);
          }
        }

        // Recreate Connector clients that have changes
        for (var ctfKey in nextConnectorTopicFuncMap) {
          var _tmp = JSON.parse(ctfKey);
          var topic  = _tmp.topic;
          var funcId = _tmp.funcId;

          var _next    = nextConnectorTopicFuncMap[ctfKey];
          var _current = CONNECTOR_TOPIC_FUNC_MAP[ctfKey];

          // Skip if no changes
          if (_current && _current['configMD5'] && _current['configMD5'] === _next['configMD5']) {
            continue
          }

          // Remove client
          if (_current) {
            _current.client.end();
            delete CONNECTOR_TOPIC_FUNC_MAP[ctfKey];
            app.locals.logger.debug('[SUB] Client removed: `{0}`', ctfKey);
          }

          // Create new client
          try {
            // Only for sub
            _next.configJSON.disablePub = true;
            _next.client = CONNECTOR_HELPER_MAP[_next.type].createHelper(app.locals.logger, _next.configJSON);
          } catch(err) {
            app.locals.logger.warning('[SUB] Client creating Error: `{0}`, reason: {1}', ctfKey, err.toString());
            continue
          }

          // Do sub
          _next.client.sub(topic, createMessageHandler(app.locals, _next.id, funcId));

          // Add to C.T.F
          CONNECTOR_TOPIC_FUNC_MAP[ctfKey] = _next;
          app.locals.logger.debug('[SUB] Client created: `{0}`', ctfKey);

          return asyncCallback();
        }
      },
    ], function(err) {
      if (err) return app.locals.logger.logError(err);
    });
  };
  setInterval(connectorChecker, CONNECTOR_CHECK_INTERVAL);

  // Do comsume
  async.forever(function(foreverCallback) {
    var workerProcessCount = 0;
    async.series([
      // Get current Worker process count for sub
      function(asyncCallback) {
        var cacheKey = toolkit.getMonitorCacheKey('heartbeat', 'processCountOnQueue');
        app.locals.cacheDB.hgetExpires(cacheKey, CONFIG._FUNC_TASK_QUEUE_SUB_HANDLER, CONFIG._MONITOR_REPORT_EXPIRES, function(err, cacheRes) {
          if (err) return asyncCallback(err);
          if (!cacheRes) return asyncCallback();

          workerProcessCount = parseInt(cacheRes.processCount || 0) || 0;

          return asyncCallback();
        });
      },
      // All sub clients consume `workerProcessCount` times
      function(asyncCallback) {
        var skip = false;

        // Skip if mo Worker process / no C.T.F
        if (workerProcessCount <= 0) {
          app.locals.logger.debug('[SUB] No worker available, skip');
          skip = true;
        } else if (toolkit.isNothing(CONNECTOR_TOPIC_FUNC_MAP)) {
          app.locals.logger.debug('[SUB] No topic func, skip');
          skip = true;
        }

        // Wait some seconds if should skip
        if (skip === true) {
          return setTimeout(function() { asyncCallback() }, 3 * 1000);
        }

        var hasAnyConsumed = false;
        async.eachOf(CONNECTOR_TOPIC_FUNC_MAP, function(connector, ctfKey, eachCallback) {
          async.times(workerProcessCount, function(n, timesCallback) {
            connector.client.consume(function(err, handleInfo){
              if (err) app.locals.logger.logError(err);

              if (handleInfo && handleInfo.taskResp) {
                app.locals.logger.debug('CONNECTOR: `{0}` -> consumed', ctfKey);
                hasAnyConsumed = true;

                var ctfKeyObj = JSON.parse(ctfKey);

                // Record recent sub consume info
                var cacheKey = toolkit.getCacheKey('cache', 'recentSubConsumeInfo')
                var field = toolkit.getColonTags([
                  'connectorId', ctfKeyObj.id,
                  'topic',       ctfKeyObj.topic,
                  'status',      handleInfo.taskResp.status,
                ]);
                var consumeInfo = {
                  funcId     : ctfKeyObj.funcId,
                  timestampMs: Date.now(),
                  message    : handleInfo.message,
                  taskResp   : handleInfo.taskResp,
                  error      : handleInfo.error,
                };
                app.locals.cacheDB.hset(cacheKey, field, JSON.stringify(consumeInfo));

                // Record recent sub consume rate (agg in 10s)
                var timestamp = parseInt(Date.now() / 1000);
                var alignedTimestamp = parseInt(timestamp / 10) * 10;

                var cacheKey   = toolkit.getCacheKey('cache', 'recentSubConsumeRate', [ 'timestamp', alignedTimestamp ]);
                var cacheField = toolkit.getColonTags([
                  'connectorId', ctfKeyObj.id,
                  'topic'      , ctfKeyObj.topic,
                ]);
                app.locals.cacheDB.hincr(cacheKey, cacheField, function(err) {
                  if (err) return;

                  app.locals.cacheDB.expire(cacheKey, 60 + 20);
                });
              }

              // Do not abort if it fails
              return timesCallback();
            });
          }, eachCallback);
        }, function() {
          if (hasAnyConsumed) {
            // Start next loop immediately if has any consumption
            return asyncCallback();

          } else {
            // Wait some second if no any consumption
            return setTimeout(function() { asyncCallback() }, 3 * 1000);
          }
        });
      },
    ], foreverCallback);
  });
};
