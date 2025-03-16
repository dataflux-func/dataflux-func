'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E       = require('./serverError');
var CONFIG  = require('./yamlResources').get('CONFIG');
var toolkit = require('./toolkit');

/**
 * Trans Scope
 * @param {Object} db
 */
var TransScope = function(db) {
  var self = this;

  self.db = db;
};

/**
 * Start the transaction scope (auto start)
 * @param  {Function} callback
 * @return {undefined}
 */
TransScope.prototype.start = function(callback) {
  var self = this;

  self.db.startTrans(callback);
};

/**
 * End the transaction scope (auto commit or rollback)
 * @param  {Object}   bizErr
 * @param  {Function} callback
 * @return {undefined}
 */
TransScope.prototype.end = function(err, callback) {
  var self = this;

  if (!self.db.transConn) return callback(err);

  if (err) {
    self.db.rollback(function(dbErr) {
      if (dbErr) return callback(dbErr);

      return callback(err);
    });

  } else {
    self.db.commit(function(dbErr) {
      if (dbErr) return callback(dbErr);

      return callback();
    });
  }
};

var TransScope = exports.TransScope = TransScope;
var createTransScope = exports.createTransScope = function(db) {
  return new TransScope(db);
};

/**
 * Create a Express.js middleware for generating paging setting.
 *
 * @param  {Object}   routeConfig - Route config
 * @return {Function}             - Express.js middleware
 */
exports.createRequestPagingOpt = function(routeConfig) {
  /**
   * @param  {Object} req                          - `Express.js` request object
   * @param  {Object} res                          - `Express.js` response object
   * @param  {Object} next                         - `Express.js` next callback
   * @return {Object} [res.locals.paging=null]     - Paging infomation
   * @return {Number} res.locals.paging.pagingStyle
   * @return {Number} res.locals.paging.pageNumber
   * @return {Number} res.locals.paging.pageSize
   * @return {Number} res.locals.paging.pageIndex
   */
  return function createRequestPagingOpt(req, res, next) {
    if ((routeConfig.paging === false)
    || (routeConfig.paging !== false && toolkit.toBoolean(req.query.noPage))) {
      return next();
    }

    // Paging style
    var paging = {
      pagingStyle: routeConfig.paging === true ? 'normal' : routeConfig.paging,
    };

    // Page size
    var pageSize = parseInt(req.query.pageSize || req.cookies[CONFIG._WEB_PAGE_SIZE_COOKIE]);
    if (pageSize && pageSize >= 1 && pageSize <= 100) {
      paging.pageSize = pageSize;
    }
    if (res.locals.requestType === 'page') {
      res.cookie(CONFIG._WEB_PAGE_SIZE_COOKIE, paging.pageSize);
    }

    // Page number
    var pageNumber = parseInt(req.query.pageNumber);
    if (pageNumber && pageNumber >= 1 && pageNumber <= 99999) {
      paging.pageNumber = pageNumber;
    }

    res.locals.paging = paging;

    return next();
  };
};

/**
 * Create a Express.js middleware for generating SQL where condition.
 *
 * @param  {Object}   routeConfig - Route config.
 * @return {Function}             - Express.js middleware.
 */
exports.createRequestFiltersOpt = function(routeConfig) {
  /**
   * @param  {Object} req                - `Express.js` request object
   * @param  {Object} res                - `Express.js` response object
   * @param  {Object} next               - `Express.js` next callback
   * @return {Object} res.locals.filters - Conditions from query
   */
  return function(req, res, next) {
    if (!routeConfig.query) {
      return next();
    }

    var reqQuery = toolkit.jsonCopy(req.query);
    var filters = res.locals.filters || {};

    for (var k in routeConfig.query) if (routeConfig.query.hasOwnProperty(k)) {
      var v = routeConfig.query[k];

      // Not for SQL
      if (v.$skipSQL) continue;

      // Not for search
      if (!v.$searchType) continue;

      // Convert search query to filter
      if (k in reqQuery && reqQuery.hasOwnProperty(k)) {
        var conditionKey   = v.$searchKey || k;
        var conditionValue = reqQuery[k];

        filters[conditionKey] = filters[conditionKey] || {};
        filters[conditionKey][v.$searchType] = toolkit.isNothing(conditionValue)
                                            ? undefined
                                            : conditionValue;

      }
    }

    res.locals.filters = filters;

    return next();
  };
};

/**
 * Create a Express.js middleware for extra condition.
 *
 * @param  {Object}   routeConfig - Route config.
 * @return {Function}             - Express.js middleware.
 */
exports.createRequestExtraOpt = function(routeConfig) {
  return function(req, res, next) {
    if (!routeConfig.query) {
      return next();
    }

    var reqQuery = toolkit.jsonCopy(req.query);
    var extra = res.locals.extra || {};

    for (var k in routeConfig.query) if (routeConfig.query.hasOwnProperty(k)) {
      var v = routeConfig.query[k];

      // Normal filter
      if (k[0] !== '_') continue;

      // Not inputed filter
      if ('undefined' === typeof req.query[k]) continue;

      // Fuzzy Search
      if (k === '_fuzzySearch' && toolkit.notNothing(routeConfig.fuzzySearch)) {
        res.locals.filters = res.locals.filters || {};
        res.locals.filters._fuzzySearch = {
          keys : toolkit.asArray(routeConfig.fuzzySearch),
          value: reqQuery[k],
        }

        continue;
      }

      // Add to extra options
      var extraKey = k.slice(1);
      extra[extraKey] = req.query[k];
    }

    res.locals.extra = extra;

    return next();
  }
};

/**
 * Create a Express.js middleware for generating SQL order condition.
 *
 * @param  {Object}   routeConfig - Route config.
 * @return {Function}             - Express.js middleware
 */
exports.createRequestOrdersOpt = function(routeConfig) {
  /**
   * @param  {Object} req               - `Express.js` request object
   * @param  {Object} res               - `Express.js` response object
   * @param  {Object} next              - `Express.js` next callback
   * @return {Object} res.locals.orders - Orders from query
   */
  return function(req, res, next) {
    if (routeConfig.method.toLowerCase() !== 'get' || !routeConfig.orderFields) {
      return next();
    }

    // Add order condition
    var orders = [];
    if (req.query.sort) {
      // New version
      req.query.sort.forEach(function(field) {
        var orderMethod = 'ASC';
        if (toolkit.startsWith(field, '-')) {
          orderMethod = 'DESC';
          field = field.slice(1).trim();
        }

        orders.push({
          field : routeConfig.orderFields[field],
          method: orderMethod,
        });
      });

    } else if (req.query.orderBy) {
      // Old version
      var orderMethod = req.query.orderMethod || 'ASC';
      orderMethod = orderMethod.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      orders.push({
        field : routeConfig.orderFields[req.query.orderBy],
        method: orderMethod,
      });
    }

    res.locals.orders = toolkit.isNothing(orders) ? null : orders;

    return next();
  };
};

/**
 * @constructor
 * @param {Object} locals  - `Express.js` req.locals/app.locals
 * @param {Object} options - CRUD options
 * @param {String} options.tableName
 * @param {String} [options.alias=null]
 * @param {String} [options.userIdField=null]
 */
var Model = function(locals, options) {
  var self = this;

  options = options || {};

  // Basic
  self.locals = locals;

  self.logger = locals.logger;

  // Table/Data description
  self.displayName  = options.displayName  || 'data';
  self.entityName   = options.entityName   || 'data';
  self.tableName    = options.tableName    || null;
  self.viewName     = options.viewName     || null;
  self.alias        = options.alias        || self.tableName;
  self.idName       = options.idName       || self.entityName + 'Id';

  // Filling field automatically
  // Field value to fill
  self.userId = toolkit.jsonFindSafe(self, (options.userIdPath || 'locals.user.id')) || null;

  // Field name for ADD data
  self.userIdField = options.userIdField || null;

  self.allowExplicitUserId = options.allowExplicitUserId || false;

  // Field name for LIST/GET, VIEW/DELETE/MODIFY WHERE condition
  self.userIdLimitField = options.userIdLimitField || null;

  if (self.userIdLimitField) {
    self.userIdLimitField_select    = self.userIdLimitField;
    self.userIdLimitField_nonSelect = self.userIdLimitField.split('.').pop();
  }

  self.ignoreUserLimit = toolkit.toBoolean(options.ignoreUserLimit) || false;

  // Default orders
  self.defaultOrders = options.defaultOrders || [{ field: toolkit.strf('{0}.seq', self.alias), method: 'DESC' }];

  // Data converting
  self.objectFields = toolkit.jsonCopy(options.objectFields || {});

  // DB
  self.db = locals.db;

  // Cache DB
  self.cacheDB = locals.cacheDB;

  // File Storage
  self.fileStorage = locals.fileStorage;

  // Extra
  self.extra = toolkit.jsonCopy(options.extra || {});

  if ('function' === typeof options.afterCreated) {
    options.afterCreated(self);
  }
};

/**
 * Check DB Duplication Error and create a Server Error
 * @param  {Object}   [err] - DB Error
 * @return {undefined}
 */
Model.prototype.checkDuplicationError = function(err) {
  var self = this;

  if (!err) return null;

  var errStr = err.toString();
  if (errStr.indexOf(self.db.uniqueKeyErrorKeyword) >= 0) {
    var key = undefined;
    var m = errStr.match(self.db.uniqueKeyErrorRegExp);
    if (m) {
      var key = m[1];
    }

    return new E('EClientDuplicated', 'Duplicated data Key', { key });
  }

  return null;
};

/**
 * Generate a new data ID for this options.
 *
 * @return {String}
 */
Model.prototype.genDataId = function() {
  return toolkit.genDataId(this.alias);
};

/**
 * List records from DB.
 *
 * @param  {Object}   [options] - List options
 * @param  {Object[]} [options.fields=null]
 * @param  {Object}   [options.filters=null]
 * @param  {Object[]} [options.orders=null]
 * @param  {Object[]} [options.groups=null]
 * @param  {Object}   [options.paging=null]
 * @param  {Number}   [options.limit=null]
 * @param  {String}   [options.baseSQL=null]
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._list = Model.prototype.list = function(options, callback) {
  var self = this;

  options         = options         || {};
  options.filters = options.filters || {};
  options.extra   = options.extra   || {};

  if (!self.tableName) {
    return callback && callback(new E('ESys', 'Cannot generate SQL for a Model without a table name'));
  }
  if (!self.viewName && options.useView === true) {
    return callback && callback(new E('ESys', 'Cannot generate SQL for a Model without a view name'));
  }

  if (!self.ignoreUserLimit && self.userIdLimitField_select) {
    options.filters[self.userIdLimitField_select] = {
      eq: self.userId,
    };
  }

  if (toolkit.isNothing(options.orders)
      && toolkit.isNothing(options.groups)
      && toolkit.isNothing(options.extra.fulltextSearchWord)) {
    options.orders = self.defaultOrders;
  }

  // Prepare SQL

  // SELECT
  var sql = options.baseSQL;
  if (!sql) {
    sql = self.db.createSQLBuilder();

    var _table = options.useView ? self.viewName : self.tableName;
    sql
      .SELECT(sql.RAW('*'))
      .FROM(_table, self.alias);

  } else {
    if (options.useView) {
      sql.FROM(self.viewName, self.alias);
    }
  }

  // DISTINCT
  if (options.distinct) {
    sql.DISTINCT();
  }

  // Fields
  options.fields = toolkit.asArray(options.fields);
  if (options.fields && toolkit.notNothing(options.fields)) {
    sql.SELECT(options.fields, null, true);
  }

  // WHERE
  if (options.filters && toolkit.notNothing(options.filters)) {
    for (var LEFT in options.filters) {
      switch(LEFT) {
        // Fuzzy search
        case '_fuzzySearch':
          var fuzzySearchOpt = options.filters[LEFT];
          sql.WHERE({
            LEFT : fuzzySearchOpt.keys,
            OP   : 'fuzzysearch',
            RIGHT: fuzzySearchOpt.value,
          });
          break;

        // Normal search
        default:
          for (var OP in options.filters[LEFT]) {
            var RIGHT = options.filters[LEFT][OP];
            sql.WHERE({ LEFT, OP, RIGHT });
          }
          break;
      }
    }
  }

  // GROUP BY
  if (options.groups && toolkit.notNothing(options.groups)) {
    sql.GROUP_BY(options.groups);
  }

  // ORDER BY
  if (options.orders && toolkit.notNothing(options.orders)) {
    options.orders.forEach(function(order) {
      sql.ORDER_BY(order.field, order.method);
    });
  }

  // Paging part
  if (options.paging && toolkit.notNothing(options.paging)) {
    sql.PAGING(options.paging);
  }

  var pageInfo = null;
  var dbData   = null;
  async.series([
    // Access DB
    function(asyncCallback) {
      self.db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        pageInfo = self.db.getPageInfo(options.paging, dbRes);
        dbData   = self.db.getData(options.paging, dbRes);

        // Convert complex data
        dbData = self.convertObject(dbData);

        return asyncCallback()
      });
    },
  ], function(err) {
    return callback && callback(err, dbData, pageInfo);
  });
};

/**
 * Count records from DB
 * @param  {Object}   options  - See `Model.prototype.list`.
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._count = Model.prototype.count = function(options, callback) {
  var self = this;

  var defaultSQL = self.db.createSQLBuilder();
  defaultSQL
    .SELECT('*')
    .FROM(self.tableName, self.alias);

  options = options || {};
  options.baseSQL = options.baseSQL || defaultSQL;
  options.baseSQL.SELECT_COUNT();

  options.orders = false;

  self._list(options, function(err, dbRes) {
    if (err) return callback && callback(err);
    return callback && callback(null, dbRes[0].count);
  });
};

/**
 * Get record from DB by Field and Value.
 *
 * @param  {String}        field
 * @param  {String|Number} value
 * @param  {String[]}      fields
 * @param  {Function}      callback
 * @return {undefined}
 */
Model.prototype._getByField = Model.prototype.getByField = function(targetField, targetValue, fields, callback) {
  var self = this;

  var opt = {
    limit  : 1,
    fields : fields,
    filters: {},
    orders : false,
  };
  opt.filters[targetField] = {eq: targetValue};

  self._list(opt, function(err, dbRes) {
    if (err) return callback && callback(err);

    return callback && callback(err, dbRes[0] || null);
  });
};

/**
 * Get record from DB by ID.
 *
 * @param  {String}    id
 * @param  {String[]}  fields
 * @param  {Function}  callback
 * @return {undefined}
 */
Model.prototype._get = Model.prototype.get = function(id, options, callback) {
  var self = this;

  var fields = options;
  if (!Array.isArray(options) && 'object' === typeof options && options) {
    fields = options.fields;
  }

  return self._getByField('id', id, fields, callback);
};

/**
 * Get record from DB by ID.
 * If nothing found, return an Error with `EClientNotFound`.
 *
 * @param  {String}    id
 * @param  {String[]}  fields
 * @param  {Function}  callback
 * @return {undefined}
 */
Model.prototype.__getWithCheck = function(method, id, options, callback) {
  var self = this;

  self[method](id, options, function(err, dbRes) {
    if (err) return callback(err);

    if (!dbRes) {
      return callback(new E('EClientNotFound', 'No such data', {
        entity: self.displayName,
        id    : id,
      }));
    }

    return callback(null, dbRes);
  });
};
Model.prototype._getWithCheck = function(id, options, callback) {return this.__getWithCheck('_get', id, options, callback); };
Model.prototype.getWithCheck  = function(id, options, callback) {return this.__getWithCheck('get',  id, options, callback); };

/**
 * Add record into DB.
 *
 * @param  {Object}   data
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._add = Model.prototype.add = function(data, callback) {
  var self = this;

  if (!self.tableName) {
    return callback && callback(new E('ESys', 'Table name not specified'));
  }

  if (!data.id) {
    data.id = self.genDataId();
  }

  if (self.userIdField && self.userId) {
    if (!self.allowExplicitUserId || !data[self.userIdField]) {
      data[self.userIdField] = self.userId;
    }
  }

  var sql = self.db.createSQLBuilder();
  sql
    .INSERT_INTO(self.tableName)
    .VALUES(data);

  var transScope = createTransScope(self.db);
  async.series([
    // Start transaction
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Access DB
    function(asyncCallback) {
      self.db.query(sql, function(err) {
        if (err) {
          err = self.checkDuplicationError(err) || err;
          return asyncCallback(err);
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    err = self.checkDuplicationError(err) || err;

    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback && callback(scopeErr);

      return callback && callback(null, data.id, data);
    });
  });
};

/**
 * Modify record in DB by ID.
 *
 * @param  {String}   id
 * @param  {Object}   data
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._modify = Model.prototype.modify = function(id, data, callback) {
  var self = this;

  if (!self.tableName) {
    return callback && callback(new E('ESys', 'Table name not specified'));
  }

  if (toolkit.isNothing(data)) {
    return callback && callback();
  }


  var sql = self.db.createSQLBuilder();
  sql
    .UPDATE(self.tableName)
    .SET(data)
    .LIMIT(1)

  var _where = { id: id };
  if (!self.ignoreUserLimit && self.userIdLimitField_nonSelect) {
    _where[self.userIdLimitField_nonSelect] = self.userId;
  }

  sql.WHERE(_where);

  var transScope = createTransScope(self.db);
  async.series([
    // Start transaction
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Access DB
    function(asyncCallback) {
      self.db.query(sql, function(err) {
        if (err) {
          err = self.checkDuplicationError(err) || err;
          return asyncCallback(err);
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    err = self.checkDuplicationError(err) || err;

    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback && callback(scopeErr);

      return callback && callback(null, id, data);
    });
  });
};

/**
 * Delete record in DB by ID.
 *
 * @param  {String}   id
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._delete = Model.prototype.delete = function(id, callback) {
  var self = this;

  if (!self.tableName) {
    return callback && callback(new E('ESys', 'Table name not specified'));
  }

  var sql = self.db.createSQLBuilder();
  sql.DELETE_FROM(self.tableName)

  var _where = { id: id };
  if (!self.ignoreUserLimit && self.userIdLimitField_nonSelect) {
    _where[self.userIdLimitField_nonSelect] = self.userId;
  }

  sql.WHERE(_where);

  var transScope = createTransScope(self.db);
  async.series([
    // Start transaction
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Access DB
    function(asyncCallback) {
      self.db.query(sql, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback && callback(scopeErr);

      return callback && callback(null, id);
    });
  });
};

/**
 * Delete records in DB by ID list.
 *
 * @param  {Array}   ids
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._deleteMany = Model.prototype.deleteMany = function(idList, callback) {
  if (toolkit.isNothing(idList)) return callback();

  var self = this;

  if (!self.tableName) {
    return callback && callback(new E('ESys', 'Table name not specified'));
  }

  var sql = self.db.createSQLBuilder();
  sql
    .DELETE_FROM(self.tableName)
    .LIMIT(idList.length)

  var _where = { id: idList };
  if (!self.ignoreUserLimit && self.userIdLimitField_nonSelect) {
    _where[self.userIdLimitField_nonSelect] = self.userId;
  }

  sql.WHERE(_where);

  var transScope = createTransScope(self.db);
  async.series([
    // Start transaction
    function(asyncCallback) {
      transScope.start(asyncCallback);
    },
    // Access DB
    function(asyncCallback) {
      self.db.query(sql, asyncCallback);
    },
  ], function(err) {
    transScope.end(err, function(scopeErr) {
      if (scopeErr) return callback && callback(scopeErr);

      return callback && callback(null, idList);
    });
  });
};

/**
 * Detect value exists on field.
 *
 * @param  {String}   field
 * @param  {*|*[]}    values
 * @param  {Function} callback
 * @return {undefined}
 */
Model.prototype._exists = Model.prototype.exists = function(field, values, callback) {
  if (toolkit.isNothing(values)) return callback();

  var valueMap = {};

  var values = toolkit.asArray(values);
  values.forEach(function(v) {
    valueMap[v] = true;
  });


  var opt = {
    fields : [ field ],
    filters: {},
  };

  if (values.length <= 1) {
    opt.filters[field] = { eq: values };
  } else {
    opt.filters[field] = { in: values };
  }

  this._list(opt, function(err, dbRes) {
    if (err) return callback(err);

    dbRes.forEach(function(d) {
      var v = d[field];

      if (valueMap[v]) {
        valueMap[v] = false;
      }
    });

    var existedValues    = [];
    var notExistedValues = [];
    for (var v in valueMap) if (valueMap.hasOwnProperty(v)) {
      if (valueMap[v]) {
        notExistedValues.push(v);
      } else {
        existedValues.push(v);
      }
    }

    return callback(null, existedValues, notExistedValues);
  });
};

/**
 * Convert response fields to object
 * @param  {Array[JSON]} dbRes
 * @return {undefined}
 */
Model.prototype.convertObject = function(dbRes) {
  if (!this.objectFields) {
    return dbRes;
  } else {
    return toolkit.convertObject(dbRes, this.objectFields);
  }
};

/**
 * @constructor
 * @param {Object} modelOptions - CRUD Handler options
 * @param {String} modelOptions.tableName
 * @param {String} [modelOptions.alias=null]
 * @param {String} [modelOptions.userIdField=null]
 */
var CRUDHandler = function(modelProto) {
  this.modelProto = modelProto;
};

/**
 * Create a `/data/do/list` handler
 *
 * @param  {Object=null}   options
 * @param  {String[]}      options.fields
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createListHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var model = new self.modelProto(res.locals);

    var opt = res.locals.getQueryOptions();

    if (options.fields) {
      opt.fields = options.fields;
    }

    model.list(opt, function(err, dbRes, pageInfo, extraDBRes) {
      if (err) return next(err);

      var ret = toolkit.initRet(dbRes, pageInfo, extraDBRes);
      var hookExtra = {
        query    : req.query,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendData(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

/**
 * Create a `/data/:id/do/get` handler
 *
 * @param  {Object=null}   options
 * @param  {String[]}      options.fields
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createGetHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var model = new self.modelProto(res.locals);
    var id = req.params.id;

    var opt = res.locals.getQueryOptions();
    if (options.fields) {
      opt.fields = options.fields;
    }

    model.getWithCheck(id, opt, function(err, dbRes) {
      if (err) return next(err);

      var ret = toolkit.initRet(dbRes);
      var hookExtra = {
        query    : req.query,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendJSON(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

/**
 * Create a `data/do/add` handler
 *
 * @param  {Object=null}   options
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createAddHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var model = new self.modelProto(res.locals);
    var data = req.body.data || {};

    model.add(data, function(err, _addedId, _addedData) {
      if (err) return next(err);

      var ret = toolkit.initRet({
        id: _addedId,
      });
      var hookExtra = {
        newData  : _addedData,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendJSON(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

/**
 * Create a `/data/:id/do/modify` handler
 *
 * @param  {Object=null}   options
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createModifyHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var ret = null;

    var model = new self.modelProto(res.locals);
    var data = req.body.data || {};
    var id   = req.params.id;

    var oldData = null;
    var newData = null;

    async.series([
      // Check
      function(asyncCallback) {
        model._getWithCheck(id, null, function(err, dbRes) {
          if (err) return asyncCallback(err);

          oldData = dbRes;

          return asyncCallback();
        });
      },
      function(asyncCallback) {
        model.modify(id, data, function(err, _modifiedId, _modifiedData) {
          if (err) return asyncCallback(err);

          newData = _modifiedData;
          ret = toolkit.initRet({
            id: _modifiedId,
          });

          return asyncCallback();
        });
      }
    ], function(err, dbRes) {
      if (err) return next(err);

      var hookExtra = {
        oldData  : oldData,
        newData  : newData,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendJSON(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

/**
 * Create a `/data/:id/do/delete` handler
 *
 * @param  {Object=null}   options
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createDeleteHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var ret = null;

    var model = new self.modelProto(res.locals);
    var id = req.params.id;

    var oldData = null;

    async.series([
      // Check
      function(asyncCallback) {
        model._getWithCheck(id, null, function(err, dbRes) {
          if (err) return asyncCallback(err);

          oldData = dbRes;

          return asyncCallback();
        });
      },
      function(asyncCallback) {
        model.delete(id, function(err, _deletedId) {
          if (err) return asyncCallback(err);

          ret = toolkit.initRet({
            id: _deletedId,
          });

          return asyncCallback();
        });
      }
    ], function(err, dbRes) {
      if (err) return next(err);

      var hookExtra = {
        oldData  : oldData,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendJSON(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

/**
 * Create a `/data/do/delete-many` handler
 *
 * @param  {Object=null}   options
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createDeleteManyHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var ret = null;

    var model = new self.modelProto(res.locals);

    var deleteIds = [];
    var oldData = null;

    async.series([
      function(asyncCallback) {
        var opt = res.locals.getQueryOptions();

        if (toolkit.isNothing(opt.filters)) {
          return asyncCallback(new E('EBizCondition.DeleteConditionNotSpecified', 'At least one condition should been specified'));
        }

        opt.fields = [ `${model.alias}.id` ];
        opt.paging = false;

        model.list(opt, function(err, dbRes) {
          if (err) return asyncCallback(err);

          deleteIds = toolkit.arrayElementValues(dbRes, 'id');

          return asyncCallback();
        });
      },
      function(asyncCallback) {
        if (toolkit.isNothing(deleteIds)) return asyncCallback();

        model.deleteMany(deleteIds, function(err, _deletedIds) {
          if (err) return asyncCallback(err);

          ret = toolkit.initRet({
            id: _deletedIds,
          });

          return asyncCallback();
        });
      }
    ], function(err, dbRes) {
      if (err) return next(err);

      var hookExtra = {
        oldData  : oldData,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendJSON(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

/**
 * Create a `/data/:id/do/delete` handler (soft)
 *
 * @param  {Object=null}   options
 * @param  {Function=null} options.beforeResp
 * @param  {Function=null} options.afterResp
 * @return {Function}
 */
CRUDHandler.prototype.createSoftDeleteHandler = function(options) {
  options = options || {};

  var self = this;
  return function(req, res, next) {
    var ret = null;

    var model = new self.modelProto(res.locals);
    var data = {isDeleted: true};
    var id   = req.params.id;

    var oldData = null;
    var newData = null;

    async.series([
      // Check
      function(asyncCallback) {
        model._getWithCheck(id, null, function(err, dbRes) {
          if (err) return asyncCallback(err);

          oldData = dbRes;

          return asyncCallback();
        });
      },
      function(asyncCallback) {
        model.modify(id, data, function(err, _softDeletedId, _softDeletedData) {
          if (err) return asyncCallback(err);

          newData = _softDeletedData;
          ret = toolkit.initRet({
            id: _softDeletedId,
          });

          return asyncCallback();
        });
      }
    ], function(err, dbRes) {
      if (err) return next(err);

      var hookExtra = {
        oldData  : oldData,
        newData  : newData,
        mainModel: model,
      };

      async.series([
        function(asyncCallback) {
          if ('function' !== typeof options.beforeResp) return asyncCallback();

          options.beforeResp(req, res, ret, hookExtra, function(err, nextRet) {
            if (err) return asyncCallback(err);

            ret = nextRet;

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        res.locals.sendJSON(ret);

        if ('function' === typeof options.afterResp) {
          options.afterResp(req, res, toolkit.jsonCopy(ret), hookExtra);
        }
      });
    });
  };
};

exports.Model       = Model;
exports.CRUDHandler = CRUDHandler;

exports.createCRUDHandler = function(modelProto) {
  return new CRUDHandler(modelProto);
};

exports.createSubModel = function(options) {
  var SubModel = function(locals) {
    Model.call(this, locals, options);
  };

  toolkit.extend(SubModel, Model);

  return SubModel;
};
