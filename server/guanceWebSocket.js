'use strict';

/* Built-in Modules */
var https = require('https');

/* 3rd-party Modules */
var async     = require('async');
var socketIO  = require('socket.io-client');
var supertest = require('supertest');

/* Project Modules */
var E                  = require('./utils/serverError');
var IMAGE_INFO         = require('./utils/yamlResources').get('IMAGE_INFO');
var CONFIG             = require('./utils/yamlResources').get('CONFIG');
var GUANCE_DATA_SOURCE = require('./utils/yamlResources').get('GUANCE_DATA_SOURCE');
var toolkit            = require('./utils/toolkit');

var systemSettingMod = require('./models/systemSettingMod');
var connectorMod     = require('./models/connectorMod');
var funcMod          = require('./models/funcMod');
var mainAPICtrl      = require('./controllers/mainAPICtrl');

/* Init */
var IS_MASTER_NODE                  = null;
var MASTER_LOCK_EXPIRES             = 15;
var GUANCE_CONNECTOR_CHECK_INTERVAL = 10 * 1000;
var GUANCE_CONNECTOR_MAP            = {}; // Abbr: G.C

// Local data
var LOCAL_DATA_MD5_MAP         = {};
var LOCAL_DATA_REPORT_INTERVAL = 10 * 1000;

// Event (common)
const EVENT_PING                  = 'ping';
const EVENT_PING_V2               = 'ping_v2';
const EVENT_DFF_AUTH              = 'dff.auth';
const EVENT_DFF_SYSTEM_INFO       = 'dff.system.info';
const EVENT_DFF_INIT_REQUIRE      = 'dff.init.require';
const EVENT_DFF_FUNC_INIT_REQUIRE = 'dff.func.init.require'; // [Compatibility]

// Event (Local data uploading)
const EVENT_DFF_FUNC_LIST      = 'dff.func.list';
const EVENT_DFF_CONNECTOR_LIST = 'dff.connector.list';

// Event (Func calling)
const EVENT_DFF_FUNC_CALL       = 'dff.func.call';
const EVENT_DFF_INNER_FUNC_CALL = 'dff.innerFunc.call';

// Event (HTTP API calling)
const EVENT_DFF_HTTP_API = 'dff.httpAPI';

// Allowed HTTP API for websocket
const ALLOWED_HTTP_APIS = [
  'GET /api/v1/connectors/do/list',
  'POST /api/v1/connectors/do/add',
  'POST /api/v1/connectors/*/do/modify',
  'GET /api/v1/connectors/*/do/delete',
  'POST /api/v1/connectors/*/do/query',
  'GET /api/v1/connectors/*/do/test',
]

// Recent websocket messages
const RECENT_WEBSOCKET_MESSAGE_LIMIT = 300;

const GUANCE_DATA_SOURCE_TYPES = GUANCE_DATA_SOURCE.connectorDefinitions.map(function(def) {
  return def.type;
});

const LOCAL_DATA_META = {
  'funcs': { event: EVENT_DFF_FUNC_LIST,
    getList: function(locals, callback) {
      var funcModel = funcMod.createModel(locals);

      var opt = {
        filters: {
          'func.category': { like: 'guance.%' }
        },
        extra: { asFuncDoc: true },
      };
      funcModel.list(opt, callback);
    }
  },
  'connectors': { event: EVENT_DFF_CONNECTOR_LIST,
    getList: function(locals, callback) {
      var connectorModel = connectorMod.createModel(locals);

      var opt = {
        filters: {
          'cnct.type': { in: GUANCE_DATA_SOURCE_TYPES }
        },
      };
      connectorModel.list(opt, callback);
    }
  },
};

function getGuanceConnectorKey(id, guanceAPIKeyId) {
  return `${id}/${guanceAPIKeyId}`;
};

function getAckSample(ack) {
  var ackSample = {};
  for (var k in ack) if (ack.hasOwnProperty(k)) {
    var v = ack[k];
    if (Array.isArray(v)) {
      v = toolkit.strf('<{0} Records>', v.length);
    }

    ackSample[k] = v;
  }
  return ackSample;
};

function logWebSocket(locals, client, event, from, to, type, data) {
  if ('string' === data) data = JSON.parse(data);

  var eventInfoDumps = toolkit.jsonDumps({
    timestampMs   : toolkit.getTimestampMs(),
    connectorId   : client.__connectorId,
    guanceAPIKeyId: client.__guanceAPIKeyId,
    event, from, to, type, data
  })
  var cacheKey = toolkit.getCacheKey('cache', 'recentWebSocketMessages');
  locals.cacheDB.pushLimit(cacheKey, eventInfoDumps, RECENT_WEBSOCKET_MESSAGE_LIMIT);
};

function doAck(locals, client, inEventObj, respData, error) {
  var ack = null;

  var err = error || inEventObj.error;
  if (err) {
    // Wrap error
    if (!E.prototype.isPrototypeOf(err)) {
      var errMessage = 'Event failed';
      var errStack   = null;

      if (CONFIG.MODE === 'dev') {
        errMessage = err.toString();
        errStack   = err.stack;
      }

      err = new E('EGuanceEventFailed', errMessage, errStack, err);
    }

    ack = {
      ok     : false,
      message: err.message,
      detail : err.detail,
    }

  } else {
    ack = {
      ok     : true,
      message: '',
    }
  }

  if (respData) {
    ack.data = respData || null;
  }

  if (inEventObj.taskId) {
    ack.taskId = inEventObj.taskId;
  }

  var ackEvent  = `${inEventObj.event}.ack`;
  var ackSample = getAckSample(ack);

  // Log method
  var loggerMethod = ack.ok ? 'debug' : 'error';

  // Ack event response
  if (inEventObj.taskId) {
    locals.logger[loggerMethod](`[GUANCE WS] AckEvent@${ackEvent}: Remote(${client.__guanceConnectorKey}) <- Func, Data: ${toolkit.jsonDumps(ackSample)}`);
    logWebSocket(locals, client, ackEvent, 'func', 'remote', 'ackEvent', ackSample);
    client.emit(ackEvent, ack);
  }

  // Callback Event response
  locals.logger[loggerMethod](`[GUANCE WS] EventCallback@${inEventObj.event}: Remote(${client.__guanceConnectorKey}) <- Func, Data: ${toolkit.jsonDumps(ackSample)}`);
  logWebSocket(locals, client, ackEvent, 'func', 'remote', 'callback', ackSample);
  return inEventObj.callback(ack);
};

function doHTTPAPIAck(locals, client, inEventObj, httpResp) {
  var ack = toolkit.jsonCopy(httpResp);

  if (inEventObj.taskId) {
    ack.taskId = inEventObj.taskId;
  }

  var ackEvent  = `${inEventObj.event}.ack`;
  var ackSample = getAckSample(ack);

  // Event resonse by ack
  if (inEventObj.taskId) {
    locals.logger.debug(`[GUANCE WS] AckEvent@${ackEvent}: Remote(${client.__guanceConnectorKey}) <- Func, Data: ${toolkit.jsonDumps(ackSample)}`);
    logWebSocket(locals, client, ackEvent, 'func', 'remote', 'ackEvent', ackSample);
    client.emit(ackEvent, ack);
  }

  // Event response by callback
  locals.logger.debug(`[GUANCE WS] EventCallback@${inEventObj.event}: Remote(${client.__guanceConnectorKey}) <- Func, Data: ${toolkit.jsonDumps(ackSample)}`);
  logWebSocket(locals, client, ackEvent, 'func', 'remote', 'callback', ackSample);
  return inEventObj.callback(ack);
};

function doEmit(locals, client, event, emitData, callback) {
  locals.logger.debug(`[GUANCE WS] Event@${event}: Func -> Remote(${client.__guanceConnectorKey}), Data: ${toolkit.jsonDumps(emitData)}`);
  logWebSocket(locals, client, event, 'func', 'remote', 'event', emitData);

  client.emit(event, emitData, function(resp) {
    locals.logger.debug(`[GUANCE WS] EventCallback@${event}: Func <- Remote(${client.__guanceConnectorKey}), Data: ${toolkit.jsonDumps(resp)}`);
    logWebSocket(locals, client, event, 'remote', 'func', 'callback', resp);

    if ('function' === typeof callback) callback(resp);
  });
};

function getInEventObj(locals, client, event, inMessage) {
  inMessage = Array.prototype.slice.call(inMessage);

  var inEventObj = {
    event   : event,
    data    : {},
    callback: null,
    error   : null,
    taskId  : null,
  }

  if ('function' === typeof inMessage[0]) {
    // Use 1st argument as callback if no Event data received
    inEventObj.callback = inMessage[0];

  } else {
    // Use 1st argument as Event data and 2nd argument as callback if Event data received
    inEventObj.data = inMessage[0] || {};
    if ('string' === typeof inEventObj.data) {
      try {
        inEventObj.data = JSON.parse(inEventObj.data);
      } catch(err) {
        inEventObj.error = err;
      }
    }

    if ('function' === typeof inMessage[1]) {
      inEventObj.callback = inMessage[1];
    }
  }

  // Ensure `callback` is a function
  inEventObj.callback = toolkit.ensureFn(inEventObj.callback);

  // Get Task ID
  try {
    inEventObj.taskId = inEventObj.data.taskId;
  } catch(_) {
    // Nope
  }

  logWebSocket(locals, client, event, 'remote', 'func', 'event', inEventObj.data);

  if (inEventObj.error) {
    // Error when handling Event
    locals.logger.debug(`[GUANCE WS] Event@${inEventObj.event}: Remote(${client.__guanceConnectorKey}) -> Func, Data: ${toolkit.jsonDumps(inEventObj.data)}, Error: ${inEventObj.error}`);
    doAck(locals, client, inEventObj);
    return null;

  } else {
    // No error when handling Event
    locals.logger.debug(`[GUANCE WS] Event@${inEventObj.event}: Remote(${client.__guanceConnectorKey}) -> Func, Data: ${toolkit.jsonDumps(inEventObj.data)}`);
    return inEventObj;
  }
};

function createWebSocketClient(locals, connector, datafluxFuncId) {
  var client = socketIO(connector.configJSON.guanceWebSocketURL);

  // Set Guance / TrueWatch Info
  client.__connectorId        = connector.id;
  client.__guanceAPIKeyId     = connector.configJSON.guanceAPIKeyId;
  client.__guanceConnectorKey = getGuanceConnectorKey(connector.id, connector.configJSON.guanceAPIKeyId);

  // Report system info
  function reportSystemInfo() {
    var systemInfo = {
      name   : connector.title || `DataFlux Func (${IMAGE_INFO.VERSION})`,
      version: IMAGE_INFO.VERSION,

      // def of Connectors
      connectorDefinitions: GUANCE_DATA_SOURCE.connectorDefinitions,
    }
    doEmit(locals, client, EVENT_DFF_SYSTEM_INFO, systemInfo);
  }

  // Report local entity list
  function reportLocalEntityList() {
    async.eachOfSeries(LOCAL_DATA_META, function(meta, localDataKey, eachCallback) {
      meta.getList(locals, function(err, localList) {
        if (err) {
          locals.logger.logError(err);
          return eachCallback(err);
        }

        var emitData = {};
        emitData[localDataKey] = localList;
        doEmit(locals, client, meta.event, emitData);

        return eachCallback();
      });
    })
  }

  const EVENT_HANDLERS = [
    // Event (system)
    { event: 'error',
      handler: function(err) {
        locals.logger.error(`[GUANCE WS] Error: ${toolkit.jsonDumps(err)}`);
      },
    },
    { event: 'connect',
      handler: function() {
        // Send Auth info
        var timestamp = parseInt(Date.now() / 1000);
        var nonce     = toolkit.genRandString();
        var authData = {
          'apiKeyId'      : connector.configJSON.guanceAPIKeyId,
          'datafluxFuncId': datafluxFuncId,
          'timestamp'     : timestamp,
          'nonce'         : nonce,
          'signature'     : toolkit.getSha256(`${connector.configJSON.guanceAPIKey}~${datafluxFuncId}~${timestamp}~${nonce}`),
        }
        doEmit(locals, client, EVENT_DFF_AUTH, authData, function(resp) {
          if (!resp.ok) {
            return locals.logger.error(`[GUANCE WS] Error: ${toolkit.jsonDumps(resp)}`);
          }

          // Record Auth status
          client.__dffAuthed = true;

          // Reset local data MD5 map
          LOCAL_DATA_MD5_MAP[client.__guanceConnectorKey] = {};

          locals.logger.debug(`[GUANCE WS] Client to Remote(${client.__guanceConnectorKey}) created.`);

          reportSystemInfo();
          reportLocalEntityList();
        });
      }
    },
    // Event (common)
    { event: EVENT_PING,
      handler: function() {
        var inEventObj = getInEventObj(locals, client, EVENT_PING, arguments);
        if (!inEventObj) return;

        return doAck(locals, client, inEventObj);
      }
    },
    { event: EVENT_PING_V2,
      handler: function() {
        var inEventObj = getInEventObj(locals, client, EVENT_PING_V2, arguments);
        if (!inEventObj) return;

        return doAck(locals, client, inEventObj);
      }
    },
    { event: EVENT_DFF_INIT_REQUIRE,
      handler: function() {
        var inEventObj = getInEventObj(locals, client, EVENT_DFF_INIT_REQUIRE, arguments);
        if (!inEventObj) return;

        reportSystemInfo();
        reportLocalEntityList();

        return doAck(locals, client, inEventObj);
      }
    },
    { event: EVENT_DFF_FUNC_INIT_REQUIRE, // [Compatibility]
      handler: function() {
        var inEventObj = getInEventObj(locals, client, EVENT_DFF_FUNC_INIT_REQUIRE, arguments);
        if (!inEventObj) return;

        reportSystemInfo();
        reportLocalEntityList();

        return doAck(locals, client, inEventObj);
      }
    },
    // Event (Func calling)
    { event: EVENT_DFF_FUNC_CALL,
      handler: function() {
        var inEventObj = getInEventObj(locals, client, EVENT_DFF_FUNC_CALL, arguments);
        if (!inEventObj) return;

        var handlerFuncId  = inEventObj.data.funcId;
        var funcCallKwargs = inEventObj.data.kwargs || inEventObj.data.callKwargs || {};

        // Call Func
        var taskReq    = null;
        var funcResult = null;
        async.series([
          // Gen Func calling request
          function(asyncCallback) {
            var opt = {
              funcId        : handlerFuncId,
              funcCallKwargs: funcCallKwargs || {},
              origin        : 'connector',
              originId      : connector.id,
              queue         : CONFIG._FUNC_TASK_QUEUE_WEBSOCKET_HANDLER,
            }
            mainAPICtrl.createFuncRunnerTaskReq(locals, opt, function(err, _taskReq) {
              if (err) return asyncCallback(err);

              taskReq = _taskReq;

              return asyncCallback();
            });
          },
          // Send Task
          function(asyncCallback) {
            mainAPICtrl.callFuncRunner(locals, taskReq, function(err, taskResp) {
              locals.logger.debug(`[GUANCE WS] Event@${inEventObj.event}: Remote(${client.__guanceConnectorKey}) -> Func, Call: ${handlerFuncId}`);

              if (err) return asyncCallback(err);

              // Get result
              try {
                funcResult = taskResp.result.returnValue;
              } catch(err) {
                funcResult = null;
              }

              return asyncCallback();
            });
          },
        ], function(err) {
          if (err) return doAck(locals, client, inEventObj, null, err);
          return doAck(locals, client, inEventObj, funcResult);
        });
      }
    },
    // Event (HTTP API calling)
    { event: EVENT_DFF_HTTP_API,
      handler: function() {
        var inEventObj = getInEventObj(locals, client, EVENT_DFF_HTTP_API, arguments);
        if (!inEventObj) return;

        var method = (inEventObj.data.method || 'get').toLowerCase();
        var path   = inEventObj.data.path  || '/';
        var query  = inEventObj.data.query || undefined;
        var body   = inEventObj.data.body  || undefined;

        var api = `${method.toUpperCase()} ${path}`;
        if (!toolkit.matchWildcards(api, ALLOWED_HTTP_APIS)) {
          var err = new E('EGuanceEventFailed', 'Calling such API via websocket is not allowed');
          return doAck(locals, client, inEventObj, null, err);
        }

        var url = toolkit.updateQuery(path, query);

        // Localhost Auth
        var localhostAuthToken = toolkit.safeReadFileSync(CONFIG._WEB_LOCALHOST_AUTH_TOKEN_PATH).trim();

        // Send HTTP request to server self
        supertest(locals.app)[method](url)
        .trustLocalhost(true)
        .set(CONFIG._WEB_LOCALHOST_AUTH_TOKEN_HEADER, localhostAuthToken)
        .send(body)
        .end(function(err, res) {
          if (err) return doAck(locals, client, inEventObj, null, err);
          return doHTTPAPIAck(locals, client, inEventObj, res.body);
        });
      }
    },
  ]

  /* Listen Events */
  EVENT_HANDLERS.forEach(function(eh) {
    var event   = eh.event;
    var handler = eh.handler;

    if (!event) return;
    if ('function' !== typeof handler) return;

    client.on(event, handler);
  });

  return client;
};

exports.runListener = function runListener(app) {
  var lockKey   = toolkit.getCacheKey('lock', 'guanceWebSocketClient');
  var lockValue = toolkit.genRandString();
  app.locals.logger.info('Start Guance WebSocket Clients... Lock: `{0}`', lockValue);

  // Current DataFlux Func ID
  var dataFluxFuncId = null;

  // Check Guance / TrueWatch Connector regularly
  function guanceConnectorChecker() {
    // Connector clients map to be recreated
    var nextGuanceConnectorMap = {};
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
              app.locals.logger.debug('[GUANCE WS] Master Node');
            }
            IS_MASTER_NODE = true;

          } else {
            // The lock was acquired by other node,
            // For safety reasons, clean up all websocket clients in this node
            if (IS_MASTER_NODE === null || IS_MASTER_NODE === true) {
              app.locals.logger.debug('[GUANCE WS] Non-Master Node');
            }

            IS_MASTER_NODE = false;

            for (var gcKey in GUANCE_CONNECTOR_MAP) {
              var connector = GUANCE_CONNECTOR_MAP[gcKey];
              connector.client.close();
              delete GUANCE_CONNECTOR_MAP[gcKey];
            }
          }

          return asyncCallback();
        });
      },
      // Get Guance / TrueWatch Connector list
      function(asyncCallback) {
        var connectorModel = connectorMod.createModel(app.locals);
        connectorModel.decipher = true;

        var opt = {
          fields: [
            'cnct.id',
            'cnct.title',
            'cnct.configJSON',
          ],
          filters: {
            'cnct.type': { in: [ 'guance', 'truewatch' ] },
          },
        };
        connectorModel.list(opt, function(err, dbRes) {
          if (err) return asyncCallback(err);

          dbRes.forEach(function(d) {
            d.configJSON = d.configJSON || {};
            d.configMD5  = toolkit.getMD5(d.configJSON);

            // Ignore if this node is not a master node
            if (!IS_MASTER_NODE) return;

            // Add to Connector client map
            var gcKey = getGuanceConnectorKey(d.id, d.configJSON.guanceAPIKeyId);
            nextGuanceConnectorMap[gcKey] = toolkit.jsonCopy(d);
          });

          return asyncCallback();
        });
      },
      // Get current DataFlux Func ID
      function(asyncCallback) {
        if (toolkit.isNothing(nextGuanceConnectorMap)) return asyncCallback();

        var systemSettingModel = systemSettingMod.createModel(app.locals);

        systemSettingModel.get('DATAFLUX_FUNC_ID', function(err, dbRes) {
          if (err) return asyncCallback(err);

          dataFluxFuncId = dbRes.DATAFLUX_FUNC_ID;

          return asyncCallback();
        });
      },
      // Update Guance / TrueWatch Connector client map
      function(asyncCallback) {
        // Clear Connector that not exists
        for (var gcKey in GUANCE_CONNECTOR_MAP) {
          if ('undefined' === typeof nextGuanceConnectorMap[gcKey]) {
            GUANCE_CONNECTOR_MAP[gcKey].client.close();
            delete GUANCE_CONNECTOR_MAP[gcKey];

            app.locals.logger.debug('[GUANCE WS] Client removed: `{0}`', gcKey);
          }
        }

        // Recreate Connector clients that have changes
        for (var gcKey in nextGuanceConnectorMap) {
          var _next    = nextGuanceConnectorMap[gcKey];
          var _current = GUANCE_CONNECTOR_MAP[gcKey];

          // Skip if no changes
          if (_current && _current['configMD5'] && _current['configMD5'] === _next['configMD5']) {
            continue
          }

          // Remove client
          if (_current) {
            _current.client.close();
            delete GUANCE_CONNECTOR_MAP[gcKey];
            app.locals.logger.debug('[GUANCE WS] Client removed: `{0}`', gcKey);
          }

          // Create new client
          try {
            _next.client = createWebSocketClient(app.locals, _next, dataFluxFuncId);
          } catch(err) {
            app.locals.logger.warning('[GUANCE WS] Client creating Error: `{0}`, reason: {1}', gcKey, err.toString());
            continue
          }

          // Add to G.C
          GUANCE_CONNECTOR_MAP[gcKey] = _next;
          app.locals.logger.debug('[GUANCE WS] Client created: `{0}` to `{1}`', gcKey, _next.configJSON.guanceWebSocketURL);

          return asyncCallback();
        }
      },
    ], function(err) {
      if (err) return app.locals.logger.logError(err);
    });
  };
  setInterval(guanceConnectorChecker, GUANCE_CONNECTOR_CHECK_INTERVAL);

  // Report local data regularly
  function localDataReporter() {
    // Ignore if this node is not a master node
    if (!IS_MASTER_NODE) {
      LOCAL_DATA_MD5_MAP = {};
      return;
    }

    async.eachOfSeries(GUANCE_CONNECTOR_MAP, function(connector, gcKey, eachCallback) {
      // Skip if client not Authed
      if (!connector || !connector.client || !connector.client.__dffAuthed) return eachCallback();

      // Init if never reported
      if (!LOCAL_DATA_MD5_MAP[gcKey]) {
        LOCAL_DATA_MD5_MAP[gcKey] = {};
      }

      async.eachOfSeries(LOCAL_DATA_META, function(meta, localDataKey, innerEachCallback) {
        var localData    = null;
        var localDataMD5 = null;

        async.series([
          // Get local data
          function(asyncCallback) {
            meta.getList(app.locals, function(err, dbRes) {
              if (err) return asyncCallback(err);

              localData    = dbRes;
              localDataMD5 = toolkit.getMD5(toolkit.jsonCopy(dbRes));

              return asyncCallback();
            });
          },
          // Handle local data
          function(asyncCallback) {
            var prevLocalDataMD5 = LOCAL_DATA_MD5_MAP[gcKey][localDataKey] || null;

            // Skip if MD5 of local data not changed
            if (prevLocalDataMD5 === localDataMD5) return asyncCallback();

            // Record and report if MD5 of local data changed
            LOCAL_DATA_MD5_MAP[gcKey][localDataKey] = localDataMD5;

            // Do report
            app.locals.logger.debug(`[GUANCE WS] Local Data MD5 (${gcKey}, ${localDataKey}) changed (${prevLocalDataMD5} -> ${localDataMD5}), need to report`);

            var emitData = {};
            emitData[localDataKey] = toolkit.jsonCopy(localData);
            doEmit(app.locals, connector.client, meta.event, emitData);

            return asyncCallback();
          },
        ], innerEachCallback);
      }, eachCallback);
    });
  };
  setInterval(localDataReporter, LOCAL_DATA_REPORT_INTERVAL);
};
