'use strict';

/* Built-in Modules */
var path         = require('path');
var childProcess = require('child_process');

/* 3rd-party Modules */
var async   = require('async');
var request = require('request');

/* Project Modules */
var E          = require('../utils/serverError');
var IMAGE_INFO = require('../utils/yamlResources').get('IMAGE_INFO');
var ROUTE      = require('../utils/yamlResources').get('ROUTE');
var CONST      = require('../utils/yamlResources').get('CONST');
var CONFIG     = require('../utils/yamlResources').get('CONFIG');
var toolkit    = require('../utils/toolkit');
var common     = require('../utils/common');

var funcMod = require('../models/funcMod');

/* Init */
var API_LIST_CACHE = {};

var OPEN_API_PARAM_TYPES = [
  { name: 'params', in: 'path' },
  { name: 'query' , in: 'query' },
];
var LANGUAGE_ZH_CN_SUFFIX = '_zhCN';

// Redis Key agg
var REDIS_KEY_AGG = [
  [ /[a-zA-Z0-9]{32}/g,                              '<Hash>'],
  [ /:date:[0-9]{4}-[0-9]{2}-[0-9]{2}:/g,            ':date:<Date>:'],
  [ /:hostname:[a-zA-Z0-9_-]+:/g,                    ':hostname:<Hostname>:'],
  [ /:pid:[0-9]+:/g,                                 ':pid:<Process ID>:'],
  [ /:xAuthTokenId:[a-zA-Z0-9_-]+:/g,                ':xAuthTokenId:<X-Auth-Token ID>:'],
  [ /:userId:[a-zA-Z0-9_-]+:/g,                      ':userId:<User ID>:'],
  [ /:username:[a-zA-Z0-9_-]+:/g,                    ':username:<Username>:'],
  [ /:workerId:[a-zA-Z0-9_-]+:/g,                    ':workerId:<Worker ID>:'],
  [ /:queue:[0-9]+:/g,                               ':queue:<Queue>:'],
  [ /:workerQueue:[0-9]+:/g,                         ':workerQueue:<Worker Queue>:'],
  [ /:funcId:[a-zA-Z0-9_.]+:/g,                      ':funcId:<Func ID>:'],
  [ /:table:[a-zA-Z0-9_]+:/g,                        ':table:<Table>:'],
  [ /:routeName:[a-zA-Z0-9_-]+:/g,                   ':routeName:<Route Name>:'],
  [ /:routeParams\.[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:/g, ':routeParams.<Field>:<Value>:'],
]

function useLanguage(j, lang) {
  lang = lang.replace(/[-_]/g, '');

  function _useLanguage(j) {
    if (j && 'object' === typeof j && !Array.isArray(j)) {
      Object.keys(j).sort().forEach(function(k) {
        if (k.slice(-LANGUAGE_ZH_CN_SUFFIX.length) === LANGUAGE_ZH_CN_SUFFIX) {
          if (lang === LANGUAGE_ZH_CN_SUFFIX.slice(1)) {
            var mainK = k.slice(0, -LANGUAGE_ZH_CN_SUFFIX.length);
            j[mainK] = j[k];
          }

          delete j[k];

        } else {
          j[k] = _useLanguage(j[k]);
        }
      });

    } else if (j && Array.isArray(j)) {
      for (var i = 0; i < j.length; i++) {
        j[i] = _useLanguage(j[i])
      }
    }

    return j;
  }

  return _useLanguage(toolkit.jsonCopy(j));
};

function toOpenAPISchema(fieldOpt, filesOpt, lang) {
  var schemaSpec = {};

  // Deprecated contents
  if (fieldOpt.$isDeprecated) {
    schemaSpec = {
      type: 'string',
    };
    return schemaSpec;
  }

  fieldOpt.$_type = fieldOpt.$ ? 'array' : (fieldOpt.$type || '').toLowerCase();
  switch(fieldOpt.$_type) {
    case 'str':
    case 'string':
      schemaSpec = {
        type: 'string',
      };
      break;

    case 'enum':
      schemaSpec = {
        type: 'string',
        enum: fieldOpt.$in,
      };
      break;

    case 'jsonstring':
      schemaSpec = {
        type  : 'string',
        format: 'JSON',
      };
      break;

    case 'commaarray':
      schemaSpec = {
        type  : 'string',
        format: 'array',
      };
      break;

    case 'int':
    case 'integer':
      schemaSpec = {
        type: 'integer',
      };
      break;

    case 'num':
    case 'number':
    case 'float':
      schemaSpec = {
        type: 'number',
      };
      break;

    case 'arr':
    case 'array':
      schemaSpec = {
        type : 'array',
        items: {},
      };
      break;

    case 'bool':
    case 'boolean':
      schemaSpec = {
        type: 'boolean',
      };
      break;

    default:
      var hasSubField = false;
      for (var optKey in fieldOpt) {
        if (optKey[0] !== '$') {
          hasSubField = true;
          break;
        }
      }

      if (hasSubField) {
        schemaSpec = {
          type      : 'object',
          properties: {},
        };

      } else {
        schemaSpec = {
          type: 'string',
        };
      }
      break;
  }

  if (fieldOpt.$desc) {
    schemaSpec.description = fieldOpt.$desc.trim();
  }
  if (fieldOpt.$allowNull) {
    schemaSpec.nullable = true;
  }
  if (fieldOpt.$notEmptyString) {
    schemaSpec.allowEmptyValue = false;
  }
  if ('$minValue' in fieldOpt) {
    schemaSpec.minimum = fieldOpt.$minValue;
  }
  if ('$maxValue' in fieldOpt) {
    schemaSpec.maximum = fieldOpt.$maxValue;
  }

  if (fieldOpt.$example) {
    schemaSpec.example = fieldOpt.$example;
  }

  for (var optKey in fieldOpt) {
    if (optKey === '$') {
      // Array
      schemaSpec.items = toOpenAPISchema(fieldOpt.$, null, lang);

    } else if (optKey[0] !== '$') {
      // Object
      var subFieldOpt = fieldOpt[optKey];
      schemaSpec.properties[optKey] = toOpenAPISchema(subFieldOpt, null, lang);
    }
  }

  if (filesOpt && schemaSpec.properties) {
    schemaSpec.properties.files = {
      description: filesOpt.$desc,
      type       : 'string',
      format     : 'binary',
    }
  }

  return schemaSpec;
};

function getOpenAPISpec(route, lang, virtualDir) {
  virtualDir = virtualDir || '';

  // Basic Structure
  var spec = {
    openapi: '3.0.0',
    info: {
      title      : 'DataFlux Func OpenAPI',
      version    : IMAGE_INFO.VERSION,
      description: route.$info.description,
    },
    tags : [],
    paths: {},
    components: {
      responses: {
        GeneralResponses: {
          description: route.$responses.description,
          content: {
            'application/json': {
              schema: toOpenAPISchema(route.$responses.schema, null, lang),
            },
          }
        }
      }
    }
  }

  // Collect Paths
  for (var moduleKey in route) {
    if (moduleKey[0] === '$') continue;

    var module = route[moduleKey];
    var moduleTag = module.$tag || moduleKey;
    if (spec.tags.indexOf(moduleTag) < 0) {
      spec.tags.push(moduleTag);
    }

    for (var apiKey in module) {
      if (apiKey[0] === '$') continue;

      var api = module[apiKey];
      if (!api.showInDoc) continue;

      // API
      var apiSpec = {
        summary    : api.name,
        description: api.desc,
        deprecated : !!api.isDeprecated || !!api.deprecated,
        tags       : [ moduleTag ],
        parameters : [],
        responses: {
          200: { $ref: '#/components/responses/GeneralResponses' }
        }
      }

      // Parameters
      OPEN_API_PARAM_TYPES.forEach(function(paramType) {
        if (!api[paramType.name]) return;

        for (var k in api[paramType.name]) {
          var paramOpt = api[paramType.name][k];

          var paramSpec = {
            name       : k,
            in         : paramType.in,
            description: paramOpt.$desc,
            schema     : toOpenAPISchema(paramOpt, null, lang),
            deprecated : !!paramOpt.$isDeprecated || !!paramOpt.$deprecated,
            required   : !!(paramType.in === 'path' || paramOpt.$isRequired || paramOpt.$required),
          }

          if (toolkit.startsWith(k, '_')) {
            apiSpec.parameters.unshift(paramSpec);
          } else {
            apiSpec.parameters.push(paramSpec);
          }
        }
      });

      // Body
      if (api.body) {
        if (api.files) {
          apiSpec.requestBody = {
            required: true,
            content: {
              'multipart/form-data': {
                schema: toOpenAPISchema(api.body, api.files, lang),
              }
            }
          }

        } else {
          apiSpec.requestBody = {
            required: true,
            content: {
              'application/json': {
                schema: toOpenAPISchema(api.body, null, lang),
              }
            }
          }
        }
      }

      var apiURL = toolkit.asArray(api.url)[0].replace(/\/:([a-zA-Z0-9-_]+)/g, '/{$1}');
      if (virtualDir) {
        apiURL = `${virtualDir}${apiURL}`;
      }

      if (!spec.paths[apiURL]) {
        spec.paths[apiURL] = {};
      }

      spec.paths[apiURL][api.method] = apiSpec;
    }
  }

  // Convert Tag object
  spec.tags = spec.tags.map(function(tag) {
    return { name: tag };
  });

  return spec
};

/* Handlers */
exports.healthz = function(req, res, next) {
  res.locals.sendJSON();
};

exports.api = function(req, res, next) {
  var format     = req.query.format     || 'openapi';
  var lang       = req.query.lang       || 'en';
  var virtualDir = req.query.virtualDir || '';

  if (virtualDir && !toolkit.startsWith(virtualDir, '/')) {
    virtualDir = `/${virtualDir}`;
  }
  virtualDir = virtualDir.trimEnd('/');

  // Get from cache
  var cacheKey = `${format}/${lang}`;
  var ret = API_LIST_CACHE[cacheKey]
          ? API_LIST_CACHE[cacheKey]
          : null;

  // Gen return data
  if (!ret) {
    var route = useLanguage(ROUTE, lang);

    switch (format) {
      case 'openapi':
      case 'swagger':
        ret = getOpenAPISpec(route, lang, virtualDir);
        break;

      case 'raw':
      default:
        ret = toolkit.initRet(route);
        break;
    }
  }

  // Return data
  res.send(ret);
};

exports.imageInfo = function(req, res, next) {
  var ret = toolkit.initRet(IMAGE_INFO);
  res.locals.sendJSON(ret);
};

exports.systemInfo = function(req, res, next) {
  var systemInfo = {
    // From image info
    ARCHITECTURE     : IMAGE_INFO.ARCHITECTURE,
    EDITION          : IMAGE_INFO.EDITION,
    VERSION          : IMAGE_INFO.VERSION,
    RELEASE_TIMESTAMP: IMAGE_INFO.RELEASE_TIMESTAMP,
    LINUX_DISTRO     : IMAGE_INFO.LINUX_DISTRO,

    // From configs
    MODE              : CONFIG.MODE,
    WEB_BASE_URL      : CONFIG.WEB_BASE_URL,
    WEB_INNER_BASE_URL: CONFIG.WEB_INNER_BASE_URL,

    _HOSTNAME       : process.env.HOSTNAME,
    _PIP_INSTALL_DIR: path.join(CONFIG.RESOURCE_ROOT_PATH, CONFIG._EXTRA_PYTHON_PACKAGE_INSTALL_DIR),

    UPLOAD_TEMP_FILE_DIR             : CONFIG.UPLOAD_TEMP_FILE_DIR,
    DOWNLOAD_TEMP_FILE_DIR           : CONFIG.DOWNLOAD_TEMP_FILE_DIR,
    _EXTRA_PYTHON_PACKAGE_INSTALL_DIR: CONFIG._EXTRA_PYTHON_PACKAGE_INSTALL_DIR,
    _USER_PYTHON_PACKAGE_DIR         : CONFIG._USER_PYTHON_PACKAGE_DIR,
    _SCRIPT_MARKET_BASE_DIR               : CONFIG._SCRIPT_MARKET_BASE_DIR,
    _PRE_RUN_SCRIPT_DIR              : CONFIG._PRE_RUN_SCRIPT_DIR,

    _WEB_CLIENT_ID_HEADER               : CONFIG._WEB_CLIENT_ID_HEADER,
    _WEB_AUTH_HEADER                    : CONFIG._WEB_AUTH_HEADER,
    _WEB_AUTH_QUERY                     : CONFIG._WEB_AUTH_QUERY,
    _WEB_TRACE_ID_HEADER                : CONFIG._WEB_TRACE_ID_HEADER,
    _WEB_CLIENT_UILOCALE_HEADER         : CONFIG._WEB_CLIENT_UILOCALE_HEADER,
    _WEB_CLIENT_TIME_HEADER             : CONFIG._WEB_CLIENT_TIME_HEADER,
    _WEB_PULL_LOG_TRACE_ID              : CONFIG._WEB_PULL_LOG_TRACE_ID,
    _WEB_SERVER_VERSION_HEADER          : CONFIG._WEB_SERVER_VERSION_HEADER,
    _WEB_SERVER_RELEASE_TIMESTAMP_HEADER: CONFIG._WEB_SERVER_RELEASE_TIMESTAMP_HEADER,

    _SCRIPT_EXPORT_FILE_PREFIX: CONFIG._SCRIPT_EXPORT_FILE_PREFIX,

    _FUNC_ARGUMENT_PLACEHOLDER_LIST: CONFIG._FUNC_ARGUMENT_PLACEHOLDER_LIST,

    _FUNC_TASK_TIMEOUT_DEBUGGER   : CONFIG._FUNC_TASK_TIMEOUT_DEBUGGER,
    _FUNC_TASK_TIMEOUT_DEFAULT    : CONFIG._FUNC_TASK_TIMEOUT_DEFAULT,
    _FUNC_TASK_TIMEOUT_MIN        : CONFIG._FUNC_TASK_TIMEOUT_MIN,
    _FUNC_TASK_TIMEOUT_MAX        : CONFIG._FUNC_TASK_TIMEOUT_MAX,
    _FUNC_TASK_DEFAULT_API_TIMEOUT: CONFIG._FUNC_TASK_DEFAULT_API_TIMEOUT,
    _FUNC_TASK_MIN_API_TIMEOUT    : CONFIG._FUNC_TASK_MIN_API_TIMEOUT,
    _FUNC_TASK_MAX_API_TIMEOUT    : CONFIG._FUNC_TASK_MAX_API_TIMEOUT,

    _FUNC_TASK_QUEUE_DEFAULT  : CONFIG._FUNC_TASK_QUEUE_DEFAULT,
    _FUNC_TASK_QUEUE_CRON_JOB : CONFIG._FUNC_TASK_QUEUE_CRON_JOB,
    _FUNC_TASK_QUEUE_ASYNC_API: CONFIG._FUNC_TASK_QUEUE_ASYNC_API,

    _TASK_RECORD_LIMIT_MIN           : CONFIG._TASK_RECORD_LIMIT_MIN,
    _TASK_RECORD_LIMIT_MAX           : CONFIG._TASK_RECORD_LIMIT_MAX,
    _TASK_RECORD_FUNC_LIMIT_SYNC_API : CONFIG._TASK_RECORD_FUNC_LIMIT_SYNC_API,
    _TASK_RECORD_FUNC_LIMIT_CRON_JOB : CONFIG._TASK_RECORD_FUNC_LIMIT_CRON_JOB,
    _TASK_RECORD_FUNC_LIMIT_ASYNC_API: CONFIG._TASK_RECORD_FUNC_LIMIT_ASYNC_API,

    _HEARTBEAT_INTERVAL: CONFIG._HEARTBEAT_INTERVAL,

    // From route config
    _RESOURCE_UPLOAD_FILE_SIZE_LIMIT: toolkit.toBytes(ROUTE.resourceAPI.upload.files.$limitSize),
  };

  var funcModel = funcMod.createModel(res.locals);

  async.series([
    // Get Integrated Sign-in Func
    function(asyncCallback) {
      if (CONFIG.DISABLE_INTEGRATED_SIGNIN) return asyncCallback();

      var opt = {
        filters: {
          integration: { eq: 'signIn' }
        }
      };
      funcModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        // Add Integrated Sign-in Func to system info
        var integratedSignInFuncs = [];
        dbRes.forEach(function(d) {
          integratedSignInFuncs.push({
            id   : d.id,
            title: d.title,
          });
        });

        systemInfo.INTEGRATED_SIGN_IN_FUNC = integratedSignInFuncs;

        return asyncCallback();
      });
    },
    // Get system setting
    function(asyncCallback) {
      var keys = Object.keys(CONST.systemSettings);
      res.locals.getSystemSettings(keys, function(err, systemSettings) {
        if (err) return asyncCallback(err);

        systemInfo.SYSTEM_SETTINGS = systemSettings;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    // Get Guance, TrueWatch node list
    systemInfo.GUANCE_NODES = common.getGuanceNodes();

    var ret = toolkit.initRet(systemInfo);
    return res.locals.sendJSON(ret);
  });
};

exports.metrics = function(req, res, next) {
  res.set('Content-Type', 'application/openmetrics-text; version=1.0.0; charset=utf-8');
  return res.locals.sendRaw('# [DEPRECATE] This API is DEPRECATED');
};

exports.ping = function(req, res, next) {
  var ret = toolkit.initRet('pong');
  res.locals.sendJSON(ret);
};

exports.echo = function(req, res, next) {
  var data = {
    query: req.query,
    body : req.body,
  }
  var ret = toolkit.initRet(data);
  res.locals.sendJSON(ret);
};

exports.proxy = function(req, res, next) {
  var hostname = URL.parse(req.body.url).hostname;
  if (CONFIG.PROXY_HOSTNAME_LIST.indexOf(hostname) < 0) {
    return next(new E('EBizCondition', `Request to ${hostname} via proxy is not allowed`));
  }

  var requestOptions = {
    forever: true,
    timeout: (req.body.timeout || 10) * 1000,
    method : req.body.method,
    url    : req.body.url,
    headers: req.body.headers || undefined,
    body   : req.body.body || undefined,
    json   : true,
  };
  request(requestOptions, function(err, _res, _body) {
    if (err) return next(err);

    var httpResp = {
      statusCode: _res.statusCode,
      body      : _body,
    };

    if (req.body.withHeaders) {
      httpResp.headers = _res.headers;
    }

    var ret = toolkit.initRet(httpResp);

    return res.locals.sendJSON(ret, { muteLog: true });
  });
};

exports.systemReport = function(req, res, next) {
  // Image info
  var IMAGE = IMAGE_INFO;

  // Configs
  var _CONFIG = toolkit.jsonMask(CONFIG);

  // Python info
  var PYTHON = {
    version : childProcess.execFileSync('python', [ '--version' ]).toString().trim().split(' ').pop(),
    packages: JSON.parse(childProcess.execFileSync('pip', [ 'list', '--format=json' ]).toString()).reduce(function(acc, x) {
      acc[x.name] = x.version;
      return acc;
    }, {}),
  };

  // Node info
  var NODE = {
    version : childProcess.execFileSync('node', [ '--version' ]).toString().trim().replace('v', ''),
    packages: toolkit.safeReadFileSync(path.join(__dirname, '../../package.json'), 'json').dependencies,
  };

  // Front-end info
  var WEB_CLIENT = {
    packages: toolkit.safeReadFileSync(path.join(__dirname, '../../client/package.json'), 'json').dependencies,
  };

  // Redis config
  var REDIS_CONFIG = toolkit.jsonMask(toolkit.jsonCopy(res.locals.cacheDB.config));

  // DB config
  var DB_CONFIG = { engine: CONFIG.DB_ENGINE };
  Object.assign(DB_CONFIG, toolkit.jsonMask(toolkit.jsonCopy(res.locals.db.config)));

  var topN = 10;

  var SERVICES        = {}; // TODO
  var QUEUES          = {}; // TODO
  var REDIS_INFO      = {};
  var DB_SETTINGS     = {};
  var DB_TABLE_STATUS = {};
  var DB_ANALYSIS     = {};

  async.series([
    // Redis
    function(asyncCallback) {
      res.locals.cacheDB.info(function(err, cacheRes) {
        if (err) return asyncCallback(err);

        cacheRes.split('\n').forEach(function(line) {
          line = line.trim();
          if (!line || line[0] === '#') return;

          var parts = line.split(':');
          var k = parts[0].trim();
          var v = '';
          if (parts.length >= 2) {
            v = parts[1].trim();
          }
          REDIS_INFO[k] = v;
        });

        return asyncCallback();
      });
    },
    // DB Settings
    function(asyncCallback) {
      res.locals.db.settings(function(err, settings) {
        if (err) return asyncCallback(err);

        DB_SETTINGS = settings;

        return asyncCallback();
      });
    },
    // DB table info
    function(asyncCallback) {
      res.locals.db.tableStatus(function(err, tableStatus) {
        if (err) return asyncCallback(err);

        DB_TABLE_STATUS = tableStatus;

        // Add readable size
        for (var name in DB_TABLE_STATUS) {
          var t = DB_TABLE_STATUS[name];

          t.dataSizeHuman   = toolkit.byteSizeHuman(t.dataSize).toString();
          t.indexSizeHuman  = toolkit.byteSizeHuman(t.indexSize).toString();
          t.totalSizeHuman  = toolkit.byteSizeHuman(t.totalSize).toString();
          t.avgRowSizeHuman = toolkit.byteSizeHuman(t.avgRowSize).toString();
        }

        // DB table analysis
        var analysisData = Object.values(DB_TABLE_STATUS);
        DB_ANALYSIS = {
          topDataSize  : toolkit.sortJSONArray(analysisData, 'dataSize',   'DESC').slice(0, topN),
          topIndexSize : toolkit.sortJSONArray(analysisData, 'indexSize',  'DESC').slice(0, topN),
          topTotalSize : toolkit.sortJSONArray(analysisData, 'totalSize',  'DESC').slice(0, topN),
          topAvgRowSize: toolkit.sortJSONArray(analysisData, 'avgRowSize', 'DESC').slice(0, topN),
        };

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var systemReport = {
      IMAGE,
      CONFIG: _CONFIG,
      NODE,
      PYTHON,
      WEB_CLIENT,
      REDIS_CONFIG,
      REDIS_INFO,
      DB_CONFIG,
      DB_SETTINGS,
      DB_TABLE_STATUS,
      DB_ANALYSIS,
    };

    var ret = toolkit.initRet(systemReport);
    return res.locals.sendJSON(ret);
  });
};

exports.detailedRedisReport = function(req, res, next) {
  var t1 = Date.now();

  var topN = 20;

  var REDIS              = {};
  var REDIS_KEYS         = {};
  var REDIS_KEY_PATTERNS = {};
  var REDIS_ANALYSIS     = {};


  async.series([
    // Redis
    function(asyncCallback) {
      res.locals.cacheDB.info(function(err, cacheRes) {
        if (err) return asyncCallback(err);

        cacheRes.split('\n').forEach(function(line) {
          line = line.trim();
          if (!line || line[0] === '#') return;

          var parts = line.split(':');
          var k = parts[0].trim();
          var v = '';
          if (parts.length >= 2) {
            v = parts[1].trim();
          }
          REDIS[k] = v;
        });

        return asyncCallback();
      });
    },
    // Redis Keys
    function(asyncCallback) {
      res.locals.cacheDB.keys('*', function(err, keys) {
        if (err) return asyncCallback(err);

        async.eachLimit(keys, 10, function(key, eachCallback) {
          REDIS_KEYS[key] = {
            key             : key,
            type            : null,
            memoryUsage     : 0,
            memoryUsageHuman: 0,
          }

          var keyPattern = key;
          REDIS_KEY_AGG.forEach(function(agg) {
            keyPattern = keyPattern.replace(agg[0], agg[1]);
          });

          REDIS_KEY_PATTERNS[keyPattern] = REDIS_KEY_PATTERNS[keyPattern] || {
            keyPattern     : keyPattern,
            type           : [],
            count          : 0,
            memoryUsageList: [],
          };

          REDIS_KEY_PATTERNS[keyPattern].count += 1;

          async.series([
            // Get type / children count
            function(innerCallback) {
              res.locals.cacheDB.client.type(key, function(err, cacheRes) {
                if (err) return innerCallback(err);

                var type = cacheRes;

                if (type === 'none') {
                  // Do not record non-typed key (expired)
                  delete REDIS_KEYS[key];
                  return eachCallback();
                }

                REDIS_KEYS[key].type = type;

                if (REDIS_KEY_PATTERNS[keyPattern].type.indexOf(type) < 0) {
                  REDIS_KEY_PATTERNS[keyPattern].type.push(type);
                }

                var typeLengthCmdMap = {
                  list: 'llen',
                  hash: 'hlen',
                  set : 'scard',
                  zset: 'zcard',
                };
                if (typeLengthCmdMap[type]) {
                  res.locals.cacheDB.run(typeLengthCmdMap[type], key, function(err, cacheRes) {
                    if (err) return innerCallback(err);

                    var elementCount = parseInt(cacheRes);

                    REDIS_KEYS[key].elementCount = elementCount;

                    if (!REDIS_KEY_PATTERNS[keyPattern].elementCountList) {
                      REDIS_KEY_PATTERNS[keyPattern].elementCountList = [];
                    }
                    REDIS_KEY_PATTERNS[keyPattern].elementCountList.push(elementCount);

                    return innerCallback();
                  })
                } else {
                  return innerCallback();
                }
              })
            },
            // Get memory usage
            function(innerCallback) {
              res.locals.cacheDB.run('MEMORY', 'USAGE', key, 'SAMPLES', '0', function(err, cacheRes) {
                if (err) return innerCallback(err);

                var memoryUsage = parseInt(cacheRes) || 0;

                REDIS_KEYS[key].memoryUsage = memoryUsage;
                if (REDIS_KEYS[key].elementCount) {
                  REDIS_KEYS[key].memoryUsageElement_avg = Math.round(memoryUsage / REDIS_KEYS[key].elementCount);
                }

                REDIS_KEY_PATTERNS[keyPattern].memoryUsageList.push(memoryUsage);

                return innerCallback(err);
              })
            },
          ], eachCallback);
        }, function(err) {
          if (err) return asyncCallback(err);

          // Prepare data
          var keyTypeCount = {};
          for (var key in REDIS_KEYS) {
            var keyDetail = REDIS_KEYS[key];

            // Record count of Key type
            keyTypeCount[keyDetail.type] = keyTypeCount[keyDetail.type] || 0;
            keyTypeCount[keyDetail.type] += 1;

            // Readable size
            REDIS_KEYS[key].memoryUsageHuman = toolkit.byteSizeHuman(REDIS_KEYS[key].memoryUsage).toString();
          }

          for (var keyPattern in REDIS_KEY_PATTERNS) {
            if (REDIS_KEY_PATTERNS[keyPattern].type.length === 0) {
              // Remove non-typed key (expired key)
              delete REDIS_KEY_PATTERNS[keyPattern];
              continue;

            } else if (REDIS_KEY_PATTERNS[keyPattern].type.length === 1) {
              // Display separately if the pattern contains only one key
              REDIS_KEY_PATTERNS[keyPattern].type = REDIS_KEY_PATTERNS[keyPattern].type[0];

            } else {
              // Display by type
              REDIS_KEY_PATTERNS[keyPattern].type = toolkit.noDuplication(REDIS_KEY_PATTERNS[keyPattern].type);
            }

            // Statistics for multiple Keys
            var methods = [ 'total', 'max', 'min', 'avg', 'median', 'p99', 'p95', 'p90'];

            methods.forEach(function(method) {
              if (REDIS_KEY_PATTERNS[keyPattern].count <= 1 && method !== 'total') return;

              var memoryUsageField = `memoryUsage_${method}`;
              REDIS_KEY_PATTERNS[keyPattern][memoryUsageField] = Math.round(toolkit[method](REDIS_KEY_PATTERNS[keyPattern].memoryUsageList));
            })

            // Readable size
            methods.forEach(function(method) {
              if (REDIS_KEY_PATTERNS[keyPattern].count <= 1 && method !== 'total') return;

              var memoryUsageField      = `memoryUsage_${method}`;
              var memoryUsageFieldHuman = `memoryUsageHuman_${method}`;
              REDIS_KEY_PATTERNS[keyPattern][memoryUsageFieldHuman] = toolkit.byteSizeHuman(REDIS_KEY_PATTERNS[keyPattern][memoryUsageField]).toString();
            })

            if (REDIS_KEY_PATTERNS[keyPattern].elementCountList) {
              methods.forEach(function(method) {
                if (REDIS_KEY_PATTERNS[keyPattern].count <= 1 && method !== 'total') return;

                var elementCountField = `elementCount_${method}`;
                REDIS_KEY_PATTERNS[keyPattern][elementCountField] = Math.round(toolkit[method](REDIS_KEY_PATTERNS[keyPattern].elementCountList));
              });
            }

            delete REDIS_KEY_PATTERNS[keyPattern].memoryUsageList;
            delete REDIS_KEY_PATTERNS[keyPattern].elementCountList;
          }

          var sortedRedisKeys = {};
          Object.keys(REDIS_KEY_PATTERNS).sort().forEach(function(key) {
            sortedRedisKeys[key] = REDIS_KEY_PATTERNS[key];
          });
          REDIS_KEY_PATTERNS = sortedRedisKeys;

          // Statistics
          REDIS_ANALYSIS = {
            keyTypeCount            : toolkit.sortJSONKeys(keyTypeCount, 'DESC'),
            topKeyMemoryUsage       : toolkit.sortJSONArray(Object.values(REDIS_KEYS), 'memoryUsage', 'DESC').slice(0, topN),
            topKeyElementCount      : toolkit.sortJSONArray(Object.values(REDIS_KEYS), 'elementCount', 'DESC').slice(0, topN),
            topKeyPatternCount      : toolkit.sortJSONArray(Object.values(REDIS_KEY_PATTERNS), 'count', 'DESC').slice(0, topN),
            topKeyPatternMemoryUsage: toolkit.sortJSONArray(Object.values(REDIS_KEY_PATTERNS), 'memoryUsage_total', 'DESC').slice(0, topN),
          };

          return asyncCallback();
        });
      });
    },
  ], function(err) {
    if (err) return next(err);

    var detailedRedisReport = {
      REDIS,
      REDIS_KEY_PATTERNS,
      REDIS_ANALYSIS,
    };

    var ret = toolkit.initRet(detailedRedisReport);

    // Forced to spend a period of time to prevent users from abusing this feature
    setTimeout(function() {
      return res.locals.sendJSON(ret);
    }, Math.max(0, t1 + 1500 - Date.now()));
  });
};
