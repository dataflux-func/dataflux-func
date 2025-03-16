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
  displayName: 'script publish history',
  entityName : 'scriptPublishHistory',
  tableName  : 'biz_main_script_publish_history',
  alias      : 'scph',

  defaultOrders: [
    { field: 'scph.seq', method: 'DESC' },
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
      'scph.seq',
      'scph.id',
      'scph.scriptId',
      'scph.scriptPublishVersion',
      'scph.note',
      'scph.createTime',
      'scph.updateTime',

      sql.FIELD('scpt.id',          'scpt_id'),
      sql.FIELD('scpt.title',       'scpt_title'),
      sql.FIELD('scpt.description', 'scpt_description'),

      sql.FIELD('sset.id',          'sset_id'),
      sql.FIELD('sset.title',       'sset_title'),
      sql.FIELD('sset.description', 'sset_description'),
    ])
    .FROM('biz_main_script_publish_history', 'scph')
    .LEFT_JOIN('biz_main_script', 'scpt', {
      'scpt.id': 'scph.scriptId',
    })
    .LEFT_JOIN('biz_main_script_set', 'sset', {
      'sset.id': 'scpt.scriptSetId',
    });

  if (options.extra.withScriptCode_cache) sql.SELECT('scph.scriptCode_cache');

  return this._list(options, callback);
};
