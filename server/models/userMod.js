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
  displayName: 'user',
  entityName : 'user',
  tableName  : 'wat_main_user',
  alias      : 'u',

  objectFields: {
    markers         : 'commaArray',
    roles           : 'commaArray',
    customPrivileges: 'commaArray',
    isDisabled      : 'boolean',
  },
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
      'u.seq',
      'u.id',
      'u.username',
      'u.name',
      'u.email',
      'u.mobile',
      'u.markers',
      'u.roles',
      'u.customPrivileges',
      'u.isDisabled',
      'u.createTime',
      'u.updateTime'])
    .FROM('wat_main_user', 'u')

  return this._list(options, callback);
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

  if (!data.id) {
    data.id = this.genDataId();
  }

  // Create passwordHash
  data.passwordHash = toolkit.getSaltedPasswordHash(
      data.id, data.password, CONFIG.SECRET);
  delete data.password;

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

  if (toolkit.notNothing(data.password)) {
    // Get new password hash when changing password
    data.passwordHash = toolkit.getSaltedPasswordHash(
        id, data.password, CONFIG.SECRET);
    delete data.password;
  }

  return this._modify(id, data, callback);
};

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  if (Array.isArray(data.markers)) {
    data.markers = data.markers.join(',');
  }

  if (Array.isArray(data.roles)) {
    data.roles = data.roles.join(',');
  }

  if (Array.isArray(data.customPrivileges)) {
    data.customPrivileges = data.customPrivileges.join(',');
  }

  return data;
};
