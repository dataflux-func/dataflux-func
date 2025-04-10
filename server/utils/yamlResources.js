'use strict';

/* Built-in Modules */
var path = require('path');

/* 3rd-party Modules */
var fs   = require('fs-extra');
var yaml = require('js-yaml');

/* Project Modules */
var toolkit = require('./toolkit');

var FILE_CACHE = {};

/* Init */
var CONFIG_KEY           = 'CONFIG';
var CONFIG_FILE_PATH_KEY = 'CONFIG_FILE_PATH'

var INVISIBLE_CHAR_CHECKED = false;
var INVISIBLE_CHAR_CHECK_FIELD_PATTERNS = [
    /.+_HOST$/,
    /.+_PORT$/,
    /.+_USER$/,
    /.+_PASSWORD$/,
    /.+_DATABASE$/,
];

function _warnInvisibleCharInConfig(config) {
  // Only check once
  if (INVISIBLE_CHAR_CHECKED) return;
  INVISIBLE_CHAR_CHECKED = true;

  for (var k in config) {
    var v = config[k];

    if ('string' !== typeof v) continue;

    for (var i = 0; i < INVISIBLE_CHAR_CHECK_FIELD_PATTERNS.length; i++) {
      var pattern = INVISIBLE_CHAR_CHECK_FIELD_PATTERNS[i];

      if (k.match(pattern)) {
        if (v.search(/\s/) >= 0) {
          console.log(`[CONFIG WARNING] The value of config \`${k}\` contains a INVISIBLE char, please make sure it's correct.`)
          break;
        }
      }
    }
  }
}

/**
 * Load a YAML file.
 *
 * @param  {String} key - Key of file data to load
 * @param  {String} filePath - Path of YAML file to load
 * @return {Object} Loaded file data
 */
var loadFile = exports.loadFile = function loadFile(key, filePath) {
  var fileContent = fs.readFileSync(filePath);
  var obj         = yaml.load(fileContent);

  if (key in FILE_CACHE) {
    Object.assign(FILE_CACHE[key], obj);
  } else {
    FILE_CACHE[key] = obj;
  }

  return obj;
};

/**
 * Load a YAML file as config file.
 *
 * @param {String}   configFilePath - Path of config file
 * @param {Function} calback
 */
var loadConfig = exports.loadConfig = function loadConfig(configFilePath, callback) {
  var configObj     = loadFile(CONFIG_KEY, configFilePath);
  var userConfigObj = {};

  var configFromEnvPrefix   = configObj.CONFIG_FROM_ENV_PREFIX;
  var configPrefixForCustom = configObj.CUSTOM_CONFIG_PREFIX;

  // Collect config field type map
  var configTypeMap = {};
  for (var k in configObj) {
    var v = configObj[k];
    switch(typeof v) {
      case 'number':
        if (configObj[k].toString().match(/^\d+$/)) {
          configTypeMap[k] = 'integer';

        } else {
          configTypeMap[k] = 'float';
        }
        break;

      case 'boolean':
        configTypeMap[k] = 'boolean';
        break;

      default:
        if (toolkit.endsWith(k, '_LIST') || Array.isArray(v)) {
          configTypeMap[k] = 'list';

        } else if (toolkit.endsWith(k, '_MAP') || 'object' === typeof v) {
          configTypeMap[k] = 'map';

        } else {
          configTypeMap[k] = 'string';
        }
        break;
    }
  }

  var userConfigPath = process.env[`${configFromEnvPrefix}${CONFIG_FILE_PATH_KEY}`] || configObj[CONFIG_FILE_PATH_KEY];
  if (!userConfigPath) {
    // User config path NOT SET
    console.log('[YAML Resource] ENV `CONFIG_FILE_PATH` not set. Use default config.');

  } else {
    // User config from FILE
    if (!fs.existsSync(userConfigPath)) {
      console.log(toolkit.strf('[YAML Resource] Config file `{0}` not found. Use default config.', userConfigPath));

    } else {
      var userConfigContent = fs.readFileSync(userConfigPath);
      userConfigObj = yaml.load(userConfigContent);

      Object.assign(configObj, userConfigObj)

      console.log(toolkit.strf('[YAML Resource] Config Overrided by: `{0}`', userConfigPath));
    }
  }

  // User config from env
  for (var envK in process.env) {
    if (!toolkit.startsWith(envK, configFromEnvPrefix)) continue;

    var k = envK.slice(configFromEnvPrefix.length);
    var v = process.env[envK];

    if ('string' === typeof v && v.trim() === '') {
      continue;
    }

    if (k in configObj) {
      configObj[k] = v;
      console.log(toolkit.strf('[YAML Resource] Config item `{0}` Overrided by env.', k));

    } else if (toolkit.startsWith(k, configPrefixForCustom)) {
      configObj[k] = v;
      console.log(toolkit.strf('[YAML Resource] Custom config item `{0}` added by env.', k));
    }
  }

  // Convert config value type
  for (var k in configObj) {
    var v = configObj[k];
    var type = configTypeMap[k];

    if (!type) continue;

    if (v === null) {
      switch(type) {
        case 'integer':
        case 'float':
          configObj[k] = 0;
          break;

        case 'list':
          configObj[k] = [];
          break;

        case 'map':
          configObj[k] = {};
          break;

        case 'string':
          configObj[k] = '';
          break;

        case 'boolean':
          configObj[k] = false;
          break;
      }
      continue;
    }

    switch(type) {
      case 'integer':
        configObj[k] = parseInt(v);
        break;

      case 'float':
        configObj[k] = parseFloat(v);
        break;

      case 'list':
        if (Array.isArray(v)) break;

        configObj[k] = v.toString();
        if (configObj[k].length > 0) {
          configObj[k] = v.trim().split(/[, \n]+/g).map(function(x) {
            return x.trim();
          });

        } else {
          configObj[k] = [];
        }
        break;

      case 'map':
        if ('object' === typeof v) break;

        var itemMap = {};
        v.split(',').forEach(function(item) {
          var itemParts = item.split('=');
          var itemK = itemParts[0].trim();
          var itemV = (itemParts[1] || '').trim();
          itemMap[itemK] = itemV;
        });
        configObj[k] = itemMap;
        break;

      case 'string':
        configObj[k] = v.toString();
        break;

      case 'boolean':
        configObj[k] = toolkit.toBoolean(v);
        break;
    }
  }

  // Remap
  if (configObj.__REMAP) {
    for (var from in configObj.__REMAP) {
      var to = configObj.__REMAP[from];

      configObj[to] = configObj[from];
      delete configObj[from];

      userConfigObj[to] = userConfigObj[from];
      delete userConfigObj[from];
    }
  }

  // Cache
  if (CONFIG_KEY in FILE_CACHE) {
    Object.assign(FILE_CACHE[CONFIG_KEY], configObj);
  } else {
    FILE_CACHE[CONFIG_KEY] = configObj;
  }

  _warnInvisibleCharInConfig(configObj);

  // Returns: finall merged config, user config
  return callback(null, configObj, userConfigObj);
};

/**
 * Get the loaded YAML file data.
 *
 * @param  {String} key - Key of loaded data
 * @return {Object} Loaded file data
 */
exports.get = function get(key) {
  key = key.replace('.yaml', '');
  var resource = FILE_CACHE[key] || null;

  return resource;
};

/**
 * Set the value of loaded YAML file data.
 * @param {String} key
 * @param {String} path
 * @param {Any}    value
 */
exports.set = function set(key, path, value) {
  FILE_CACHE[key][path] = value;
};

/**
 * Get all the loaded YAML file data.
 *
 * @return {Object} All loaded file data
 */
exports.getAll = function getAll() {
  return FILE_CACHE;
};
