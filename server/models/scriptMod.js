'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var common      = require('../utils/common');
var modelHelper = require('../utils/modelHelper');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'script',
  entityName : 'script',
  tableName  : 'biz_main_script',
  alias      : 'scpt',

  objectFields: {
    lockConfigJSON     : 'json',
    isLocked           : 'boolean',
    sset_lockConfigJSON: 'json',
  },

  defaultOrders: [
    { field: 'sset.id', method: 'ASC' },
    { field: 'scpt.id', method: 'ASC' },
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
  var self = this;

  var opt = {
    limit  : 1,
    filters: { 'scpt.id': { eq: id } },
    orders : false,
    extra  : { withCode: true, withCodeDraft: true },
  };

  this.list(opt, function(err, dbRes) {
    if (err) return callback(err);

    dbRes = dbRes[0] || null;
    if (!dbRes) {
      return callback(new E('EClientNotFound', 'No such data', {
        entity: self.displayName,
        id    : id,
      }));
    }

    dbRes = toolkit.jsonPick(dbRes, options);

    dbRes.lockedByUserId       = dbRes.sset_lockedByUserId       || dbRes.lockedByUserId;
    dbRes.lockedByUserUsername = dbRes.sset_lockedByUserUsername || dbRes.lockedByUserUsername;
    dbRes.lockedByUserName     = dbRes.sset_lockedByUserName     || dbRes.lockedByUserName;

    var scriptAllowMap    = common.getLockConfigMemberAllowMap(dbRes.lockConfigJSON);
    var scriptSetAllowMap = common.getLockConfigMemberAllowMap(dbRes.sset_lockConfigJSON);
    dbRes.lockConfigMemberAllowMap = Object.assign(scriptAllowMap, scriptSetAllowMap);

    return callback(null, dbRes);
  });
};

EntityModel.prototype.list = function(options, callback) {
  var self = this;

  options = options || {};
  options.extra = options.extra || {};

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'scpt.seq',
      'scpt.id',
      'scpt.scriptSetId',
      'scpt.title',
      'scpt.description',
      'scpt.publishVersion',
      'scpt.type',
      'scpt.codeMD5',
      'scpt.codeDraftMD5',
      'scpt.lockedByUserId',
      'scpt.lockConfigJSON',
      'scpt.createTime',
      'scpt.updateTime',

      sql.EXPR([
        [
          { LEFT: 'scpt.lockedByUserId', OP: 'isnotnull', RIGHT: true },
          { LEFT: 'sset.lockedByUserId', OP: 'isnotnull', RIGHT: true },
        ]
      ], 'isLocked'),

      sql.EXPR({ LEFT: 'sset.lockedByUserId', OP: 'isnotnull', RIGHT: true }, 'isLockedByScriptSet'),
      sql.EXPR({ LEFT: 'scpt.lockConfigJSON', OP: 'isnotnull', RIGHT: true }, 'hasLockConfig'),

      sql.FIELD('scptLocker.username', 'lockedByUserUsername'),
      sql.FIELD('scptLocker.name',     'lockedByUserName'),

      sql.FIELD('sset.id',             'sset_id'),
      sql.FIELD('sset.title',          'sset_title'),
      sql.FIELD('sset.description',    'sset_description'),
      sql.FIELD('sset.origin',         'sset_origin'),
      sql.FIELD('sset.originId',       'sset_originId'),
      sql.FIELD('sset.lockedByUserId', 'sset_lockedByUserId'),
      sql.FIELD('sset.lockConfigJSON', 'sset_lockConfigJSON'),
      sql.FIELD('ssetLocker.username', 'sset_lockedByUserUsername'),
      sql.FIELD('ssetLocker.name',     'sset_lockedByUserName'),
    ])
    .FROM('biz_main_script', 'scpt')
    .LEFT_JOIN('biz_main_script_set', 'sset', {
      'sset.id': 'scpt.scriptSetId',
    })
    .LEFT_JOIN('wat_main_user', 'scptLocker', {
      'scptLocker.id': 'scpt.lockedByUserId',
    })
    .LEFT_JOIN('wat_main_user', 'ssetLocker', {
      'ssetLocker.id': 'sset.lockedByUserId',
    });

  if (options.extra.withCode)      sql.SELECT('scpt.code');
  if (options.extra.withCodeDraft) sql.SELECT('scpt.codeDraft');

  if (options.extra.isExample) {
    sql.WHERE({ LEFT: 'scpt.id', OP: 'like', RIGHT: '__example' });
  }

  return this._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    dbRes.forEach(function(d) {
      // Lock user inherts Script Set
      d.lockedByUserId       = d.lockedByUserId       || d.sset_lockedByUserId;
      d.lockedByUserUsername = d.lockedByUserUsername || d.sset_lockedByUserUsername;
      d.lockedByUserName     = d.lockedByUserName     || d.sset_lockedByUserName;

      // Gen and merge allow map by Script Set and Script
      var scriptSetAllowMap = common.getLockConfigMemberAllowMap(d.sset_lockConfigJSON);
      var scriptAllowMap    = common.getLockConfigMemberAllowMap(d.lockConfigJSON);
      d.lockConfigMemberAllowMap = Object.assign({}, scriptSetAllowMap, scriptAllowMap);

      // Do not return code when not allowed
      if (!common.lockConfigCan(self.locals.user, d, [ 'scriptSet_readScriptCode', 'scriptSet_editScriptCode', 'script_readCode', 'script_editCode' ])) {
        d.codeMD5      = null;
        d.codeDraftMD5 = null;
        d.code         = null;
        d.codeDraft    = null;
      }
    });

    return callback(null, dbRes, pageInfo);
  });
};

EntityModel.prototype.add = function(data, callback) {
  // Add Script Set Id automatically
  data.scriptSetId = data.id.split('__')[0];

  // Ensure `code`, `codeDraft` is string
  data.code      = data.code      || '';
  data.codeDraft = data.codeDraft || '';

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

  var retId = id;

  var transScope = modelHelper.createTransScope(self.db);
  async.series([
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Save to DB
    function(asyncCallback) {
      self._delete(id, asyncCallback);
    },
    // Remove related data
    function(asyncCallback) {
      var tables = [
        'biz_main_func',
      ];
      async.eachSeries(tables, function(table, eachCallback) {
        var sql = self.db.createSQLBuilder();
        sql
          .DELETE_FROM(table)
          .WHERE({
            scriptId: id,
          });

        self.db.query(sql, eachCallback);
      }, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback(scopeErr);

      return callback(null, retId);
    });
  });
};

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  // Unpack Base64 code
  if ('string' === typeof data.codeDraftBase64) {
    data.codeDraft = toolkit.fromBase64(data.codeDraftBase64);
  }
  delete data.codeDraftBase64;

  if ('undefined' !== typeof data.code) {
    data.codeMD5 = toolkit.getMD5(data.code);
  }
  if ('undefined' !== typeof data.codeDraft) {
    data.codeDraftMD5 = toolkit.getMD5(data.codeDraft);
  }

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

  return data;
};
