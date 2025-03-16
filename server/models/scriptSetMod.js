'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async     = require('async');
var validator = require('validator');

/* Project Modules */
var E           = require('../utils/serverError');
var CONST       = require('../utils/yamlResources').get('CONST');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var common      = require('../utils/common');
var modelHelper = require('../utils/modelHelper');

var scriptRecoverPointMod     = require('./scriptRecoverPointMod');
var scriptSetImportHistoryMod = require('./scriptSetImportHistoryMod');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'script set',
  entityName : 'scriptSet',
  tableName  : 'biz_main_script_set',
  alias      : 'sset',

  objectFields: {
    lockConfigJSON : 'json',
    isPinned       : 'boolean',
    isLocked       : 'boolean',
    smkt_configJSON: 'json',
  },

  defaultOrders: [
    { field: 'sset.pinTime', method: 'DESC' },
    { field: 'sset.id',      method: 'ASC'  },
  ],
};

exports.createCRUDHandler = function() {
  return modelHelper.createCRUDHandler(EntityModel);
};

exports.createModel = function(locals) {
  return new EntityModel(locals);
};

var EntityModel = exports.EntityModel = modelHelper.createSubModel(TABLE_OPTIONS);

EntityModel.prototype.getWithCheck = function(id, options, callback) {
  return this._getWithCheck(id, options, function(err, dbRes) {
    if (err) return callback(err);

    dbRes.lockConfigMemberAllowMap = common.getLockConfigMemberAllowMap(dbRes.lockConfigJSON);

    return callback(null, dbRes);
  });
};

EntityModel.prototype.list = function(options, callback) {
  options = options || {};

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'sset.*',

      sql.EXPR({ LEFT: 'sset.pinTime',        OP: 'isnotnull', RIGHT: true }, 'isPinned'),
      sql.EXPR({ LEFT: 'sset.lockedByUserId', OP: 'isnotnull', RIGHT: true }, 'isLocked'),
      sql.EXPR({ LEFT: 'sset.lockConfigJSON', OP: 'isnotnull', RIGHT: true }, 'hasLockConfig'),

      sql.FIELD('locker.username', 'lockedByUserUsername'),
      sql.FIELD('locker.name',     'lockedByUserName'),
      sql.FIELD('smkt.id',         'smkt_id'),
      sql.FIELD('smkt.title',      'smkt_title'),
      sql.FIELD('smkt.type',       'smkt_type'),
      sql.FIELD('smkt.configJSON', 'smkt_configJSON'),
    ])
    .FROM('biz_main_script_set', 'sset')
    .LEFT_JOIN('wat_main_user', 'locker', {
      'locker.id': 'sset.lockedByUserId',
    })
    .LEFT_JOIN('biz_main_script_market', 'smkt', {
      'sset.origin': sql.VALUE('scriptMarket'),
      'smkt.id'    : 'sset.originId',
    })

  return this._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    dbRes.forEach(function(d) {
      // Gen Member Allow Map by lock config
      d.lockConfigMemberAllowMap = common.getLockConfigMemberAllowMap(d.lockConfigJSON);
    });

    return callback(null, dbRes, pageInfo);
  });
};

EntityModel.prototype.add = function(data, callback) {
  try {
    data = _prepareData(data);
  } catch(err) {
    this.logger.logError(err);
    if (err instanceof E) {
      return callback(err);
    } else {
      return callback(new E('EClientBadRequest', 'Invalid request post data', {
        error: err.toString(),
      }));
    }
  }

  // Add `origin`, `originId`
  if (!data.origin)   data.origin   = (this.locals.user && this.locals.user.isSignedIn) ? 'user'              : 'UNKNOWN';
  if (!data.originId) data.originId = (this.locals.user && this.locals.user.isSignedIn) ? this.locals.user.id : 'UNKNOWN';

  return this._add(data, callback);
};

EntityModel.prototype.modify = function(id, data, callback) {
  try {
    data = _prepareData(data);
  } catch(err) {
    this.logger.logError(err);
    if (err instanceof E) {
      return callback(err);
    } else {
      return callback(new E('EClientBadRequest', 'Invalid request post data', {
        error: err.toString(),
      }));
    }
  }

  return this._modify(id, data, callback);
};

EntityModel.prototype.delete = function(id, callback) {
  var self = this;

  var transScope = modelHelper.createTransScope(self.db);
  async.series([
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Save to DB
    function(asyncCallback) {
      self._delete(id, asyncCallback);
    },
    // Delete related data
    function(asyncCallback) {
      var tables = [
        'biz_main_script',
        'biz_main_func',
      ];
      async.eachSeries(tables, function(table, eachCallback) {
        var sql = self.db.createSQLBuilder();
        sql
          .DELETE_FROM(table)
          .WHERE({
            scriptSetId: id,
          });

        self.db.query(sql, eachCallback);
      }, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback(scopeErr);

      return callback(null, id);
    });
  });
};

EntityModel.prototype.clone = function(id, newId, callback) {
  var self = this;

  var transScope = modelHelper.createTransScope(self.db);
  async.series([
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Clone Script Set
    function(asyncCallback) {
      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'title',
          'description',
          'requirements',
          'originMD5',
        ])
        .FROM('biz_main_script_set')
        .WHERE({
          id: id,
        });

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        var cloneData = [];

        var origin   = (self.locals.user && self.locals.user.isSignedIn) ? 'user'              : 'UNKNOWN';
        var originId = (self.locals.user && self.locals.user.isSignedIn) ? self.locals.user.id : 'UNKNOWN';

        dbRes.forEach(function(d) {
          cloneData.push({
            id          : newId,
            title       : d.title,
            description : d.description,
            requirements: d.requirements,
            origin      : origin,
            originId    : originId,
            originMD5   : d.originMD5,
          });
        })

        var sql = self.db.createSQLBuilder();
        sql
          .INSERT_INTO('biz_main_script_set')
          .VALUES(cloneData);

        var sqlParams = [cloneData];
        self.db.query(sql, sqlParams, asyncCallback);
      });
    },
    // Clone Script
    function(asyncCallback) {
      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'id',
          'title',
          'description',
          'publishVersion',
          'type',
          'code',
          'codeMD5',
          'codeDraft',
          'codeDraftMD5',
        ])
        .FROM('biz_main_script')
        .WHERE({
          scriptSetId: id,
        });

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);
        if (dbRes.length <= 0) return asyncCallback();

        var cloneData = [];
        dbRes.forEach(function(d) {
          // Get new Script ID
          var idParts = d.id.split('__');
          idParts[0] = newId;

          var newScriptId = idParts.join('__');

          cloneData.push({
            id            : newScriptId,
            scriptSetId   : newId,
            title         : d.title,
            description   : d.description,
            publishVersion: 1,
            type          : d.type,
            code          : d.code,
            codeMD5       : d.codeMD5,
            codeDraft     : d.codeDraft,
            codeDraftMD5  : d.codeDraftMD5,
          });
        });

        var sql = self.db.createSQLBuilder();
        sql
          .INSERT_INTO('biz_main_script')
          .VALUES(cloneData);

        self.db.query(sql, asyncCallback);
      });
    },
    // Clone Func
    function(asyncCallback) {
      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'id',
          'name',
          'title',
          'description',
          'definition',
          'argsJSON',
          'kwargsJSON',
          'extraConfigJSON',
          'category',
          'integration',
          'tagsJSON',
          'defOrder',
        ])
        .FROM('biz_main_func')
        .WHERE({
          scriptSetId: id,
        });

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);
        if (dbRes.length <= 0) return asyncCallback();

        var cloneData = [];
        dbRes.forEach(function(d) {
          // Gen new Script, Func ID
          var idParts = d.id.split('__');
          idParts[0] = newId;

          var newFuncId   = idParts.join('__');
          var newScriptId = newFuncId.split('.')[0]

          cloneData.push({
            id             : newFuncId,
            scriptSetId    : newId,
            scriptId       : newScriptId,
            name           : d.name,
            title          : d.title,
            description    : d.description,
            definition     : d.definition,
            argsJSON       : toolkit.ensureJSONString(d.argsJSON),
            kwargsJSON     : toolkit.ensureJSONString(d.kwargsJSON),
            extraConfigJSON: toolkit.ensureJSONString(d.extraConfigJSON),
            category       : d.category,
            integration    : d.integration,
            tagsJSON       : toolkit.ensureJSONString(d.tagsJSON),
            defOrder       : d.defOrder,
          });
        })

        var sql = self.db.createSQLBuilder();
        sql
          .INSERT_INTO('biz_main_func')
          .VALUES(cloneData);

        self.db.query(sql, asyncCallback);
      });
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback(scopeErr);

      return callback();
    });
  });
};

EntityModel.prototype.getExportData = function(options, callback) {
  var self = this;

  options = options || {};
  var scriptSetIds     = options.scriptSetIds;
  var connectorIds     = options.connectorIds;
  var envVariableIds   = options.envVariableIds;
  var includeSyncAPIs  = toolkit.toBoolean(options.includeSyncAPIs);
  var includeAsyncAPIs = toolkit.toBoolean(options.includeAsyncAPIs);
  var includeCronJobs  = toolkit.toBoolean(options.includeCronJobs);
  var withCodeDraft    = toolkit.toBoolean(options.withCodeDraft);

  var exportUser = common.getExportUser(self.locals);
  var exportTime = toolkit.getISO8601();
  var note       = options.note || `Exported by ${exportUser} at ${toolkit.getDateTimeStringCN(exportTime)}`;

  var exportData = {
    version: common.IMPORT_EXPORT_DATA_SCHEMA_VERSION,

    scriptSets: [],
    extra: {
      exportUser: exportUser,
      exportTime: exportTime,
      note      : note,
    }
  };

  var scriptSetMap = {};
  var scriptMap    = {};

  // Connectors / Env Variables
  if (toolkit.notNothing(connectorIds))   exportData.connectors   = [];
  if (toolkit.notNothing(envVariableIds)) exportData.envVariables = [];

  // Related data to Script Sets
  if (includeSyncAPIs)  exportData.syncAPIs  = [];
  if (includeAsyncAPIs) exportData.asyncAPIs = [];
  if (includeCronJobs)  exportData.cronJobs  = [];

  async.series([
    // Get Script Sets
    function(asyncCallback) {
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'sset.id',
          'sset.title',
          'sset.description',
          'sset.requirements',
          'sset.origin',
          'sset.originId',
        ])
        .FROM('biz_main_script_set', 'sset')
        .WHERE({
          'sset.id': scriptSetIds,
        })
        .ORDER_BY('sset.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        scriptSetMap = toolkit.arrayElementMap(dbRes, 'id');

        dbRes.forEach(function(d) {
          d.scripts = [];
        });

        exportData.scriptSets = dbRes;

        return asyncCallback();
      });
    },
    // Get Scripts
    function(asyncCallback) {
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'scpt.scriptSetId',

          'scpt.id',
          'scpt.title',
          'scpt.description',
          'scpt.publishVersion',
          'scpt.type',
          'scpt.code',
          'scpt.codeMD5',
          'scpt.updateTime',
        ])
        .FROM('biz_main_script', 'scpt')
        .LEFT_JOIN('biz_main_script_set', 'sset', {
          'sset.id': 'scpt.scriptSetId',
        })
        .WHERE({
          'sset.id': scriptSetIds,
        })
        .ORDER_BY('scpt.id', 'ASC');

      if (withCodeDraft) {
        sql.SELECT([
          'scpt.codeDraft',
          'scpt.codeDraftMD5',
        ]);
      }

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        scriptMap = toolkit.arrayElementMap(dbRes, 'id');

        dbRes.forEach(function(d) {
          d.funcs = [];

          // [Compatibility] type of `updateTime` in DB was changed to `int`
          if ('updateTime' in d) {
            d.updateTime = toolkit.getISO8601(d.updateTime);
          }

          scriptSetMap[d.scriptSetId].scripts.push(d);
          delete d.scriptSetId;
        });

        return asyncCallback();
      });
    },
    // Get Funcs
    function(asyncCallback) {
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'func.scriptSetId',
          'func.scriptId',

          'func.id',
          'func.name',
          'func.title',
          'func.description',
          'func.definition',
          'func.argsJSON',
          'func.kwargsJSON',
          'func.extraConfigJSON',
          'func.category',
          'func.integration',
          'func.tagsJSON',
          'func.defOrder',
        ])
        .FROM('biz_main_func', 'func')
        .LEFT_JOIN('biz_main_script_set', 'sset', {
          'sset.id': 'func.scriptSetId',
        })
        .WHERE({
          'sset.id': scriptSetIds,
        })
        .ORDER_BY('func.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        dbRes.forEach(function(d) {
          scriptMap[d.scriptId].funcs.push(d);
          delete d.scriptSetId;
          delete d.scriptId;
        });

        return asyncCallback();
      });
    },
    // Get connector
    function(asyncCallback) {
      if (toolkit.isNothing(connectorIds)) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'cnct.id',
          'cnct.title',
          'cnct.description',
          'cnct.type',
          'cnct.configJSON',
        ])
        .FROM('biz_main_connector', 'cnct')
        .WHERE({
          'cnct.id': connectorIds,
        })
        .ORDER_BY('cnct.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Remove ciphered fields
        dbRes.forEach(function(d) {
          if (toolkit.notNothing(d.configJSON) && 'string' === typeof d.configJSON) {
            d.configJSON = JSON.parse(d.configJSON);
          }

          CONST.cipherFields.forEach(function(f) {
            var fCipher = toolkit.strf('{0}Cipher', f);
            if (fCipher in d.configJSON) {
              d.configJSON[fCipher] = '';
            }
          });
        });

        exportData.connectors = dbRes;

        return asyncCallback();
      });
    },
    // Get Env Variable
    function(asyncCallback) {
      if (toolkit.isNothing(envVariableIds)) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'evar.id',
          'evar.title',
          'evar.description',
          'evar.autoTypeCasting',
          'evar.valueTEXT',
        ])
        .FROM('biz_main_env_variable', 'evar')
        .WHERE({
          'evar.id': envVariableIds,
        })
        .ORDER_BY('evar.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Convert password type Env Variables to string and set empty string
        dbRes.forEach(function(d) {
          if (d.autoTypeCasting !== 'password') return;

          d.autoTypeCasting = 'string';
          d.valueTEXT       = '';
        });

        exportData.envVariables = dbRes;

        return asyncCallback();
      });
    },
    // Get Sync API
    function(asyncCallback) {
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();
      if (!includeSyncAPIs) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'sapi.id',
          'sapi.funcId',
          'sapi.funcCallKwargsJSON',
          'sapi.expireTime',
          'sapi.throttlingJSON',
          'sapi.origin',
          'sapi.originId',
          'sapi.showInDoc',
          'sapi.isDisabled',
          'sapi.note',
        ])
        .FROM('biz_main_sync_api', 'sapi')
        .LEFT_JOIN('biz_main_func', 'func', {
          'func.id': 'sapi.funcId',
        })
        .LEFT_JOIN('biz_main_script_set', 'sset', {
          'sset.id': 'func.scriptSetId',
        })
        .WHERE({
          'sset.id': scriptSetIds,
        })
        .ORDER_BY('sapi.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        exportData.syncAPIs = dbRes;

        return asyncCallback();
      });
    },
    // Get Async API
    function(asyncCallback) {
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();
      if (!includeAsyncAPIs) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'aapi.id',
          'aapi.funcId',
          'aapi.funcCallKwargsJSON',
          'aapi.tagsJSON',
          'aapi.origin',
          'aapi.originId',
          'aapi.showInDoc',
          'aapi.isDisabled',
          'aapi.note',
        ])
        .FROM('biz_main_async_api', 'aapi')
        .LEFT_JOIN('biz_main_func', 'func', {
          'func.id': 'aapi.funcId',
        })
        .LEFT_JOIN('biz_main_script_set', 'sset', {
          'sset.id': 'func.scriptSetId',
        })
        .WHERE({
          'sset.id': scriptSetIds,
        })
        .ORDER_BY('aapi.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        exportData.asyncAPIs = dbRes;

        return asyncCallback();
      });
    },
    // Get Cron Jobs
    function(asyncCallback) {
      if (toolkit.isNothing(scriptSetIds)) return asyncCallback();
      if (!includeCronJobs) return asyncCallback();

      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'cron.id',
          'cron.funcId',
          'cron.funcCallKwargsJSON',
          'cron.cronExpr',
          'cron.tagsJSON',
          'cron.scope',
          'cron.expireTime',
          'cron.origin',
          'cron.originId',
          'cron.isDisabled',
          'cron.note',
        ])
        .FROM('biz_main_cron_job', 'cron')
        .LEFT_JOIN('biz_main_func', 'func', {
          'func.id': 'cron.funcId',
        })
        .LEFT_JOIN('biz_main_script_set', 'sset', {
          'sset.id': 'func.scriptSetId',
        })
        .WHERE({
          'sset.id': scriptSetIds,
        })
        .ORDER_BY('cron.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        exportData.cronJobs = dbRes;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    // Add extra info for Script Sets
    if (toolkit.notNothing(exportData.scriptSets)) {
      exportData.scriptSets.forEach(function(scriptSet) {
        // Compute MD5 of Script Sets
        scriptSet.originMD5 = common.getScriptSetMD5(scriptSet, scriptSet.scripts);

        // Add extra info
        scriptSet._extra = {
          exportUser: exportUser,
          exportTime: exportTime,
          note      : note,
        }
      });
    }

    // [Compatibility] `authLinks`, `batches`, `crontabConfigs
    //         were changed to `syncAPIs`, `asyncAPIs`, `cronJobs`
    var aliasMap = {
      syncAPIs : 'authLinks',
      asyncAPIs: 'batches',
      cronJobs : 'crontabConfigs',
    }
    for (var entityName in aliasMap) {
      if (entityName in exportData) {
        var alias = aliasMap[entityName];
        exportData[alias] = exportData[entityName];
      }
    }

    return callback(null, exportData);
  });
};

EntityModel.prototype.import = function(importData, recoverPoint, callback) {
  var self = this;

  // [Compatibility] Convert import / export data schema
  importData = common.convertImportExportDataSchema(importData);

  // Flatten import / export data
  importData = common.flattenImportExportData(importData);

  var scriptRecoverPointModel     = scriptRecoverPointMod.createModel(self.locals);
  var scriptSetImportHistoryModel = scriptSetImportHistoryMod.createModel(self.locals);

  var scriptSetIds   = toolkit.arrayElementValues(importData.scriptSets   || [], 'id');
  var connectorIds   = toolkit.arrayElementValues(importData.connectors   || [], 'id');
  var envVariableIds = toolkit.arrayElementValues(importData.envVariables || [], 'id');
  var syncAPIIds     = toolkit.arrayElementValues(importData.syncAPIs     || [], 'id');
  var asyncAPIIds    = toolkit.arrayElementValues(importData.asyncAPIs    || [], 'id');
  var cronJobIds     = toolkit.arrayElementValues(importData.cronJobs     || [], 'id');

  var transScope = modelHelper.createTransScope(self.db);
  async.series([
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Create Recover Point
    function(asyncCallback) {
      if (toolkit.isNothing(recoverPoint)) return asyncCallback();

      scriptRecoverPointModel.add(recoverPoint, asyncCallback);
    },
    // Remove all related Script Sets, Scripts, Funcs
    function(asyncCallback) {
      if (recoverPoint && recoverPoint.type === 'recover') {
        // Recover mode: Clear all Script Sets, Scripts, Funcs
        var sqls = [
          self.db.createSQLBuilder().DELETE_FROM('biz_main_script_set').FORCE_NO_WHERE(),
          self.db.createSQLBuilder().DELETE_FROM('biz_main_script').FORCE_NO_WHERE(),
          self.db.createSQLBuilder().DELETE_FROM('biz_main_func').FORCE_NO_WHERE(),
        ];

        self.db.query(sqls, asyncCallback);

      } else {
        // Import mode: Delete related Script Sets, Scripts, Funcs
        if (toolkit.isNothing(scriptSetIds)) return asyncCallback();

        var deleteTargets = [
          { table: 'biz_main_script_set', where: { id         : scriptSetIds } },
          { table: 'biz_main_script',     where: { scriptSetId: scriptSetIds } },
          { table: 'biz_main_func',       where: { scriptSetId: scriptSetIds } },
        ];
        async.eachSeries(deleteTargets, function(target, eachCallback) {
          var sql = self.db.createSQLBuilder();
          sql
            .DELETE_FROM(target.table)
            .WHERE(target.where)

          self.db.query(sql, eachCallback);
        }, asyncCallback);
      }
    },
    // Remove all related Connectors, Env Variables, Sync APIs, Async APIs, Cron Jobs
    function(asyncCallback) {
      if (toolkit.isNothing(syncAPIIds)) return asyncCallback();

      var deleteTargets = [
        { table: 'biz_main_connector',    ids: connectorIds },
        { table: 'biz_main_env_variable', ids: envVariableIds },
        { table: 'biz_main_sync_api',     ids: syncAPIIds },
        { table: 'biz_main_async_api',    ids: asyncAPIIds },
        { table: 'biz_main_cron_job',     ids: cronJobIds },
      ];
      async.eachSeries(deleteTargets, function(target, eachCallback) {
        if (toolkit.isNothing(target.ids)) return eachCallback();

        var sql = self.db.createSQLBuilder();
        sql
          .DELETE_FROM(target.table)
          .WHERE({
            id: target.ids,
          });

        self.db.query(sql, eachCallback);
      }, asyncCallback);
    },

    // Insert data
    function(asyncCallback) {
      // Insert data rules
      var _rules = [
        { name: 'scriptSets',   table: 'biz_main_script_set'   },
        { name: 'scripts',      table: 'biz_main_script'       },
        { name: 'funcs',        table: 'biz_main_func'         },
        { name: 'connectors',   table: 'biz_main_connector'    },
        { name: 'envVariables', table: 'biz_main_env_variable' },
        { name: 'syncAPIs',     table: 'biz_main_sync_api'     },
        { name: 'asyncAPIs',    table: 'biz_main_async_api'    },
        { name: 'cronJobs',     table: 'biz_main_cron_job'     },

      ];
      async.eachSeries(_rules, function(_rule, eachCallback) {
        var _dataSet = importData[_rule.name];
        if (toolkit.isNothing(_dataSet)) return eachCallback();

        var tableFields = [];
        async.series([
          // Get columns of current table
          function(innerCallback) {
              self.db.columns(_rule.table, function(err, columns) {
                if (err) return innerCallback(err);

                tableFields = columns;

                return innerCallback();
              });
          },
          // Replace data
          function(innerCallback) {
            async.eachSeries(_dataSet, function(_data, innerEachCallback) {
              var _data = _prepareTableDataToImport(_data, tableFields);

              var sqls = [
                self.db.createSQLBuilder()
                  .DELETE_FROM(_rule.table)
                  .WHERE({
                    id: _data.id,
                  })
                  .LIMIT(1),

                self.db.createSQLBuilder()
                  .INSERT_INTO(_rule.table)
                  .VALUES(_data),
              ]

              self.db.query(sqls, innerEachCallback);
            }, innerCallback);
          }
        ], eachCallback)
      }, asyncCallback);
    },
    // Record import history
    function(asyncCallback) {
      var summary = toolkit.jsonCopy(importData);

      // No code / draft in Script summary
      if (toolkit.notNothing(summary.scripts)) {
        summary.scripts.forEach(function(d) {
          delete d.code;
          delete d.codeDraft;
        });
      }

      // Save to DB
      var _data = {
        note       : toolkit.jsonFindSafe(importData, 'extra.note'),
        summaryJSON: summary,
      }
      scriptSetImportHistoryModel.add(_data, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback(scopeErr);

      // Pick requirements
      var requirements = {};
      importData.scriptSets.forEach(function(s) {
        if (toolkit.isNothing(s.requirements)) return;

        s.requirements.split('\n').forEach(function(r) {
          if (toolkit.isNothing(r)) return;

          var pkgVer = r.trim().split(/[>=<!]=*/);
          var pkg = pkgVer[0].split('[')[0];
          var ver = pkgVer[1] || null;
          requirements[pkg] = ver;
        });
      });

      return callback(null, requirements);
    });
  });
};

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  if (data.lockConfigJSON && 'object' === typeof data.lockConfigJSON) {
    Object.keys(data.lockConfigJSON).forEach(function(k) {
      if (toolkit.isNothing(data.lockConfigJSON[k])) delete data.lockConfigJSON[k];
    });

    if (toolkit.isNothing(data.lockConfigJSON)) {
      data.lockConfigJSON = null;
    } else {
      // Keep `_ALL` in top position
      if (Array.isArray(data.lockConfigJSON.members)) {
        var nextMembers = [];
        data.lockConfigJSON.members.forEach(function(m) {
          if (m.userId === '_ALL') {
            nextMembers.unshift(m);
          } else {
            nextMembers.push(m);
          }
        });
        data.lockConfigJSON.members = nextMembers;
      }

      data.lockConfigJSON = JSON.stringify(data.lockConfigJSON);
    }
  }

  if ('boolean' === typeof data.isPinned) {
    data.pinTime = data.isPinned ? toolkit.getTimestamp() : null;
    delete data.isPinned;
  }

  return data;
};

function _prepareTableDataToImport(data, tableFields) {
  data = toolkit.jsonCopy(data);

  for (var f in data) {
    // Remove fields not exists
    if (tableFields.indexOf(f) < 0) {
      delete data[f];
    }

    // Remove fields starts with "_"
    if (toolkit.startsWith(f, '_')) {
      delete data[f];
    }

    // Skip if value is NULL
    var v = data[f];
    if (toolkit.isNullOrUndefined(v)) {
      continue;
    }

    // Dump JSON value
    if (toolkit.endsWith(f, 'JSON')
      && 'string' !== typeof v) {
      data[f] = JSON.stringify(v);
    }

    // Convert time value
    if (toolkit.endsWith(f, 'Time')
      && 'string' === typeof v
      && validator.isISO8601(v, { strict: true, strictSeparator: true })) {
      data[f] = toolkit.getTimestamp(v);
    }
  }

  return data;
};
