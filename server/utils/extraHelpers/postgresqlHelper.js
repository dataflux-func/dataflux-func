'use strict';

/* 3rd-party Modules */
var pg     = require('pg');
var moment = require('moment-timezone');

/* Project Modules */
var CONFIG            = require('../yamlResources').get('CONFIG');
var toolkit           = require('../toolkit');
var logHelper         = require('../logHelper');
var PostgreSQLBuilder = require('./sqlBuilder').PostgreSQLBuilder;

// Use parseInt to parse INT8
var pgTypes = pg.types;
pgTypes.setTypeParser(pgTypes.builtins.INT8, function(v) {
  return parseInt(v, 10);
});

function getConfig(c) {
  return {
    host                   : c.host,
    port                   : c.port,
    user                   : c.user,
    password               : c.password,
    database               : c.database,
    max                    : CONFIG._DB_POOL_SIZE_SERVER,
    connectionTimeoutMillis: CONFIG._DB_CONN_TIMEOUT * 1000,
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
var PostgreSQLHelper = function(logger, config, debug) {
  this.logger = logger || logHelper.createHelper();

  this.isDryRun = false;
  this.skipLog  = false;

  // TODO PK conflict notice
  this.uniqueKeyErrorKeyword = 'duplicate key value';
  this.uniqueKeyErrorRegExp  = /Key \'(.+)\'/;

  if (config) {
    this.config = toolkit.noNullOrWhiteSpace(config);
    this.client = new pg.Pool(getConfig(this.config));

  } else {
    if (!CLIENT) {
      CLIENT_CONFIG = toolkit.noNullOrWhiteSpace({
        host    : CONFIG.POSTGRESQL_HOST,
        port    : CONFIG.POSTGRESQL_PORT,
        user    : CONFIG.POSTGRESQL_USER,
        password: CONFIG.POSTGRESQL_PASSWORD,
        database: CONFIG.POSTGRESQL_DATABASE,
      });
      CLIENT = new pg.Pool(getConfig(CLIENT_CONFIG));
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
PostgreSQLHelper.prototype.close = function() {
  // Do not close the default DB connection/pool
  if (CLIENT === this.client) return;

  this.client.end();
};

PostgreSQLHelper.prototype.getTimezone = function() {
  return this.config.timezone || CONFIG['TIMEZONE'];
};

PostgreSQLHelper.prototype.version = function(callback) {
  var self = this;

  var version = null;
  var branch  = null;

  // Get version
  var sql = self.createSQLBuilder(`SHOW server_version`);
  self.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var versionStr = dbRes[0].server_version;
    var m = versionStr.match(/\d+\.\d+/)
    if (m) {
      version = m[0];
    } else {
      version = versionStr;
    }

    // TODO Get branch
    branch = 'PostgreSQL';

    return callback(null, version, branch);
  });
};

PostgreSQLHelper.prototype.settings = function(callback) {
  var sql = this.createSQLBuilder(`SHOW ALL`);
  this.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var settings = {};
    dbRes.forEach(function(d) {
      var k = d['name'];
      var v = d['setting'];
      settings[k] = v;
    });

    return callback(null, settings);
  });
};

PostgreSQLHelper.prototype.tables = function(callback) {
  var sql = this.createSQLBuilder(`
    SELECT
      relname AS name
    FROM
      pg_stat_user_tables
    ORDER BY
      relname ASC`);
  this.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var tables = dbRes.reduce(function(acc, x) {
      acc.push(x.name);
      return acc;
    }, []);

    return callback(null, tables);
  });
};

PostgreSQLHelper.prototype.columns = function(table, callback) {
  var sql = this.createSQLBuilder(`
    SELECT
      column_name AS name
    FROM
      information_schema.columns
    WHERE
      table_schema   = 'public'
      AND table_name = ?`);
  this.query(sql, [ table ], function(err, dbRes) {
    if (err) return callback(err);

    var columns = dbRes.reduce(function(acc, x) {
      acc.push(x.name);
      return acc;
    }, []);

    return callback(null, columns);
  });
};

PostgreSQLHelper.prototype.tableStatus = function(callback) {
  var sql = this.createSQLBuilder(`
    SELECT
      relname    AS name,
      n_live_tup AS rows,

      pg_table_size(relid)   AS data_length,
      pg_indexes_size(relid) AS index_length
    FROM
      pg_stat_user_tables
    ORDER BY
      relname ASC
  `);
  this.query(sql, function(err, dbRes) {
    if (err) return callback(err);

    var tableStatus = dbRes.reduce(function(acc, x) {
      var totalSize  = (x.data_length || 0) + (x.index_length || 0);
      var avgRowSize = x.rows ? parseInt(totalSize / x.rows) : 0;

      var t = {
        name: x.name,
        rows: x.rows || 0,

        dataSize  : x.data_length  || 0,
        indexSize : x.index_length || 0,
        totalSize : totalSize,
        avgRowSize: avgRowSize,
      }

      acc[x.name] = t;
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
PostgreSQLHelper.prototype.query = function(sql, sqlParams, callback) {
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
        self.logger.error('[POSTGRESQL] Query: {0}', debugSQL);
      } else {
        self.logger.error('[POSTGRESQL] Trans Query: {0}', debugSQL);
      }
      self.logger.error(`[POSTGRESQL ERROR] ${err}`);

      return callback(err);
    }

    if (toolkit.startsWith(sql.toUpperCase(), 'SELECT')) {
      // Do type conversion for SELECT query
      if (Array.isArray(dbRes)) {
        // Only convert value type in first dataset when got multiple dataset
        dbRes = dbRes.map(function(d) {
          return d.rows;
        });

        self._convertTypes(dbRes[0]);
      } else {
        // Convert value type
        dbRes = dbRes.rows;

        self._convertTypes(dbRes);
      }
    } else {
      // Retrun row counts for other query
      dbRes = dbRes.rows;
    }

    return callback(null, dbRes);
  }

  if (!self.transConn) {
    if (!self.skipLog) {
      self.logger.debug('[POSTGRESQL] Query: {0}', debugSQL);
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
      self.logger.debug('[POSTGRESQL] Trans Query: {0}', debugSQL);
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
PostgreSQLHelper.prototype.startTrans = function(callback) {
  var self = this;
  callback = toolkit.ensureFn(callback);

  if (self.transConn) {
    self.transConnRing++;

    if (!self.skipLog) {
      self.logger.debug('[POSTGRESQL] Enter ring {0} -> {1} (by START)',
        self.transConnRing - 1,
        self.transConnRing
      );
    }

    return callback();
  }

  self.client.connect(function(err, conn) {
    if (err) return callback(err);

    conn.query('BEGIN', function(err) {
      if (err) {
        conn.release()

        return callback(err);

      } else {
        self.transConn = conn;
        self.transConnRing++;

        if (!self.skipLog) {
          self.logger.debug('[POSTGRESQL] Trans START');
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
PostgreSQLHelper.prototype.commit = function(callback) {
  var self = this;
  callback = toolkit.ensureFn(callback);

  if (self.isDryRun) return self.rollback(callback);

  if (!self.transConn) {
    if (!self.skipLog) {
      self.logger.warning('[POSTGRESQL] Trans COMMIT (Transaction not started, skip)');
    }
    return callback();

  } else {
    self.transConnRing--;

    if (self.transConnRing <= 0) {
      self.transConn.query('COMMIT', function(err) {
        self.transConn.release();
        self.transConn = null;

        if (!self.skipLog) {
          self.logger.debug('[POSTGRESQL] Trans COMMIT');
        }

        return callback(err);
      });

    } else {
      if (!self.skipLog) {
        self.logger.debug('[POSTGRESQL] Leave ring {0} <- {1} (by COMMIT)',
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
PostgreSQLHelper.prototype.rollback = function(callback) {
  var self = this;
  callback = toolkit.ensureFn(callback);

  if (!self.transConn) {
    if (!self.skipLog) {
      self.logger.warning('[POSTGRESQL] Trans ROLLBACK (Transaction not started, skip)');
    }
    return callback();

  } else {
    self.transConnRing--;

    if (self.transConnRing <= 0) {
      self.transConn.query('ROLLBACK', function() {
        self.transConn.release();
        self.transConn = null;

        if (!self.skipLog) {
          self.logger.debug('[POSTGRESQL] Trans ROLLBACK');
        }

        return callback();
      });

    } else {
      if (!self.skipLog) {
        self.logger.debug('[POSTGRESQL] Leave ring {0} <- {1} (by ROLLBACK)',
          self.transConnRing,
          self.transConnRing + 1
        );
      }

      return callback();
    }
  }
};

PostgreSQLHelper.prototype._convertTypes = function(dbRes) {
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

PostgreSQLHelper.prototype._prepareSQL = function(sql, sqlParams) {
  var self = this;

  var sqls = toolkit.asArray(sql);
  var preparedSQL = sqls.map(function(_sql) {
    if (self.client === CLIENT) {
      // Special for system DB

      // Force to use SQLBuilder
      if (!(_sql instanceof PostgreSQLBuilder)) {
        var e = new Error(`SQL is not a instance of PostgreSQLBuilder: ${_sql}`);
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
PostgreSQLHelper.prototype.getPageInfo = function(options, dbRes) {
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
PostgreSQLHelper.prototype.getData = function(options, dbRes) {
  if (!options) return dbRes;

  if (options.pagingStyle === true || options.pagingStyle === 'normal') {
    return dbRes[0];
  } else {
    return dbRes;
  }
};

PostgreSQLHelper.prototype.createSQLBuilder = function(rawSQL) {
  return new PostgreSQLBuilder(rawSQL).setTimezone(this.getTimezone());
};

exports.PostgreSQLHelper = PostgreSQLHelper;

exports.createHelper = function(logger, config, debug) {
  return new PostgreSQLHelper(logger, config, debug);
};
