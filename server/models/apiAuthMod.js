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
  displayName: 'API auth',
  entityName : 'apiAuth',
  tableName  : 'biz_main_api_auth',
  alias      : 'apia',

  objectFields: {
    configJSON: 'json',
  },

  defaultOrders: [
    { field: 'apia.seq', method: 'ASC' },
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
      'apia.*',

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

      sql.FIELD('scpt.id',             'scpt_id'),
      sql.FIELD('scpt.title',          'scpt_title'),
      sql.FIELD('scpt.description',    'scpt_description'),
      sql.FIELD('scpt.publishVersion', 'scpt_publishVersion'),

      sql.FIELD('sset.id',          'sset_id'),
      sql.FIELD('sset.title',       'sset_title'),
      sql.FIELD('sset.description', 'sset_description'),
    ])
    .FROM('biz_main_api_auth', 'apia')
    .LEFT_JOIN('biz_main_func', 'func', {
      'func.id': 'apia.funcId',
    })
    .LEFT_JOIN('biz_main_script', 'scpt', {
      'scpt.id': 'func.scriptId',
    })
    .LEFT_JOIN('biz_main_script_set', 'sset', {
      'sset.id': 'func.scriptSetId',
    });

  return this._list(options, callback);
};

EntityModel.prototype.add = function(data, callback) {
  // Gen data ID for cipher salt
  if (!data.id) {
    data.id = this.genDataId();
  }

  // Cipher password
  switch(data.type) {
    case 'httpBasic':
    case 'httpDigest':
      if (Array.isArray(data.configJSON.users)) {
        data.configJSON.users.forEach(function(x) {
          var salt = `~${data.id}~${x.username}~`;
          x.passwordCipher = toolkit.cipherByAES(x.password, CONFIG.SECRET, salt);
          delete x.password;
        });
      }
      break;
  }

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
  var self = this;

  async.series([
    // Get prev config
    function(asyncCallback) {
      self.getWithCheck(id, ['type', 'configJSON'], function(err, dbRes) {
        if (err) return asyncCallback(err);

        var prevMap = null;
        switch(dbRes.type) {
          case 'httpBasic':
          case 'httpDigest':
            // Get prev passwords
            if (Array.isArray(dbRes.configJSON.users)) {
              prevMap = dbRes.configJSON.users.reduce(function(acc, x) {
                acc[x.username] = x.passwordCipher || '';
                return acc;
              }, {});
            }

            // Fill passwords that not changed
            if (Array.isArray(data.configJSON.users)) {
              data.configJSON.users.forEach(function(x) {
                if (!x.password) {
                  // Use prev ciphered data if no inputed new password
                  x.passwordCipher = prevMap[x.username] || '';

                } else {
                  // Cipher password if inputed new passowrd
                  var salt = `~${id}~${x.username}~`;
                  x.passwordCipher = toolkit.cipherByAES(x.password, CONFIG.SECRET, salt);
                }

                delete x.password;
              });
            }
            break;
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);

    try {
      data = _prepareData(data);
    } catch(err) {
      self.logger.logError(err);
      if (err instanceof E) {
        return callback(err);
      } else {
        return callback(new E('EClientBadRequest', 'Invalid request post data', {
          error: err.toString(),
        }));
      }
    }

    return self._modify(id, data, callback);
  });
};

function _prepareData(data) {
  data = toolkit.jsonCopy(data);

  // [Compatibility] `name` was changed to `title`
  if ('name' in data) {
    data.title = data.title || data.name;
    delete data.name;
  }

  if (data.configJSON && 'object' === typeof data.configJSON) {
    data.configJSON = JSON.stringify(data.configJSON);
  }

  return data;
};
