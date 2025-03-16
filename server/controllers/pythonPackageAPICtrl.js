'use strict';

/* Built-in Modules */
var path = require('path');

/* 3rd-party Modules */
var fs    = require('fs-extra');
var async = require('async');
var LRU   = require('lru-cache');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');

/* Handlers */
exports.listInstalled = function(req, res, next) {
  // Python package install path
  var packageInstallPath = path.join(CONFIG.RESOURCE_ROOT_PATH, CONFIG._EXTRA_PYTHON_PACKAGE_INSTALL_DIR);

  var packageVersionMap = {};

  var pipFreezes = [
    { type: 'builtinVersion',       cmd: 'pip', cmdArgs: [ 'freeze' ] },
    { type: 'userInstalledVersion', cmd: 'pip', cmdArgs: [ 'freeze', '--path', packageInstallPath] },
  ]
  async.eachSeries(pipFreezes, function(pipFreeze, asyncCallback) {
    toolkit.childProcessSpawn(pipFreeze.cmd, pipFreeze.cmdArgs, null, function(err, stdout) {
      if (err) return asyncCallback(err);

      stdout.trim().split('\n').forEach(function(pkg) {
        if (toolkit.isNothing(pkg)) return;

        var parts = pkg.split(/===?/);
        var name    = parts[0];
        var version = parts[1];
        if (!packageVersionMap[name]) {
          packageVersionMap[name] = { name: name };
        }
        packageVersionMap[name][pipFreeze.type] = version;
      });

      return asyncCallback();
    });
  }, function(err) {
    if (err) return next(err);

    var packages = Object.values(packageVersionMap);
    packages.sort(function(a, b) {
      if (a < b) {
        return -1;
      } else if (a > b) {
        return 1;
      } else {
        return 0;
      }
    });

    var ret = toolkit.initRet(packages);
    return res.locals.sendJSON(ret);
  });
};

exports.getInstallStatus = function(req, res, next) {
  var cacheKey = toolkit.getCacheKey('cache', 'pythonPackageInstallStatus');
  res.locals.cacheDB.hgetall(cacheKey, function(err, cacheRes) {
    if (err) return next(err);

    var installStatus = [];
    if (cacheRes) {
      installStatus = Object.values(cacheRes) || [];
      installStatus = installStatus.map(function(x) {
        return JSON.parse(x);
      });

      var nowMs = toolkit.getTimestampMs();
      installStatus.forEach(function(x) {
        x.nowMs = nowMs;
      });

      // Sort
      installStatus = installStatus.sort(function(a, b) {
        if (a.order < b.order) return -1;
        else if (a.order > b.order) return 1;
        else return 0;
      });
    }

    var ret = toolkit.initRet(installStatus);
    return res.locals.sendJSON(ret);
  });
};

exports.clearInstallStatus = function(req, res, next) {
  var cacheKey = toolkit.getCacheKey('cache', 'pythonPackageInstallStatus');
  res.locals.cacheDB.del(cacheKey, function(err) {
    if (err) return next(err);
    return res.locals.sendJSON();
  });
};

exports.install = function(req, res, next) {
  var pipIndexURL = req.body.pipIndexURL;
  var packages    = req.body.packages.trim().split(/\s+/);
  var upgrade     = req.body.upgrade;

  // Install progress
  var installStatusCacheKey = toolkit.getCacheKey('cache', 'pythonPackageInstallStatus');
  var installStatus         = [];

  // Python package install path
  var packageInstallPath = path.join(CONFIG.RESOURCE_ROOT_PATH, CONFIG._EXTRA_PYTHON_PACKAGE_INSTALL_DIR);
  fs.ensureDirSync(packageInstallPath);

  // Install package
  function _installPackage(packageInfo, callback) {
    async.series([
      // Record installing status
      function(asyncCallback) {
        packageInfo.startTimeMs = Date.now();
        packageInfo.status      = 'installing';
        return res.locals.cacheDB.hset(installStatusCacheKey, packageInfo.package, JSON.stringify(packageInfo), asyncCallback);
      },
      // Run PIP command
      function(asyncCallback) {
        var cmd = 'pip';
        var cmdArgs = [
          'install',
          '--no-cache-dir',
          '--default-timeout', '60',
          '-t', packageInstallPath,
        ];

        // Use mirror
        if (toolkit.notNothing(pipIndexURL)) {
          cmdArgs.push('-i', pipIndexURL);
        }

        // Use --upgrade flag
        if (upgrade) {
          cmdArgs.push('--upgrade');
        }

        if (toolkit.endsWith(packageInfo.package, '.whl')) {
          // Wheel package
          var wheelFilePath = path.join(CONFIG.RESOURCE_ROOT_PATH, packageInfo.package);
          cmdArgs.push(wheelFilePath);

        } else {
          // PIP package
          packageInfo.package.split(',').forEach(function(_pkg) {
            cmdArgs.push(_pkg.trim());
          });
        }

        toolkit.childProcessSpawn(cmd, cmdArgs, null, function(err) {
          if (err) {
            // Install failed
            return asyncCallback(new E('ESys', 'Install Python package failed', {
              package: packageInfo.package,
              message: err.toString(),
            }));
          }

          return asyncCallback();
        });
      },
    ], function(err) {
      // Wait and record result
      setTimeout(function() {
        // Install status / Error info
        packageInfo.endTimeMs = Date.now();
        if (err) {
          packageInfo.status = 'failure';
          packageInfo.error = err.detail ? err.detail.message : err.message;
        } else {
          packageInfo.status = 'success';
        }

        return res.locals.cacheDB.hset(installStatusCacheKey, packageInfo.package, JSON.stringify(packageInfo), callback);
      }, 1 * 1000);
    });
  }

  async.series([
    // Check / Clear installing status info
    function(asyncCallback) {
      res.locals.cacheDB.hgetall(installStatusCacheKey, function(err, cacheRes) {
        if (err) return asyncCallback(err);

        var waitingPackages = [];
        if (cacheRes) {
          waitingPackages = Object.values(cacheRes) || [];
          waitingPackages = waitingPackages.filter(function(packageInfo) {
            if ('string' === typeof packageInfo) {
              packageInfo = JSON.parse(packageInfo);
            }

            return packageInfo.status === 'waiting';
          });
        }

        if (waitingPackages.length > 0) {
          // Prev installing is still running
          return asyncCallback(new E('EBizRequestConflict', 'Previous Python package installing is not finished.'));

        } else {
          // Clear install status cache
          return res.locals.cacheDB.del(installStatusCacheKey, asyncCallback);
        }
      });
    },
    // Init installing status
    function(asyncCallback) {
      installStatus = packages.map(function(pkg, i) {
        var packageInfo = {
          order      : i,
          package    : pkg,
          status     : 'waiting',
          startTimeMs: null,
          endTimeMs  : null,
          error      : null,
        };
        return packageInfo;
      });

      var installStatusForCache = installStatus.reduce(function(acc, x) {
        acc[x.package] = JSON.stringify(x);
        return acc;
      }, {});

      return res.locals.cacheDB.hmset(installStatusCacheKey, installStatusForCache, asyncCallback);
    },
  ], function(err) {
    if (err) return next(err);

    // Do install
    async.eachSeries(installStatus, _installPackage);

    res.locals.sendJSON();
  });
};
