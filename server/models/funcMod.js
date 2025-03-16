'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');
var urlFor      = require('../utils/routeLoader').urlFor;

/* Init */
var TABLE_OPTIONS = exports.TABLE_OPTIONS = {
  displayName: 'func',
  entityName : 'func',
  tableName  : 'biz_main_func',
  alias      : 'func',

  objectFields: {
    argsJSON       : 'json',
    kwargsJSON     : 'json',
    extraConfigJSON: 'json',
    tagsJSON       : 'json',
    dataJSON       : 'json',
  },

  defaultOrders: [
    { field: 'scpt.id',       method: 'ASC' },
    { field: 'func.defOrder', method: 'ASC' },
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
  var self = this;

  options = options || {};
  options.extra = options.extra || {};

  if (options.extra.asFuncDoc) {
    options.filters = options.filters;
    options.filters['func.isHidden'] = { eq: false };
  }

  var sql = options.baseSQL = this.db.createSQLBuilder();
  sql
    .SELECT([
      'func.*',

      sql.FIELD('scpt.id',             'scpt_id'),
      sql.FIELD('scpt.title',          'scpt_title'),
      sql.FIELD('scpt.description',    'scpt_description'),
      sql.FIELD('scpt.codeMD5',        'scpt_codeMD5'),
      sql.FIELD('scpt.publishVersion', 'scpt_publishVersion'),

      sql.FIELD('sset.id',          'sset_id'),
      sql.FIELD('sset.title',       'sset_title'),
      sql.FIELD('sset.description', 'sset_description'),
      sql.FIELD('sset.origin',      'sset_origin'),
      sql.FIELD('sset.originId',    'sset_originId'),
    ])
    .FROM('biz_main_func', 'func')
    .LEFT_JOIN('biz_main_script', 'scpt', {
      'scpt.id': 'func.scriptId',
    })
    .LEFT_JOIN('biz_main_script_set', 'sset', {
      'sset.id': 'func.scriptSetId',
    });

  return this._list(options, function(err, dbRes, pageInfo) {
    if (err) return callback(err);

    // Add more info
    dbRes.forEach(function(d) {
      // Skip if no Func def
      if (!d.definition) return;

      // Parse `argsJSON`, `kwargsJSON`
      var parsedFuncArgs = parseFuncArgs(d.definition);
      d.argsJSON   = d.argsJSON   || parsedFuncArgs.args   || [];
      d.kwargsJSON = d.kwargsJSON || parsedFuncArgs.kwargs || {};

      // Ensure `extraConfigJSON`
      d.extraConfigJSON = d.extraConfigJSON || {};
    });

    // Convert format
    let funcDoc = null;
    if (options.extra.asFuncDoc) {
      funcDoc = [];
      dbRes.forEach(function(d) {
        funcDoc.push({
          url: urlFor('mainAPI.callFunc', {
            params: { funcId: d.id },
          }),

          id                  : d.id,
          name                : d.name,
          title               : d.title,
          description         : d.description,
          definition          : d.definition,
          argsJSON            : d.argsJSON,
          kwargsJSON          : d.kwargsJSON,
          extraConfigJSON     : d.extraConfigJSON,
          category            : d.category,
          integration         : d.integration,
          tagsJSON            : d.tagsJSON,
          scriptId            : d.scpt_id,
          scriptTitle         : d.scpt_title,
          scriptDescription   : d.scpt_description,
          scriptSetId         : d.sset_id,
          scriptSetTitle      : d.sset_title,
          scriptSetDescription: d.sset_description,
        });
      });
    }

    return callback(null, funcDoc || dbRes, pageInfo);
  });
};

EntityModel.prototype.update = function(scriptId, apiFuncs, callback) {
  var self = this;

  var scriptSetId = scriptId.split('__')[0];
  apiFuncs = toolkit.asArray(apiFuncs);

  var transScope = modelHelper.createTransScope(self.db);
  async.series([
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    function(asyncCallback) {
      var sql = self.db.createSQLBuilder();
      sql
        .DELETE_FROM('biz_main_func')
        .WHERE({
          scriptId: scriptId
        });

      self.db.query(sql, asyncCallback);
    },
    function(asyncCallback) {
      if (toolkit.isNothing(apiFuncs)) return asyncCallback();

      var data = [];
      apiFuncs.forEach(function(d) {
        var dataId = toolkit.strf('{0}.{1}', scriptId, d.name);

        var argsJSON = null;
        if (d.args && 'string' !== typeof d.args) {
          argsJSON = JSON.stringify(d.args);
        }

        var kwargsJSON = null;
        if (d.kwargs && 'string' !== typeof d.kwargs) {
          kwargsJSON = JSON.stringify(d.kwargs);
        }

        var extraConfigJSON = {};
        if (d.extraConfig && 'string' !== typeof d.extraConfig) {
          extraConfigJSON = JSON.stringify(d.extraConfig);
        }
        var tagsJSON = null;
        if (d.tags && 'string' !== typeof d.tags) {
          tagsJSON = JSON.stringify(d.tags);
        }

        data.push({
          id             : dataId,
          scriptSetId    : scriptSetId,
          scriptId       : scriptId,
          name           : d.name,
          title          : d.title,
          description    : d.description,
          definition     : d.definition,
          argsJSON       : argsJSON,
          kwargsJSON     : kwargsJSON,
          extraConfigJSON: extraConfigJSON,
          category       : d.category,
          integration    : d.integration,
          tagsJSON       : tagsJSON,
          defOrder       : d.defOrder,
        })
      });

      var sql = self.db.createSQLBuilder();
      sql
        .INSERT_INTO('biz_main_func')
        .VALUES(data);

      self.db.query(sql, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback(scopeErr);
      return callback();
    });
  });
};

var parseFuncArgs = exports.parseFuncArgs = function(funcDefinition) {
  var args       = [];
  var kwargs     = {};
  var argsJSON   = JSON.stringify(args);
  var kwargsJSON = JSON.stringify(kwargs);

  try {
    if (funcDefinition) {
      funcDefinition
      .replace(/\w+\(/g, '')
      .replace(/\)$/g, '')
      .split(',')
      .forEach(function(s) {
        var k = s.trim().split('=')[0];
        if (!k) return;

        args.push(k);
        kwargs[k] = null;
      });
    }

    argsJSON   = JSON.stringify(args);
    kwargsJSON = JSON.stringify(kwargs);

  } catch(err) {
    // Do not throw
  }

  var parsedFuncArgs = {
    args      : args,
    argsJSON  : argsJSON,
    kwargs    : kwargs,
    kwargsJSON: kwargsJSON,
  }
  return parsedFuncArgs;
};
