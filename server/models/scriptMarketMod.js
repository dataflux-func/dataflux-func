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
  displayName: 'script market',
  entityName : 'scriptMarket',
  tableName  : 'biz_main_script_market',
  alias      : 'smkt',

  objectFields: {
    configJSON    : 'json',
    extraJSON     : 'json',
    lockConfigJSON: 'json',
    isOfficial    : 'boolean',
    isLocked      : 'boolean',
    isPinned      : 'boolean',
  },

  defaultOrders: [
    { field: 'smkt.pinTime', method: 'DESC' },
    { field: 'smkt.seq',     method: 'ASC'  },
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
      'smkt.*',

      sql.EXPR({ 'smkt.id': CONFIG._OFFICIAL_SCRIPT_MARKET_ID },       'isOfficial'),
      sql.EXPR({ LEFT: 'smkt.pinTime', OP: 'isnotnull', RIGHT: true }, 'isPinned'),
      sql.FIELD('locker.username',                                     'lockedByUserUsername'),
      sql.FIELD('locker.name',                                         'lockedByUserName'),
    ])
    .FROM('biz_main_script_market', 'smkt')
    .LEFT_JOIN('wat_main_user', 'locker', {
      'locker.id': 'smkt.lockedByUserId',
    });

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
  // Gen data ID for cipher salt
  if (!data.id) {
    data.id = this.genDataId();
  }

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

  // [Compatibility] `name` was changed to `title`
  if ('name' in data) {
    data.title = data.title || data.name;
    delete data.name;
  }

  if (data.configJSON && 'object' === typeof data.configJSON) {
    ['url', 'endpoint', 'folder'].forEach(function(f) {
      if (data.configJSON[f]) {
        data.configJSON[f] = data.configJSON[f].replace(/\/*$/g, '').replace(/^\/*/g, '');
      }
    });

    data.configJSON = JSON.stringify(data.configJSON);
  }

  if (data.extraJSON && 'object' === typeof data.extraJSON) {
    data.extraJSON = JSON.stringify(data.extraJSON);
  }

  if (data.lockConfigJSON && 'object' === typeof data.lockConfigJSON) {
    data.lockConfigJSON = JSON.stringify(data.lockConfigJSON);
  }

  if ('boolean' === typeof data.isPinned) {
    data.pinTime = data.isPinned ? toolkit.getTimestamp() : null;
    delete data.isPinned;
  }

  return data;
};
