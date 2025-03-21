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
  displayName: 'access key',
  entityName : 'accessKey',
  tableName  : 'wat_main_access_key',
  alias      : 'ak',

  userIdField     : 'userId',
  userIdLimitField: null,

  objectFields: {
    webhookEvents   : 'commaArray',
    allowWebhookEcho: 'boolean',
  },

  useCache    : true,
  cacheExpires: 60,
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

    // Decipher secret
    if (dbRes) {
      if (dbRes.secretCipher.indexOf('AESv2:') === 0) {
        var salt = id;
        dbRes.secret = toolkit.decipherByAES(dbRes.secretCipher, CONFIG.SECRET, salt);
      } else {
        dbRes.secret = dbRes.secretCipher;
      }
      delete dbRes.secretCipher;
    }

    return callback(null, dbRes);
  });
};

EntityModel.prototype.list = function(options, callback) {
  options = options || {};

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'ak.seq',
      'ak.id',
      'ak.title',
      'ak.secretCipher',
      'ak.webhookURL',
      'ak.webhookEvents',
      'ak.allowWebhookEcho',
      'ak.createTime',
      'ak.updateTime',

      sql.FIELD('u.id',       'u_id'),
      sql.FIELD('u.username', 'u_username'),
      sql.FIELD('u.name',     'u_name'),
      sql.FIELD('u.mobile',   'u_mobile'),
    ])
    .FROM('wat_main_access_key', 'ak')
    .LEFT_JOIN('wat_main_user', 'u', {
      'u.id': 'ak.userId',
    });

  return this._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    // Decipher secret
    dbRes.forEach(function(d) {
      if (d.secretCipher.indexOf('AESv2:') === 0) {
        var salt = d.id;
        d.secret = toolkit.decipherByAES(d.secretCipher, CONFIG.SECRET, salt);
      } else {
        d.secret = d.secretCipher;
      }
      delete d.secretCipher;
    });

    return callback(null, dbRes, pageInfo);
  });
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

  data.id = toolkit.strf('{0}-{1}', this.alias, toolkit.genRandString(16));
  var secret = toolkit.genRandString(32);

  // Cipher secret
  var salt = data.id;
  data.secretCipher = toolkit.cipherByAES(secret, CONFIG.SECRET, salt);

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

  // [Compatibility] `name` was changed to `title`
  if ('name' in data) {
    data.title = data.title || data.name;
    delete data.name;
  }

  if (Array.isArray(data.webhookEvents)) {
    data.webhookEvents = data.webhookEvents.join(',');
  }

  return data;
};
