'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E           = require('../utils/serverError');
var CONFIG      = require('../utils/yamlResources').get('CONFIG');
var toolkit     = require('../utils/toolkit');
var modelHelper = require('../utils/modelHelper');

var funcMod    = require('../models/funcMod');
var cronJobMod = require('../models/cronJobMod');

/* Init */
var GLOBAL_SCOPE = 'GLOBAL';

/* Handlers */
var crudHandler = exports.crudHandler = cronJobMod.createCRUDHandler();
exports.delete     = crudHandler.createDeleteHandler();
exports.deleteMany = crudHandler.createDeleteManyHandler();

exports.list = function(req, res, next) {
  var listData     = null;
  var listPageInfo = null;

  var cronJobModel = cronJobMod.createModel(res.locals);

  async.series([
    function(asyncCallback) {
      var opt = res.locals.getQueryOptions();

      cronJobModel.list(opt, function(err, dbRes, pageInfo) {
        if (err) return asyncCallback(err);

        listData     = dbRes;
        listPageInfo = pageInfo;

        return asyncCallback();
      });
    },
    // Add last task status
    function(asyncCallback) {
      if (toolkit.isNothing(listData)) return asyncCallback();

      var dataIds = toolkit.arrayElementValues(listData, 'id');
      var cacheKey = toolkit.getGlobalCacheKey('cache', 'lastTaskStatus', [ 'origin', 'cronJob' ]);
      res.locals.cacheDB.hmget(cacheKey, dataIds, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        listData.forEach(function(d) {
          d.lastTaskStatus = null;

          var lastTaskStatus = cacheRes[d.id];
          if (!lastTaskStatus) return;

          d.lastTaskStatus = JSON.parse(lastTaskStatus);
        });

        return asyncCallback();
      });
    },
    // Add dynamic Cron expr
    function(asyncCallback) {
      if (toolkit.isNothing(listData)) return asyncCallback();

      var dataIds  = toolkit.arrayElementValues(listData, 'id');
      var cacheKey = toolkit.getGlobalCacheKey('cronJob', 'dynamicCronExpr');
      res.locals.cacheDB.hmget(cacheKey, dataIds, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        var now = toolkit.getTimestamp();
        listData.forEach(function(d) {
          d.dynamicCronExpr           = null;
          d.dynamicCronExprExpireTime = null;

          var dynamicCronExpr = cacheRes[d.id];
          if (!dynamicCronExpr) return;

          dynamicCronExpr = JSON.parse(dynamicCronExpr);
          if (dynamicCronExpr.expireTime && dynamicCronExpr.expireTime < now) return;

          d.dynamicCronExpr           = dynamicCronExpr.value;
          d.dynamicCronExprExpireTime = dynamicCronExpr.expireTime;
        });

        return asyncCallback();
      });
    },
    // Add Cron Job pause flag
    function(asyncCallback) {
      if (toolkit.isNothing(listData)) return asyncCallback();

      var dataIds  = toolkit.arrayElementValues(listData, 'id');
      var cacheKey = toolkit.getGlobalCacheKey('cronJob', 'pause');
      res.locals.cacheDB.hmget(cacheKey, dataIds, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        var now = toolkit.getTimestamp();
        listData.forEach(function(d) {
          d.isPaused        = false;
          d.pauseExpireTime = null;

          var pauseExpireTime = cacheRes[d.id];
          if (!pauseExpireTime) return;

          pauseExpireTime = parseInt(pauseExpireTime);
          if (pauseExpireTime && pauseExpireTime < now) return;

          d.isPaused        = true;
          d.pauseExpireTime = pauseExpireTime;
        });

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(listData, listPageInfo);
    res.locals.sendJSON(ret);
  });
}

exports.listRecentTriggered = function(req, res, next) {
  var id = req.params.id;

  var cacheKey = toolkit.getGlobalCacheKey('cache', 'recentTaskTriggered', [ 'origin', 'cronJob' ]);
  res.locals.cacheDB.hget(cacheKey, id, function(err, cacheRes) {
    if (err) return next(err);

    var data = cacheRes;
    if (!data) {
      data = {};
    } else {
      data = JSON.parse(data);
    }

    // Clear old data
    if (Array.isArray(data)) {
      data = {};
      res.locals.cacheDB.hdel(cacheKey, id);
    }

    // NOTE Compatibility: `crontab` was changed to `cronJob`
    if ('undefined' !== typeof data.crontab) {
      data.cronJob = data.crontab;
      delete data.crontab;
    }

    let recentTriggered = [];
    for (let execMode in data) {
      toolkit.deltaOfDeltaDecode(toolkit.repeatDecode(data[execMode])).forEach(function(ts) {
        recentTriggered.push([ ts, execMode ]);
      });
    }

    recentTriggered.sort(function(a, b) {
      if (a[0] < b[0]) return 1;
      else if (a[0] > b[0]) return -1;
      else return 0
    });

    if (recentTriggered.length > CONFIG._RECENT_CRON_JOB_TRIGGERED_LIMIT) {
      recentTriggered = recentTriggered.slice(0, CONFIG._RECENT_CRON_JOB_TRIGGERED_LIMIT)
    }

    var ret = toolkit.initRet(recentTriggered);
    return res.locals.sendJSON(ret);
  });
}

exports.add = function(req, res, next) {
  var data = req.body.data;

  // NOTE Compatibility: `crontab` was changed to `cronExpr`
  data.cronExpr = data.cronExpr || data.crontab;
  delete data.crontab;

  _addImpl(res.locals, data, function(err, addedId) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: addedId,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.modify = function(req, res, next) {
  var id   = req.params.id;
  var data = req.body.data;

  // NOTE Compatibility: `crontab` was changed to `cronExpr`
  data.cronExpr = data.cronExpr || data.crontab;
  delete data.crontab;

  _modifyImpl(res.locals, id, data, null, function(err, modifiedId) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      id: id,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.addMany = function(req, res, next) {
  var data = req.body.data;

  // NOTE Compatibility: `crontab` was changed to `cronExpr`
  data.cronExpr = data.cronExpr || data.crontab;
  delete data.crontab;

  var addedIds = [];

  var transScope = modelHelper.createTransScope(res.locals.db);
  async.series([
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    function(asyncCallback) {
      async.eachSeries(data, function(d, eachCallback) {
        _addImpl(res.locals, d, function(err, addedId) {
          if (err) return eachCallback(err);

          addedIds.push(addedId);

          return eachCallback();
        });
      }, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return next(scopeErr);

      var ret = toolkit.initRet({
        ids: addedIds,
      });
      return res.locals.sendJSON(ret);
    });
  });
};

exports.modifyMany = function(req, res, next) {
  var data = req.body.data;

  // NOTE Compatibility: `crontab` was changed to `cronExpr`
  data.cronExpr = data.cronExpr || data.crontab;
  delete data.crontab;

  var cronJobModel = cronJobMod.createModel(res.locals);

  var modifiedIds = [];

  var transScope = modelHelper.createTransScope(res.locals.db);
  async.series([
    function(asyncCallback) {
      var opt = res.locals.getQueryOptions();

      if (toolkit.isNothing(opt.filters)) {
        return asyncCallback(new E('EBizCondition.ModifyConditionNotSpecified', 'At least one condition should been specified'));
      }

      opt.fields = [ 'cron.id' ];
      opt.paging = false;

      cronJobModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        modifiedIds = toolkit.arrayElementValues(dbRes, 'id');

        return asyncCallback();
      });
    },
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    function(asyncCallback) {
      async.eachSeries(modifiedIds, function(id, eachCallback) {
        var _data = toolkit.jsonCopy(data);
        var opt = {
          funcCallKwargs: 'merge'
        };
        _modifyImpl(res.locals, id, _data, opt, eachCallback);

      }, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return next(scopeErr);

      var ret = toolkit.initRet({
        ids: modifiedIds,
      });
      return res.locals.sendJSON(ret);
    });
  });
};

function _addImpl(locals, data, callback) {
  // Default scope
  data.scope = data.scope || GLOBAL_SCOPE;

  var funcModel    = funcMod.createModel(locals);
  var cronJobModel = cronJobMod.createModel(locals);

  var addedId = null;

  async.series([
    // Check Func
    function(asyncCallback) {
      funcModel.getWithCheck(data.funcId, ['func.seq'], asyncCallback);
    },
    // Save to DB
    function(asyncCallback) {
      cronJobModel.add(data, function(err, _addedId) {
        if (err) return asyncCallback(err);

        addedId = _addedId;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);
    return callback(null, addedId);
  });
};

function _modifyImpl(locals, id, data, opt, callback) {
  opt = opt || {};

  var funcModel    = funcMod.createModel(locals);
  var cronJobModel = cronJobMod.createModel(locals);

  var cronJob = null;

  async.series([
    // Get data
    function(asyncCallback) {
      var fields = [
        'cron.seq',
        'cron.funcId',
        'cron.funcCallKwargsJSON',
        'cron.scope',
      ]
      cronJobModel.getWithCheck(id, fields, function(err, dbRes) {
        if (err) return asyncCallback(err);

        cronJob = dbRes;

        if (opt.funcCallKwargs === 'merge' && toolkit.notNothing(data.funcCallKwargsJSON)) {
          // Merge funcCallKwargsJSON
          var prevFuncCallKwargs = toolkit.jsonCopy(cronJob.funcCallKwargsJSON);
          data.funcCallKwargsJSON = Object.assign(prevFuncCallKwargs, data.funcCallKwargsJSON);
        }

        return asyncCallback();
      });
    },
    // Check Func
    function(asyncCallback) {
      if (toolkit.isNothing(data.funcId)) return asyncCallback();

      funcModel.getWithCheck(data.funcId, ['func.seq', 'func.extraConfigJSON'], asyncCallback);
    },
    function(asyncCallback) {
      cronJobModel.modify(id, data, asyncCallback);
    },
  ], function(err) {
    if (err) return callback(err);
    return callback(null, id);
  });
};
