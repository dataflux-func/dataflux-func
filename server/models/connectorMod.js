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
  displayName: 'connector',
  entityName : 'connector',
  tableName  : 'biz_main_connector',
  alias      : 'cnct',

  objectFields: {
    configJSON: 'json',
    isBuiltin : 'boolean',
    isPinned  : 'boolean',
  },

  defaultOrders: [
    { field: 'cnct.pinTime',   method: 'DESC' },
    { field: 'cnct.isBuiltin', method: 'DESC' },
    { field: 'cnct.seq',       method: 'ASC'  },
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

    // Decipher / hide fields
    if (dbRes) {
      if (self.decipher) {
        _doDecipher(id, dbRes.configJSON);
      } else {
        _removeCipherFields(dbRes.configJSON);
      }
    }

    return callback(null, dbRes);
  });
};

EntityModel.prototype.list = function(options, callback) {
  var self = this;
  options = options || {};

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'cnct.*',

      sql.EXPR({ LEFT: 'cnct.pinTime', OP: 'isnotnull', RIGHT: true }, 'isPinned'),
    ])
    .FROM('biz_main_connector', 'cnct');

  return self._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    // Decipher / hide fields
    dbRes.forEach(function(d) {
      if (self.decipher) {
        _doDecipher(d.id, d.configJSON);
      } else {
        _removeCipherFields(d.configJSON);
      }
    });

    return callback(null, dbRes, pageInfo);
  });
};

EntityModel.prototype.add = function(data, callback) {
  // ID is specified by user, no need to generate
  _doCipher(data.id, data.configJSON);

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
  _doCipher(id, data.configJSON);

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

function _doCipher(id, configJSON) {
  if (toolkit.isNothing(configJSON)) return configJSON;

  CONST.cipherFields.forEach(function(f) {
    var fCipher = toolkit.strf('{0}Cipher', f);

    if (configJSON[f]) {
      var salt = id;
      configJSON[fCipher] = toolkit.cipherByAES(configJSON[f], CONFIG.SECRET, salt);
      delete configJSON[f];
    }
  });

  return configJSON;
};

function _doDecipher(id, configJSON) {
  if (toolkit.isNothing(configJSON)) return configJSON;

  CONST.cipherFields.forEach(function(f) {
    var fCipher = toolkit.strf('{0}Cipher', f);

    if (configJSON[fCipher]) {
      try {
        var salt = id;
        configJSON[f] = toolkit.decipherByAES(configJSON[fCipher], CONFIG.SECRET, salt);
      } catch(err) {
        configJSON[f] = '';
      }
    }
  });

  _removeCipherFields(configJSON);

  return configJSON;
};

function _removeCipherFields(configJSON) {
  if (toolkit.isNothing(configJSON)) return configJSON;

  CONST.cipherFields.forEach(function(f) {
    var fCipher = toolkit.strf('{0}Cipher', f);
    delete configJSON[fCipher];
  });
  return configJSON;
};

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  if (data.configJSON && 'object' === typeof data.configJSON) {
    data.configJSON = JSON.stringify(data.configJSON);
  }

  if ('boolean' === typeof data.isPinned) {
    data.pinTime = data.isPinned ? toolkit.getTimestamp() : null;
    delete data.isPinned;
  }

  return data;
};
