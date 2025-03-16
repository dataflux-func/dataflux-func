'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

var funcMod = require('./funcMod');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'async API',
  entityName : 'asyncAPI',
  tableName  : 'biz_main_async_api',
  alias      : 'aapi',

  objectFields: {
    funcCallKwargsJSON  : 'json',
    tagsJSON            : 'json',
    showInDoc           : 'boolean',
    isDisabled          : 'boolean',
    func_argsJSON       : 'json',
    func_kwargsJSON     : 'json',
    func_extraConfigJSON: 'json',
    func_tagsJSON       : 'json',
  },

  defaultOrders: [
    { field: 'aapi.seq', method: 'DESC' },
  ],
};

exports.createCRUDHandler = function() {
  return modelHelper.createCRUDHandler(EntityModel);
};

exports.createModel = function(locals) {
  return new EntityModel(locals);
};

var EntityModel = exports.EntityModel = modelHelper.createSubModel(TABLE_OPTIONS);

EntityModel.prototype.list = function(options, callback) {
  options = options || {};

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'aapi.*',

      sql.FIELD('func.id',              'func_id'),
      sql.FIELD('func.name',            'func_name'),
      sql.FIELD('func.title',           'func_title'),
      sql.FIELD('func.description',     'func_description'),
      sql.FIELD('func.definition',      'func_definition'),
      sql.FIELD('func.argsJSON',        'func_argsJSON'),
      sql.FIELD('func.kwargsJSON',      'func_kwargsJSON'),
      sql.FIELD('func.extraConfigJSON', 'func_extraConfigJSON'),
      sql.FIELD('func.category',        'func_category'),
      sql.FIELD('func.integration',     'func_integration'),
      sql.FIELD('func.tagsJSON',        'func_tagsJSON'),

      sql.FIELD('scpt.id',             'scpt_id'),
      sql.FIELD('scpt.title',          'scpt_title'),
      sql.FIELD('scpt.description',    'scpt_description'),
      sql.FIELD('scpt.publishVersion', 'scpt_publishVersion'),

      sql.FIELD('sset.id',          'sset_id'),
      sql.FIELD('sset.title',       'sset_title'),
      sql.FIELD('sset.description', 'sset_description'),

      sql.FIELD('apia.id',    'apia_id'),
      sql.FIELD('apia.title', 'apia_title'),
      sql.FIELD('apia.type',  'apia_type'),
    ])
    .FROM('biz_main_async_api', 'aapi')
    .LEFT_JOIN('biz_main_func', 'func', {
      'func.id': 'aapi.funcId',
    })
    .LEFT_JOIN('biz_main_script', 'scpt', {
      'scpt.id': 'func.scriptId',
    })
    .LEFT_JOIN('biz_main_script_set', 'sset', {
      'sset.id': 'func.scriptSetId',
    })
    .LEFT_JOIN('biz_main_api_auth', 'apia', {
      'apia.id': 'aapi.apiAuthId',
    });

  this._list(options, callback);
};

EntityModel.prototype.add = function(data, callback) {
  try {
    if (!data.funcCallKwargsJSON) {
      data.funcCallKwargsJSON = {};
    }

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

  // Add origin, originId
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

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  if (data.funcCallKwargsJSON && 'object' === typeof data.funcCallKwargsJSON) {
    data.funcCallKwargsJSON = JSON.stringify(data.funcCallKwargsJSON);
  }

  if (data.tagsJSON && 'object' === typeof data.tagsJSON) {
    data.tagsJSON = toolkit.noDuplication(data.tagsJSON);
    data.tagsJSON.sort();
    data.tagsJSON = JSON.stringify(data.tagsJSON);
  }

  return data;
};
