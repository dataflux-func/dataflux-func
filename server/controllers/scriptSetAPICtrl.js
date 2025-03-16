'use strict';

/* Built-in Modules */
var path = require('path');

/* 3rd-party Modules */
var fs     = require('fs-extra');
var async  = require('async');
var moment = require('moment-timezone');
var AdmZip = require("adm-zip");
var yaml   = require('js-yaml');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var ROUTE   = require('../utils/yamlResources').get('ROUTE');
var toolkit = require('../utils/toolkit');
var common  = require('../utils/common');

var scriptSetMod              = require('../models/scriptSetMod');
var scriptMod                 = require('../models/scriptMod');
var funcMod                   = require('../models/funcMod');
var connectorMod              = require('../models/connectorMod');
var envVariableMod            = require('../models/envVariableMod');
var syncAPIMod                = require('../models/syncAPIMod');
var asyncAPIMod               = require('../models/asyncAPIMod');
var cronJobMod                = require('../models/cronJobMod');
var scriptSetExportHistoryMod = require('../models/scriptSetExportHistoryMod');

var mainAPICtrl = require('./mainAPICtrl');

/* Init */

/* Handlers */
var crudHandler = exports.crudHandler = scriptSetMod.createCRUDHandler();

exports.list = function(req, res, next) {
  var withScripts    = toolkit.toBoolean(req.query._withScripts);
  var withScriptCode = toolkit.toBoolean(req.query._withScriptCode);

  var listData     = null;
  var listPageInfo = null;

  var scriptModel    = scriptMod.createModel(res.locals);
  var scriptSetModel = scriptSetMod.createModel(res.locals);

  async.series([
    // Get Script Set
    function(asyncCallback) {
      var opt = res.locals.getQueryOptions();

      scriptSetModel.list(opt, function(err, dbRes, pageInfo) {
        if (err) return asyncCallback(err);

        listData     = dbRes;
        listPageInfo = pageInfo;

        return asyncCallback();
      });
    },
    // Get Script
    function(asyncCallback) {
      if (!withScripts) return asyncCallback();

      var scriptSetIds = toolkit.arrayElementValues(listData, 'id');
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();

      var opt = {
        filters: {
          scriptSetId: { in: scriptSetIds }
        },
        extra: {
          withCode: withScriptCode,
        }
      }
      scriptModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        var _map = dbRes.reduce(function(acc, x) {
          if (!acc[x.scriptSetId]) acc[x.scriptSetId] = [];
          acc[x.scriptSetId].push(x);
          return acc;
        }, {});

        listData.forEach(function(scriptSet) {
          scriptSet.scripts = _map[scriptSet.id] || [];
          scriptSet.md5     = common.getScriptSetMD5(scriptSet, scriptSet.scripts);
        });

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

  async.series([
    // Check for ID duplication
    function(asyncCallback) {
      var opt = {
        limit  : 1,
        fields : ['sset.id'],
        filters: {
          'sset.id': {eq: data.id},
        },
      };
      scriptSetModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes.length > 0) {
          return asyncCallback(new E('EBizCondition.DuplicatedScriptSetID', 'ID of script set already exists'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      scriptSetModel.add(data, asyncCallback);
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

  var scriptSetModel = scriptSetMod.createModel(res.locals);

  async.series([
    // Check lock config
    function(asyncCallback) {
      // No limitation to sa user
      if (res.locals.user.is('sa')) return asyncCallback();

      var isModifyingSetup      = false;
      var isModifyingLockConfig = false;

      Object.keys(data).forEach(function(k) {
        switch(k) {
          case 'isLocked':
          case 'lockConfigJSON':
            isModifyingLockConfig = true;
            break;

          default:
            isModifyingSetup = true;
            break;
        }
      });

      scriptSetModel.getWithCheck(id, ['lockedByUserId', 'lockConfigJSON'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Check lock owner
        if (isModifyingLockConfig && !common.lockConfigCan(res.locals.user, dbRes)) {
          return asyncCallback(new E('EBizCondition.ModifyingScriptSetLockConfigNotAllowed', 'This Script Set is locked by other user'));
        }

        // Check lock for setup
        if (isModifyingSetup && !common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_setup' ])) {
          return asyncCallback(new E('EBizCondition.ModifyingScriptSetSetupNotAllowed', 'This Script Set is locked by other user'));
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

      scriptSetModel.modify(id, data, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: id,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.delete = function(req, res, next) {
  var id = req.params.id;

  var scriptSetModel = scriptSetMod.createModel(res.locals);

  async.series([
    // Check lock config of Script Set
    function(asyncCallback) {
      // No limitation to sa user
      if (res.locals.user.is('sa')) return asyncCallback();

      scriptSetModel.getWithCheck(id, ['lockedByUserId'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!common.lockConfigCan(res.locals.user, dbRes)) {
          return asyncCallback(new E('EBizCondition.DeletingScriptSetNotAllowed', 'This Script Set is locked by other user'));
        }

        return asyncCallback();
      });
    },
    // Save to DB
    function(asyncCallback) {
      scriptSetModel.delete(id, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: id,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.clone = function(req, res, next) {
  var id    = req.params.id;
  var newId = req.body.newId;

  var scriptSetModel = scriptSetMod.createModel(res.locals);
  var scriptModel    = scriptMod.createModel(res.locals);

  async.series([
    // Check lock config
    function(asyncCallback) {
      // No limitation to sa user
      if (res.locals.user.is('sa')) return asyncCallback();

      scriptSetModel.getWithCheck(id, ['lockedByUserId', 'lockConfigJSON'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_readScriptCode', 'scriptSet_editScriptCode' ])) {
          return asyncCallback(new E('EBizCondition.CloningScriptSetNotAllowed', 'This Script Set is locked by other user'));
        }

        return asyncCallback();
      });
    },
    // Check for ID duplication
    function(asyncCallback) {
      var opt = {
        limit  : 1,
        fields : ['sset.id'],
        filters: {
          'sset.id': { eq: newId },
        },
      };
      scriptSetModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes.length > 0) {
          return asyncCallback(new E('EBizCondition.DuplicatedScriptSetID', 'ID of script set already exists'));
        }

        return asyncCallback();
      });
    },
    // Check if ID is too long or not
    function(asyncCallback) {
      var opt = {
        fields : ['scpt.id'],
        filters: {
          'scpt.scriptSetId': { eq: id },
        },
      };
      scriptModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        for (var i = 0; i < dbRes.length; i++) {
          var newScriptid = `${newId}__${dbRes[i].id.split('__')[1]}`;
          if (newScriptid.length > ROUTE.scriptAPI.add.body.data.id.$maxLength) {
            return asyncCallback(new E('EBizCondition.ClonedScriptIDTooLong', 'ID of cloned Script will be too long'));
          }
        }

        return asyncCallback();
      });
    },
    // Clone Script Set
    function(asyncCallback) {
      scriptSetModel.clone(id, newId, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: newId,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.export = function(req, res, next) {
  var opt = req.body || {};

  // [Compatibility] `includeAuthLinks`, `includeBatches`,   `includeCrontabConfigs`
  // were changed to `includeSyncAPIs`,  `includeAsyncAPIs`, `includeCronJobs`
  opt.includeSyncAPIs  = opt.includeSyncAPIs  || opt.includeAuthLinks;
  opt.includeAsyncAPIs = opt.includeAsyncAPIs || opt.includeBatches;
  opt.includeCronJobs  = opt.includeCronJobs  || opt.includeCrontabConfigs;

  var scriptSetModel              = scriptSetMod.createModel(res.locals);
  var scriptSetExportHistoryModel = scriptSetExportHistoryMod.createModel(res.locals);

  var exportData = null;
  var fileBuf    = null;
  async.series([
    // Check lock config
    function(asyncCallback) {
      // No limitation to sa user
      if (res.locals.user.is('sa')) return asyncCallback();

      if (toolkit.isNothing(opt.scriptSetIds)) return asyncCallback();

      async.eachSeries(opt.scriptSetIds, function(id, eachCallback) {
        scriptSetModel.getWithCheck(id, ['lockedByUserId', 'lockConfigJSON'], function(err, dbRes) {
          if (err) return eachCallback(err);

          if (!common.lockConfigCan(res.locals.user, dbRes, [ 'scriptSet_readScriptCode', 'scriptSet_editScriptCode' ])) {
            return eachCallback(new E('EBizCondition.ExportingScriptSetNotAllowed', 'This Script Set is locked by other user'));
          }

          return eachCallback();
        });
      }, asyncCallback);
    },
    // Export
    function(asyncCallback) {
      scriptSetModel.getExportData(opt, function(err, _exportData) {
        if (err) return asyncCallback(err);

        exportData = _exportData;

        // Make zip
        var zip = new AdmZip();

        // Add Script Set data / Script file
        exportData.scriptSets.forEach(function(scriptSet) {
          if (toolkit.isNothing(scriptSet.scripts)) return;

          // No extra in exported Script Set data (extra is for Script Market)
          delete scriptSet._extra;

          var scriptSetDir = path.join(CONFIG._SCRIPT_EXPORT_SCRIPT_SET_DIR, scriptSet.id);
          scriptSet.scripts.forEach(function(script) {
            // Add Script file
            var filePath = path.join(scriptSetDir, common.getScriptFilename(script));
            zip.addFile(filePath, script.code || '');

            // No code / code draft in Exported Script data (code stored as file)
            delete script.code;
            delete script.codeDraft;
          });
        });

        // Add META file
        zip.addFile(CONFIG._SCRIPT_EXPORT_META_FILE, yaml.dump(exportData));

        // Add NOTE file
        var note = toolkit.jsonFindSafe(exportData, 'extra.note');
        if (note) {
          zip.addFile(CONFIG._SCRIPT_EXPORT_NOTE_FILE, note);
        }

        fileBuf = zip.toBuffer();

        return asyncCallback();
      });
    },
    // Record export history
    function(asyncCallback) {
      // Gen summary
      var summary = common.flattenImportExportData(exportData);

      // No code / code draft in summary
      if (toolkit.notNothing(summary.scripts)) {
        summary.scripts.forEach(function(d) {
          delete d.code;
          delete d.codeDraft;
        });
      }

      var _data = {
        note       : toolkit.jsonFindSafe(summary, 'extra.note'),
        summaryJSON: summary,
      }
      scriptSetExportHistoryModel.add(_data, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    // Export file name
    let _prefix  = CONFIG._SCRIPT_EXPORT_FILE_PREFIX;
    let _timeTag = moment().utcOffset('+08:00').format('YYYYMMDD_HHmmss');
    var fileName = `${_prefix}${_timeTag}.zip`;

    // Download
    return res.locals.sendFile(fileBuf, fileName);
  });
};

exports.import = function(req, res, next) {
  var file       = req.files ? req.files[0]: null;
  var checkOnly  = toolkit.toBoolean(req.body.checkOnly);
  var setBuiltin = toolkit.toBoolean(req.body.setBuiltin);

  var scriptSetModel   = scriptSetMod.createModel(res.locals);
  var connectorModel   = connectorMod.createModel(res.locals);
  var envVariableModel = envVariableMod.createModel(res.locals);
  var syncAPIModel     = syncAPIMod.createModel(res.locals);
  var asyncAPIModel    = asyncAPIMod.createModel(res.locals);
  var cronJobModel     = cronJobMod.createModel(res.locals);

  var requirements = {};
  var confirmId    = toolkit.genDataId('import');
  var diff         = {};

  var scriptMap   = {};
  var importData  = {};
  var allFileData = {};

  async.series([
    // Load zip file
    function(asyncCallback) {
      var fileBuf = fs.readFileSync(file.path);
      var zip = new AdmZip(fileBuf);

      // Unzip
      try {
        zip.getEntries().forEach(function(zipEntry) {
          if (zipEntry.isDirectory) return;
          allFileData[zipEntry.entryName] = zipEntry.getData().toString("utf8");
        });

      } catch(err) {
        return asyncCallback(new E('EBizCondition.InvalidImportFile', 'Invalid import file', null, err));
      }

      if (toolkit.isNothing(allFileData)) {
        return asyncCallback(new E('EBizCondition.EmptyImportFile', 'Empty import file'));
      }

      // Get META file path
      var realMetaPath = Object.keys(allFileData).filter(function(filePath) {
        return toolkit.endsWith(filePath, `/${CONFIG._SCRIPT_EXPORT_META_FILE}`);
      })[0];

      if (realMetaPath) {
        var rootDir = realMetaPath.split('/').slice(0, -1).join('/');
        for (var filePath in allFileData) {
          if (!toolkit.startsWith(filePath, rootDir)) continue;

          var nextFilePath = filePath.slice(rootDir.length + 1);
          if (nextFilePath === filePath) continue;

          allFileData[nextFilePath] = allFileData[filePath];
          delete allFileData[filePath];
        }
      }

      // Get data to import
      if (allFileData[CONFIG._SCRIPT_EXPORT_META_FILE]) {
        // Read META data
        importData = yaml.load(allFileData[CONFIG._SCRIPT_EXPORT_META_FILE]) || {};

        // [Compatibility] `authLinks`, `batches`, `crontabConfigs`
        // were changed to `syncAPIs`, `asyncAPIs`, `cronJobs`
        importData.syncAPIs  = importData.authLinks;
        importData.asyncAPIs = importData.batches;
        importData.cronJobs  = importData.crontabConfigs;

        delete importData.authLinks;
        delete importData.batches;
        delete importData.crontabConfigs;

      } else {
        // [Compatibility] Separated files for each entity
        importData = {};

        // Read Script Sets data
        importData.scriptSets = yaml.load(allFileData[`scriptSets.yaml`]);

        // Read other entity data
        var resourceNameMap = {
          'connectors'  : 'connectors',
          'envVariables': 'envVariables',
          'syncAPIs'    : 'syncAPIs',
          'asyncAPIs'   : 'asyncAPIs',
          'cronJobs'    : 'cronJobs',

          // [Compatibility] `authLinks`, `batches`, `crontabConfigs`
          // were changed to `syncAPIs`, `asyncAPIs`, `cronJobs`
          'authLinks'     : 'syncAPIs',
          'crontabConfigs': 'cronJobs',
          'batches'       : 'asyncAPIs',
        };
        for (var dataKey in resourceNameMap) {
          var importKey = resourceNameMap[dataKey];

          var data = allFileData[`${dataKey}.yaml`];
          if (!data) return;

          importData[importKey] = yaml.load(data);
        }

        // Load NOTE to `extra.note`
        importData.extra      = importData.extra || {};
        importData.extra.note = allFileData[CONFIG._SCRIPT_EXPORT_NOTE_FILE] || null;
      }

      // Load Script code
      importData.scriptSets.forEach(function(scriptSet) {
        if (toolkit.isNothing(scriptSet.scripts)) return;

        scriptSet.scripts.forEach(function(script) {
          scriptMap[script.id] = script;

          // Read code
          var scriptZipPath = `${CONFIG._SCRIPT_EXPORT_SCRIPT_SET_DIR}/${scriptSet.id}/${common.getScriptFilename(script)}`;
          script.code = allFileData[scriptZipPath] || '';
        });
      });

      // Replace `origin`, `originId`
      var origin   = 'UNKNOWN';
      var originId = 'UNKNOWN';

      if (setBuiltin) {
        origin   = 'builtin';
        originId = 'builtin';
      } else if (res.locals.user && res.locals.user.isSignedIn) {
        origin   = 'user';
        originId = res.locals.user.id;
      }

      common.replaceImportDataOrigin(importData, origin, originId);

      if (checkOnly) {
        // Cache data to Redis only if check only
        var cacheKey = toolkit.getCacheKey('stage', 'importScriptSet', ['confirmId', confirmId]);
        return res.locals.cacheDB.setex(cacheKey, CONFIG._SCRIPT_IMPORT_CONFIRM_TIMEOUT, JSON.stringify(importData), asyncCallback);

      } else {
        // Do import
        var recoverPoint = {
          type: 'import',
          note: 'System: Before importing Script Sets',
        };
        return scriptSetModel.import(importData, recoverPoint, function(err, _requirements) {
          if (err) return asyncCallback(err);

          requirements = _requirements;

          reloadDataMD5Cache(res.locals, asyncCallback);
        });
      }
    },
    // Get current entity info
    function(asyncCallback) {
      var currentDataOpts = [
        { key: 'scriptSets',   model: scriptSetModel,   fields: [ 'id', 'title' ]  },
        { key: 'connectors',   model: connectorModel,   fields: [ 'id', 'title' ]  },
        { key: 'envVariables', model: envVariableModel, fields: [ 'id', 'title' ]  },
        { key: 'syncAPIs',     model: syncAPIModel,     fields: [ 'id', 'funcId' ] },
        { key: 'asyncAPIs',    model: asyncAPIModel,    fields: [ 'id', 'funcId' ] },
        { key: 'cronJobs',     model: cronJobModel,     fields: [ 'id', 'funcId' ] },
      ]
      async.eachSeries(currentDataOpts, function(dataOpt, eachCallback) {
        var opt = {
          fields: dataOpt.fields.map(function(f) {
            return `${dataOpt.model.alias}.${f}`;
          }),
        }
        dataOpt.model.list(opt, function(err, dbRes) {
          if (err) return eachCallback(err);

          if (toolkit.isNothing(importData[dataOpt.key])) return eachCallback();

          var currentDataMap = toolkit.arrayElementMap(dbRes, 'id');
          var diffAdd     = [];
          var diffReplace = [];

          importData[dataOpt.key].forEach(function(d) {
            var diffInfo = dataOpt.fields.reduce(function(acc, f) {
              acc[f] = d[f];
              return acc;
            }, {});

            if (!!currentDataMap[d.id]) {
              diffInfo.diffType = 'replace';
              diffReplace.push(diffInfo);
            } else {
              diffInfo.diffType = 'add';
              diffAdd.push(diffInfo);
            }
          });

          diff[dataOpt.key] = diffAdd.concat(diffReplace);

          return eachCallback();
        });
      }, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      requirements: requirements,
      confirmId   : confirmId,
      diff        : diff,
      note        : toolkit.jsonFindSafe(importData, 'extra.note'),
    });
    return res.locals.sendJSON(ret);
  });
};

exports.confirmImport = function(req, res, next) {
  var confirmId = req.body.confirmId;

  var requirements = null;

  var scriptSetModel = scriptSetMod.createModel(res.locals);

  var importData = null;
  async.series([
    // Get data from Redis to import
    function(asyncCallback) {
      var cacheKey = toolkit.getCacheKey('stage', 'importScriptSet', ['confirmId', confirmId]);
      res.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (!cacheRes) {
          return asyncCallback(new E('EBizCondition.ConfirmingImportTimeout', 'Confirming import timeout'));
        }

        importData = JSON.parse(cacheRes);

        return asyncCallback();
      });
    },
    // Do import
    function(asyncCallback) {
      var recoverPoint = {
        type: 'import',
        note: 'System: Before importing Script Sets',
      };
      scriptSetModel.import(importData, recoverPoint, function(err, _requirements) {
        if (err) return asyncCallback(err);

        requirements = _requirements;

        reloadDataMD5Cache(res.locals, asyncCallback);
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      requirements: requirements,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.deploy = function(req, res, next) {
  var scriptSetId = req.params.id;

  var opt = {
    startupScriptTitle: req.body.startupScriptTitle || null,
    withCronJob       : req.body.withCronJob        || false,
    configReplacer    : req.body.configReplacer     || {},
  }

  // [Compatibility] `withCrontabConfig` was changed to `withCronJob`
  opt.withCronJob = opt.withCronJob || req.body.withCrontabConfig || false;

  doDeploy(res.locals, scriptSetId, opt, function(err, startupScriptId, startupCronJobId, startupScriptCronJobFunc) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      startupScriptId         : startupScriptId,
      startupCronJobId        : startupCronJobId,
      startupScriptCronJobFunc: startupScriptCronJobFunc,
    });
    return res.locals.sendJSON(ret);
  });
};

function reloadDataMD5Cache(locals, callback) {
  var taskReq = {
    name  : 'Internal.ReloadDataMD5Cache',
    kwargs: { all: true },
  }
  locals.cacheDB.putTask(taskReq, callback);
};

function doDeploy(locals, scriptSetId, options, callback) {
  options = options || {};
  options.startupScriptTitle = options.startupScriptTitle || null;
  options.withCronJob        = options.withCronJob        || false;
  options.configReplacer     = options.configReplacer     || {};

  var startupScriptId = `${CONFIG._STARTUP_SCRIPT_SET_ID}__${scriptSetId}`;

  var startupScriptCronJobFunc = null;
  var startupCronJobId         = null;

  var scriptSetModel = scriptSetMod.createModel(locals);
  var scriptModel    = scriptMod.createModel(locals);
  var funcModel      = funcMod.createModel(locals);
  var cronJobModel   = cronJobMod.createModel(locals);

  var exampleScript = null;
  var nextAPIFuncs  = null;
  async.series([
    // Get example Script
    function(asyncCallback) {
      var exampleScriptId = `${scriptSetId}__example`;
      scriptModel.get(exampleScriptId, [ 'code' ], function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes) {
          exampleScript = dbRes;
          return asyncCallback();

        } else {
          // End if no example Script
          return callback();
        }
      });
    },
    // Check and create startup Script Set
    function(asyncCallback) {
      scriptSetModel.get(CONFIG._STARTUP_SCRIPT_SET_ID, [ 'seq' ], function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Skip if already exists
        if (dbRes) return asyncCallback();

        // Create if not exists
        var _data = {
          id      : CONFIG._STARTUP_SCRIPT_SET_ID,
          title   : 'Startup',
          isPinned: true,
        }
        return scriptSetModel.add(_data, asyncCallback);
      })
    },
    // Check and create startup Script
    function(asyncCallback) {
      scriptModel.get(startupScriptId, [ 'seq' ], function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Skip if already exists
        if (dbRes) return asyncCallback();

        // Create if not exists
        if (toolkit.notNothing(options.configReplacer)) {
          for (var k in options.configReplacer) {
            var v = options.configReplacer[k];
            if (v) {
              // NOTE Since all config items are STRING and placeholder is "<xxx>", add escape char "\" for double quotes
              v = v.replaceAll('"', '\\"');
              exampleScript.code = exampleScript.code.replace(`"<${k}>"`, `"${v}"`);
            }
          }
        }

        // Replace other config items to empty string with comment
        exampleScript.code = exampleScript.code.replace(/"<(.+)>"(.*)/g, '""$2 # $1');

        var _data = {
          id       : startupScriptId,
          title    : options.startupScriptTitle || scriptSetId,
          code     : exampleScript.code,
          codeDraft: exampleScript.code,
        }
        return scriptModel.add(_data, asyncCallback);
      });
    },
    // Send Script pre-check task
    function(asyncCallback) {
      var opt = {
        scriptId: startupScriptId,

        origin  : 'scriptSet',
        originId: scriptSetId,
      }
      mainAPICtrl.callFuncDebugger(locals, opt, function(err, taskResp) {
        if (err) return asyncCallback(err);

        if (taskResp.result.status === 'failure') {
          return asyncCallback(new E('EStartupScriptDeployFailed', 'Startup Script deploying failed, Please contact the author', {
            // Abstract `exception` and `traceback` when deploy error occured
            exception: taskResp.result && taskResp.result.exception,
            traceback: taskResp.result && taskResp.result.traceback,
        }));
        }

        nextAPIFuncs = taskResp.result.apiFuncs;

        return asyncCallback();
      });
    },
    // Update Funcs
    function(asyncCallback) {
      if (toolkit.isNothing(nextAPIFuncs)) return asyncCallback();

      funcModel.update(startupScriptId, nextAPIFuncs, asyncCallback);
    },
    // Check and create Cron Job
    function(asyncCallback) {
      if (!options.withCronJob) return asyncCallback();
      if (toolkit.isNothing(nextAPIFuncs)) return asyncCallback();

      for (var i = 0; i < nextAPIFuncs.length; i++) {
        var apiFunc = nextAPIFuncs[i];
        if (apiFunc.extraConfig && apiFunc.extraConfig.fixedCronExpr) {
          startupScriptCronJobFunc = apiFunc;
          break;
        }
      }

      // Skip if no Func for Cron Job (no `fixedCronExpr`)
      if (!startupScriptCronJobFunc) return asyncCallback();

      var cronJobFuncId = `${startupScriptId}.${startupScriptCronJobFunc.name}`;

      // Check if Cron Job exists or not
      var opt = {
        fields : [ 'cron.id' ],
        filters: {
          funcId: { eq: cronJobFuncId }
        }
      }
      cronJobModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Skip if already exists
        if (dbRes.length > 0) {
          startupCronJobId = dbRes[0].id;
          return asyncCallback();
        }

        // Create if not exists
        startupCronJobId = `${CONFIG._STARTUP_CRON_JOB_ID_PREFIX}${scriptSetId}`;
        var _data = {
          id                : startupCronJobId,
          funcId            : cronJobFuncId,
          funcCallKwargsJSON: {},
          taskRecordLimit   : CONFIG._TASK_RECORD_FUNC_LIMIT_CRON_JOB_BY_DEPLOY,
        }
        return cronJobModel.add(_data, asyncCallback);
      });
    },
  ], function(err) {
    if (err) return callback(err);
    callback(null, startupScriptId, startupCronJobId, startupScriptCronJobFunc);

    // Reload MD5 cache
    reloadDataMD5Cache(locals);
  });
};

exports.doDeploy = doDeploy;
