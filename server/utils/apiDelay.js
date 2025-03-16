'use strict';

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E       = require('./serverError');
var CONFIG  = require('./yamlResources').get('CONFIG');
var toolkit = require('./toolkit');

/* Init */
var createAPIDelayCacheKey = function(category) {
  return toolkit.getCacheKey('apiDelay', category);
};

exports.createAPIDelayHandler = function createAPIDelayHandler(category, delayTime) {
  return function(req, res, next) {
    var cacheKey = createAPIDelayCacheKey(category || 'general');

    async.during(function(checkCallback) {
      res.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
        if (err) return checkCallback(err);

        return checkCallback(null, !!cacheRes);
      });

    }, function(duringCallback) {
      setTimeout(duringCallback, 1000);

    }, function(err) {
      if (err) return next(err);

      res.locals.cacheDB.setex(cacheKey, delayTime, 'x', next);
    });
  }
};
