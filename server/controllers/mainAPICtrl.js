'use strict';

/* Built-in Modules */
var path = require('path');

/* 3rd-party Modules */
var fs            = require('fs-extra');
var async         = require('async');
var LRU           = require('lru-cache');
var sortedJSON    = require('sorted-json');
var later         = require('@breejs/later');
var moment        = require('moment-timezone');
var byteSize      = require('byte-size');
var HTTPAuthUtils = require('http-auth-utils');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var CONST   = require('../utils/yamlResources').get('CONST');
var toolkit = require('../utils/toolkit');
var auth    = require('../utils/auth');

var scriptSetMod   = require('../models/scriptSetMod');
var scriptMod      = require('../models/scriptMod');
var funcMod        = require('../models/funcMod');
var connectorMod   = require('../models/connectorMod');
var envVariableMod = require('../models/envVariableMod');
var apiAuthMod     = require('../models/apiAuthMod');
var syncAPIMod     = require('../models/syncAPIMod');
var asyncAPIMod    = require('../models/asyncAPIMod');
var cronJobMod     = require('../models/cronJobMod');
var fileServiceMod = require('../models/fileServiceMod');
var userMod        = require('../models/userMod');

var funcAPICtrl = require('./funcAPICtrl');
const { cachedDataVersionTag } = require('v8');

var THROTTLING_RULE_EXPIRES_MAP = {
  bySecond: 1,
  byMinute: 60,
  byHour  : 60 * 60,
  byDay   : 60 * 60 * 24,
  byMonth : 60 * 60 * 24 * 30,
  byYear  : 60 * 60 * 24 * 365,
};

// LRU
var FUNC_CACHE_OPT = {
  max   : CONFIG._LRU_FUNC_CACHE_LIMIT,
  maxAge: CONFIG._LRU_FUNC_CACHE_MAX_AGE * 1000,
};
var FUNC_LRU      = new LRU(FUNC_CACHE_OPT);
var API_AUTH_LRU  = new LRU(FUNC_CACHE_OPT);
var SYNC_API_LRU  = new LRU(FUNC_CACHE_OPT);
var ASYNC_API_LRU = new LRU(FUNC_CACHE_OPT);

var FUNC_RESULT_CACHE_OPT = {
  max   : CONFIG._LRU_FUNC_RESULT_CACHE_LIMIT,
  maxAge: CONFIG._LRU_FUNC_RESULT_CACHE_MAX_AGE * 1000,
}
var FUNC_RESULT_CACHE_LRU = new LRU(FUNC_RESULT_CACHE_OPT);

// Ensure resource dir
fs.ensureDirSync(CONFIG.RESOURCE_ROOT_PATH);

function _getHTTPRequestInfo(req) {
  if (req.path === 'FAKE') {
    return toolkit.jsonCopy(req);
  }

  // Request body
  var httpRequest = {
    method     : req.method.toUpperCase(),
    originalUrl: req.originalUrl,
    url        : path.join(req.baseUrl, req.path),
    host       : req.headers.host,
    hostname   : req.hostname,
    protocol   : req.protocol,
    headers    : req.headers,
    query      : req.query,
    body       : req.body,
    ip         : req.ip,
    ips        : req.ips,
    xhr        : req.xhr,
  };
  return httpRequest;
};

function _getFuncById(locals, funcId, callback) {
  if (!funcId) {
    // Do not run if Func ID is missing
    return callback(new E('EClientNotFound', 'Func ID not specified'));
  }

  var func = FUNC_LRU.get(funcId);
  if (func) return callback(null, func);

  // Use `list` method for getting Scirpt MD5 in the same time
  var funcModel = funcMod.createModel(locals);

  var opt = {
    limit  : 1,
    filters: {
      'func.id': { eq: funcId },
    }
  };
  funcModel.list(opt, function(err, dbRes) {
    if (err) return callback(err);

    dbRes = dbRes[0];
    if (!dbRes) {
      return callback(new E('EClientNotFound', 'No such Func', { funcId: funcId }));
    }

    func = dbRes;
    func.extraConfigJSON = func.extraConfigJSON || {};

    // Set cache
    FUNC_LRU.set(funcId, func);

    return callback(null, func);
  });
};

function _isFuncArgumentPlaceholder(v) {
  for (var i = 0; i < CONFIG._FUNC_ARGUMENT_PLACEHOLDER_LIST.length; i++) {
    if (CONFIG._FUNC_ARGUMENT_PLACEHOLDER_LIST[i] === v) return true;
  }
  return false;
};

function _assignFuncCallKwargs(destFuncCallKwargs, srcFuncCallKwargs) {
  var allKeys = toolkit.noDuplication(Object.keys(destFuncCallKwargs).concat(Object.keys(srcFuncCallKwargs)));
  allKeys.forEach(function(k) {
    var baseV  = destFuncCallKwargs[k];
    var inputV = srcFuncCallKwargs[k];

    if (baseV === undefined && inputV !== undefined) {
      // Extra kwargs, merge
      destFuncCallKwargs[k] = inputV;

    } else if (_isFuncArgumentPlaceholder(baseV) && inputV !== undefined) {
      // Placehoder, merge
      destFuncCallKwargs[k] = inputV;

    } else if (baseV !== undefined && inputV !== undefined) {
      // Since specified fixed kwargs, extra kwargs fields are not allowed
      throw new E('EClientBadRequest', 'Cannot specify a fixed kwargs field', {
        kwargsField: k,
        kwargsValue: inputV,
      });

    } else if (_isFuncArgumentPlaceholder(baseV) && inputV === undefined) {
      // Kwargs not passed
      delete destFuncCallKwargs[k];
    }
  });

  return destFuncCallKwargs;
};

function _createFuncRunnerTaskReq(locals, options, callback) {
  options = toolkit.jsonCopy(options) || {};
  options.funcCallKwargs = options.funcCallKwargs || {};

  var func = null;
  async.series([
    // Get Func
    function(asyncCallback) {
      _getFuncById(locals, options.funcId, function(err, _func) {
        if (err) return asyncCallback(err);

        func = _func;

        return asyncCallback();
      })
    },
  ], function(err) {
    if (err) return callback(err);

    /***** Build Task request *****/
    var taskReq = {
      name: 'Func.Runner',
      kwargs: {
        // Func ID / Kwargs
        funcId        : options.funcId,
        funcCallKwargs: options.funcCallKwargs,

        // Origin
        origin  : options.origin   || 'UNKNOWN',
        originId: options.originId || 'UNKNOWN',

        // HTTP request info
        httpRequest: options.httpRequest || {},

        scriptSetTitle: func.sset_title,
        scriptTitle   : func.scpt_title,
        funcTitle     : func.title,
      },

      // ETA / Delay to run
      eta  : options.eta   || undefined,
      delay: options.delay || undefined,

      // Task Record limit
      taskRecordLimit: options.taskRecordLimit || undefined,

      // If ignore result or not
      ignoreResult: options.ignoreResult,
    };

    // Func result caching: taskReq.cacheResult / cacheResultKey
    if (toolkit.notNothing(func.extraConfigJSON.cacheResult)) {
      var cacheResult = parseInt(func.extraConfigJSON.cacheResult) || false;

      if (cacheResult) {
        var funcCallKwargsDump = sortedJSON.sortify(options.funcCallKwargs, { stringify: true });
        var funcCallKwargsMD5  = toolkit.getMD5(funcCallKwargsDump);

        taskReq.kwargs.cacheResult = cacheResult;
        taskReq.kwargs.cacheResultKey = toolkit.getCacheKey('cache', 'funcCallResult', [
          'funcId'              , func.id,
          'scriptCodeMD5'       , func.scpt_codeMD5,
          'scriptPublishVersion', func.scpt_publishVersion,
          'funcCallKwargsMD5'   , funcCallKwargsMD5]);
      }
    }

    // Queue: taskReq.queue
    //    Priority: Specify directly > Func config > Default
    if (toolkit.notNothing(options.queue)) {
      // Specify directly
      var queueNumber = parseInt(options.queue);
      if (queueNumber < 1 || queueNumber > 9) {
        return callback(new E('EClientBadRequest', 'Invalid options, queue should be an integer between 1 and 9'));
      }

      taskReq.queue = queueNumber;

    } else if (toolkit.notNothing(func.extraConfigJSON.queue)) {
      // Func config
      taskReq.queue = parseInt(func.extraConfigJSON.queue);

    } else {
      // Default
      switch(options.origin) {
        case 'asyncAPI':
          taskReq.queue = CONFIG._FUNC_TASK_QUEUE_ASYNC_API;
          break;

        default:
          taskReq.queue = CONFIG._FUNC_TASK_QUEUE_DEFAULT;
          break;
      }
    }

    // Task run timeout: taskReq.timeout
    //    Priority: Specified directly > Func config > Default
    if (toolkit.notNothing(options.timeout)) {
      // Specified directly
      options.timeout = parseInt(options.timeout);

      if (options.timeout < CONFIG._FUNC_TASK_TIMEOUT_MIN) {
        return callback(new E('EClientBadRequest', 'Invalid options, timeout is too small', { min: CONFIG._FUNC_TASK_TIMEOUT_MIN }));
      }
      if (options.timeout > CONFIG._FUNC_TASK_TIMEOUT_MAX) {
        return callback(new E('EClientBadRequest', 'Invalid options, timeout is too large', { max: CONFIG._FUNC_TASK_TIMEOUT_MAX }));
      }

      taskReq.timeout = options.timeout;

    } else if (toolkit.notNothing(func.extraConfigJSON.timeout)) {
      // Func config
      taskReq.timeout = parseInt(func.extraConfigJSON.timeout);

    } else {
      // Default
      switch(options.origin) {
        case 'asyncAPI':
          // Async API has a separate default timeout
          taskReq.timeout = CONFIG._FUNC_TASK_TIMEOUT_ASYNC_API;
          break;

        default:
          taskReq.timeout = CONFIG._FUNC_TASK_TIMEOUT_DEFAULT;
          break;
      }
    }

    // Task run expires: taskReq.expires
    //    Priority: Specified directly > Func config > Default
    if (toolkit.notNothing(options.expires)) {
      // Specified directly
      options.expires = parseInt(options.expires);

      if (options.expires < CONFIG._FUNC_TASK_EXPIRES_MIN) {
        return callback(new E('EClientBadRequest', 'Invalid options, expires is too small', { min: CONFIG._FUNC_TASK_EXPIRES_MIN }));
      }
      if (options.expires > CONFIG._FUNC_TASK_EXPIRES_MAX) {
        return callback(new E('EClientBadRequest', 'Invalid options, expires is too large', { max: CONFIG._FUNC_TASK_EXPIRES_MAX }));
      }

      taskReq.expires = options.expires;

    } else if (toolkit.notNothing(func.extraConfigJSON.expires)) {
      // Func config
      taskReq.expires = parseInt(func.extraConfigJSON.expires);

    } else {
      // Default
      switch(options.origin) {
        case 'syncAPI':
        case 'asyncAPI':
          // Sync / Async API have the same default expires and timeout
          taskReq.expires = taskReq.timeout || CONFIG._FUNC_TASK_TIMEOUT_DEFAULT;
          break;

        default:
          taskReq.expires = CONFIG._FUNC_TASK_EXPIRES_DEFAULT;
          break;
      }
    }

    // Return type: taskReq.returnType
    //    Priority: Specified directly > Default
    if (toolkit.notNothing(options.returnType)) {
      // Specified directly
      var _RETURN_TYPES = [ 'raw', 'jsonDumps'];
      if (_RETURN_TYPES.indexOf(options.returnType) < 0) {
        return callback(new E('EClientBadRequest', 'Invalid options, invalid returnType', { allowed: _RETURN_TYPES }));
      }

      taskReq.returnType = options.returnType;

    } else {
      // Default
      taskReq.returnType = 'raw';
    }

    // If unbox or not: taskReq.unbox
    //    Priority: Specified directly > Default
    if (toolkit.notNothing(options.unbox)) {
      // Specified directly
      taskReq.unbox = options.unbox;

    } else {
      // Default
      switch(options.origin) {
        case 'direct':
          // Direct call defaults to no unboxing
          taskReq.unbox = false;
          break;

        default:
          // Other calls to default unboxing
          taskReq.unbox = true;
          break
      }
    }

    return callback(null, taskReq);
  });
};

function _createFuncRunnerTaskReqFromHTTPRequest(locals, req, options, callback) {
  options = toolkit.jsonCopy(options) || {};

  // Parse request data
  var reqData = req.method.toLowerCase() === 'get' ? req.query : req.body;
  if ('string' === typeof reqData) {
    // Plain text body
    reqData = { text: reqData };
  } else if (Buffer.isBuffer(reqData)) {
    // Base64 Body
    reqData = { base64: toolkit.getBase64(reqData) }
  } else {
    // JSON Body
    if ('string' === typeof reqData.kwargs) {
      try {
        reqData.kwargs = JSON.parse(reqData.kwargs);
      } catch(err) {
        return callback(new E('EClientBadRequest', 'Invalid kwargs, bad JSON format', {
          error: err.toString(),
        }));
      }
    }

    if ('string' === typeof reqData.options) {
      try {
        reqData.options = JSON.parse(reqData.options);
      } catch(err) {
        return callback(new E('EClientBadRequest', 'Invalid options, bad JSON format', {
          error: err.toString(),
        }));
      }
    }
  }

  // Gen Func calling kwargs
  options.funcCallKwargs = options.funcCallKwargs || {};

  var reqFuncCallKwargs = {}
  var format = req.params.format || 'normal';
  switch(format) {
    case 'normal':
      // Normal format: Func calling kwargs, opitons are in JSON fields
      if (toolkit.notNothing(reqData.kwargs)) {
        reqFuncCallKwargs = reqData.kwargs;
      }
      if (toolkit.notNothing(reqData.options)) {
        Object.assign(options, reqData.options);
      }
      break;

    case 's':
    case 'simplified':
      // Simplified fromat: use request query / body as Func calling kwargs, no options supported
      reqFuncCallKwargs = reqData;
      break;
  }

  try {
    _assignFuncCallKwargs(options.funcCallKwargs, reqFuncCallKwargs);

  } catch(err) {
    // Add Func ID to error
    if (err instanceof E) {
      err.setDetail({ funcId: options.funcId });
    }
    return callback(err);
  }

  // Gen file uploading parameters
  if (req.files && req.files.length > 0) {
    options.funcCallKwargs.files = req.files.map(function(file) {
      return {
        filePath    : file.path,
        originalname: file.originalname,
        encoding    : file.encoding,
        mimetype    : file.mimetype,
        size        : file.size,
      }
    });
  }

  // Add HTTP request info
  options.httpRequest = _getHTTPRequestInfo(req);

  return _createFuncRunnerTaskReq(locals, options, callback);
};

function _createFuncRunnerTaskReqForAPIAuth(locals, req, options, callback) {
  options = toolkit.jsonCopy(options) || {};

  // Add HTTP request info
  options.httpRequest = _getHTTPRequestInfo(req);

  return _createFuncRunnerTaskReq(locals, options, callback);
};

function _getFuncCallResultCache(locals, cacheKey, callback) {
  // 1. Get from local cache
  var lruRes = FUNC_RESULT_CACHE_LRU.get(cacheKey);
  if (lruRes) {
    return callback(null, lruRes);
  }

  // 2. Get from Redis
  locals.cacheDB.get(cacheKey, function(err, cacheRes) {
    if (err) return callback(err);

    if (cacheRes) {
      cacheRes = JSON.parse(cacheRes);
    }

    FUNC_RESULT_CACHE_LRU.set(cacheKey, cacheRes);
    return callback(err, cacheRes);
  });
};

function _callFuncRunner(locals, taskReq, callback) {
  callback = toolkit.ensureFn(callback);

  if (taskReq.ignoreResult) {
    // Ignore result, skip callback function
    return locals.cacheDB.putTask(taskReq, function(err, taskId) {
      if (err) return callback(err);
      return callback(null, taskId);
    });

  } else {
    // Recive result
    taskReq.onResponse = function(taskResp) {
      async.series([
        // Error handling
        function(asyncCallback) {
          switch(taskResp.status) {
            case 'noResponse':
              return asyncCallback(new E('EWorkerNoResponse', 'Worker no response, please check the status of this system'));

            case 'failure':
              return asyncCallback(new E('EFuncFailed', 'Func task failed', {
                exception: taskResp.exception,
                traceback: taskResp.traceback,
              }));

            case 'timeout':
              return asyncCallback(new E('EFuncTimeout', 'Func task timeout', {
                exception: taskResp.exception,
                traceback: taskResp.traceback,
              }));

            case 'skip':
              return asyncCallback(new E('EFuncFailed', 'Func task skipped', {
                exception: taskResp.exception,
                traceback: taskResp.traceback,
              }));

            case 'success':
              if ('string' === typeof taskResp.result) {
                // Error: Result cannot be prased
                return asyncCallback(new E('EFuncResultParsingFailed', 'Cannot parse task result', {
                  result: taskResp.result,
                }));
              }

              return asyncCallback();
          }
        },
      ], function(err) {
        return callback(err, taskResp);
      });
    };

    async.series([
      // Return cached result
      function(asyncCallback) {
        if (!taskReq.kwargs.cacheResultKey) return asyncCallback();

        _getFuncCallResultCache(locals, taskReq.kwargs.cacheResultKey, function(err, cacheRes) {
          if (err) {
            // Call Func when get result cache error occured
            locals.logger.logError(err);
            return asyncCallback();
          }

          if (!cacheRes) {
            // Call Func if no result cache
            return asyncCallback();

          } else {
            // Call Task response function when result cache hit
            var taskResp = cacheRes;
            taskResp.isCached = true;

            return taskReq.onResponse(taskResp);
          }
        });
      },
    ], function(err) {
      if (err) return callback(err);
      return locals.cacheDB.putTask(taskReq);
    });
  }
};

function _callFuncDebugger(locals, options, callback) {
  var taskReq = {
    name: 'Func.Debugger',
    kwargs: {
      funcId        : options.funcId         || options.scriptId,
      funcCallKwargs: options.funcCallKwargs || {},

      // Origin
      origin  : options.origin   || 'UNKNOWN',
      originId: options.originId || 'UNKNOWN',

      // HTTP request info
      httpRequest: options.httpRequest || {},
    },
    queue  : CONFIG._FUNC_TASK_QUEUE_DEBUGGER,
    timeout: CONFIG._FUNC_TASK_TIMEOUT_DEBUGGER,

    onResponse(taskResp) {
      switch(taskResp.status) {
        case 'noResponse':
          return callback(new E('EWorkerNoResponse', 'Worker no response, please check the status of this system'));

        case 'timeout':
          return callback(new E('EFuncTimeout', 'Func task timeout', taskResp));

        case 'success':
          return callback(null, taskResp);

        default:
          return callback(new E('EAssert', 'Unexpected result.'));
      }
    }
  }
  return locals.cacheDB.putTask(taskReq);
};

function _doAPIResponse(res, taskReq, taskResp, callback) {
  var responseControl = taskResp.result.responseControl || {};
  var returnValue     = taskResp.result.returnValue     || null;

  // Cache marker
  if (taskResp.isCached) {
    res.set(CONFIG._WEB_IS_CACHED_HEADER, 'Cached');
  }

  // Response control
  if (responseControl.statusCode) {
    res.status(responseControl.statusCode);
  }

  if (responseControl.headers) {
    res.set(responseControl.headers);
  }

  if (!responseControl.allow304) {
    res.set('Last-Modified', (new Date()).toUTCString());
  }

  if (responseControl.filePath) {
    // Read data from file
    var filePath = path.join(CONFIG.RESOURCE_ROOT_PATH, responseControl.filePath.replace(/^\/+/, ''));

    fs.readFile(filePath, function(err, buffer) {
      if (err) return callback(err);

      // File name defaults to the original file name
      var fileName = filePath.split('/').pop();
      if ('string' === typeof responseControl.download) {
        // Specified download name
        fileName = responseControl.download;
      }

      if (responseControl.download === false) {
        // Non-download mode
        res.locals.sendRaw(buffer, fileName);
      } else {
        // Download mode
        res.locals.sendFile(buffer, fileName);
      }

      // Delete downloaded file automatically
      if (responseControl.autoDelete) {
        fs.remove(filePath);
      }

      return;
    });

  } else {
    // Return data directly
    if (responseControl.download) {
      // Download as file
      var file     = returnValue;
      var fileName = responseControl.download;
      if ('string' !== typeof fileName) {
        var fileExt = typeof file === 'object' ? 'json' : 'txt';
        fileName = `api-resp.${fileExt}`;
      }
      return res.locals.sendFile(file, fileName);

    } else {
      // Return as data

      // When specified response type:
      //    `returnType` must be "raw"
      //    `unbox`      must be true
      var returnType = taskReq.returnType;
      var unbox      = taskReq.unbox;
      if (responseControl.contentType) {
        returnType = 'raw';
        unbox      = true;
      }

      // Convert the format according to `returnType`
      switch(returnType) {
        case 'raw':
          // Nope
          break;

        case 'jsonDumps':
          returnValue = JSON.stringify(returnValue);
          break;
      }

      // Unbox
      if (unbox) {
        // Send raw data type when unbox
        return res.locals.sendRaw(returnValue, responseControl.contentType);

      } else {
        // Send JSON data wrapped in `data.result` when not unbox
        var ret = toolkit.initRet({
          result: returnValue,
        });
        return res.locals.sendJSON(ret);
      }
    }
  }
};

function __matchedFixedFields(req, fields) {
  var result = false;

  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];

    if (f.location === 'header') {
      // Header field
      result = (req.get(f.name) === f.value);

    } else {
      // Non-header field
      try {
        var fullPath = toolkit.strf('{0}.{1}', f.location, f.name);
        result = (toolkit.jsonFind(req, fullPath) === f.value)
      } catch(_) {}
      try { delete req[f.location][f.name] } catch(_) {}
    }

    if (result) break;
  }
  return result;
};

function __getHTTPAuth(type, req, res, callback) {
  type = type.toLowerCase();

  var authInfo = null;

  var authString = req.get('Authorization');
  if (!authString || !toolkit.startsWith(authString.toLowerCase(), type + ' ')) return callback();

  var data = authString.slice(type.length + 1);
  switch(type) {
    case 'basic':
      var splitted = toolkit.fromBase64(data).split(':');
      authInfo = {
        hash    : data,
        username: splitted[0],
        password: splitted.slice(1).join(':'),
      }
      return callback(null, authInfo);
      break;

    case 'digest':
      authInfo = toolkit.parseKVString(data);
      authInfo.hash = authInfo.response;

      var tags = [
        'realm', authInfo.realm,
        'nonce', authInfo.nonce,
      ]
      var cacheKey = toolkit.getCacheKey('cache', 'httpAuth', tags);
      res.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
        if (err) return callback(err);

        if (cacheRes) {
          return callback(null, authInfo);
        } else {
          return callback(null, null);
        }
      });
      break;

    default:
      return callback();
      break;
  }
};

function __checkHTTPAuth(type, req, authInfo, password) {
  var expectedHash = HTTPAuthUtils[type.toUpperCase()].computeHash({
    username : authInfo.username,
    realm    : authInfo.realm,
    password : password,
    method   : req.method.toUpperCase(),
    uri      : authInfo.uri,
    nonce    : authInfo.nonce,
    nc       : authInfo.nc,
    cnonce   : authInfo.cnonce,
    qop      : authInfo.qop,
    algorithm: 'md5',
  });
  return expectedHash === authInfo.hash;
};

function __askHTTPAuth(type, res, realm, callback) {
  var nonce = toolkit.genUUID();

  var tags = [
    'realm', realm,
    'nonce', nonce,
  ]
  var cacheKey = toolkit.getCacheKey('cache', 'httpAuth', tags);
  res.locals.cacheDB.setex(cacheKey, CONFIG._HTTP_AUTH_NONCE_MAX_AGE, 'x', function(err) {
    if (err) return callback(err);

    var authMechanism = HTTPAuthUtils[type.toUpperCase()];
    var authOpt = {
      realm : realm,
      qop   : 'auth',
      nonce : nonce,
      opaque: 'DataFlux Func Love You!',
    };
    var wwwAuthString = HTTPAuthUtils.buildWWWAuthenticateHeader(authMechanism, authOpt);

    res.set('WWW-Authenticate', wwwAuthString);
    return callback(new E('EAPIAuth', toolkit.strf('HTTP {0} Auth failed', type)));
  });
};

function __callAuthFunc(req, res, apiAuth, callback) {
  var taskReq = null;
  async.series([
    // Create Func calling request
    function(asyncCallback) {
      var opt = {
        funcId  : apiAuth.configJSON.funcId,
        origin  : 'apiAuth',
        originId: apiAuth.id
      }
      _createFuncRunnerTaskReqForAPIAuth(res.locals, req, opt, function(err, _taskReq) {
        if (err) return asyncCallback(err);

        taskReq = _taskReq;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);

    _callFuncRunner(res.locals, taskReq, function(err, taskResp) {
      if (err) return callback(err);

      var isValidAuth = false;
      try { isValidAuth = !!taskResp.result } catch(_) {};

      return callback(null, isValidAuth);
    });
  });
};

function _doAPIAuth(locals, req, res, apiAuthId, realm, callback) {
  var apiAuth = null;
  async.series([
    // Get API Auth config
    function(asyncCallback) {
      apiAuth = API_AUTH_LRU.get(apiAuthId);
      if (apiAuth === null) {
        // Skip if not exist
        return asyncCallback();

      } else if (apiAuth) {
        // Skip if cached
        return asyncCallback();
      }

      var apiAuthModel = apiAuthMod.createModel(locals);

      apiAuthModel._get(apiAuthId, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!dbRes) {
          // Cache as `null` if not exist
          API_AUTH_LRU.set(apiAuthId, null);
          return asyncCallback();
        }

        apiAuth = dbRes;
        API_AUTH_LRU.set(apiAuthId, apiAuth);

        return asyncCallback();
      });
    },
    // Do API auth
    function(asyncCallback) {
      if (!apiAuth) return asyncCallback();

      locals.logger.info('[API AUTH] Type: {0}', apiAuth.type);

      switch(apiAuth.type) {
        case 'fixedField':
          var fields = apiAuth.configJSON.fields;
          if (!__matchedFixedFields(req, fields)) {
            return asyncCallback(new E('EAPIAuth', 'Fixed Field Auth failed'));
          }
          return asyncCallback();
          break;

        case 'httpBasic':
        case 'httpDigest':
          var authType = apiAuth.type.replace(/^http/g, '');

          __getHTTPAuth(authType, req, res, function(err, authInfo) {
            if (err) return asyncCallback(err);

            var users = apiAuth.configJSON.users;
            if (!authInfo || toolkit.isNothing(users)) {
              // Ask HTTP auth if no auth info sent / no auth config set
              return __askHTTPAuth(authType, res, realm, asyncCallback);
            }

            // Find auth user
            var matchedUser = users.filter(function(x) {
              return x.username === authInfo.username;
            })[0];

            if (!matchedUser) {
              // No matched user
              return __askHTTPAuth(authType, res, realm, asyncCallback);

            } else {
              var salt = `~${apiAuthId}~${matchedUser.username}~`;
              var password = toolkit.decipherByAES(matchedUser.passwordCipher, CONFIG.SECRET, salt);
              if (!__checkHTTPAuth(authType, req, authInfo, password)) {
                return __askHTTPAuth(authType, res, realm, asyncCallback);
              }
            }

            return asyncCallback();
          });
          break;

        case 'func':
          __callAuthFunc(req, res, apiAuth, function(err, isValidAuth) {
            if (err) return asyncCallback(err);

            if (!isValidAuth) {
              return asyncCallback(new E('EAPIAuth', 'Func Auth failed'));
            }

            return asyncCallback();
          });
          break;

        default:
          return asyncCallback();
      }
    },
  ], function(err) {
    if (err) return callback(err);
    return callback();
  });
};

/* Handlers */
exports.overview = function(req, res, next) {
  var now = toolkit.getTimestamp();

  var sections = toolkit.asArray(req.query.sections);
  var sectionMap = null;
  if (toolkit.notNothing(sections)) {
    sectionMap = {};
    sections.forEach(function(s) {
      sectionMap[s] = true;
    })
  }

  var scriptSetModel   = scriptSetMod.createModel(res.locals);
  var scriptModel      = scriptMod.createModel(res.locals);
  var funcModel        = funcMod.createModel(res.locals);
  var connectorModel   = connectorMod.createModel(res.locals);
  var envVariableModel = envVariableMod.createModel(res.locals);
  var syncAPIModel     = syncAPIMod.createModel(res.locals);
  var cronJobModel     = cronJobMod.createModel(res.locals);
  var asyncAPIModel    = asyncAPIMod.createModel(res.locals);
  var fileServiceModel = fileServiceMod.createModel(res.locals);
  var userModel        = userMod.createModel(res.locals);

  var bizEntityMeta = [
    { name : 'scriptSet',   model: scriptSetModel   },
    { name : 'script',      model: scriptModel      },
    { name : 'func',        model: funcModel        },
    { name : 'connector',   model: connectorModel   },
    { name : 'envVariable', model: envVariableModel },
    { name : 'syncAPI',     model: syncAPIModel     },
    { name : 'asyncAPI',    model: asyncAPIModel    },
    { name : 'cronJob',     model: cronJobModel     },
    { name : 'fileService', model: fileServiceModel },
    { name : 'user',        model: userModel        },
  ];

  var overview = {
    services   : [],
    queues     : [],
    bizMetrics : [],
    bizEntities: [],
  };

  if (!sectionMap || sectionMap.queues) {
    for (var i = 0; i < CONFIG._WORKER_QUEUE_COUNT; i++) {
      overview.queues[i] = {
        queue            : i,
        workerCount      : 0,
        processCount     : 0,
        delayQueueLength : 0,
        workerQueueLength: 0,
        workerQueueLimit : 0,
        workerQueueLoad  : 0,
      }
    }
  }

  var SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET = CONST.systemSettings.SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET;
  var SCRIPT_SET_HIDDEN_BUILTIN                = CONST.systemSettings.SCRIPT_SET_HIDDEN_BUILTIN;
  var SCRIPT_SET_HIDDEN_BLUEPRINT              = CONST.systemSettings.SCRIPT_SET_HIDDEN_BLUEPRINT;
  var nonScriptSetOrigins                      = [];
  var nonScriptSetOriginIds                    = [];
  async.series([
    // Get system settings
    function(asyncCallback) {
      var keys = [
        'SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET',
        'SCRIPT_SET_HIDDEN_BUILTIN',
        'SCRIPT_SET_HIDDEN_BLUEPRINT',
      ]
      res.locals.getSystemSettings(keys, function(err, systemSettings) {
        if (err) return asyncCallback(err);

        SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET = systemSettings.SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET;
        if (SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET) {
          nonScriptSetOriginIds.push('smkt-official');
        }

        SCRIPT_SET_HIDDEN_BUILTIN = systemSettings.SCRIPT_SET_HIDDEN_BUILTIN;
        if (SCRIPT_SET_HIDDEN_BUILTIN) {
          nonScriptSetOrigins.push('builtin');
        }

        SCRIPT_SET_HIDDEN_BLUEPRINT = systemSettings.SCRIPT_SET_HIDDEN_BLUEPRINT;
        if (SCRIPT_SET_HIDDEN_BLUEPRINT) {
          nonScriptSetOrigins.push('blueprint');
        }

        return asyncCallback();
      });
    },
    // Get running services
    function(asyncCallback) {
      if (sectionMap && !sectionMap.services) return asyncCallback();

      var cacheKey = toolkit.getMonitorCacheKey('heartbeat', 'serviceInfo');
      res.locals.cacheDB.hgetallExpires(cacheKey, CONFIG._MONITOR_REPORT_EXPIRES, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        // Get service list
        for (var field in cacheRes) {
          var parsedTags = toolkit.parseColonTags(field);
          var cacheData  = cacheRes[field];

          overview.services.push({
            ts        : cacheData.ts,
            timeDiffMs: cacheData.timeDiffMs || 0,
            hostname  : parsedTags.hostname,
            pid       : parsedTags.pid,
            name      : cacheData.name,
            uptime    : cacheData.uptime,
            version   : cacheData.version,
            edition   : cacheData.edition,
            queues    : cacheData.queues,
            ttl       : Math.max(0, cacheData.ts + CONFIG._MONITOR_REPORT_EXPIRES - now),
          });
        }

        // Sort services
        var serviceOrder = [ 'server', 'worker', 'beat' ];
        overview.services.sort(function(a, b) {
          var serviceOrder_a = serviceOrder.indexOf(a.name);
          var serviceOrder_b = serviceOrder.indexOf(b.name);

          var queueDumps_a = toolkit.jsonDumps(a.queues || []);
          var queueDumps_b = toolkit.jsonDumps(b.queues || []);

          if (serviceOrder_a < serviceOrder_b) return -1;
          else if (serviceOrder_a > serviceOrder_b) return 1;
          else
            if (queueDumps_a < queueDumps_b) return -1;
            else if (queueDumps_a > queueDumps_b) return 1;
            else
              if (a.ttl > b.ttl) return -1;
              else if (a.ttl < b.ttl) return 1;
              else return 0
        });

        return asyncCallback();
      });
    },
    // Worker count on each queue
    function(asyncCallback) {
      if (sectionMap && !sectionMap.queues) return asyncCallback();

      var cacheKey = toolkit.getMonitorCacheKey('heartbeat', 'workerCountOnQueue');
      res.locals.cacheDB.hgetallExpires(cacheKey, CONFIG._MONITOR_REPORT_EXPIRES, function(err, cacheRes) {
        if (err) return asyncCallback(err);
        if (!cacheRes) return asyncCallback();

        for (var q in cacheRes) {
          overview.queues[q].workerCount = parseInt(cacheRes[q].workerCount || 0) || 0;
        }

        return asyncCallback();

      });
    },
    // Process count on each queue
    function(asyncCallback) {
      if (sectionMap && !sectionMap.queues) return asyncCallback();

      var cacheKey = toolkit.getMonitorCacheKey('heartbeat', 'processCountOnQueue');
      res.locals.cacheDB.hgetallExpires(cacheKey, CONFIG._MONITOR_REPORT_EXPIRES, function(err, cacheRes) {
        if (err) return asyncCallback(err);
        if (!cacheRes) return asyncCallback();

        for (var q in cacheRes) {
          overview.queues[q].processCount = parseInt(cacheRes[q].processCount || 0) || 0;
        }

        return asyncCallback();

      });
    },
    // Worker queue, delayed queue length
    function(asyncCallback) {
      if (sectionMap && !sectionMap.queues) return asyncCallback();

      async.timesSeries(CONFIG._WORKER_QUEUE_COUNT, function(q, timesCallback) {
        async.series([
          function(innerCallback) {
            var workerQueue = toolkit.getWorkerQueue(q);
            res.locals.cacheDB.run('llen', workerQueue, function(err, cacheRes) {
              if (err) return innerCallback(err);

              var length = parseInt(cacheRes || 0) || 0;
              overview.queues[q].workerQueueLength = length;

              // Compute queue load (via Task count to each queue)
              overview.queues[q].workerQueueLoad = parseInt(length / (overview.queues[q].processCount || 1));

              return innerCallback();
            });
          },
          function(innerCallback) {
            var delayQueue = toolkit.getDelayQueue(q);
            res.locals.cacheDB.run('zcard', delayQueue, function(err, cacheRes) {
              if (err) return innerCallback(err);

              overview.queues[q].delayQueueLength = parseInt(cacheRes || 0) || 0;

              return innerCallback();
            });
          },
        ], timesCallback);
      }, asyncCallback);
    },
    // Worker queue limit
    function(asyncCallback) {
      if (sectionMap && !sectionMap.queues) return asyncCallback();

      var cacheKey = toolkit.getGlobalCacheKey('cache', 'workerQueueLimitCronJob');
      res.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (!cacheRes) return asyncCallback();

        cacheRes = JSON.parse(cacheRes);
        for (var queue in cacheRes) {
          overview.queues[queue].workerQueueLimit = cacheRes[queue];
        }

        return asyncCallback();
      });
    },
    // Biz metrics
    function(asyncCallback) {
      if (sectionMap && !sectionMap.bizMetrics) return asyncCallback();

      var cronJobs = [];
      async.series([
        // Get all Cron Jobs
        function(innerCallback) {
          var opt = {
            fields: [
              'cron.id',
              'cron.cronExpr',
              'func.extraConfigJSON',
            ],
            filters: {
              'cron.isDisabled': { eq: false },
              'func.id'        : { isnotnull: true },
            },
          }
          cronJobModel.list(opt, function(err, dbRes) {
            if (err) return innerCallback(err);

            cronJobs = dbRes;

            // Get extraConfigJSON.fixedCronExpr
            cronJobs.forEach(function(c) {
              c.extraConfigJSON = c.extraConfigJSON || {};
              c.fixedCronExpr = c.extraConfigJSON.fixedCronExpr;
            });

            return innerCallback();
          });
        },
        // Add dynamic Cron expr
        function(innerCallback) {
          if (toolkit.isNothing(cronJobs)) return innerCallback();

          var dataIds  = toolkit.arrayElementValues(cronJobs, 'id');
          var cacheKey = toolkit.getGlobalCacheKey('cronJob', 'dynamicCronExpr');
          res.locals.cacheDB.hmget(cacheKey, dataIds, function(err, cacheRes) {
            if (err) return innerCallback(err);

            var now = toolkit.getTimestamp();
            cronJobs.forEach(function(d) {
              d.dynamicCronExpr = null;

              var dynamicCronExpr = cacheRes[d.id];
              if (!dynamicCronExpr) return;

              dynamicCronExpr = JSON.parse(dynamicCronExpr);
              if (dynamicCronExpr.expireTime && dynamicCronExpr.expireTime < now) return;

              d.dynamicCronExpr = dynamicCronExpr.value;
            });

            return innerCallback();
          });
        },
        // Add Cron Job pause flag
        function(innerCallback) {
          if (toolkit.isNothing(cronJobs)) return innerCallback();

          var dataIds  = toolkit.arrayElementValues(cronJobs, 'id');
          var cacheKey = toolkit.getGlobalCacheKey('cronJob', 'pause');
          res.locals.cacheDB.hmget(cacheKey, dataIds, function(err, cacheRes) {
            if (err) return innerCallback(err);

            var now = toolkit.getTimestamp();
            cronJobs.forEach(function(d) {
              d.isPaused = false;

              var pauseExpireTime = cacheRes[d.id];
              if (!pauseExpireTime) return;

              pauseExpireTime = parseInt(pauseExpireTime);
              if (pauseExpireTime && pauseExpireTime < now) return;

              d.isPaused = true;
            });

            return innerCallback();
          });
        },
        // Compute the count of Cron Jobs trigger for the next 24 hours
        function(innerCallback) {
          var baseTimestamp = moment(moment().format('YYYY-MM-DDT00:00:01Z')).unix() * 1000;

          var totalTriggerCount   = 0;
          var cronTriggerCountMap = {}
          cronJobs.forEach(function(c) {
            var cronExpr = c.dynamicCronExpr || c.extraConfigJSON.fixedCronExpr || c.cronExpr;
            if (!cronExpr) return;

            if (c.isPaused) return;

            var tickCount = cronTriggerCountMap[cronExpr];
            if (toolkit.notNothing(tickCount)) {
              totalTriggerCount += tickCount;
              return;
            }

            var start = new Date(baseTimestamp);
            var end   = new Date(baseTimestamp + (3600 * 24 * 1000));
            var cron = later.parse.cron(cronExpr);

            var tickCount = 0
            while (true) {
              var r = later.schedule(cron).next(1000, start, end);
              if (!r || r.length === 0) break;

              start = r.pop();

              if (r.length > 0) {
                tickCount += r.length;
              } else {
                tickCount += 1;
                break;
              }
            }

            cronTriggerCountMap[cronExpr] = tickCount;
            totalTriggerCount += tickCount;
          });

          overview.bizMetrics.push({
            title    : 'Cron Job',
            subTitle : 'Triggers Per Second',
            value    : parseFloat((totalTriggerCount / (3600 * 24)).toFixed(1)),
            isBuiltin: true,
          });
          overview.bizMetrics.push({
            title    : 'Cron Job',
            subTitle : 'Triggers Per Minute',
            value    : parseFloat((totalTriggerCount / (60 * 24)).toFixed(1)),
            isBuiltin: true,
          });
          overview.bizMetrics.push({
            title    : 'Cron Job',
            subTitle : 'Triggers Per Hour',
            value    : parseFloat((totalTriggerCount / 24).toFixed(1)),
            isBuiltin: true,
          });
          overview.bizMetrics.push({
            title    : 'Cron Job',
            subTitle : 'Triggers Per Day',
            value    : parseFloat((totalTriggerCount).toFixed(1)),
            isBuiltin: true,
          });

          return innerCallback();
        },
      ], asyncCallback);
    },
    // Biz entity count
    function(asyncCallback) {
      if (sectionMap && !sectionMap.bizEntities) return asyncCallback();

      async.eachSeries(bizEntityMeta, function(meta, eachCallback) {
        var useHidden = false;

        // Exclude hided Script Sets
        var sql = res.locals.db.createSQLBuilder();
        switch(meta.name) {
          case 'scriptSet':
            useHidden = true;
            sql
              .SELECT_COUNT()
              .FROM('biz_main_script_set', 'sset')
            break;

          case 'script':
            useHidden = true;
            sql
              .SELECT_COUNT()
              .FROM('biz_main_script', 'scpt')
              .JOIN('biz_main_script_set', 'sset', {
                'scpt.scriptSetId': 'sset.id',
              })
            break;

          case 'func':
            useHidden = true;
            sql
              .SELECT_COUNT()
              .FROM('biz_main_func', 'func')
              .JOIN('biz_main_script', 'scpt', {
                'func.scriptId': 'scpt.id',
              })
              .JOIN('biz_main_script_set', 'sset', {
                'scpt.scriptSetId': 'sset.id',
              })
            break;

          case 'syncAPI':
          case 'asyncAPI':
          case 'cronJob':
            sql
              .SELECT([
                sql.FUNC('COUNT', sql.RAW('*'),            'count'),
                sql.FUNC('SUM',   sql.FIELD('isDisabled'), 'disabledCount'),
              ])
              .FROM(meta.model.tableName)
            break;

          default:
            sql
              .SELECT_COUNT()
              .FROM(meta.model.tableName)
            break;
        }

        var opt = { baseSQL: sql };
        if (useHidden) {
          opt.filters = opt.filters || {};
          if (nonScriptSetOrigins.length   > 0) opt.filters['sset.origin']   = { notin: nonScriptSetOrigins   };
          if (nonScriptSetOriginIds.length > 0) opt.filters['sset.originId'] = { notin: nonScriptSetOriginIds };
        }

        opt.orders = false;
        meta.model._list(opt, function(err, dbRes) {
          if (err) return eachCallback(err);

          var d = {
            name : meta.name,
            count: dbRes[0].count,
          };

          if ('disabledCount' in dbRes[0]) {
            d.countEnabled = dbRes[0].count - (dbRes[0].disabledCount || 0);
          }

          overview.bizEntities.push(d);

          return eachCallback();
        });
      }, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    if (sectionMap) {
      Object.keys(overview).forEach(function(k) {
        if (!sectionMap[k]) {
          delete overview[k];
        }
      })
    }

    var ret = toolkit.initRet(overview);
    return res.locals.sendJSON(ret, { muteLog: true });
  });
};

exports.describeFunc = function(req, res, next) {
  var funcId = req.params.funcId;

  var funcModel = funcMod.createModel(res.locals);

  var func = null;

  async.series([
    function(asyncCallback) {
      funcModel.getWithCheck(funcId, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        func = dbRes;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(func);
    return res.locals.sendJSON(ret);
  });
};

exports.callFunc = function(req, res, next) {
  var funcId  = req.params.funcId;
  var options = req.body.options || {};

  var taskReq = null;
  async.series([
    // Create Func calling request
    function(asyncCallback) {
      var opt = {
        funcId  : funcId,
        origin  : 'direct',
        originId: 'direct',
      }
      _createFuncRunnerTaskReqFromHTTPRequest(res.locals, req, opt, function(err, _taskReq) {
        if (err) return asyncCallback(err);

        taskReq = _taskReq;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    if (options.async) {
      // Async call
      taskReq.ignoreResult = true;
      _callFuncRunner(res.locals, taskReq, function(err, taskId) {
        if (err) return next(err);

        var ret = toolkit.initRet({ id: taskId });
        return res.locals.sendJSON(ret);
      });

    } else {
      // Sync call
      _callFuncRunner(res.locals, taskReq, function(err, taskResp) {
        if (err) return next(err);
        return _doAPIResponse(res, taskReq, taskResp, next);
      });
    }
  });
};

exports.callFuncMany = function(req, res, next) {
  var calls = req.body.calls || [];

  var taskIds = [];
  async.eachLimit(calls, 10, function(call, eachCallback) {
    var options = call.options || {};
    var opt = {
      funcId        : call.funcId,
      funcCallKwargs: call.kwargs || {},
      origin        : 'direct',
      originId      : 'direct',
      httpRequest   : _getHTTPRequestInfo(req),
      eta           : options.eta,
      delay         : options.delay,
      ignoreResult  : true,
    }

    var taskReq = null;
    async.series([
      function(asyncCallback) {
        _createFuncRunnerTaskReq(res.locals, opt, function(err, _taskReq) {
          if (err) return asyncCallback(err);

          taskReq = _taskReq;

          return asyncCallback();
        });
      },
      function(asyncCallback) {
        _callFuncRunner(res.locals, taskReq, function(err, taskId) {
          if (err) return asyncCallback(err);

          taskIds.push(taskId);

          return asyncCallback();
        });
      }
    ], eachCallback);
  }, function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({ ids: taskIds });
    return res.locals.sendJSON(ret);
  });
};

exports.callFuncDraft = function(req, res, next) {
  // Func ID, kwargs
  var funcId         = req.params.funcId;
  var funcCallKwargs = req.body.kwargs || {};

  var opt = {
    funcId        : funcId,
    funcCallKwargs: funcCallKwargs,

    origin  : 'direct',
    originId: funcId,
  }

  // Add HTTP request info
  opt.httpRequest = _getHTTPRequestInfo(req);

  return _callFuncDebugger(res.locals, opt, function(err, taskResp) {
    if (err) return next(err);

    var ret = toolkit.initRet(taskResp);
    res.locals.sendJSON(ret);
  });
};

exports.callSyncAPI = function(req, res, next) {
  var id = req.params.id;

  var taskReq = null;
  var syncAPI = null;
  async.series([
    // Check if Sync API exists
    function(asyncCallback) {
      syncAPI = SYNC_API_LRU.get(id);

      if (syncAPI === null) {
        // Skip when not exist
        return asyncCallback(new E('EClientNotFound', 'No such Sync API', { id: id }));

      } else if (syncAPI) {
        // Skip cached
        return asyncCallback();
      }

      var syncAPIModel = syncAPIMod.createModel(res.locals);

      syncAPIModel._get(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!dbRes) {
          // Cache as `null` if not exist
          SYNC_API_LRU.set(id, null);
          return asyncCallback(new E('EClientNotFound', 'No such Sync API', { id: id }));
        }

        syncAPI = dbRes;
        SYNC_API_LRU.set(id, syncAPI);

        return asyncCallback();
      });
    },
    // Check API Auth
    function(asyncCallback) {
      if (!syncAPI.apiAuthId) return asyncCallback();

      var realm = 'SyncAPI:' + syncAPI.id;
      _doAPIAuth(res.locals, req, res, syncAPI.apiAuthId, realm, asyncCallback);
    },
    // Check limit
    function(asyncCallback) {
      // Check if disabled or not
      if (syncAPI.isDisabled) {
        return asyncCallback(new E('EBizCondition.SyncAPIDisabled', 'This Sync API is disabled'))
      }

      // Check if expired or not
      if (syncAPI.expireTime && new Date(syncAPI.expireTime) < toolkit.getTimestamp()) {
        return asyncCallback(new E('EBizCondition.SyncAPIExpired', 'This Sync API is already expired'))
      }

      // Check throttling
      if (toolkit.isNothing(syncAPI.throttlingJSON)) return asyncCallback();

      async.eachOfSeries(syncAPI.throttlingJSON, function(limit, rule, eachCallback) {
        var ruleSep = parseInt(Date.now() / 1000 / THROTTLING_RULE_EXPIRES_MAP[rule]);
        var tags = [
          'syncAPIId', id,
          'rule'     , rule,
          'ruleSep'  , ruleSep,
        ];
        var cacheKey = toolkit.getCacheKey('throttling', 'syncAPI', tags);

        res.locals.cacheDB.incr(cacheKey, function(err, cacheRes) {
          if (err) return eachCallback(err);

          var currentCount = parseInt(cacheRes);
          if (currentCount > limit) {
            // Match throttling
            var waitSeconds = parseInt((ruleSep + 1) * THROTTLING_RULE_EXPIRES_MAP[rule] - Date.now() / 1000) + 1;
            return eachCallback(new E('EClientRateLimit.APIThrottling', 'Maximum calling rate exceeded', {
              rule        : rule,
              limit       : limit,
              currentCount: currentCount,
              waitSeconds : waitSeconds,
            }));

          } else {
            // Update expire time
            res.locals.cacheDB.expire(cacheKey, THROTTLING_RULE_EXPIRES_MAP[rule]);
          }

          return eachCallback();
        });

      }, asyncCallback);
    },
    // Create Func calling request
    function(asyncCallback) {
      var opt = {
        funcId         : syncAPI.funcId,
        funcCallKwargs : syncAPI.funcCallKwargsJSON,
        origin         : 'syncAPI',
        originId       : syncAPI.id,
        taskRecordLimit: syncAPI.taskRecordLimit,
      }
      _createFuncRunnerTaskReqFromHTTPRequest(res.locals, req, opt, function(err, _taskReq) {
        if (err) return asyncCallback(err);

        taskReq = _taskReq;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    _callFuncRunner(res.locals, taskReq, function(err, taskResp) {
      if (err) return next(err);
      return _doAPIResponse(res, taskReq, taskResp, next);
    });
  });
};

exports.callAsyncAPI = function(req, res, next) {
  var id = req.params.id;

  var taskReq  = null;
  var asyncAPI = null;
  async.series([
    // Check Async API exists
    function(asyncCallback) {
      asyncAPI = ASYNC_API_LRU.get(id);

      if (asyncAPI === null) {
        // Skip when not exist
        return asyncCallback(new E('EClientNotFound', 'No such Async API', { id: id }));

      } else if (asyncAPI) {
        // Skip cached
        return asyncCallback();
      }

      var asyncAPIModel = asyncAPIMod.createModel(res.locals);

      asyncAPIModel._get(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!dbRes) {
          // Cache as `null` if not exist
          ASYNC_API_LRU.set(id, null);
          return asyncCallback(new E('EClientNotFound', 'No such Async API', { id: id }));
        }

        asyncAPI = dbRes;
        ASYNC_API_LRU.set(id, asyncAPI);

        return asyncCallback();
      });
    },
    // Check API Auth
    function(asyncCallback) {
      if (!asyncAPI.apiAuthId) return asyncCallback();

      var realm = 'AsyncAPI:' + asyncAPI.id;
      _doAPIAuth(res.locals, req, res, asyncAPI.apiAuthId, realm, asyncCallback);
    },
    // Check limit
    function(asyncCallback) {
      // Check if disabled or not
      if (asyncAPI.isDisabled) {
        return asyncCallback(new E('EBizCondition.AsyncAPIDisabled', 'This Async API is disabled'))
      }

      return asyncCallback();
    },
    // Create Func calling request
    function(asyncCallback) {
      var opt = {
        funcId         : asyncAPI.funcId,
        funcCallKwargs : asyncAPI.funcCallKwargsJSON,
        origin         : 'asyncAPI',
        originId       : asyncAPI.id,
        taskRecordLimit: asyncAPI.taskRecordLimit,
      }
      _createFuncRunnerTaskReqFromHTTPRequest(res.locals, req, opt, function(err, _taskReq) {
        if (err) return asyncCallback(err);

        taskReq = _taskReq;

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    taskReq.ignoreResult = true;
    _callFuncRunner(res.locals, taskReq, function(err, taskId) {
      if (err) return next(err);

      var ret = toolkit.initRet({ id: taskId });
      return res.locals.sendJSON(ret);
    });
  });
};

exports.runCronJobManually = function(req, res, next) {
  var id = req.params.id;

  async.series([
    // Check Cron Job exists
    function(asyncCallback) {
      var cronJobModel = cronJobMod.createModel(res.locals);

      cronJobModel._get(id, null, function(err, dbRes) {
        if (err) return asyncCallback(err);

        if (!dbRes) {
          // Cache as `null` if not exist
          return asyncCallback(new E('EClientNotFound', 'No such Cron Job', { id: id }));
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    // Send Task
    var taskReq = {
      name  : 'CronJob.ManualStarter',
      kwargs: { cronJobId: id },
    }
    res.locals.cacheDB.putTask(taskReq, function(err) {
      if (err) return next(err);
      return res.locals.sendJSON();
    });
  });
};

exports.getFuncList = function(req, res, next) {
  res.locals.extra.asFuncDoc = true;

  return funcAPICtrl.list(req, res, next);
};

exports.getFuncTagList = function(req, res, next) {
  var name       = req.query.name;
  var tagPattern = req.query.tagPattern;

  var funcModel = funcMod.createModel(res.locals);

  var opt = res.locals.getQueryOptions();
  opt.fileds = ['tagsJSON'];

  funcModel.list(opt, function(err, dbRes) {
    if (err) return next(err);

    var funcTags = [];
    dbRes.forEach(function(d) {
      funcTags = funcTags.concat(d.tagsJSON || []);
    });

    funcTags = toolkit.noDuplication(funcTags);
    funcTags.sort();

    // Do filter
    if (toolkit.notNothing(name)) {
      funcTags = funcTags.filter(function(x) {
        return x.indexOf(name) >= 0;
      });
    }

    if (toolkit.notNothing(tagPattern)) {
      funcTags = funcTags.filter(function(x) {
        return toolkit.matchWildcard(x, tagPattern);
      });
    }

    var ret = toolkit.initRet(funcTags);
    return res.locals.sendJSON(ret);
  });
};

exports.getFuncAPIList = function(req, res, next) {
  var apiType = req.query.apiType || 'ALL';

  var syncAPIModel  = syncAPIMod.createModel(res.locals);
  var asyncAPIModel = asyncAPIMod.createModel(res.locals);

  var apiList = [];

  async.series([
    // Sync API
    function(asyncCallback) {
      if (apiType !== 'ALL' && apiType !== 'syncAPI') return asyncCallback();

      var opt = res.locals.getQueryOptions();
      opt.filters = opt.filters || {};
      opt.filters['sapi.showInDoc'] = {eq: true};

      syncAPIModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        dbRes.forEach(function(d) {
          apiList.push({
            url: urlFor('mainAPI.callSyncAPIByGet', {
              params: { id: d.id },
            }),

            apiType           : 'syncAPI',
            id                : d.id,
            funcCallKwargsJSON: d.funcCallKwargsJSON,
            expireTime        : d.expireTime,
            throttlingJSON    : d.throttlingJSON,
            isDisabled        : d.isDisabled,

            configFuncId      : d.funcId,
            funcId            : d.func_id,
            funcName          : d.func_name,
            funcTitle         : d.func_title,
            funcDescription   : d.func_description,
            funcDefinition    : d.func_definition,
            funcArgsJSON      : d.func_argsJSON,
            funcKwargsJSON    : d.func_kwargsJSON,
            funcCategory      : d.func_category,
            funcIntegration   : d.func_integration,
            funcTagsJSON      : d.func_tagsJSON,

            apiAuthId   : d.apia_id,
            apiAuthTitle: d.apia_title,
            apiAuthType : d.apia_type,
          });
        });

        return asyncCallback();
      });
    },
    // Async API
    function(asyncCallback) {
      if (apiType !== 'ALL' && apiType !== 'asyncAPI') return asyncCallback();

      var opt = res.locals.getQueryOptions();
      opt.filters = opt.filters || {};
      opt.filters['aapi.showInDoc'] = {eq: true};

      asyncAPIModel.list(opt, function(err, dbRes) {
        if (err) return asyncCallback(err);

        dbRes.forEach(function(d) {
          apiList.push({
            url: urlFor('mainAPI.callAsyncAPIByGet', {
              params: { id: d.id },
            }),

            apiType           : 'asyncAPI',
            id                : d.id,
            funcCallKwargsJSON: d.funcCallKwargsJSON,
            expireTime        : null, // Async API does not support this feature
            throttlingJSON    : null, // Async API does not support this feature
            isDisabled        : d.isDisabled,

            configFuncId      : d.funcId,
            funcId            : d.func_id,
            funcName          : d.func_name,
            funcTitle         : d.func_title,
            funcDescription   : d.func_description,
            funcDefinition    : d.func_definition,
            funcArgsJSON      : d.func_argsJSON,
            funcKwargsJSON    : d.func_kwargsJSON,
            funcCategory      : d.func_category,
            funcIntegration   : d.func_integration,
            funcTagsJSON      : d.func_tagsJSON,

            apiAuthId   : d.apia_id,
            apiAuthTitle: d.apia_title,
            apiAuthType : d.apia_type,
          });
        });

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet(apiList);
    return res.locals.sendJSON(ret);
  });
};

// Integrated Sign-in
exports.integratedSignIn = function(req, res, next) {
  if (CONFIG.DISABLE_INTEGRATED_SIGNIN) {
      return next(new E('EBizCondition', 'Integrated Sign-in is disabled'));
  }

  var funcId   = req.body.signIn.funcId;
  var username = req.body.signIn.username;
  var password = req.body.signIn.password;

  var taskReq    = null;
  var userId     = null;
  var xAuthToken = null;

  async.series([
    function(asyncCallback) {
      var opt = {
        funcId         : funcId,
        funcCallKwargs : { username: username, password: password },
        origin         : 'integration',
        originId       : 'signIn',
        taskRecordLimit: CONFIG._TASK_RECORD_FUNC_LIMIT_INTEGRATION,
      }
      _createFuncRunnerTaskReq(res.locals, opt, function(err, _taskReq) {
        if (err) return asyncCallback(err);

        taskReq = _taskReq;

        return asyncCallback();
      });
    },
    function(asyncCallback) {
      _callFuncRunner(res.locals, taskReq, function(err, taskResp) {
        if (err && !taskResp) return asyncCallback(err);

        switch(taskResp.status) {
          case 'noResponse':
            return next(new E('EWorkerNoResponse', 'Worker no response, please check the status of this system'));

          case 'failure':
            return next(new E('EFuncFailed.SignInFuncRaisedException', taskResp.exception, {
              exception: taskResp.exception,
              traceback: taskResp.traceback,
            }));

          case 'timeout':
            return next(new E('EFuncFailed.SignInFuncTimeout', 'Sign-in function timeout', {
              exception: taskResp.exception,
              traceback: taskResp.traceback,
            }));
        }

        var returnValue = taskResp.result.returnValue;

        // Func returned `False` or other meaning-less content
        if (toolkit.isNothing(returnValue) || returnValue === false) {
          return next(new E('EFuncFailed.SignInFuncReturnedFalseOrNothing', 'Sign-in function returned False or nothing'));
        }

        // Sign-in Successful
        var userDisplayName = username;
        var userEmail       = null;
        switch(typeof returnValue) {
          // When Integrated Sign-in Func returns `true`, use username as User ID
          case 'boolean':
            userId = username;
            break;

          // When Integrated Sign-in Func returns string, use it as User ID
          case 'string':
          case 'number':
            userId = '' + returnValue;
            break;

          // When Integrated Sign-in Func returns an obj, try to pick user info
          case 'object':
            function pickField(obj, possibleFields) {
              for (var k in obj) {
                k = ('' + k).toLowerCase();
                if (possibleFields.indexOf(k) >= 0) {
                  return obj[k];
                }
              }
            }
            userId = pickField(returnValue, [
              'id',
              'uid',
              'userid',
              'userId',
              'user_id',
            ]);
            userDisplayName = pickField(returnValue, [
              'name',
              'title',
              'fullname',
              'full_name',
              'displayName',
              'display_name',
              'realName',
              'real_name',
              'showName',
              'show_name',
              'nickName',
              'nick_name',
            ]);
            userEmail = pickField(returnValue, [
              'mail',
              'email',
              'useremail',
              'user_email',
            ]);
            break;
        }

        // Avoid conflict to built-in user ID (igu: Integration Generated User)
        userId = toolkit.strf('igu_{0}-{1}', toolkit.getMD5(funcId), userId);

        var user = {
          id      : userId,
          username: username,
          name    : userDisplayName,
          email   : userEmail
        }
        // Gen X-Auth-Token
        var xAuthTokenObj = auth.genXAuthTokenObj(user, funcId);
        xAuthToken = auth.signXAuthTokenObj(xAuthTokenObj);

        var cacheKey   = auth.getCacheKey();
        var cacheField = auth.getCacheField(xAuthTokenObj);
        var cacheData  = { ts: toolkit.getTimestamp() };
        res.locals.cacheDB.hset(cacheKey, cacheField, JSON.stringify(cacheData), asyncCallback);
      });
    }
  ], function(err) {
    if (err) return next(err);

    var ret = toolkit.initRet({
      userId    : userId,
      xAuthToken: xAuthToken,
    });
    return res.locals.sendJSON(ret);
  });
};

exports.integratedAuthMid = function(req, res, next) {
  if (res.locals.user && res.locals.user.isSignedIn) return next();

  var now = toolkit.getTimestamp();

  // Get x-auth-token
  var xAuthToken = null;

  var headerField = CONFIG._WEB_AUTH_HEADER;
  var queryField  = CONFIG._WEB_AUTH_QUERY;
  var cookieField = CONFIG._WEB_AUTH_COOKIE;

  if (cookieField
      && req.signedCookies[cookieField]
      && res.locals.requestType === 'page') {
    // Try to get x-auth-token from cookie
    xAuthToken = req.signedCookies[cookieField];

  } else if (headerField && req.get(headerField)) {
    // Try to get x-auth-token from HTTP header
    xAuthToken = req.get(headerField);

  } else if (queryField && req.query[queryField]) {
    // Try to get x-auth-token from query
    xAuthToken = req.query[queryField];
  }

  // Skip if no xAuthToken
  if (!xAuthToken) return next();

  if (CONFIG.MODE === 'dev') {
    res.locals.logger.debug('[MID] IN mainAPICtrl.integratedAuthMid');
  }

  res.locals.user = auth.createUserHandler();

  // Check x-auth-token
  var xAuthTokenObj = null;

  var cacheKey   = auth.getCacheKey();
  var cacheField = null;

  async.series([
    // Verify JWT
    function(asyncCallback) {
      auth.verifyXAuthToken(xAuthToken, function(err, obj) {
        if (err) {
          res.locals.reqAuthError = new E('EUserAuth', 'Invalid x-auth-token');
          return asyncCallback(res.locals.reqAuthError);
        }

        xAuthTokenObj = obj;

        /*** Skip when non-integrated Sign-in ***/
        if (!xAuthTokenObj.isfid) return next();

        cacheField = auth.getCacheField(xAuthTokenObj);

        return asyncCallback();
      });
    },
    // Check Integrated Sign-in disabled
    function(asyncCallback) {
      if (CONFIG.DISABLE_INTEGRATED_SIGNIN) {
        res.locals.reqAuthError = new E('EUserDisabled', 'Integrated Sign-in is disabled');
      }

      // Throw error later if auth failed
      return asyncCallback();
    },
    // Check Redis
    function(asyncCallback) {
      res.locals.cacheDB.hgetExpires(cacheKey, cacheField, CONFIG._WEB_AUTH_EXPIRES, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        if (!cacheRes) {
          res.locals.reqAuthError = new E('EUserAuth', 'x-auth-token is expired');
          return asyncCallback(res.locals.reqAuthError);
        }

        res.locals.xAuthToken    = xAuthToken;
        res.locals.xAuthTokenObj = xAuthTokenObj;

        return asyncCallback();
      });
    },
    // Refresh x-auth-token
    function(asyncCallback) {
      var cacheData = { ts: now };
      res.locals.cacheDB.hset(cacheKey, cacheField, JSON.stringify(cacheData), asyncCallback);
    },
  ], function(err) {
    if (err && res.locals.reqAuthError === err) {
      // Skip request error here, throw later.
      return next();
    }

    if (err) return next(err);

    res.locals.user.load({
      seq             : 0,
      id              : xAuthTokenObj.uid,
      username        : xAuthTokenObj.un,
      name            : xAuthTokenObj.nm,
      email           : xAuthTokenObj.em,
      roles           : ['user'].join(','),
      customPrivileges: ['systemSetting_r'].join(','),
      integratedSignInFuncId: xAuthTokenObj.isfid,
    });

    res.locals.logger.info('Auth by [Integrated Sign-in Func]: id=`{0}`; username=`{1}`, integratedSignInFuncId=`{2}`',
      res.locals.user.id,
      res.locals.user.username,
      res.locals.user.integratedSignInFuncId);

    // client detect
    res.locals.authType = 'builtin.byXAuthToken';
    res.locals.authId   = xAuthTokenObj.uid;

    delete req.query[queryField];

    return next();
  });
};

// File Service
exports.fileService = function(req, res, next) {
  var id = req.params.id;

  // Avoid accessing the path that not allowed
  if (req.params[0] && req.params[0].match(/\.\./g)) {
    return next(new E('EBizCondition.ParentDirectorySymbolNotAllowed', 'Parent directory symbol (..) is not allowed in path'));
  }

  var relPath = '/' + req.params[0];

  var fileServiceModel = fileServiceMod.createModel(res.locals);
  fileServiceModel.getWithCheck(id, null, function(err, dbRes) {
    if (err) return next(err);

    if (dbRes.isDisabled) {
        return next(new E('EBizCondition.FileServiceDisabled', 'This File Service is disabled'))
    }

    var rootPath = path.join(CONFIG.RESOURCE_ROOT_PATH, (dbRes.root || '.'));
    var absPath  = path.join(CONFIG.RESOURCE_ROOT_PATH, (dbRes.root || '.'), relPath);

    // Avoid accessing the path not under the root path
    if (absPath.indexOf(rootPath) !== 0) {
      return next(new E('EBizCondition.AccessingOutOfScopePathNotAllowed', 'Accessing out-of-scope file system is not allowed'))
    }

    // Handling items according to it's type
    fs.lstat(absPath, function(err, stats) {
      if (err) {
        // Not exists
        var pageData = {
          id     : id,
          relPath: relPath,
          error  : err.code === 'ENOENT' ? 'Not Found' : err.toString(),
        }
        return res.locals.render('file-service', pageData);
      }

      if (stats.isDirectory()) {
        // Dir: return HTML page and show sub items
        var opt = {
          withFileTypes: true,
        };
        return fs.readdir(absPath, opt, function(err, data) {
          if (err) return next(err);

          // Collect sub items
          var files = data.reduce(function(acc, x) {
            var f = {
              name      : x.name,
              type      : null,
              size      : null,
              createTime: null,
              updateTime: null,
            };

            var stat = fs.statSync(path.join(absPath, x.name));
            f.createTime = moment(stat.birthtimeMs).tz(CONFIG.TIMEZONE).format('YYYY-MM-DD HH:mm:ss Z');
            f.updateTime = moment(stat.ctimeMs).tz(CONFIG.TIMEZONE).format('YYYY-MM-DD HH:mm:ss Z');

            if (x.isDirectory()) {
              f.type = 'folder';
              f.name += '/';

            } else if (x.isFile()) {
              f.type = 'file';
              f.size = byteSize(stat.size);
            }

            if (!f.type) return acc;

            acc.push(f);
            return acc;
          }, []);

          // Parent dir
          if (relPath !== '/') {
            files.unshift({
              name: '../',
              type: 'folder',
            });
          }

          var pageData = {
            id     : id,
            files  : files,
            relPath: relPath,
          };
          return res.locals.render('file-service', pageData);
        });

      } else if (stats.isFile()) {
        // File: send file
        return res.sendFile(absPath);

      } else {
        // Other: return HTML page with NOT SUPPORTED notice
        var pageData = {
          id     : id,
          relPath: relPath,
          error  : 'Not Supported',
        }
        return res.locals.render('file-service', pageData);
      }
    });
  });
};

/* Allow other modules to access */
exports.getFuncById             = _getFuncById;
exports.createFuncRunnerTaskReq = _createFuncRunnerTaskReq;
exports.callFuncRunner          = _callFuncRunner;
exports.callFuncDebugger        = _callFuncDebugger;
