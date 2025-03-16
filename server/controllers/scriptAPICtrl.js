'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var fs    = require('fs-extra');
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var common      = require('../utils/common');
var modelHelper = require('../utils/modelHelper');

var scriptSetMod            = require('../models/scriptSetMod');
var scriptMod               = require('../models/scriptMod');
var funcMod                 = require('../models/funcMod');
var scriptPublishHistoryMod = require('../models/scriptPublishHistoryMod');

var mainAPICtrl = require('./mainAPICtrl');

/* Init */

/* Handlers */
var crudHandler = exports.crudHandler = scriptMod.createCRUDHandler();

exports.list = function(req, res, next) {
  var listData     = null;
  var listPageInfo = null;

  var scriptModel = scriptMod.createModel(res.locals);

  async.series([
    function(asyncCallback) {
      var opt = res.locals.getQueryOptions();

      scriptModel.list(opt, function(err, dbRes, pageInfo) {
        if (err) return asyncCallback(err);

        listData     = dbRes;
        listPageInfo = pageInfo;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(listData, listPageInfo);
    res.locals.sendJSON(ret);
  });
};

exports.add = function(req, res, next) {
  var data = req.body.data;

  var scriptSetModel = scriptSetMod.createModel(res.locals);
  var scriptModel    = scriptMod.createModel(res.locals);

  async.series([
    // Check lock status of Script Set
    function(asyncCallback) {
      // No limit to Admin
      if (res.locals.user.is('sa')) return asyncCallback();

      var scriptSetId = data.id.split('__')[0];
      scriptSetModel.getWithCheck(scriptSetId, ['lockedByUserId', 'lockConfigJSON'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_editScriptCode' ])) {
          return asyncCallback(new E('EBizCondition.AddingScriptNotAllowed', 'This Script Set is locked by other user'));
        }

        return asyncCallback();
      });
    },
    // Check for ID duplication
    function(asyncCallback) {
      var opt = {
        limit  : 1,
        fields : ['scpt.id'],
        filters: {
          'scpt.id': {eq: data.id},
        },
      };
      scriptModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes.length > 0) {
          return asyncCallback(new E('EBizCondition.DuplicatedScriptID', 'ID of script already exists'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      // Add sample code
      if (!data.codeDraft && !data.codeDraftBase64 && !data.code) {
        data.codeDraft = fs.readFileSync(`script-example/example.${res.locals.clientUILocale}.py`).toString();
      }

      scriptModel.add(data, asyncCallback);
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

  var prevCodeDraftMD5 = req.body.prevCodeDraftMD5;

  var scriptModel = scriptMod.createModel(res.locals);

  var codeDraftMD5 = null;
  async.series([
    // Check lock status of Script, MD5 of code
    function(asyncCallback) {
      scriptModel.getWithCheck(id, ['codeDraftMD5', 'lockedByUserId', 'sset_lockedByUserId', 'lockConfigJSON', 'sset_lockConfigJSON'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Check limitation to non-admin user
        if (!res.locals.user.is('sa')) {
          var isModifyingCode       = !!prevCodeDraftMD5;
          var isModifyingSetup      = false;
          var isModifyingLockConfig = false;

          Object.keys(data).forEach(function(k) {
            switch(k) {
              case 'codeDraft':
              case 'codeDraftBase64':
                isModifyingCode = true;
                break;

              case 'isLocked':
              case 'lockConfigJSON':
                isModifyingLockConfig = true;
                break;

              default:
                isModifyingSetup = true;
                break;
            }
          });

          // Check permission for code editing
          if (isModifyingCode && !common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_editScriptCode', 'script_editCode' ])) {
            return asyncCallback(new E('EBizCondition.ModifyingScriptCodeNotAllowed', 'This Script is locked by other user'));
          }

          // Check permission for lock config
          if (isModifyingLockConfig && !common.lockConfigCan(res.locals.user, dbRes)) {
            return asyncCallback(new E('EBizCondition.ModifyingScriptLockConfigNotAllowed', 'This Script is locked by other user'));
          }

          // Check permission for setup
          if (isModifyingSetup && !common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_setupScript', 'script_setup' ])) {
            return asyncCallback(new E('EBizCondition.ModifyingScriptSetupNotAllowed', 'This Script is locked by other user'));
          }
        }

        if (prevCodeDraftMD5 && prevCodeDraftMD5 !== dbRes.codeDraftMD5) {
          return asyncCallback(new E('EBizRequestConflict.scriptDraftAlreadyChanged', 'Script draft already changed'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      // Add / clear lock config
      if (data.isLocked === true) {
        data.lockedByUserId = res.locals.user.id;
        data.lockConfigJSON = data.lockConfigJSON || []
      } else if (data.isLocked === false) {
        data.lockedByUserId = null;
        data.lockConfigJSON = null;
      }
      delete data.isLocked;

      scriptModel.modify(id, data, function(err, _modifiedId, _modifiedData) {
        if (err) return asyncCallback(err);

        codeDraftMD5 = _modifiedData.codeDraftMD5 || null;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id          : id,
      codeDraftMD5: codeDraftMD5,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.delete = function(req, res, next) {
  var id = req.params.id;

  var scriptModel = scriptMod.createModel(res.locals);

  async.series([
    // Check lock status of Script
    function(asyncCallback) {
      // No limit to Admin
      if (res.locals.user.is('sa')) return asyncCallback();

      scriptModel.getWithCheck(id, ['lockedByUserId', 'sset_lockedByUserId', 'lockConfigJSON', 'sset_lockConfigJSON'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_deleteScript' ])) {
          return asyncCallback(new E('EBizCondition.DeletingScriptNotAllowed', 'This Script is locked by other user'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      scriptModel.delete(id, asyncCallback);
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

exports.publish = function(req, res, next) {
  var id   = req.params.id;
  var data = req.body.data || {};

  var scriptModel               = scriptMod.createModel(res.locals);
  var funcModel                 = funcMod.createModel(res.locals);
  var scriptPublishHistoryModel = scriptPublishHistoryMod.createModel(res.locals);

  var script = null;

  var nextScriptPublishVersion = null;
  var nextAPIFuncs             = [];

  var transScope = modelHelper.createTransScope(res.locals.db);
  async.series([
    // Check lock status of Script
    function(asyncCallback) {
      // No limit to Admin
      scriptModel.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_editScriptCode', 'script_editCode' ])) {
          return asyncCallback(new E('EBizCondition.PublishingScriptNotAllowed', 'This Script is locked by other user'));
        }

        script = dbRes;

        nextScriptPublishVersion = script.publishVersion + 1;

        return asyncCallback();
      });
    },
    // Send pre-check Task for Script
    function(asyncCallback) {
      var opt = {
        scriptId: id,

        origin  : 'script',
        originId: id,
      }
      mainAPICtrl.callFuncDebugger(res.locals, opt, function(err, taskResp) {
        if (err) return asyncCallback(err);

        switch (taskResp.result.status) {
          case 'failure':
          case 'timeout':
            return asyncCallback(new E('EScriptPublishFailed', 'Script publishing failed. Please check your code', taskResp));
        }

        nextAPIFuncs = taskResp.result.apiFuncs;

        return asyncCallback();
      })
    },
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Update Script
    function(asyncCallback) {
      var _data = {
        code          : script.codeDraft,
        publishVersion: nextScriptPublishVersion,
      }
      scriptModel.modify(id, _data, asyncCallback);
    },
    // Update Func
    function(asyncCallback) {
      funcModel.update(script.id, nextAPIFuncs, asyncCallback);
    },
    // Add Script publish history
    function(asyncCallback) {
      var _data = {
        scriptId            : script.id,
        scriptPublishVersion: nextScriptPublishVersion,
        scriptCode_cache    : script.codeDraft, // At this time, `codeDraft` has been updated to `code`
        note                : data.note,
      };
      scriptPublishHistoryModel.add(_data, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return next(scopeErr);

      // Response first
      var ret = toolkit.initRet({
        id            : id,
        publishVersion: nextScriptPublishVersion,
        apiFuncs      : nextAPIFuncs,
      });
      res.locals.sendJSON(ret);

      // After published
      // 1. Reload MD5 cache of Script code
      // 2. Run Func with autoRun.onScriptPublish config
      reloadDataMD5Cache(res.locals, id, function(err) {
        if (err) return;

        nextAPIFuncs.forEach(function(func) {
          if (func.integration !== 'autoRun') return;

          var onScriptPublish = false;
          try { onScriptPublish = onScriptPublish || func.extraConfig.integrationConfig.onScriptPublish } catch(err) { }
          try { onScriptPublish = onScriptPublish || func.extraConfig.integrationConfig.onPublish       } catch(err) { }

          if (!onScriptPublish) return;

          var funcId = `${id}.${func.name}`;
          var opt = {
            funcId         : funcId,
            origin         : 'integration',
            originId       : `autoRun.onScriptPublish-${funcId}`,
            taskRecordLimit: CONFIG._TASK_RECORD_FUNC_LIMIT_INTEGRATION,
            ignoreResult   : true,
          }
          mainAPICtrl.createFuncRunnerTaskReq(res.locals, opt, function(err, _taskReq) {
            if (_taskReq) return mainAPICtrl.callFuncRunner(res.locals, _taskReq);
          });
        });
      });
    });
  });
};

function reloadDataMD5Cache(locals, scriptId, callback) {
  var taskReq = {
    name  : 'Internal.ReloadDataMD5Cache',
    kwargs: { type: 'script', id: scriptId },
  }
  locals.cacheDB.putTask(taskReq, callback);
};

exports.reloadDataMD5Cache = reloadDataMD5Cache;
