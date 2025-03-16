'use strict';

/* Built-in Modules */

/* 3rd-party Modules */
var async = require('async');

/* Project Modules */
var E       = require('../utils/serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('../utils/toolkit');
var auth    = require('../utils/auth');

var socketIOServerHelper = require('../utils/extraHelpers/socketIOServerHelper');

/* Init */
var AUTHED_SOCKET_IO_CLIENT_MAP = {};

module.exports = function(app, server) {
  // Init
  var socketIO = socketIOServerHelper.createHelper(server, app.locals.logger);

  socketIO.server.on('connection', function(socket) {
    app.locals.logger.debug('[SOCKET IO] Client connected. id=`{0}`', socket.id);

    // Hello message
    socket.emit('hello', 'Welcome, please send X-Auth-Token string by event `auth` for authentication.')

    // Auth middleware
    socket.use(function(packet, next) {
      var event        = packet[0];
      var xAuthToken   = packet[1];
      var respCallback = packet[2];

      if (event !== 'auth') return next();

      // Do auth when client send `auth` event
      if (!xAuthToken) {
        return next(new E('EClientBadRequest', 'X-Auth-Token not sent').forSocketIO());
      }

      var xAuthTokenObj = null;
      async.series([
        // verify JWT
        function(asyncCallback) {
          auth.verifyXAuthToken(xAuthToken, function(err, obj) {
            // Check JWT sign
            if (err || !obj) {
              return asyncCallback(new E('EAuthToken', 'Invalid Auth Token').forSocketIO());
            };

            xAuthTokenObj = obj;

            return asyncCallback();
          });
        },
        // Check if X-Auth-Token expired
        function(asyncCallback) {
          if (!xAuthTokenObj) return asyncCallback();

          var cacheKey   = auth.getCacheKey();
          var cacheField = auth.getCacheField(xAuthTokenObj);
          app.locals.cacheDB.hgetExpires(cacheKey, cacheField, CONFIG._WEB_AUTH_EXPIRES, function(err, cacheRes) {
            if (err) {
              return asyncCallback(new E('ESysCache', 'Read cache error').forSocketIO());
            }

            if (!cacheRes) {
              // X-Auth-Token expired
              return asyncCallback(new E('EAuthToken', 'Auth Token expired').forSocketIO());
            }

            // Do not refresh X-Auth-Token in Socket.IO
            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);

        AUTHED_SOCKET_IO_CLIENT_MAP[socket.id] = xAuthTokenObj;
        AUTHED_SOCKET_IO_CLIENT_MAP[socket.id].authType = 'builtin.byXAuthToken';

        var joinedRooms = [];

        function _joinRoom(room) {
          socket.join(room);
          joinedRooms.push(room);
        }

        // Join channel for client
        _joinRoom(socket.id);

        // Join channel for User
        if (xAuthTokenObj.uid) {
          _joinRoom(xAuthTokenObj.uid);
        }

        // Send response
        var ret = toolkit.initRet({
          clientId   : socket.id,
          joinedRooms: joinedRooms,
        });
        var respData = JSON.stringify(ret);

        if ('function' === typeof respCallback) {
          try {
            respCallback(respData); // Socket.io 2.0 ACK response
          } catch(err) {
            app.locals.logger.error(ex);
          }
        }
        socket.emit(event + '.resp', respData); // Common event response
      });
    });

    // Auth check middleware
    socket.use(function(packet, next) {
      // Check client is signed-in before Socket.io client send any event
      var xAuthTokenObj = AUTHED_SOCKET_IO_CLIENT_MAP[socket.id];
      if (!xAuthTokenObj) {
        // Error if not signed in
        return next(new E('ESocketIOAuth', 'Client not send X-Auth-Token yet').forSocketIO());
      }

      async.series([
        // Check if X-Auth-Token expired or not
        function(asyncCallback) {
          if (!xAuthTokenObj) return asyncCallback();

          switch(xAuthTokenObj.authType) {
            case 'builtin.byXAuthToken':
              break;

            default:
              return asyncCallback(new E('EAuthToken', 'Unsupported auth type', { authType: xAuthTokenObj.authType }).forSocketIO());
          }

          var cacheKey   = auth.getCacheKey();
          var cacheField = auth.getCacheField(xAuthTokenObj)
          app.locals.cacheDB.hgetExpires(cacheKey, cacheField, CONFIG._WEB_AUTH_EXPIRES, function(err, cacheRes) {
            if (err) {
              return asyncCallback(new E('ESysCache', 'Read cache error').forSocketIO());
            }

            if (!cacheRes) {
              // X-Auth-Token expired
              return asyncCallback(new E('EAuthToken', 'Auth Token expired').forSocketIO());
            }

            return asyncCallback();
          });
        },
      ], function(err) {
        if (err) return next(err);
        return next();
      });
    });

    // Handling message
    socket.use(function(packet, next) {
      // Check X-Auth-Token before handling messages
      var xAuthTokenObj = AUTHED_SOCKET_IO_CLIENT_MAP[socket.id];
      if (!xAuthTokenObj) {
        return next(new E('ESocketIOAuth', 'Socket.io connection gone').forSocketIO());
      }

      var event        = packet[0];
      var data         = packet[1] || {};
      var respCallback = packet[2];

      // REQ ID
      var reqId = data.reqId || undefined;

      var retData        = null;
      var conflictSource = null;
      async.series([
        // Handle messages
        function(asyncCallback) {
          switch(event) {
            case 'ping':
              retData = 'pong';
              break;

            case 'reportAndCheckClientConflict':
              switch(data.routeName) {
                case 'code-editor':
                case 'connector-setup':
                case 'env-variable-setup':
                  conflictSource = [
                    'routeName',      data.routeName,
                    'routeParams.id', data.routeParams.id,
                  ]
                  break;

                case 'script-set-import-history-list':
                case 'script-recover-point-list':
                  conflictSource = [
                    'routeName', data.routeName,
                  ]
                  break;
              }
              break;

            default:
              return asyncCallback(new E('ESocketIOEvent', `Unknown event: ${event}`).forSocketIO(reqId));
          }

          return asyncCallback();
        },
        // Detect conflict
        function(asyncCallback) {
          if (!conflictSource) return asyncCallback();

          var cacheKey = toolkit.getCacheKey('cache', 'clientConflict', conflictSource);
          var conflictInfo = {
            conflictId: data.conflictId,
            user: {
              username: xAuthTokenObj.un,
              name    : xAuthTokenObj.nm,
            },
          }
          async.series([
            function(innerCallback) {
              if (data.checkOnly) return innerCallback();

              app.locals.cacheDB.setexnx(cacheKey, CONFIG._CLIENT_CONFLICT_EXPIRES, JSON.stringify(conflictInfo), innerCallback);
            },
            function(innerCallback) {
              app.locals.cacheDB.get(cacheKey, function(err, cacheRes) {
                if (err) return innerCallback(err);

                var remoteConflictInfo = {}
                if (cacheRes) remoteConflictInfo = JSON.parse(cacheRes) || {};

                var remoteConflictId = remoteConflictInfo.conflictId || null;
                var user             = remoteConflictInfo.user       || null;
                var isConflict       = remoteConflictId && data.conflictId !== remoteConflictId

                retData = {
                  conflictId: remoteConflictId,
                  isConflict: isConflict,
                  user      : user,
                }

                if (!isConflict && !data.checkOnly) {
                  app.locals.cacheDB.expire(cacheKey, CONFIG._CLIENT_CONFLICT_EXPIRES);
                }

                return innerCallback();
              });
            },
          ], asyncCallback);
        },
      ], function(err) {
        if (err) return next(err);

        var ret   = toolkit.initRet(retData);
        ret.reqId = reqId;

        var respData = JSON.stringify(ret);

        if ('function' === typeof respCallback) {
          try {
            respCallback(respData); // Socket.io 2.0 ACK response
          } catch(err) {
            app.locals.logger.error(ex);
          }
        }
        socket.emit(event + '.resp', respData); // Common event response
      });
    });

    // CLient disconnect
    socket.on('disconnect', function(reason) {
      var xAuthTokenObj = AUTHED_SOCKET_IO_CLIENT_MAP[socket.id];

      var username = null;
      if (xAuthTokenObj) {
        username = xAuthTokenObj.un;
      }

      app.locals.logger.debug('[SOCKET IO] Client disconnected. id=`{0}`, username=`{1}`, reason=`{2}`', socket.id, username, reason);

      delete AUTHED_SOCKET_IO_CLIENT_MAP[socket.id];
    });

    // Error handling
    socket.on('error', function(err) {
      var reason = null;
      try {
        reason = JSON.parse(err.message);
      } catch(err) {
        // Nope
      }

      socket.emit('error', err.message);
      if (reason === 'ESocketIOAuth') {
        socket.disconnect();
      }
    });
  });

  app.locals.socketIO = socketIO;
};
