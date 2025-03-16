'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async     = require('async');
var splitargs = require('splitargs');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');

var connectorMod = require('../models/connectorMod');

/* Init */
var RESERVED_REF_NAME = 'dataflux_';

function _checkConfig(locals, type, config, skipTest, callback) {
  var requiredFields = [];
  var optionalFields = [];

  switch(type) {
    case 'guance':
    case 'truewatch':
      requiredFields = ['guanceNode', 'guanceOpenAPIURL', 'guanceWebSocketURL', 'guanceOpenWayURL', 'guanceAPIKeyId', 'guanceAPIKey'];
      optionalFields = [];
      break;

    case 'df_datakit':
      config.port     = config.port     || 9529;
      config.protocol = config.protocol || 'http';

      requiredFields = ['host'];
      optionalFields = ['port', 'protocol', 'source'];
      break;

    case 'df_dataway':
      config.port     = config.port     || 9528;
      config.protocol = config.protocol || 'http';

      requiredFields = ['host'];
      optionalFields = ['port', 'protocol', 'token', 'accessKey', 'secretKey'];
      break;

    case 'dff_sidecar':
      config.host     = config.host     || '172.17.0.1';
      config.port     = config.port     || 8099;
      config.protocol = config.protocol || 'http';

      requiredFields = ['secretKey'];
      optionalFields = ['host', 'port', 'protocol'];
      break;

    case 'influxdb':
      config.port     = config.port     || 8086;
      config.protocol = config.protocol || 'http';

      requiredFields = ['host'];
      optionalFields = ['port', 'protocol', 'database', 'user', 'password'];
      break;

    case 'mysql':
      config.port    = config.port    || 3306;
      config.charset = config.charset || 'utf8mb4';

      requiredFields = ['host', 'database', 'user', 'password'];
      optionalFields = ['port', 'charset'];
      break;

    case 'redis':
      config.port     = config.port     || 6379;
      config.password = config.password || null;
      config.database = config.database || 0;

      requiredFields = ['host'];
      optionalFields = ['port', 'database', 'user', 'password', 'authType', 'topicHandlers'];
      break;

    case 'memcached':
      requiredFields = ['servers'];
      optionalFields = [];
      break;

    case 'clickhouse':
      config.port = config.port || 9000;
      config.user = config.user || 'default';

      requiredFields = ['host', 'database'];
      optionalFields = ['port', 'user', 'password'];
      break;

    case 'oracle':
      config.port    = config.port    || 1521;
      config.charset = config.charset || 'utf8';

      requiredFields = ['host', 'database', 'user', 'password'];
      optionalFields = ['port', 'charset'];
      break;

    case 'sqlserver':
      config.port    = config.port    || 1433;
      config.charset = config.charset || 'utf8';

      requiredFields = ['host', 'database', 'user', 'password'];
      optionalFields = ['port', 'charset'];
      break;

    case 'postgresql':
      config.port    = config.port    || 5432;
      config.charset = config.charset || 'utf8';

      requiredFields = ['host', 'database', 'user', 'password'];
      optionalFields = ['port', 'charset'];
      break;

    case 'mongodb':
      config.port = config.port || 27017;

      requiredFields = ['host'];
      optionalFields = ['port', 'user', 'password', 'database'];
      break;

    case 'elasticsearch':
      config.port     = config.port     || 9200;
      config.protocol = config.protocol || 'http';

      requiredFields = ['host'];
      optionalFields = ['port', 'protocol', 'user', 'password'];
      break;

    case 'nsq':
      config.port = config.port || 4161;

      requiredFields = ['host'];
      optionalFields = ['port', 'protocol', 'servers'];
      break;

    case 'mqtt':
      config.port = config.port || 1883;

      requiredFields = ['host'];
      optionalFields = ['port', 'user', 'password', 'clientId', 'multiSubClient', 'topicHandlers'];
      break;

    case 'kafka':
      requiredFields = ['servers'];
      optionalFields = ['user', 'password', 'groupId', 'securityProtocol', 'saslMechanisms', 'multiSubClient', 'kafkaOffset', 'topicHandlers'];
      break;

    case 'prometheus':
      config.port     = config.port     || 9090;
      config.protocol = config.protocol || 'http';

      requiredFields = ['host'];
      optionalFields = ['port', 'protocol', 'user', 'password'];
      break;

    case 'aliyunSLS':
      requiredFields = ['endpoint', 'accessKeyId', 'accessKeySecret'];
      optionalFields = [];
      break;
  }

  // Check fields
  for (var i = 0; i < requiredFields.length; i++) {
    var f = requiredFields[i];

    if ('undefined' === typeof config[f]) {
      return callback(new E('EClientBadRequest.InvalidConnectorConfigJSON', 'Invalid config JSON', {
        requiredFields: requiredFields,
        optionalFields: optionalFields,
        missingField  : f,
      }));
    }
  }

  // Try to connect
  if (skipTest) return callback();

  var taskReq = {
    name  : 'Internal.CheckConnector',
    kwargs: { type: type, config: config },

    onResponse(taskResp) {
      switch(taskResp.status) {
        case 'noResponse':
          return callback(new E('EWorkerNoResponse', 'Worker no response, please check the status of this system'));

        case 'failure':
          return callback(new E('EClientBadRequest.ConnectingToConnectorFailed', 'Connecting to Connector failed', {
            exception: taskResp.exception,
            traceback: taskResp.traceback,
          }));

        case 'timeout':
          return callback(new E('EClientBadRequest.ConnectingToConnectorFailed', 'Connecting to Connector timeout', {
            exception: taskResp.exception,
            traceback: taskResp.traceback,
          }));
      }

      return callback();
    }
  }
  return locals.cacheDB.putTask(taskReq);
};

/* Handlers */
var crudHandler = exports.crudHandler = connectorMod.createCRUDHandler();

exports.list = crudHandler.createListHandler();

exports.add = function(req, res, next) {
  var data     = req.body.data;
  var skipTest = toolkit.toBoolean(req.body.skipTest) || false;
  var testOnly = toolkit.toBoolean(req.body.testOnly) || false;

  if (toolkit.startsWith(data.id, RESERVED_REF_NAME)) {
    return next(new E('EBizCondition.ReservedConnectorIDPrefix', 'Cannot use a ID of reserved prefix'));
  }

  var connectorModel = connectorMod.createModel(res.locals);

  var newConnector = null;

  async.series([
    // Check for ID duplication
    function(asyncCallback) {
      if (testOnly) return asyncCallback();

      var opt = {
        limit  : 1,
        fields : ['cnct.id'],
        filters: {
          'cnct.id': {eq: data.id},
        },
      };
      connectorModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes.length > 0) {
          return asyncCallback(new E('EBizCondition.DuplicatedConnectorID', 'ID of Connector already exists'));
        }

        return asyncCallback();
      });
    },
    // Check connector config
    function(asyncCallback) {
      if (toolkit.isNothing(data.configJSON)) return asyncCallback();

      return _checkConfig(res.locals, data.type, data.configJSON, skipTest, asyncCallback);
    },
    // Save to DB
    function(asyncCallback) {
      if (testOnly) return asyncCallback();

      connectorModel.add(data, function(err, _addedId, _addedData) {
        if (err) return asyncCallback(err);

        newConnector = _addedData;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: data.id,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.modify = function(req, res, next) {
  var id       = req.params.id;
  var data     = req.body.data;
  var skipTest = toolkit.toBoolean(req.body.skipTest) || false;

  var connectorModel = connectorMod.createModel(res.locals);
  connectorModel.decipher = true;

  var connector = null;

  async.series([
    // Get connector
    function(asyncCallback) {
      connectorModel.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        connector = dbRes;
        if (connector.isBuiltin) {
          return asyncCallback(new E('EBizCondition.ModifyingBuiltinConnectorNotAllowed', 'Modifying built-in Connector is not allowed, please edit the config instead'));
        }

        return asyncCallback();
      });
    },
    // Check connector config
    function(asyncCallback) {
      if (toolkit.isNothing(data.configJSON)) return asyncCallback();

      return _checkConfig(res.locals, connector.type, data.configJSON, skipTest, asyncCallback);
    },
    // Save to DB
    function(asyncCallback) {
      connectorModel.modify(id, data, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: id,
    });
    res.locals.sendJSON(ret);

    reloadDataMD5Cache(res.locals, id);
  });
};

exports.delete = function(req, res, next) {
  var id = req.params.id;

  var connectorModel = connectorMod.createModel(res.locals);

  var connector = null;

  async.series([
    // Get connector
    function(asyncCallback) {
      connectorModel.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        connector = dbRes;
        if (connector.isBuiltin) {
          return asyncCallback(new E('EBizCondition.DeletingBuiltinConnectorNotAllowed', 'Deleting built-in Connector is not allowed'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      connectorModel.delete(id, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: id,
    });
    res.locals.sendJSON(ret);

    reloadDataMD5Cache(res.locals, id);
  });
};

exports.query = function(req, res, next) {
  var id                   = req.params.id;
  var command              = req.body.command;
  var commandArgs          = req.body.commandArgs;
  var commandKwargs        = req.body.commandKwargs;
  var queryStatement       = req.body.queryStatement;
  var database             = req.body.database;
  var returnType           = req.body.returnType;
  var guanceDQLLikeOptions = req.body.guanceDQLLikeOptions;

  var connectorModel = connectorMod.createModel(res.locals);

  var connector   = null;
  var queryResult = null;

  // Check parameters
  if (!command && !queryStatement) {
    return next(new E('EClientBadRequest', 'Either `command` or `queryStatement` must be specified'));
  }

  async.series([
    // Get connector
    function(asyncCallback) {
      connectorModel.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        connector = dbRes;

        return asyncCallback();
      });
    },
    // Run query
    function(asyncCallback) {
      // Preapre task kwargs
      var taskKwargs = {
        id                  : connector.id,
        command             : command,
        commandArgs         : commandArgs,
        commandKwargs       : commandKwargs,
        database            : database,
        queryStatement      : queryStatement,
        returnType          : returnType || 'json',
        guanceDQLLikeOptions: guanceDQLLikeOptions,
      };

      // Send task
      var taskReq = {
        name  : 'Internal.QueryConnector',
        kwargs: taskKwargs,

        onResponse(taskResp) {
          switch(taskResp.status) {
            case 'noResponse':
              return asyncCallback(new E('EWorkerNoResponse', 'Worker no response, please check the status of this system'));

            case 'failure':
              return asyncCallback(new E('EClientBadRequest.QueryFailed', 'Query failed', {
                exception: taskResp.exception,
                traceback: taskResp.traceback,
              }));

            case 'timeout':
              return asyncCallback(new E('EClientBadRequest.QueryTimeout', 'Query timeout', {
                exception: taskResp.exception,
                traceback: taskResp.traceback,
              }));
          }

          queryResult = taskResp.result || null;
          return asyncCallback();
        }
      }
      return res.locals.cacheDB.putTask(taskReq);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(queryResult);
    return res.locals.sendJSON(ret);
  });
};

exports.listSubInfo = function(req, res, next) {
  var connectorId = req.params.id;

  var recentSubInfoMap = {};

  async.series([
    // Get consume rate (10-second aggregation)
    function(asyncCallback) {
      var now              = toolkit.getTimestamp();
      var alignedTimestamp = parseInt(now / 10) * 10;
      async.times(6, function(n, timesCallback) {
        var fatchTimestamp = alignedTimestamp - (6 - n) * 10
        var cacheKey = toolkit.getCacheKey('cache', 'recentSubConsumeRate', [ 'timestamp', fatchTimestamp]);
        res.locals.cacheDB.hgetall(cacheKey, function(err, cacheRes) {
          if (err) return timesCallback(err);

          for (var ctKey in cacheRes) {
            recentSubInfoMap[ctKey] = recentSubInfoMap[ctKey] || {};
            recentSubInfoMap[ctKey].lastMinuteCount = recentSubInfoMap[ctKey].lastMinuteCount || 0;
            recentSubInfoMap[ctKey].lastMinuteCount += parseInt(cacheRes[ctKey]);
          }

          return timesCallback();
        });
      }, asyncCallback);
    },
    // Get recent sub consume info
    function(asyncCallback) {
      var cacheKey = toolkit.getCacheKey('cache', 'recentSubConsumeInfo');
      var fieldPattern = toolkit.getColonTags([
        'connectorId', connectorId,
        'topic',       '*',
        'status',      '*',
      ]);
      res.locals.cacheDB.hgetPattern(cacheKey, fieldPattern, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (cacheRes) {
          for (var field in cacheRes) {
            var consumeInfo = JSON.parse(cacheRes[field]);

            var parsedTags = toolkit.parseColonTags(field);
            var ctKey = toolkit.getColonTags([
              'connectorId', parsedTags.connectorId,
              'topic',       parsedTags.topic,
            ]);

            recentSubInfoMap[ctKey] = recentSubInfoMap[ctKey] || {};
            recentSubInfoMap[ctKey].lastConsumed = recentSubInfoMap[ctKey].lastConsumed || {};
            recentSubInfoMap[ctKey].lastConsumed[consumeInfo.taskResp.status] = consumeInfo;
          }
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    // Prepare data
    var recentSubInfoList = [];
    for (var ctKey in recentSubInfoMap) {
      var recentSubInfo = recentSubInfoMap[ctKey];

      var ctKeyTags = toolkit.parseColonTags(ctKey);
      recentSubInfo.connectorId = ctKeyTags.connectorId;
      recentSubInfo.topic       = ctKeyTags.topic;

      recentSubInfoList.push(recentSubInfo);
    }

    var ret = toolkit.initRet(recentSubInfoList);
    res.locals.sendJSON(ret);
  });
};

function reloadDataMD5Cache(locals, connectorId, callback) {
  var taskReq = {
    name  : 'Internal.ReloadDataMD5Cache',
    kwargs: { type: 'connector', id: connectorId },
  }
  locals.cacheDB.putTask(taskReq, callback);
};
