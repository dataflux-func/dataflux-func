'use strict';

/* 3rd-party Modules */
var mysql  = require('mysql2');
var moment = require('moment-timezone');

/* Project Modules */
var CONFIG       = require('../yamlResources').get('CONFIG');
var toolkit      = require('../toolkit');
var logHelper    = require('../logHelper');
var MySQLBuilder = require('./sqlBuilder').MySQLBuilder;

function getConfig(c) {
  return {
    host           : c.host,
    port           : c.port,
    user           : c.user,
    password       : c.password,
    database       : c.database,
    charset        : c.charset,
    timezone       : c.timezone,
    connectionLimit: CONFIG._DB_POOL_SIZE_SERVER,
    connectTimeout : CONFIG._DB_CONN_TIMEOUT * 1000,

    multipleStatements: true,
    enableKeepAlive   : true,
  };
};

/* Singleton Client */
var CLIENT_CONFIG = null;
var CLIENT        = null;

/**
 * @constructor
 * @param  {Object}  [logger=null]
 * @param  {Object}  [config=null]
 * @param  {Boolean} [debug=false]
 * @return {Object} - MySQL Helper
 */
var MySQLHelper = function(logger, config, debug) {
  this.logger = logger || logHelper.createHelper();

  this.isDryRun = false;
  this.skipLog  = false;

  this.uniqueKeyErrorKeyword = 'ER_DUP_ENTRY';
  this.uniqueKeyErrorRegExp  = /for key \'(.+)\'/;

  if (config) {
    this.config = toolkit.noNullOrWhiteSpace(config);
    this.client = mysql.createPool(getConfig(this.config));

  } else {
    if (!CLIENT) {
      CLIENT_CONFIG = toolkit.noNullOrWhiteSpace({
        host    : CONFIG.MYSQL_HOST,
        port    : CONFIG.MYSQL_PORT,
        user    : CONFIG.MYSQL_USER,
        password: CONFIG.MYSQL_PASSWORD,
        database: CONFIG.MYSQL_DATABASE,
        charset : CONFIG._MYSQL_CHARSET,
      });
      CLIENT = mysql.createPool(getConfig(CLIENT_CONFIG));
    }

    this.config = CLIENT_CONFIG;
    this.client = CLIENT;
  }

  this.transConn = null;
  this.transConnRing = 0;
};

/**
 * Close the DB connection
 */
MySQLHelper.prototype.close = function() {
  // Do not close the default DB connection/pool
  if (CLIENT === this.client) return;

  this.client.end();
};

MySQLHelper.prototype.getTimezone = function() {
  return this.config.timezone || CONFIG['TIMEZONE'];
};

MySQLHelper.prototype.version = function(callback) {
  var self = this;

  var version = null;
  var branch  = null;

  // Get version
  var sql = self.createSQLBuilder(`SELECT VERSION() AS version`);
  self.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var versionStr = dbRes[0].version;
    var m = versionStr.match(/\d+\.\d+\.\d+/)
    if (m) {
      version = m[0];
    } else {
      version = versionStr;
    }

    // Get branch
    var sql = self.createSQLBuilder(`SHOW VARIABLES LIKE 'version_comment'`);
    self.query(sql, function(err, dbRes) {
      if (err) return callback(err);

      var versionComment = dbRes[0].Value.toLowerCase();
      if (versionComment.indexOf('mysql') >= 0) {
        branch = 'MySQL';
      } else if (versionComment.indexOf('maria') >= 0) {
        branch = 'MariaDB';
      } else {
        branch = 'Other MySQL-like DB';
      }

      return callback(null, version, branch);
    });
  });
};

MySQLHelper.prototype.settings = function(callback) {
  var sql = this.createSQLBuilder(`SHOW VARIABLES`);
  this.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var settings = {};
    dbRes.forEach(function(d) {
      var k = d['Variable_name'];
      var v = d['Value'];
      settings[k] = v;
    });

    return callback(null, settings);
  });
};

MySQLHelper.prototype.tables = function(callback) {
  var sql = this.createSQLBuilder(`SHOW TABLES`);
  this.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var tables = dbRes.reduce(function(acc, x) {
      acc.push(Object.values(x)[0]);
      return acc;
    }, []);

    return callback(null, tables);
  });
};

MySQLHelper.prototype.columns = function(table, callback) {
  var sql = this.createSQLBuilder(`SHOW COLUMNS FROM ??`);
  this.query(sql, [ table ], function(err, dbRes) {
    if (err) return callback(err);

    var columns = dbRes.reduce(function(acc, x) {
      acc.push(x.Field);
      return acc;
    }, []);

    return callback(null, columns);
  });
};

MySQLHelper.prototype.tableStatus = function(callback) {
  var sql = this.createSQLBuilder(`SHOW TABLE STATUS`);
  this.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var tableStatus = dbRes.reduce(function(acc, x) {
      var totalSize  = (x.Data_length || 0) + (x.Index_length || 0);
      var avgRowSize = x.Rows ? parseInt(totalSize / x.Rows) : 0;

      var t = {
        name: x.Name,
        rows: x.Rows || 0,

        dataSize  : x.Data_length  || 0,
        indexSize : x.Index_length || 0,
        totalSize : totalSize,
        avgRowSize: avgRowSize,
      }

      acc[x.Name] = t;
      return acc;
    }, {});

    return callback(null, tableStatus);
  });
};

/**
 * Run SQL statement.
 *
 * @param  {String}   sql       - SQL statement
 * @param  {*[]}      sqlParams - SQL parameters
 * @param  {Function} callback
 * @return {undefined}
 */
MySQLHelper.prototype.query = function(sql, sqlParams, callback) {
  var self = this;

  if ('function' === typeof sqlParams) {
    callback  = sqlParams;
    sqlParams = undefined;
  }

  callback = toolkit.ensureFn(callback);

  sql = this._prepareSQL(sql, sqlParams);
  var debugSQL = toolkit.toDebugText(sql);

  // Query callback
  function queryCallback(err, dbRes) {
    if (err) {
      if (!self.transConn) {
        self.logger.error('[MYSQL] Query: {0}', debugSQL);
      } else {
        self.logger.error('[MYSQL] Trans Query: {0}', debugSQL);
      }
      self.logger.error(`[MYSQL ERROR] ${err}`);

      return callback(err);
    }

    if (toolkit.startsWith(sql.toUpperCase(), 'SELECT') && Array.isArray(dbRes)) {
      if (Array.isArray(dbRes[0])) {
        // Only convert value type in first dataset when got multiple dataset
        self._convertTypes(dbRes[0]);
      } else {
        // Convert value type
        self._convertTypes(dbRes);
      }
    }

    return callback(null, dbRes);
  }

  if (!self.transConn) {
    if (!self.skipLog) {
      self.logger.debug('[MYSQL] Query: {0}', debugSQL);
    }

    // Single Query
    if (!self.isDryRun || sql.trim().indexOf('SELECT') === 0) {
      return self.client.query(sql, queryCallback);
    } else {
      return queryCallback();
    }

  } else {
    // Transaction Query
    if (!self.skipLog) {
      self.logger.debug('[MYSQL] Trans Query: {0}', debugSQL);
    }

    return self.transConn.query(sql, queryCallback);
  }
};

/**
 * Get a connection from connection pool and start a transaction.
 *
 * @param  {Function} callback
 * @return {undefined}
 */
MySQLHelper.prototype.startTrans = function(callback) {
  var self = this;
  callback = toolkit.ensureFn(callback);

  if (self.transConn) {
    self.transConnRing++;

    if (!self.skipLog) {
      self.logger.debug('[MYSQL] Enter ring {0} -> {1} (by START)',
        self.transConnRing - 1,
        self.transConnRing
      );
    }

    return callback();
  }

  self.client.getConnection(function(err, conn) {
    if (err) return callback(err);

    conn.beginTransaction(function(err) {
      if (err) {
        conn.release()

        return callback(err);

      } else {
        self.transConn = conn;
        self.transConnRing++;

        if (!self.skipLog) {
          self.logger.debug('[MYSQL] Trans START');
        }

        return callback();
      }
    });
  });
};

/**
 * Commit the transaction.
 *
 * @param  {Function} callback
 * @return {undefined}
 */
MySQLHelper.prototype.commit = function(callback) {
  var self = this;
  callback = toolkit.ensureFn(callback);

  if (self.isDryRun) return self.rollback(callback);

  if (!self.transConn) {
    if (!self.skipLog) {
      self.logger.warning('[MYSQL] Trans COMMIT (Transaction not started, skip)');
    }
    return callback();

  } else {
    self.transConnRing--;

    if (self.transConnRing <= 0) {
      self.transConn.commit(function(err) {
        self.transConn.release();
        self.transConn = null;

        if (!self.skipLog) {
          self.logger.debug('[MYSQL] Trans COMMIT');
        }

        return callback(err);
      });

    } else {
      if (!self.skipLog) {
        self.logger.debug('[MYSQL] Leave ring {0} <- {1} (by COMMIT)',
          self.transConnRing,
          self.transConnRing + 1
        );
      }

      return callback();
    }
  }
};

/**
 * Rollback the transaction.
 *
 * @param  {Function} callback
 * @return {undefined}
 */
MySQLHelper.prototype.rollback = function(callback) {
  var self = this;
  callback = toolkit.ensureFn(callback);

  if (!self.transConn) {
    if (!self.skipLog) {
      self.logger.warning('[MYSQL] Trans ROLLBACK (Transaction not started, skip)');
    }
    return callback();

  } else {
    self.transConnRing--;

    if (self.transConnRing <= 0) {
      self.transConn.rollback(function() {
        self.transConn.release();
        self.transConn = null;

        if (!self.skipLog) {
          self.logger.debug('[MYSQL] Trans ROLLBACK');
        }

        return callback();
      });

    } else {
      if (!self.skipLog) {
        self.logger.debug('[MYSQL] Leave ring {0} <- {1} (by ROLLBACK)',
          self.transConnRing,
          self.transConnRing + 1
        );
      }

      return callback();
    }
  }
};

MySQLHelper.prototype._convertTypes = function(dbRes) {
  var timezone = this.getTimezone();

  dbRes.forEach(function(d) {
    for (var k in d) {
      var v = d[k];

      // JSON field to obj
      if (toolkit.endsWith(k, 'JSON') && 'string' === typeof v) {
        try {
          d[k] = JSON.parse(v);
        } catch(e) {
          // Nope
        }
      }

      // DateTime field to Moment obj
      if (timezone && toolkit.endsWith(k, 'Time') && 'number' === typeof v) {
        try {
          d[k] = moment(v * 1000).tz(timezone);
        } catch(e) {
          // Nope
        }
      }
    }
  });
};

MySQLHelper.prototype._prepareSQL = function(sql, sqlParams) {
  var self = this;

  var sqls = toolkit.asArray(sql);
  var preparedSQL = sqls.map(function(_sql) {
    if (self.client === CLIENT) {
      // Special for system DB

      // Force to use SQLBuilder
      if (!(_sql instanceof MySQLBuilder)) {
        var e = new Error(`SQL is not a instance of MySQLBuilder: ${_sql}`);
        throw e;
      }

      // Check SQL safty
      _sql.checkSafty();

      // Add updateTime / createTime automatically
      var nowTimestamp = toolkit.getTimestamp();
      if (_sql.meta.type === 'INSERT') {
        _sql.UPDATE_VALUES({
          'createTime': nowTimestamp,
          'updateTime': nowTimestamp,
        }, true);

      } else if (_sql.meta.type === 'UPDATE') {
        _sql.SET({
          'updateTime': nowTimestamp,
        });
      }
    }

    // Convert to string with semicolons
    _sql = _sql.toString().trim();
    if (!toolkit.endsWith(_sql, ';')) {
      _sql += ';';
    }

    return _sql;
  }).join(' ');

  if (sqlParams) {
    preparedSQL = sqls[0].formatSQL(preparedSQL, sqlParams);
  }

  return preparedSQL;
};

/**
 * Get page infomation from DB result by paging setting.
 *
 * @param  {Object}   options - Paging options
 * @param  {Object[]} dbRes
 * @return {Object}
 */
MySQLHelper.prototype.getPageInfo = function(options, dbRes) {
  if (!options) return null;

  var pageInfo = {
    pagingStyle: options.pagingStyle,
    pageSize   : options.pageSize,
  }

  if (options.pagingStyle === true || options.pagingStyle === 'normal') {
    pageInfo.count       = dbRes[0].length;
    pageInfo.totalCount  = dbRes[1][0].totalCount;
    pageInfo.pageNumber  = options.pageNumber || 1;
    pageInfo.pageCount   = Math.ceil(pageInfo.totalCount / pageInfo.pageSize);
    pageInfo.isFirstPage = pageInfo.pageNumber <= 1;

  } else if (options.pagingStyle === 'simple') {
    pageInfo.count       = dbRes.length;
    pageInfo.pageNumber  = options.pageNumber || 1;
    pageInfo.isFirstPage = pageInfo.pageNumber <= 1;

  } else if (options.pagingStyle === 'marker') {
    pageInfo.count           = dbRes.length;
    pageInfo.pageMarkerField = null;
    pageInfo.pageMarker      = null;
    pageInfo.isFirstPage     = null;

    if (dbRes.length > 0 && options.pageMarkerField) {
      pageInfo.pageMarkerField = options.pageMarkerField.split('.').pop();
      pageInfo.pageMarker      = dbRes[dbRes.length - 1][pageInfo.pageMarkerField];
    }

    pageInfo.isFirstPage = options.pageMarker <= 0;
  }

  return pageInfo;
};

/**
 * Get data from DB result when paging is setted.
 *
 * @param  {Object}   options - Paging options
 * @param  {Object[]} dbRes
 * @return {Object}
 */
MySQLHelper.prototype.getData = function(options, dbRes) {
  if (!options) return dbRes;

  if (options.pagingStyle === true || options.pagingStyle === 'normal') {
    return dbRes[0];
  } else {
    return dbRes;
  }
};

MySQLHelper.prototype.createSQLBuilder = function(rawSQL) {
  return new MySQLBuilder(rawSQL).setTimezone(this.getTimezone());
};

exports.MySQLHelper = MySQLHelper;

exports.createHelper = function(logger, config, debug) {
  return new MySQLHelper(logger, config, debug);
};
