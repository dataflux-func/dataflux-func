'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

var scriptSetMod = require('./scriptSetMod');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'script recover point',
  entityName : 'scriptRecoverPoint',
  tableName  : 'biz_main_script_recover_point',
  alias      : 'srpt',

  defaultOrders: [
    { field: 'srpt.seq', method: 'DESC' },
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
      'srpt.seq',
      'srpt.id',
      'srpt.type',
      'srpt.note',
      'srpt.createTime',
      'srpt.updateTime',
    ])
    .FROM('biz_main_script_recover_point', 'srpt');

  return this._list(options, callback);
};

EntityModel.prototype.add = function(data, callback) {
  var self = this;

  var scriptSetModel = scriptSetMod.createModel(self.locals);

  var scriptRecoverPointId = null;
  var allScriptSetIds = [];
  async.series([
    // Get all Script Set ID
    function(asyncCallback) {
      var sql = self.db.createSQLBuilder();
      sql
        .SELECT([
          'sset.id',
        ])
        .FROM('biz_main_script_set', 'sset')
        .ORDER_BY('sset.id', 'ASC');

      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        allScriptSetIds = toolkit.arrayElementValues(dbRes, 'id');

        return asyncCallback();
      });
    },
    // Get data to export
    function(asyncCallback) {
      var opt = {
        scriptSetIds : allScriptSetIds,
        withCodeDraft: true,
        note         : 'Recover Point',
      }
      scriptSetModel.getExportData(opt, function(err, exportData) {
        if (err) return asyncCallback(err);

        data.exportData = toolkit.getGzipBase64(exportData);

        return asyncCallback();
      });
    },
    // Write to DB
    function(asyncCallback) {
      self._add(data, function(err, addedId) {
        if (err) return asyncCallback(err);

        scriptRecoverPointId = addedId;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);

    return callback(null, scriptRecoverPointId);
  });
};

EntityModel.prototype.recover = function(id, callback) {
  var self = this;

  var scriptSetModel = scriptSetMod.createModel(self.locals);

  var scriptRecoverPoint = null;
  async.series([
    // Get all Recover Point
    function(asyncCallback) {
      self.getWithCheck(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        scriptRecoverPoint = dbRes;

        return asyncCallback();
      })
    },
    // Use Recover Point dat to import
    function(asyncCallback) {
      var importData = toolkit.fromGzipBase64(scriptRecoverPoint.exportData);
      var recoverPoint = {
        type: 'recover',
        note: `System: Before recovering Script Lib to #${scriptRecoverPoint.seq}`,
      }
      scriptSetModel.import(importData, recoverPoint, asyncCallback);
    },
  ], function(err) {
    if (err) return callback(err);
    return callback();
  });
};
