'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONST       = require('../utils/yamlResources').get('CONST');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'system setting',
  entityName : 'systemSetting',
  tableName  : 'wat_main_system_setting',
  alias      : 'ss',

  objectFields: {
    value: 'json',
  }
};

exports.createCRUDHandler = function() {
  return modelHelper.createCRUDHandler(EntityModel);
};

exports.createModel = function(locals) {
  return new EntityModel(locals);
};

var EntityModel = exports.EntityModel = modelHelper.createSubModel(TABLE_OPTIONS);

EntityModel.prototype.get = function(ids, callback) {
  ids = toolkit.asArray(ids);

  var opt = {
    filters: {
      id: { in: ids },
    }
  }
  this.list(opt, function(err, dbRes) {
    if (err) return callback(err);

    var result = {};

    // Default value
    ids.forEach(function(id) {
      result[id] = CONST.systemSettings[id];
    });

    // User set value
    dbRes.forEach(function(d) {
      result[d.id] = d.value;
    });

    return callback(null, result);
  });
};

EntityModel.prototype.set = function(id, newValue, callback) {
  var self = this;

  var systemSettingId = null;
  var oldValue        = null;

  async.series([
    // Get System Settings
    function(asyncCallback) {
      var opt = {
        filters: {
          id: {eq: id}
        }
      };
      self.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        dbRes = dbRes[0];
        if (dbRes) {
          systemSettingId = dbRes.id;
          oldValue        = dbRes.value;
        }

        return asyncCallback();
      });
    },
    // Add / update System Setting
    function(asyncCallback) {
      var _newValue = JSON.stringify(newValue);

      if (systemSettingId) {
        if (toolkit.isNothing(newValue)) {
          // Remove data if new value is nothing
          self.delete(systemSettingId, asyncCallback);

        } else {
          // Update data if got a new value
          var nextData = {
            value: _newValue,
          };
          self.modify(systemSettingId, nextData, asyncCallback);
        }

      } else {
        // Insert data if not exists
        var newData = {
          id   : id,
          value: _newValue,
        };
        self.add(newData, asyncCallback);
      }
    },
  ], function(err) {
    if (err) return callback(err);

    var ret = {
      oldValue: oldValue,
      newValue: newValue,
    }
    return callback(null, ret);
  });
};
