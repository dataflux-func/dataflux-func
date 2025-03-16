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
  displayName: 'func store',
  entityName : 'funcStore',
  tableName  : 'biz_main_func_store',
  alias      : 'fnst',

  objectFields: {
    valueJSON: 'json',
  },

  defaultOrders: [
    { field: 'fnst.seq', method: 'DESC' },
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
      'fnst.seq',
      'fnst.id',
      'fnst.scope',
      'fnst.key',
      'fnst.expireAt',
      'fnst.createTime',
      'fnst.updateTime',
      sql.BYTE_SIZE(sql.FIELD('fnst.valueJSON'), 'dataSize'),
    ])
    .FROM('biz_main_func_store', 'fnst');

  return this._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    // Add data type
    dbRes.forEach(function(d) {
      d.type = typeof d;
    });

    return callback(null, dbRes, pageInfo);
  });
};
