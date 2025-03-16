'use strict';

/* Build-in Modules */
var os   = require('os');
var path = require('path');

/* 3rd-part Modules */
var fs     = require('fs-extra');
var multer = require('multer');
var moment = require('moment-timezone');

/* Project Modules */
var E       = require('./serverError');
var CONFIG  = require('../utils/yamlResources').get('CONFIG');
var toolkit = require('./toolkit');

/* Init */
var UPLOAD_TEMP_FILE_DIR  = path.join(CONFIG.RESOURCE_ROOT_PATH, CONFIG.UPLOAD_TEMP_FILE_DIR);
var MULTIPART_BOUNDARY_RE = /^multipart\/form-data.\s?boundary=['"]?(.*?)['"]?$/i;

module.exports = function(options) {
  var limitByteSize = null;

  if (options.$limitSize) {
    limitByteSize = toolkit.toBytes(options.$limitSize);
  }

  // Init file uploading middleware
  //  File path：<Upload Temp Dir>/<Date Time>_<Random>_encodeURI(<Origin Name>)
  var storage = multer.diskStorage({
    destination: UPLOAD_TEMP_FILE_DIR,
    filename: function (req, file, callback) {
      var now = Date.now() + CONFIG._UPLOAD_FILE_EXPIRES * 1000;

      // Parse file name
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

      // Gen temp file name
      var tmpFilename = [
        moment(now).format('YYYYMMDDHHmmss'), // Date Time
        toolkit.genRandString(16),            // Random
        encodeURI(file.originalname),         // encodeURI(<Origin Name>)
      ].join('_');

      return callback(null, tmpFilename);
    }
  })
  var opt = {
    storage: storage,
    limits: {
      fileSize : limitByteSize,
      fieldSize: limitByteSize,
    },
  };

  // Return middleware instance
  return function(req, res, next) {
    // Fix boundary with '/' but missing quotes by iOS issue
    // `https://github.com/facebook/react-native/issues/7564`
    // `https://github.com/expressjs/multer/issues/462`
    var contentType = req.headers['content-type'];
    var match = MULTIPART_BOUNDARY_RE.exec(contentType);
    if (match && match.length === 2) {
        req.headers['content-type'] = 'multipart/form-data; boundary="' + match[1] + '"';
    }

    multer(opt).any()(req, res, function(err) {
      if (err instanceof multer.MulterError) {
        // Convert Multer error
        err = new E('EClientBadRequest', 'Uploading file failed', {
          message: err.message,
        });
      }

      return next(err);
    });
  }
};
