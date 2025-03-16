'use strict';

/* Built-in Modules */
var path = require('path');
var http = require('http');

/* 3rd-party Modules */
var fs         = require('fs-extra');
var express    = require('express');
var bodyParser = require('body-parser');
var async      = require('async');
var yaml       = require('js-yaml');

/* Project Modules */
var toolkit = require('./utils/toolkit');
var common  = require('./utils/common');

/* Load YAML resources */
var yamlResources = require('./utils/yamlResources');

var CONFIG       = null;
var USER_CONFIG  = null;
var UPGRADE_INFO = null;
var IMAGE_INFO   = require('../image-info.json');

var CHECKER_INTERVAL                 = 3 * 1000;
var ADMIN_USER_ID                    = 'u-admin';
var ADMIN_DEFUALT_USERNAME           = 'admin';
var ADMIN_DEFUALT_PASSWORD           = 'admin';
var AUTO_SETUP_DEFAULT_AK_ID         = 'ak-auto-setup';
var SYS_CONFIG_ID_UPGRADE_DB_SEQ     = 'UPGRADE_DB_SEQ';
var SYS_CONFIG_ID_UPGRADE_DB_SEQ_OLD = 'upgrade.db.upgradeSeq';
var MEMORY_1GB_BYTES                 = 1 * 1024 * 1024 * 1024;

var DB_VERSION_REQUIRES = {
  MySQL: {
    version     : '5.7.0',
    errorMessage: 'MySQL 5.7 or above is required',
  },
  MariaDB: {
    // version     : '10.4.21',
    version     : '10.4.0',
    errorMessage: 'MariaDB 10.4 or above is required',
  },
  PostgreSQL: {
    // version     : '12.19',
    version     : '12.0',
    errorMessage: 'PostgreSQL 12 or above is required',
  }
};
var DB_CONFIG_FIELDS = {
  'mysql': {
    host    : 'MYSQL_HOST',
    port    : 'MYSQL_PORT',
    user    : 'MYSQL_USER',
    password: 'MYSQL_PASSWORD',
    database: 'MYSQL_DATABASE',
  },
  'postgresql': {
    host    : 'POSTGRESQL_HOST',
    port    : 'POSTGRESQL_PORT',
    user    : 'POSTGRESQL_USER',
    password: 'POSTGRESQL_PASSWORD',
    database: 'POSTGRESQL_DATABASE',
  },
}

var TEMP_INSTALL_CONFIGS_TO_WRITE = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_REPEAT',

  'AUTO_SETUP',
  'AUTO_SETUP_ADMIN_USERNAME',
  'AUTO_SETUP_ADMIN_PASSWORD',
  'AUTO_SETUP_AK_ID',
  'AUTO_SETUP_AK_SECRET',

  'GUANCE_NODE',
  'GUANCE_OPENAPI_URL',
  'GUANCE_OPENWAY_URL',
  'GUANCE_WEBSOCKET_URL',
  'GUANCE_API_KEY_ID',
  'GUANCE_API_KEY',

  'TRUEWATCH_NODE',
  'TRUEWATCH_OPENAPI_URL',
  'TRUEWATCH_OPENWAY_URL',
  'TRUEWATCH_WEBSOCKET_URL',
  'TRUEWATCH_API_KEY_ID',
  'TRUEWATCH_API_KEY',
]

// Setup error
var SetupErrorWrap = function() {
  this.errors = {}
};
SetupErrorWrap.prototype.set = function(key, message, error) {
  if (!this.errors[key]) {
    this.errors[key] = [];
  }

  var line = {
    message: message.toString(),
  }

  if (error) {
    line.error = error.toString();
  }

  this.errors[key].push(line);
};
SetupErrorWrap.prototype.has = function(key) {
  return (key in this.errors);
};
SetupErrorWrap.prototype.hasError = function(key) {
  return Object.keys(this.errors).length > 0;
};
SetupErrorWrap.prototype.toJSON = function() {
  return this.errors;
};

function _getDBHelper(dbEngine) {
  var dbHelper = null;
  switch(dbEngine || CONFIG.DB_ENGINE) {
    case 'postgresql':
      dbHelper = require('./utils/extraHelpers/postgresqlHelper');
      break;

    case 'mysql':
    default:
      dbHelper = require('./utils/extraHelpers/mysqlHelper');
      break;
  }

  return dbHelper;
};

function _getCacheDBHelper() {
  var cacheDBHelper = require('./utils/extraHelpers/redisHelper');
  return cacheDBHelper;
};

function _doSetup(inputedUserConfig, callback) {
  var nowTimestamp    = toolkit.getTimestamp();
  var nowTimeStringCN = toolkit.getDateTimeStringCN(nowTimestamp);

  var inputedUserConfig = toolkit.jsonCopy(inputedUserConfig);

  var adminUsername            = null;
  var adminPassword            = null;
  var adminPasswordRepeat      = null;
  var guanceConnectorConfig    = null;
  var truewatchConnectorConfig = null;

  if (inputedUserConfig.ADMIN_USERNAME) {
    // Init manually
    adminUsername       = inputedUserConfig.ADMIN_USERNAME;
    adminPassword       = inputedUserConfig.ADMIN_PASSWORD;
    adminPasswordRepeat = inputedUserConfig.ADMIN_PASSWORD_REPEAT;

  } else if (inputedUserConfig.AUTO_SETUP_ADMIN_USERNAME || inputedUserConfig.AUTO_SETUP_ADMIN_PASSWORD) {
    // Init automatically with `--auto-setup-admin-username` or `--auto-setup-admin-password`
    adminUsername       = inputedUserConfig.AUTO_SETUP_ADMIN_USERNAME || ADMIN_DEFUALT_USERNAME;
    adminPassword       = inputedUserConfig.AUTO_SETUP_ADMIN_PASSWORD || ADMIN_DEFUALT_PASSWORD;
    adminPasswordRepeat = inputedUserConfig.AUTO_SETUP_ADMIN_PASSWORD || ADMIN_DEFUALT_PASSWORD;

  } else {
    // Init automatically without `--auto-setup-admin-username` or `--auto-setup-admin-password`
    adminUsername       = ADMIN_DEFUALT_USERNAME;
    adminPassword       = ADMIN_DEFUALT_PASSWORD;
    adminPasswordRepeat = ADMIN_DEFUALT_PASSWORD;
  }

  // Default DB engine
  inputedUserConfig.DB_ENGINE = inputedUserConfig.DB_ENGINE || 'mysql';

  // Wrap setup error
  var setupErrorWrap = new SetupErrorWrap();

  var db      = null;
  var cacheDB = null;

  var dbVersion = '0.0.0';
  var dbBranch  = '';

  async.series([
    // Check admin username/password
    function(asyncCallback) {
      if (!adminUsername || !adminPassword) {
        setupErrorWrap.set('adminUser', 'Administrator username or password is not inputed');
        return asyncCallback();
      }

      if (toolkit.notNothing(adminPasswordRepeat) && adminPassword !== adminPasswordRepeat) {
        setupErrorWrap.set('adminUser', 'Repeated administrator password not match');
        return asyncCallback();
      }

      return asyncCallback();
    },
    // Check Guance API Key
    function(asyncCallback) {
      if (!inputedUserConfig.GUANCE_NODE) return asyncCallback();

      if (!inputedUserConfig.GUANCE_API_KEY_ID) setupErrorWrap.set('guance', 'Guance API Key ID is not inputed');
      if (!inputedUserConfig.GUANCE_API_KEY)    setupErrorWrap.set('guance', 'Guance API Key is not inputed');

      if (setupErrorWrap.has('guance')) return asyncCallback();

      var guanceNode = common.getGuanceNodes().filter(function(node) {
        return node.key === inputedUserConfig.GUANCE_NODE;
      })[0];

      if (!guanceNode) {
        setupErrorWrap.set('guance', 'No such Guance Node');
        return asyncCallback();
      }

      if (guanceNode.key === 'private') {
        if (!inputedUserConfig.GUANCE_OPENAPI_URL) {
          setupErrorWrap.set('guance', 'Guance OpenAPI URL is not inputed');
        }
        if (!inputedUserConfig.GUANCE_OPENWAY_URL) {
          setupErrorWrap.set('guance', 'Guance OpenWay URL is not inputed');
        }
        if (!inputedUserConfig.GUANCE_WEBSOCKET_URL) {
          setupErrorWrap.set('guance', 'Guance WebSocket URL is not inputed');
        }
        if (setupErrorWrap.has('guance')) return asyncCallback();

        guanceNode.openapi   = inputedUserConfig.GUANCE_OPENAPI_URL;
        guanceNode.openway   = inputedUserConfig.GUANCE_OPENWAY_URL;
        guanceNode.websocket = inputedUserConfig.GUANCE_WEBSOCKET_URL;
      }

      async.series([
        // Validate API Key of Guance API Key
        function(innerCallback) {
          common.checkGuanceAPIKey(guanceNode, inputedUserConfig.GUANCE_API_KEY_ID, inputedUserConfig.GUANCE_API_KEY, function(err) {
            if (err) {
              setupErrorWrap.set('guance', 'Guance API Key ID / API Key is not valid');
              return innerCallback(true);
            }

            return innerCallback();
          });
        },
      ], function(err) {
        if (!err) {
          var salt = 'guance';
          var guanceAPIKeyCipher = toolkit.cipherByAES(inputedUserConfig.GUANCE_API_KEY, inputedUserConfig.SECRET, salt);
          guanceConnectorConfig = {
            guanceNode        : guanceNode.key,
            guanceOpenAPIURL  : guanceNode.openapi,
            guanceOpenWayURL  : guanceNode.openway,
            guanceWebSocketURL: guanceNode.websocket,
            guanceAPIKeyId    : inputedUserConfig.GUANCE_API_KEY_ID,
            guanceAPIKeyCipher: guanceAPIKeyCipher,
          };
        }

        return asyncCallback();
      });
    },
    // Check TrueWatch API Key
    function(asyncCallback) {
      if (!inputedUserConfig.TRUEWATCH_NODE) return asyncCallback();

      if (!inputedUserConfig.TRUEWATCH_API_KEY_ID) setupErrorWrap.set('truewatch', 'TrueWatch API Key ID is not inputed');
      if (!inputedUserConfig.TRUEWATCH_API_KEY)    setupErrorWrap.set('truewatch', 'TrueWatch API Key is not inputed');

      if (setupErrorWrap.has('truewatch')) return asyncCallback();

      var truewatchNode = common.getGuanceNodes().filter(function(node) {
        return node.key === inputedUserConfig.TRUEWATCH_NODE;
      })[0];

      if (!truewatchNode) {
        setupErrorWrap.set('truewatch', 'No such TrueWatch Node');
        return asyncCallback();
      }

      if (truewatchNode.key === 'private') {
        if (!inputedUserConfig.TRUEWATCH_OPENAPI_URL) {
          setupErrorWrap.set('truewatch', 'TrueWatch OpenAPI URL is not inputed');
        }
        if (!inputedUserConfig.TRUEWATCH_OPENWAY_URL) {
          setupErrorWrap.set('truewatch', 'TrueWatch OpenWay URL is not inputed');
        }
        if (!inputedUserConfig.TRUEWATCH_WEBSOCKET_URL) {
          setupErrorWrap.set('truewatch', 'TrueWatch WebSocket URL is not inputed');
        }
        if (setupErrorWrap.has('truewatch')) return asyncCallback();

        truewatchNode.openapi   = inputedUserConfig.TRUEWATCH_OPENAPI_URL;
        truewatchNode.openway   = inputedUserConfig.TRUEWATCH_OPENWAY_URL;
        truewatchNode.websocket = inputedUserConfig.TRUEWATCH_WEBSOCKET_URL;
      }

      async.series([
        // Validate API Key of TrueWatch API Key
        function(innerCallback) {
          common.checkGuanceAPIKey(truewatchNode, inputedUserConfig.TRUEWATCH_API_KEY_ID, inputedUserConfig.TRUEWATCH_API_KEY, function(err) {
            if (err) {
              setupErrorWrap.set('truewatch', 'TrueWatch API Key ID / API Key is not valid');
              return innerCallback(true);
            }

            return innerCallback();
          });
        },
      ], function(err) {
        if (!err) {
          var salt = 'truewatch';
          var guanceAPIKeyCipher = toolkit.cipherByAES(inputedUserConfig.TRUEWATCH_API_KEY, inputedUserConfig.SECRET, salt);
          truewatchConnectorConfig = {
            guanceNode        : truewatchNode.key,
            guanceOpenAPIURL  : truewatchNode.openapi,
            guanceOpenWayURL  : truewatchNode.openway,
            guanceWebSocketURL: truewatchNode.websocket,
            guanceAPIKeyId    : inputedUserConfig.TRUEWATCH_API_KEY_ID,
            guanceAPIKeyCipher: guanceAPIKeyCipher,
          };
        }

        return asyncCallback();
      });
    },
    // Check DB version
    function(asyncCallback) {
      try {
        async.retry({ times: 5, interval: CHECKER_INTERVAL }, function(retryCallback) {
          console.log('Try to check DB version...');

          var dbConfig = {};
          var dbConfigFields = DB_CONFIG_FIELDS[inputedUserConfig.DB_ENGINE];
          if (dbConfigFields) {
            for (var f in dbConfigFields) {
              var configField = dbConfigFields[f];
              dbConfig[f] = inputedUserConfig[configField];
            }

          } else {
            setupErrorWrap.set('db', 'Unsupported DB Engine');
          }

          if (toolkit.isNothing(dbConfig)) return asyncCallback();


          db = _getDBHelper(inputedUserConfig.DB_ENGINE).createHelper(null, dbConfig);
          db.skipLog = true;

          db.version(function(err, _version, _branch) {
            if (err) return retryCallback(err);

            console.log(`Engine Branch : ${_branch}`);
            console.log(`Engine Version: ${_version}`);

            dbVersion = _version;
            dbBranch  = _branch;

            return retryCallback();
          });
        }, function(err) {
          if (err) {
            setupErrorWrap.set('db', 'Connecting to DB failed (1)', err);

          } else {
            var dbVersionRequires = DB_VERSION_REQUIRES[dbBranch];
            if (dbVersionRequires && toolkit.compareVersion(dbVersion, dbVersionRequires.version) < 0) {
                setupErrorWrap.set('db', dbVersionRequires.errorMessage, `DB: ${dbBranch} ${dbVersion}`);
            }
          }

          return asyncCallback();
        });

      } catch(err) {
        setupErrorWrap.set('db', 'Unexpected error with DB (1)', err);
        return asyncCallback();
      }
    },
    // Check DB config
    function(asyncCallback) {
      if (setupErrorWrap.has('db')) return asyncCallback();

      try {
        db.settings(function(err, settings) {
          if (err) {
            setupErrorWrap.set('db', 'Connecting to DB failed (2)', err);

          } else {
            if (dbBranch === 'MySQL'
            && settings['innodb_large_prefix']
            && settings['innodb_large_prefix'].toUpperCase() !== 'ON') {
              setupErrorWrap.set('db', 'MySQL system variable "innodb_large_prefix" should be ON');
            }
          }

          return asyncCallback();
        });
      } catch(err) {
        setupErrorWrap.set('db', 'Unexpected error with DB (2)', err);
        return asyncCallback();
      }
    },
    // Check Redis config
    function(asyncCallback) {
      try {
        var redisConfig = {
          host    : inputedUserConfig.REDIS_HOST,
          port    : inputedUserConfig.REDIS_PORT,
          user    : inputedUserConfig.REDIS_USER,
          password: inputedUserConfig.REDIS_PASSWORD,
          db      : inputedUserConfig.REDIS_DATABASE || 0,
          useTLS  : inputedUserConfig.REDIS_USE_TLS  || false,
          authType: inputedUserConfig.REDIS_AUTH_TYPE,

          disableRetry: true,
          errorCallback(err) {
            setupErrorWrap.set('redis', 'Connecting to Redis failed', err);

            if (cacheDB) {
              cacheDB.end();
            }
          }
        }
        cacheDB = _getCacheDBHelper().createHelper(null, redisConfig);
        cacheDB.skipLog = true;

        cacheDB.run('info', function(err, data) {
          if (err) {
            setupErrorWrap.set('redis', 'Access Redis failed', err);

          } else {
            var redisInfo = {
              redis_version      : null,
              total_system_memory: null,
              maxmemory          : null,
              cluster_enabled    : null,
            }
            data.split('\n').forEach(function(line) {
              for (var k in redisInfo) {
                if (line.indexOf(`${k}:`) === 0) {
                  redisInfo[k] = line.split(':')[1].trim();
                }
              }
            });

            // Check version
            if (redisInfo['redis_version'] !== null) {
              var redisMajorVer = parseInt(redisInfo['redis_version'].split('.')[0]);
              if (redisMajorVer < 5) {
                setupErrorWrap.set('redis', 'Redis 5.0 or above is required', `redis_version: ${redisInfo['redis_version']}`);
              }
            }

            // Check system memory
            if (redisInfo['total_system_memory'] !== null) {
              var redisSystemMemory = parseInt(redisInfo['total_system_memory']);
              if (redisSystemMemory < MEMORY_1GB_BYTES) {
                setupErrorWrap.set('redis', 'Redis requires at least 1 GB of memory', `total_system_memory: ${redisInfo['total_system_memory']}`);
              }
            }

            if (redisInfo['maxmemory'] !== null) {
              var redisMaxMemory = parseInt(redisInfo['maxmemory']);
              if (redisMaxMemory > 0 && redisMaxMemory < MEMORY_1GB_BYTES) {
                setupErrorWrap.set('redis', 'Redis requires at least 1GB of memory', `maxmemory: ${redisInfo['maxmemory']}`);
              }
            }

            // Check if is cluster enabled or not
            if (redisInfo['cluster_enabled'] !== null) {
              var redisClusterEnabled = redisInfo['cluster_enabled'] !== '0';
              if (redisClusterEnabled) {
                setupErrorWrap.set('redis', 'DataFlux Func does not support Redis Cluster', `cluster_enabled: ${redisInfo['cluster_enabled']}`);
              }
            }
          }

          return asyncCallback();
        });

      } catch(err) {
        setupErrorWrap.set('redis', 'Unexpected error with Redis', err);
        return asyncCallback();
      }
    },
    // Init DB
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();

      var initSQLPath = path.join(__dirname, `../db/dataflux_func_${inputedUserConfig.DB_ENGINE}_latest.sql`);
      var initSQL = fs.readFileSync(initSQLPath).toString();

      db.query(initSQL, null, function(err, data) {
        if (err) {
          setupErrorWrap.set('dbInit', 'Initializing DB failed', err);
        }

        return asyncCallback();
      });
    },
    // Add sys config
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();

      var sql = db.createSQLBuilder();
      sql
        .INSERT_INTO('wat_main_system_setting')
        .VALUES({
          id        : SYS_CONFIG_ID_UPGRADE_DB_SEQ,
          value     : JSON.stringify(UPGRADE_INFO[UPGRADE_INFO.length - 1].seq),
          createTime: nowTimestamp,
          updateTime: nowTimestamp,
        });

      db.query(sql, function(err) {
        if (err) {
          setupErrorWrap.set('dbInit', 'Initializing system settings failed', err);
        }

        return asyncCallback();
      });
    },
    // Add Guance connector
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();
      if (toolkit.isNothing(guanceConnectorConfig)) return asyncCallback();

      var sql = db.createSQLBuilder();
      sql
        .INSERT_INTO('biz_main_connector')
        .VALUES({
          id         : 'guance',
          title      : 'Guance',
          description: `Created at ${nowTimeStringCN} during Setup`,
          type       : 'guance',
          configJSON : JSON.stringify(guanceConnectorConfig),
          pinTime    : nowTimestamp,
          createTime : nowTimestamp,
          updateTime : nowTimestamp,
        });

      db.query(sql, function(err) {
        if (err) {
          setupErrorWrap.set('guanceInit', 'Initializing Guance connector failed', err);
        }

        return asyncCallback();
      });
    },
    // Add TrueWatch connector
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();
      if (toolkit.isNothing(truewatchConnectorConfig)) return asyncCallback();

      var sql = db.createSQLBuilder();
      sql
        .INSERT_INTO('biz_main_connector')
        .VALUES({
          id         : 'truewatch',
          title      : 'TrueWatch',
          description: `Created at ${nowTimeStringCN} during Setup`,
          type       : 'truewatch',
          configJSON : JSON.stringify(truewatchConnectorConfig),
          pinTime    : nowTimestamp,
          createTime : nowTimestamp,
          updateTime : nowTimestamp,
        });

      db.query(sql, function(err) {
        if (err) {
          setupErrorWrap.set('truewatchInit', 'Initializing TrueWatch connector failed', err);
        }

        return asyncCallback();
      });
    },
    // Setup Init AK automatically
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();
      if (!inputedUserConfig.AUTO_SETUP_AK_SECRET) return asyncCallback();

      var akId = inputedUserConfig.AUTO_SETUP_AK_ID || AUTO_SETUP_DEFAULT_AK_ID;
      var salt = akId;
      var akSecret = toolkit.cipherByAES(inputedUserConfig.AUTO_SETUP_AK_SECRET, inputedUserConfig.SECRET, salt);

      var sql = db.createSQLBuilder();
      sql
        .INSERT_INTO('wat_main_access_key')
        .VALUES({
          id        : akId,
          userId    : ADMIN_USER_ID,
          name      : 'Auto Setup Init AK',
          secret    : akSecret,
          createTime: nowTimestamp,
          updateTime: nowTimestamp,
        });

      db.query(sql, function(err, data) {
        if (err) {
          setupErrorWrap.set('akInit', 'Initializing AccessKey failed', err);
        }

        return asyncCallback();
      });
    },
    // Delete admin
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();

      var sql = db.createSQLBuilder();
      sql
        .DELETE_FROM('wat_main_user')
        .WHERE({
          id: ADMIN_USER_ID,
        });

      db.query(sql, function(err) {
        if (err) {
          setupErrorWrap.set('adminUser', 'Setup administrator password failed (1)', err);
        }

        return asyncCallback();
      });
    },
    // Add admin
    function(asyncCallback) {
      if (setupErrorWrap.hasError()) return asyncCallback();

      var adminPasswordHash = toolkit.getSaltedPasswordHash(
          ADMIN_USER_ID, adminPassword, inputedUserConfig.SECRET);

      var sql = db.createSQLBuilder();
      sql
        .INSERT_INTO('wat_main_user')
        .VALUES({
          id              : ADMIN_USER_ID,
          username        : adminUsername,
          passwordHash    : adminPasswordHash,
          roles           : 'sa',
          customPrivileges: '*',
          createTime      : nowTimestamp,
          updateTime      : nowTimestamp,
        })

      db.query(sql, function(err) {
        if (err) {
          setupErrorWrap.set('adminUser', 'Setup administrator password failed (2)', err);
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return toolkit.sysExitError();

    if (setupErrorWrap.hasError()) return callback(setupErrorWrap);

    // Merge inputed config to user config and set `_IS_INSTALLED` flag
    Object.assign(USER_CONFIG, inputedUserConfig);
    USER_CONFIG._IS_INSTALLED = true;

    // Remove unused DB config according to `DB_ENGINE`
    for (var _dbEngine in DB_CONFIG_FIELDS) {
      if (_dbEngine == USER_CONFIG.DB_ENGINE) continue;

      Object.values(DB_CONFIG_FIELDS[_dbEngine]).forEach(function(_configField) {
        delete USER_CONFIG[_configField];
      });
    }

    // Remove temp install configs
    TEMP_INSTALL_CONFIGS_TO_WRITE.forEach(function(c) {
      delete USER_CONFIG[c];
    })

    fs.writeFileSync(CONFIG.CONFIG_FILE_PATH, yaml.dump(USER_CONFIG));
    console.log('DataFlux Func Installed.');

    // Response for redirection
    var redirectURL = USER_CONFIG.WEB_BASE_URL || CONFIG.WEB_BASE_URL || null;
    return callback(null, redirectURL);
  });
};

function runSetupServer() {
  /*
    Setup wizard as a single page app, launched before the server app
    After the user confirms the configs, the wizard writes the configs to the `user-config.yaml` file and exits,
    and then the server app launches

    When multiple instances are started at the same time,
    each process checks the `_IS_INSTALLED` flag in config file regularly to determine if it has been installed.
    Once the installation is completed, it exits automatically
   */

  // Install checker
  setInterval(function() {
    // To check if the installation is completed, the config file should be reloaded each time
    yamlResources.loadConfig(path.join(__dirname, '../config.yaml'), function(err, config) {
      if (err) {
        console.log(err);
        return toolkit.sysExitError();
      }

      // Waiting for the next round
      if (!config._IS_INSTALLED) {
        console.log(`Waiting for setup, please open http://<IP or Hostname>:${config.WEB_PORT}/ and continue`)
        return;
      }

      // Exit
      console.log('Other process finished installation.');
      return toolkit.sysExitOK();
    });
  }, CHECKER_INTERVAL);

  // Express
  var app = express();

  // App Setting
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  // Static files
  app.use('/statics', express.static(path.join(__dirname, 'statics')));

  // Setup page locals
  app.get('/locals', function(req, res, next) {
    var localsFileBasePath = path.join(__dirname, 'statics/yaml');
    var opt = {
      withFileTypes: true,
    };
    fs.readdir(localsFileBasePath, opt, function(err, data) {
      if (err) return next(err);

      // Get locals file map
      var localsFileMap = data.reduce(function(acc, x) {
        if (!x.isFile()) return acc;

        var m = x.name.match(/^setup-locals\.(.+)\.yaml$/);
        if (!m) return acc;

        acc[m[1]] = m[0];
        return acc
      }, {});

      // Load locals data
      var messages = {};
      for (var locals in localsFileMap) {
        var filePath = path.join(localsFileBasePath, localsFileMap[locals]);
        messages[locals] = toolkit.safeReadFileSync(filePath, 'yaml');
      }

      res.send(messages);
    })
  });

  // Setup page
  app.get('/', function(req, res) {
    var defaultConfig = toolkit.jsonCopy(CONFIG);

    // Default admin username / password
    defaultConfig['ADMIN_USERNAME']        = ADMIN_DEFUALT_USERNAME;
    defaultConfig['ADMIN_PASSWORD']        = ADMIN_DEFUALT_PASSWORD;
    defaultConfig['ADMIN_PASSWORD_REPEAT'] = ADMIN_DEFUALT_PASSWORD;

    var GUANCE_NODES = common.getGuanceNodes();

    var pageData = {
      CONFIG      : defaultConfig,
      IMAGE_INFO  : IMAGE_INFO,
      GUANCE_NODES: GUANCE_NODES,
    }
    res.render('setup', pageData);
  });

  // Setup handler
  app.use(bodyParser.json({limit: '1mb'}));
  app.post('/setup', function(req, res, next) {
    // Inputed user config
    var inputedUserConfig = req.body.userConfig || {};

    _doSetup(inputedUserConfig, function(setupErrorWrap, redirectURL) {
      if (setupErrorWrap && setupErrorWrap.hasError()) {
        res.status(400);
        return res.send({ setupErrors: setupErrorWrap.toJSON() });
      }

      res.send({ redirectURL: redirectURL });

      // Close server after setup finished
      setTimeout(function() {
        server.close();
      }, 3 * 1000);
    });
  });

  // Redirect to /
  app.use(function(req, res) {
    res.redirect('/');
  });

  var server = http.createServer(app);

  var listenOpt = {
    host: '0.0.0.0',
    port: CONFIG.WEB_PORT,
  };
  server.listen(listenOpt, function() {
    // Print some message of the server
    console.log(toolkit.strf('Setup Server is listening on {0}  (Press CTRL+C to quit)', CONFIG.WEB_PORT));
  });
}

function runUpgrade() {
  /*
    Upgrade DB schema

    When multiple instances are started at the same time,
    Each process determines if another process is already updating according to the Redis exclusion locks.
    When it finds that other processes are updating, it switches to a regular check to see if the update is complete
    Exit automatically when it detects that an update is complete
   */
  if (toolkit.isNothing(UPGRADE_INFO)) {
    console.log('No upgrade info, skip.');
    toolkit.sysExitOK();
  }

  // Init
  var db      = _getDBHelper().createHelper();
  var cacheDB = _getCacheDBHelper().createHelper();

  var currentUpgradeSeq = null;
  var nextUpgradeSeq    = null;
  var upgradeItems      = null;

  var lockKey     = toolkit.strf('{0}#upgradeLock', CONFIG.APP_NAME);
  var lockValue   = toolkit.genRandString();
  var maxLockTime = 30;

  var system_setting_table = 'wat_main_system_setting';
  async.series([
    // Check current table name of System Setting
    //  [NEW] wat_main_system_setting
    //  [OLD] wat_main_system_config
    function(asyncCallback) {
      db.tables(function(err, tables) {
        if (err) return asyncCallback(err);

        // No table with new name found in DB, use old table name
        if (tables.indexOf('wat_main_system_setting') < 0) {
          console.log('No new system config table, use `wat_main_system_config`');
          system_setting_table = 'wat_main_system_config';
        }

        return asyncCallback();
      });
    },
    // Migration to new ID of upgrade DB seq
    function(asyncCallback) {
      var sql = db.createSQLBuilder();
      sql
        .UPDATE(system_setting_table)
        .SET({
          id: SYS_CONFIG_ID_UPGRADE_DB_SEQ
        })
        .WHERE({
          id: SYS_CONFIG_ID_UPGRADE_DB_SEQ_OLD
        });

      db.query(sql, asyncCallback);
    },
    // Check upgrade lock
    function(asyncCallback) {
      cacheDB.lock(lockKey, lockValue, maxLockTime, function(err, cacheRes) {
        if (err) {
          console.log('Checking upgrade status failed: ', err);
          return toolkit.sysExitError();
        }

        // Got lock, do next
        if (cacheRes) return asyncCallback();

        // Cannot get lock, other process is running upgrade, wait until lock expires
        console.log('Other process is running upgrade, waiting...');
        setInterval(function() {
          cacheDB.get(lockKey, function(err, cacheRes) {
            if (err) {
              console.log('Waiting upgrade status failed: ', err);
              return toolkit.sysExitError();
            }

            if (cacheRes) {
              console.log('Upgrading is still running...');
              return;
            }

            console.log('Upgrading ended, start application...');
            return toolkit.sysExitOK();
          });
        }, CHECKER_INTERVAL);
      });
    },
    // Get upgrade items
    function(asyncCallback) {
      var sql = db.createSQLBuilder();
      sql
        .SELECT('value')
        .FROM(system_setting_table)
        .WHERE({
          id: SYS_CONFIG_ID_UPGRADE_DB_SEQ,
        });

      db.query(sql, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (dbRes.length <= 0) {
          // Never upgraded, perform all upgrades
          currentUpgradeSeq = null;
          console.log('No current upgrade SEQ...')


          upgradeItems = UPGRADE_INFO;

        } else if (dbRes.length > 0) {
          // Upgraded before, only follow-up upgrades will be performed
          currentUpgradeSeq = parseInt(dbRes[0].value);
          console.log(`Current upgrade SEQ: ${currentUpgradeSeq}`);

          upgradeItems = UPGRADE_INFO.filter(function(d) {
            return d.seq > currentUpgradeSeq;
          });
        }

        return asyncCallback();
      });
    },
    // Do upgrade
    function(asyncCallback) {
      if (toolkit.isNothing(upgradeItems)) {
        console.log('Already up to date, skip.');
        return asyncCallback();
      }

      console.log(toolkit.strf('Run upgrade: {0} -> {1}',
          toolkit.isNothing(currentUpgradeSeq) ? 'BASE' : currentUpgradeSeq,
          upgradeItems[upgradeItems.length -1].seq));

      async.eachSeries(upgradeItems, function(item, eachCallback) {
        console.log(toolkit.strf('Upgading to SEQ {0}...', item.seq));

        if (item.skipWhenSetup) {
          // Skip the step that have already been upgraded
          nextUpgradeSeq = item.seq;

          return eachCallback();

        } else {
          // Normal perform the upgrade step
          var sql = db.createSQLBuilder(item[CONFIG.DB_ENGINE] || item.database);

          db.query(sql, function(err) {
            if (err) return eachCallback(err);

            nextUpgradeSeq = item.seq;

            cacheDB.extendLockTime(lockKey, lockValue, maxLockTime, function(err) {
              if (err) return console.log('Extend upgrading lock time failed: ', err);
            });

            return eachCallback();
          });
        }
      }, asyncCallback);
    },
    // Update upgrade seq
    function(asyncCallback) {
      if (toolkit.isNothing(nextUpgradeSeq)) return asyncCallback();

      // At this point, the System Setting table must be the new one
      var sql = db.createSQLBuilder();

      if (toolkit.isNothing(currentUpgradeSeq)) {
        sql
          .INSERT_INTO('wat_main_system_setting')
          .VALUES({
            id   : SYS_CONFIG_ID_UPGRADE_DB_SEQ,
            value: JSON.stringify(nextUpgradeSeq),
          });

      } else {
        sql
          .UPDATE('wat_main_system_setting')
          .SET({
            value: JSON.stringify(nextUpgradeSeq),
          })
          .WHERE({
            id: SYS_CONFIG_ID_UPGRADE_DB_SEQ,
          });
      }

      db.query(sql, function(err) {
        if (err) return asyncCallback(err);

        console.log('Upgrading completed.');

        return asyncCallback();
      });
    },
  ], function(err) {
    cacheDB.unlock(lockKey, lockValue);

    if (err) {
      console.log('Upgrading failed: ', err);
      return toolkit.sysExitError();
    }

    return toolkit.sysExitOK();
  });
}

// Load extra YAML resources and run
yamlResources.loadConfig(path.join(__dirname, '../config.yaml'), function(err, _config, _userConfig) {
  if (err) throw err;

  CONFIG      = _config;
  USER_CONFIG = _userConfig;

  // Load upgrade info
  var upgradeInfoPath = path.join(__dirname, '../upgrade-info.yaml')
  UPGRADE_INFO = yaml.load(fs.readFileSync(upgradeInfoPath)).upgradeInfo;

  var callback = null;

  if (CONFIG._DISABLE_SETUP) {
    console.log('Setup disabled, skip...');
    return toolkit.sysExitOK();
  }

  if (!CONFIG._IS_INSTALLED) {
    // Not installed yet

    if (CONFIG.AUTO_SETUP) {
      // Auto-setup
      console.log('Start auto setup...')

      // When perform aut-setup:
      // 1. Force to get a random SECRET
      // 2. Use user-config.yaml to init
      USER_CONFIG.SECRET = toolkit.genRandString(16);
      return _doSetup(USER_CONFIG, function(setupErrorWrap) {
        if (setupErrorWrap && setupErrorWrap.hasError()) {
          console.log(setupErrorWrap.toJSON());
          return toolkit.sysExitError();
        }

        console.log('Auto setup finished.');
        return toolkit.sysExitOK();
      });

    } else {
      // Run Setup server and provide wizard page
      console.log('Start setup guide...');
      callback = runSetupServer;
    }

  } else {
    // Upgrade
    console.log('Start upgrade process...');
    callback = runUpgrade;
  }

  if ('function' === typeof callback) {
    require('./appInit').prepare(callback);
  }
});
