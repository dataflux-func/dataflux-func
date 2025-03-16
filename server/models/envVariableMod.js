'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'env variable',
  entityName : 'envVariable',
  tableName  : 'biz_main_env_variable',
  alias      : 'evar',

  objectFields: {
    isPinned: 'boolean',
  },

  defaultOrders: [
    { field: 'evar.pinTime', method: 'DESC' },
    { field: 'evar.id',      method: 'ASC'  },
  ],
};

exports.createCRUDHandler = function() {
  return modelHelper.createCRUDHandler(EntityModel);
};

exports.createModel = function(locals) {
  return new EntityModel(locals);
};

var EntityModel = exports.EntityModel = modelHelper.createSubModel(TABLE_OPTIONS);

EntityModel.prototype.get = function(id, options, callback) {
  var self = this;

  return self._get(id, options, function(err, dbRes) {
    if (err) return callback(err);

    // Hide password value
    if (dbRes) {
      if (dbRes.autoTypeCasting === 'password') {
        delete dbRes.valueTEXT;
      }
    }

    return callback(null, dbRes);
  });
};

EntityModel.prototype.list = function(options, callback) {
  options = options || {};

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'evar.*',

      sql.EXPR({ LEFT: 'evar.pinTime', OP: 'isnotnull', RIGHT: true }, 'isPinned'),
    ])
    .FROM('biz_main_env_variable', 'evar');

  return this._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    // Hide password value
    dbRes.forEach(function(d) {
      if (d.autoTypeCasting === 'password') {
        delete d.valueTEXT;
      }
    });

    return callback(null, dbRes, pageInfo);
  });
};

EntityModel.prototype.add = function(data, callback) {
  if (data.valueTEXT && data.autoTypeCasting === 'password') {
    // ID is specified by user, no need to generate
    var salt = data.id;
    data.valueTEXT = toolkit.cipherByAES(data.valueTEXT, CONFIG.SECRET, salt);
  }

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
  if (data.valueTEXT && data.autoTypeCasting === 'password') {
    // ID is specified by user, no need to generate
    var salt = id;
    data.valueTEXT = toolkit.cipherByAES(data.valueTEXT, CONFIG.SECRET, salt);
  }

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

  if ('valueTEXT' in data && !data.valueTEXT) {
    data.valueTEXT = '';
  }

  if ('boolean' === typeof data.isPinned) {
    data.pinTime = data.isPinned ? toolkit.getTimestamp() : null;
    delete data.isPinned;
  }

  return data;
};
