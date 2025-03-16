'use strict';

/* Built-in Modules */
var path = require('path');

/* 3rd-party Modules */

/* Project Modules */

var DEFAULT_FAVICON_PATH = path.join(__dirname, '../statics/favicon.ico');

module.exports = function(req, res, next) {
  var keys = [ 'CUSTOM_FAVICON_ENABLED', 'CUSTOM_FAVICON_IMAGE_SRC' ];
  res.locals.getSystemSettings(keys, function(err, systemSettings) {
    if (err) return next(err);

    if (!systemSettings.CUSTOM_FAVICON_ENABLED
      || !systemSettings.CUSTOM_FAVICON_IMAGE_SRC) {
      // Use default icon if no custom favicon set
      return res.sendFile(DEFAULT_FAVICON_PATH);

    } else {
      // Send icon data if custom favion set
      var iconBuffer = new Buffer.from(systemSettings.CUSTOM_FAVICON_IMAGE_SRC.split(',')[1], 'base64');
      return res.send(iconBuffer);
    }
  });
};
