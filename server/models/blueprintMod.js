'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var fs = require('fs-extra');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'Blueprint',
  entityName : 'blueprint',
  tableName  : 'biz_main_blueprint',
  alias      : 'blpt',

  objectFields: {
    canvasJSON: 'json',
    isDeployed: 'boolean',
  },

  defaultOrders: [
    { field: 'blpt.seq', method: 'ASC' },
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
      'blpt.seq',
      'blpt.id',
      'blpt.title',
      'blpt.description',
      'blpt.createTime',
      'blpt.updateTime',
    ])
    .FROM('biz_main_blueprint', 'blpt');

  if (options.extra.withCanvas) {
    sql
      .SELECT([
        'blpt.canvasJSON',
        'blpt.viewJSON',
      ]);
  }

  return this._list(options, callback);
};

EntityModel.prototype.add = function(data, callback) {
  // Add example data for new Blueprint
  data.canvasJSON = toolkit.isNullOrUndefined(data.canvasJSON)
                 ? JSON.parse(fs.readFileSync('blueprint-example.json'))
                 : data.canvasJSON;

  data.viewJSON = {};

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

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  if (data.canvasJSON && 'object' === typeof data.canvasJSON) {
    data.canvasJSON = JSON.stringify(data.canvasJSON);
  }

  if (data.viewJSON && 'object' === typeof data.viewJSON) {
    data.viewJSON = JSON.stringify(data.viewJSON);
  }

  return data;
};
