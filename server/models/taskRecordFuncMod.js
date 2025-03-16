'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async  = require('async');
var moment = require('moment-timezone');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'task record func',
  entityName : 'taskRecordFunc',
  tableName  : 'biz_main_task_record_func',
  alias      : 'task',

  objectFields: {
  },

  defaultOrders: [
    { field: 'task.seq', method: 'DESC' },
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
      'task.*',

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
    ])
    .FROM('biz_main_task_record_func', 'task')
    .LEFT_JOIN('biz_main_func', 'func', {
      'func.id': 'task.funcId',
    });

  // Root Task is included when search by Root Task
  if (options.filters['task.rootTaskId'] && options.filters['task.rootTaskId'].eq) {
    sql.WHERE([
      [{
        'task.id'        : options.filters['task.rootTaskId'].eq,
        'task.rootTaskId': options.filters['task.rootTaskId'].eq,
      }]
    ]);

    delete options.filters['task.rootTaskId'].eq;
  }

  this._list(options, callback);
};

EntityModel.prototype.getCount = function(groupField, groupIds, callback) {
  groupIds = toolkit.asArray(groupIds);

  var sql = this.db.createSQLBuilder()
  sql
    .SELECT([
      sql.FIELD(groupField, 'groupId'),
      sql.FUNC('COUNT', sql.RAW('*'), 'count'),
    ])
    .FROM('biz_main_task_record_func')
    .WHERE([
      { LEFT: groupField, OP: 'in', RIGHT: groupIds },
    ])
    .GROUP_BY(groupField);

  this.db.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var countMap = {};
    dbRes.forEach(function(d) {
      if (!d.groupId) return;

      countMap[d.groupId] = d;
    });

    return callback(null, countMap);
  });
};

EntityModel.prototype.appendSubTaskCount = function(data, callback) {
  if (toolkit.isNothing(data)) return callback(null, data);

  var rootTaskIds = toolkit.arrayElementValues(data, 'id');

  var sql = this.db.createSQLBuilder()
  sql
    .SELECT([
      'sub.rootTaskId',
      sql.FUNC('COUNT', sql.FIELD('sub.seq'), 'subTaskCount'),
    ])
    .FROM('biz_main_task_record_func', 'sub')
    .WHERE({
      'sub.rootTaskId': rootTaskIds,
    })
    .GROUP_BY('sub.rootTaskId');

  this.db.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    // Make Sub Task map
    var subTaskCountMap = {};
    dbRes.forEach(function(d) {
      if (!d.rootTaskId) return;

      subTaskCountMap[d.rootTaskId] = d.subTaskCount;
    });

    // Fill Sub Task Count
    data.forEach(function(x) {
      var subTaskCount = subTaskCountMap[x.id] || 0;
      x.subTaskCount = subTaskCount || 0;
    });

    return callback(null, data);
  });
};
