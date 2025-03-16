'use strict';

/* Monkey patch */
require('./monkeyPatch');

/* Built-in Modules */
var path         = require('path');
var http         = require('http');
var https        = require('https');
var childProcess = require('child_process');

/* 3rd-party Modules */
var fs               = require('fs-extra');
var express          = require('express');
var expressUseragent = require('express-useragent');
var bodyParser       = require('body-parser');
var cookieParser     = require('cookie-parser');
var cors             = require('cors');

/* Init */

/* Load YAML resources */
var yamlResources = require('./utils/yamlResources');

yamlResources.loadFile('IMAGE_INFO',         path.join(__dirname, '../image-info.json'));
yamlResources.loadFile('CONST',              path.join(__dirname, '../const.yaml'));
yamlResources.loadFile('ROUTE',              path.join(__dirname, './route.yaml'));
yamlResources.loadFile('PRIVILEGE',          path.join(__dirname, './privilege.yaml'));
yamlResources.loadFile('GUANCE_DATA_SOURCE', path.join(__dirname, './guanceDataSource.yaml'));

// Load arch
yamlResources.set('IMAGE_INFO', 'ARCHITECTURE',
  childProcess.execFileSync('uname', [ '-m' ]).toString().trim());

var CONFIG = null;

// Load extra YAML resources
yamlResources.loadConfig(path.join(__dirname, '../config.yaml'), function(err, _config) {
  if (err) throw err;

  CONFIG = _config;

  // Prefer to use GUANCE_BIND_IP env as bind IP
  if (process.env['GUANCE_BIND_IP']) {
    CONFIG.WEB_BIND = process.env['GUANCE_BIND_IP'];
  }

  require('./appInit').prepare(function() {
    startApplication();
  });
});

function startApplication() {
  /* Project Modules */
  var E           = require('./utils/serverError');
  var toolkit     = require('./utils/toolkit');
  var logHelper   = require('./utils/logHelper');
  var routeLoader = require('./utils/routeLoader');

  // Linux Distro
  var linuxDistro = toolkit.safeReadFileSync('/linux-distro').trim()
                 || toolkit.safeReadFileSync('/image-info').split('\n')[0];
  yamlResources.set('IMAGE_INFO', 'LINUX_DISTRO', linuxDistro);

  // Express
  var app = express();
  app.locals.app = app;

  // gzip
  app.use(require('compression')());

  // For SLB Health check
  app.head('/', function(req, res, next) {
    return res.send('OK');
  });

  // For index jumping
  app.get('/', function(req, res, next) {
    return res.redirect('./client-app/');
  });

  // Logger
  app.use(logHelper.requestLoggerInitialize);

  // App Setting
  app.set('x-powered-by', false);
  app.set('trust proxy', true);
  app.set('etag', 'weak');
  app.set('env', CONFIG.MODE === 'prod' ? 'production' : 'development');
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.set('view cache', CONFIG.MODE === 'prod');

  // CORS
  var corsConfig = {
    origin              : CONFIG.WEB_CORS_ORIGIN,
    credentials         : CONFIG.WEB_CORS_CREDENTIALS,
    exposedHeaders      : '*',
    optionsSuccessStatus: 200,
    maxAge              : 86400,
  }
  if ('string' === typeof corsConfig.origin) {
    corsConfig.origin = toolkit.asArray(corsConfig.origin);
  }
  if (Array.isArray(corsConfig.origin)) corsConfig.origin.forEach(function(origin, index) {
    if ('string' === typeof origin && origin.indexOf('regexp:') === 0) {
      corsConfig.origin[index] = new RegExp(origin.replace('regexp:', ''));
    }
  });
  app.use(cors(corsConfig));

  // Static files
  var STATIC_CONFIGS = {
    '/client-app': path.join(__dirname, '../client/dist'),
    '/statics'   : path.join(__dirname, 'statics'),
    '/doc'       : path.join(__dirname, 'doc'),
  }
  for (var _route in STATIC_CONFIGS) {
    var _staticDir = STATIC_CONFIGS[_route];
    app.use(_route, express.static(_staticDir, { redirect: false }));
    app.get(_route, function(req, res, next) {
      return toolkit.endsWith(req.path, '/')
        ? next()
        : res.redirect(`.${req.path}/`);
    });
  }

  // User agent
  app.use(expressUseragent.express());

  // Cookie
  app.use(cookieParser(CONFIG.SECRET));

  // Initialize
  app.use(require('./utils/responseInitialize'));

  // Favicon
  app.use('/favicon.ico', require('./utils/favicon'));

  // Body paser
  app.use(function(req, res, next) {
    res.locals.isBodyParsing = true;
    return next();
  });

  app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
  app.use(bodyParser.json({limit: '50mb'}));
  app.use(bodyParser.text({limit: '50mb'}));
  app.use(bodyParser.raw({limit: '50mb', type: function(req) {
    // Parse raw for non-file-uploading request
    var isUpload = req.get('content-type') && req.get('content-type').indexOf('multipart/form-data') >= 0;
    return !isUpload;
  }}));

  app.use(function(err, req, res, next) {
    if (err && res.locals.isBodyParsing) {
      res.locals.logger.logError(err);

      // Response fixed error if parse request body error occured
      err = new E('EClientBadRequest', 'Invalid request body');
    }

    res.locals.isBodyParsing = false;
    return next(err);
  });

  // Integrated Auth
  app.use(require('./controllers/mainAPICtrl').integratedAuthMid);

  // Dump user information
  if (CONFIG.MODE === 'dev') {
    app.use(require('./utils/requestDumper').dumpUserInformation);
  }

  // Load routes
  require('./routers/indexAPIRouter');
  require('./routers/authAPIRouter');
  require('./routers/userAPIRouter');
  require('./routers/accessKeyAPIRouter');
  require('./routers/monitorAPIRouter');
  require('./routers/systemSettingAPIRouter');
  require('./routers/tempFlagAPIRouter');
  require('./routers/debugAPIRouter');

  require('./routers/mainAPIRouter');
  require('./routers/pythonPackageAPIRouter');
  require('./routers/resourceAPIRouter');

  require('./routers/scriptSetAPIRouter');
  require('./routers/scriptAPIRouter');
  require('./routers/funcAPIRouter');

  require('./routers/scriptRecoverPointAPIRouter');

  require('./routers/scriptPublishHistoryAPIRouter');
  require('./routers/scriptSetExportHistoryAPIRouter');
  require('./routers/scriptSetImportHistoryAPIRouter');

  require('./routers/connectorAPIRouter');
  require('./routers/envVariableAPIRouter');

  require('./routers/apiAuthAPIRouter');

  require('./routers/syncAPIRouter');
  require('./routers/asyncAPIRouter');
  require('./routers/cronJobAPIRouter');

  require('./routers/taskRecordAPIRouter');
  require('./routers/taskRecordFuncAPIRouter');

  require('./routers/operationRecordAPIRouter');

  require('./routers/fileServiceAPIRouter');
  require('./routers/funcCacheAPIRouter');
  require('./routers/funcStoreAPIRouter');

  require('./routers/blueprintAPIRouter');
  require('./routers/scriptMarketAPIRouter');

  // [Compatibility] Auth Link, Batch, Crontab Config was changed to Sync API, Async API, Cron Job
  require('./routers/authLinkAPIRouter');
  require('./routers/crontabConfigAPIRouter');
  require('./routers/batchAPIRouter');

  routeLoader.mount(app);

  // More Server initialize
  var serverLogger = logHelper.createHelper();
  app.locals.logger = serverLogger;

  var dbHelper = null;
  switch(CONFIG.DB_ENGINE) {
    case 'postgresql':
      dbHelper = require('./utils/extraHelpers/postgresqlHelper');
      break;

    case 'mysql':
    default:
      dbHelper = require('./utils/extraHelpers/mysqlHelper');
      break;
  }

  app.locals.db = dbHelper.createHelper(serverLogger);
  app.locals.db.skipLog = CONFIG.LOG_APP_LEVEL_DISABLED === 'auto'
                        ? CONFIG.MODE === 'prod'
                        : CONFIG.LOG_APP_LEVEL_DISABLED;

  app.locals.cacheDB = require('./utils/extraHelpers/redisHelper').createHelper(serverLogger);
  app.locals.cacheDB.skipLog = CONFIG.LOG_APP_LEVEL_DISABLED === 'auto'
                             ? CONFIG.MODE === 'prod'
                             : CONFIG.LOG_APP_LEVEL_DISABLED;

  // Generate 404 Error
  app.use(function gen404Error(req, res, next) {
    if (CONFIG.MODE === 'dev') {
      res.locals.logger.debug('[MID] IN app.404Error');
    }

    return next(new E('EClientNotFound', 'No such router. Please make sure that the METHOD is correct and no spelling missing in the URL', {
      method: req.method,
      url   : req.originalUrl,
    }));
  });

  // Handle Error
  app.use(function handleError(err, req, res, next) {
    if (!res.locals.logger) {
      res.locals.logger = serverLogger;
    }

    if (CONFIG.MODE === 'dev') {
      res.locals.logger.debug('[MID] IN app.handleError');
    }

    // Wrap general error
    if (!E.prototype.isPrototypeOf(err)) {
      var errMessage = 'A System error occured. Please report this response to the administrator';
      var errStack   = null;

      if (CONFIG.MODE === 'dev') {
        errMessage = err.toString();
        errStack   = err.stack;
      }

      err = new E('ESys', errMessage, errStack, err);
    }

    // Set status code
    err.status = parseInt(err.status || 500);
    res.status(err.status);
    res.locals.responseStatus = err.status;

    if (err.status < 599) {
      // Print error
      if (!err.originError) {
        if (err.status >= 500) {
          res.locals.logger.error(err.toString());
        } else if (err.status >= 400) {
          res.locals.logger.warning(err.toString());
        }
      }

      // Print stack
      if (err.status >= 500) {
        var stack = err.originError
                  ? err.originError.stack
                  : err.stack;

        if (stack) {
          var stackLines = stack.split('\n');
          for (var i = 0; i < stackLines.length; i++) {
            (res.locals.logger || console).error(stackLines[i]);
          }
        }
      }
    }

    switch (res.locals.requestType) {
      case 'api':
        if ('function' !== typeof res.locals.sendJSON) {
          return res.send(err.toJSON());
        }

        // Response a JSON string
        var errorRet = err.toJSON();
        errorRet.reqDump = {
          method: req.method,
          url   : req.originalUrl,
        }
        if (toolkit.notNothing(req.body)) {
          var bodyDump = toolkit.jsonDumps(req.body, 2);
          bodyDump = toolkit.limitText(bodyDump, 1000, { showLength: 'newLine' });
          errorRet.reqDump.bodyDump = bodyDump;
        }
        return res.locals.sendJSON(errorRet);

      case 'page':
      default:
        if ('function' !== typeof res.locals.render) {
          return res.send(err.toHTML());
        }

        // Response a HTML page
        return res.locals.render('error', {
          error : err,
          CONFIG: CONFIG,
        });
    }
  });

  var server = null;
  var serveHTTPS = toolkit.toBoolean(process.env['GUANCE_SELF_TLS_ENABLE']);
  if (serveHTTPS) {
    // Use HTTPS
    var httpsOpt = {
      key : fs.readFileSync('/etc/guance/inner-tls.key'),
      cert: fs.readFileSync('/etc/guance/inner-tls.cert'),
    }
    server = https.createServer(httpsOpt, app);

  } else {
    // Use HTTP
    server = http.createServer(app);
  }

  require('./messageHandlers/socketIOHandler')(app, server);

  var listenOpt = {
    host: CONFIG.WEB_BIND,
    port: CONFIG.WEB_PORT,
  };
  server.listen(listenOpt, function() {
    // Print some message of the server
    console.log(toolkit.strf('Web Server is listening on {0}://{1}:{2} (Press CTRL+C to quit)', serveHTTPS ? 'https' : 'http', CONFIG.WEB_BIND, CONFIG.WEB_PORT));
    console.log(toolkit.strf('PID: {0}', process.pid));
    console.log('Have fun!');

    // Non-request code here...
    require('./appInit').afterServe(app);

    // Sub client
    require('./sub').runListener(app);

    // Guance WS client
    require('./guanceWebSocket').runListener(app);

    // Check restart flag
    setInterval(function checkRestartFlag() {
      var cacheKey = toolkit.getGlobalCacheKey('tempFlag', 'restartAllServers');
      app.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
        if (!cacheRes) return;

        var restartFlagTime = parseInt(cacheRes);
        if (restartFlagTime <= toolkit.sysStartTime()) return;

        app.locals.logger.warning(`Flag \`restartAllServers\` is set at ${toolkit.getISO8601(restartFlagTime * 1000)}, server will restart soon...`);
        toolkit.sysExitRestart();
      });
    }, 5 * 1000);

    // Exit on SIGTERM
    process.on('SIGTERM', function(signame, signum) {
      app.locals.logger.warning(`Signal ${signame} is received, server exit`);
      toolkit.sysExitOK();
    });

    // Exit on keyboard interrupt
    process.on('SIGINT', function() {
      app.locals.logger.warning(`Interrupted by keyboard, server exit`);
      toolkit.sysExitOK();
    });
  });
}
