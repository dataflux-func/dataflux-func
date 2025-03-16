'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');

var envVariableMod = require('../models/envVariableMod');

/* Init */

/* Handlers */
var crudHandler = exports.crudHandler = envVariableMod.createCRUDHandler();

exports.list = crudHandler.createListHandler();

exports.add = function(req, res, next) {
  var data = req.body.data;

  var envVariableModel = envVariableMod.createModel(res.locals);

  async.series([
    // Check for ID duplication
    function(asyncCallback) {
      var opt = {
        limit  : 1,
        fields : ['evar.id'],
        filters: {
          'evar.id': { eq: data.id },
        },
      };
      envVariableModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes.length > 0) {
          return asyncCallback(new E('EBizCondition.DuplicatedEnvVariableID', 'ID of ENV Variable already exists'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      envVariableModel.add(data, asyncCallback);
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
  var id   = req.params.id;
  var data = req.body.data;

  var envVariableModel = envVariableMod.createModel(res.locals);

  async.series([
    // Get Env Variable
    function(asyncCallback) {
      // Skip if not modified
      if (!data.valueTEXT) return asyncCallback();

      // Skip if autoTypeCasting provided
      if (data.autoTypeCasting) return asyncCallback();

      envVariableModel.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        data.autoTypeCasting = dbRes.autoTypeCasting;

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      envVariableModel.modify(id, data, asyncCallback);
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

  var envVariableModel = envVariableMod.createModel(res.locals);

  var envVariable = null;

  async.series([
    // Get Env Variable
    function(asyncCallback) {
      envVariableModel.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        envVariable = dbRes;

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      envVariableModel.delete(id, asyncCallback);
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

function reloadDataMD5Cache(locals, envVariableId, callback) {
  var taskReq = {
    name  : 'Internal.ReloadDataMD5Cache',
    kwargs: { type: 'envVariable', id: envVariableId },
  }
  locals.cacheDB.putTask(taskReq, callback);
};
