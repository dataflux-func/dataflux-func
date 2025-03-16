'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');
var urlFor  = require('../utils/routeLoader').urlFor;

var funcMod = require('../models/funcMod');

/* Init */

/* Handlers */
var crudHandler = exports.crudHandler = funcMod.createCRUDHandler();

exports.list = function(req, res, next) {
  var listData     = null;
  var listPageInfo = null;

  var funcModel = funcMod.createModel(res.locals);

  async.series([
    function(asyncCallback) {
      var opt = res.locals.getQueryOptions();

      funcModel.list(opt, function(err, dbRes, pageInfo) {
        if (err) return asyncCallback(err);

        listData     = dbRes;
        listPageInfo = pageInfo;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(listData, listPageInfo);
    res.locals.sendJSON(ret);
  });
};
