'use strict';

/* Built-in Modules */
var path = require('path');

/* 3rd-party Modules */
var sortedJSON = require('sorted-json');
var async      = require('async');
var request    = require('request');

/* Project Modules */
var toolkit    = require('./toolkit');
var IMAGE_INFO = require('../../image-info.json');

var common = exports;

var SCRIPT_TYPE_EXT_MAP = {
  python  : 'py',
  markdown: 'md',
};

var SCRIPT_SET_MD5_FIELDS = [
  'id',
  'title',
  'description',
  'requirements',
];
var SCRIPT_MD5_FIELDS = [
  'id',
  'title',
  'description',
  'type',
  'codeMD5',
];

var IMPORT_DATA_KEYS_WITH_ORIGIN = [
  'scriptSets',
  'syncAPIs',
  'asyncAPIs',
  'cronJobs',
];

common.IMPORT_EXPORT_DATA_SCHEMA_VERSION = 2;

common.convertImportExportDataSchema = function(data) {
  data.version = data.version || 1;

  // v1 => v2
  if (data.version === 1) {
    // `data.scriptSets[#]._exportUser` field location changed to `data.scriptSets[#]._extra.exportUser`
    // `data.scriptSets[#]._exportTime` field location changed to `data.scriptSets[#]._extra.exportTime`
    // `data.scriptSets[#]._note`       field location changed to `data.scriptSets[#]._extra.note`
    if (toolkit.notNothing(data.scriptSets)) {
      data.scriptSets.forEach(function(scriptSet) {
        scriptSet._extra = scriptSet._extra || {};
        if ('_exportUser' in scriptSet) scriptSet._extra.exportUser = scriptSet._exportUser;
        if ('_exportTime' in scriptSet) scriptSet._extra.exportTime = scriptSet._exportTime;
        if ('_note'       in scriptSet) scriptSet._extra.note       = scriptSet._note;

        delete scriptSet._exportUser;
        delete scriptSet._exportTime;
        delete scriptSet._note;
      })
    }

    // `data.exportUser` field location changed to `data.extra.exportUser`
    // `data.exportTime` field location changed to `data.extra.exportTime`
    // `data.note`       field location changed to `data.extra.note`
    data.extra = data.extra || {};
    if ('exportUser' in data) data.extra.exportUser = data.exportUser;
    if ('exportTime' in data) data.extra.exportTime = data.exportTime;
    if ('note'       in data) data.extra.note       = data.note;

    delete data.exportUser;
    delete data.exportTime;
    delete data.note;

    // Update version
    data.version = 2;
  }

  return data;
};

common.getExportUser = function(locals) {
  var exportUser = `${locals.user.username || 'ANONYMOUS'}`;
  if (locals.user.name) {
    exportUser = `${locals.user.name || 'ANONYMOUS'} (${locals.user.username || 'ANONYMOUS'})`;
  }
  return exportUser;
};

common.getScriptFilename = function(script) {
  var filename = script.id.split('__').slice(1).join('__');
  var fileExt = SCRIPT_TYPE_EXT_MAP[script.type];
  if (fileExt) filename += '.' + fileExt;

  return filename;
};

common.flattenImportExportData = function(data) {
  if ('string' === typeof data) {
    data = JSON.parse(data);
  }

  data.scriptSets = data.scriptSets || [];
  data.scripts    = data.scripts    || [];
  data.funcs      = data.funcs      || [];

  // Flatten Script data
  data.scriptSets.forEach(function(scriptSet) {
    var _scripts = scriptSet.scripts;
    delete scriptSet.scripts;

    if (toolkit.isNothing(_scripts)) return;

    _scripts.forEach(function(script) {
      script.scriptSetId = scriptSet.id;

      script.code    = script.code    || '';                         // Ensure `code` field is not NULL
      script.codeMD5 = script.codeMD5 || toolkit.getMD5(script.code) // Compute MD5

      if (script.codeDraft) {
        script.codeDraft    = script.codeDraft    || '';                              // Ensure codeDraft field is not NULL
        script.codeDraftMD5 = script.codeDraftMD5 || toolkit.getMD5(script.codeDraft) // Compute MD5
      } else {
        script.codeDraft    = script.code;
        script.codeDraftMD5 = script.codeMD5;
      }

      data.scripts.push(script);
    });
  });

  // Flatten Func data
  data.scripts.forEach(function(script) {
    var _funcs = script.funcs;
    delete script.funcs;

    if (toolkit.isNothing(_funcs)) return;

    _funcs.forEach(function(func) {
      func.scriptId    = script.id;
      func.scriptSetId = script.scriptSetId;

      data.funcs.push(func);
    });
  });

  return data;
};

function _getScriptSetMD5Fields(fields, tableAlias) {
  fields = toolkit.jsonCopy(fields);
  if (tableAlias) {
    fields = fields.map(function(f) {
      return `${tableAlias}.${f}`;
    });
  }

  return fields;
};

common.getScriptSetMD5Fields = function(tableAlias) {
  return _getScriptSetMD5Fields(SCRIPT_SET_MD5_FIELDS, tableAlias);
};

common.getScriptMD5Fields = function(tableAlias) {
  return _getScriptSetMD5Fields(SCRIPT_MD5_FIELDS, tableAlias);
};

common.getScriptSetMD5 = function(scriptSet, scripts) {
  var dataToMD5 = {
    scriptSet: {},
    scripts  : [],
  }

  // Script Set field
  common.getScriptSetMD5Fields().forEach(function(f) {
    if (!(f in scriptSet)) throw new Error(`Lack of Script Set field to compute Script Set MD5: ${f}`);

    dataToMD5[f] = scriptSet[f];
  });

  // Script field
  if (toolkit.notNothing(scripts)) {
    scripts.forEach(function(script) {
      var _script = {};

      common.getScriptMD5Fields().forEach(function(f) {
        if (!(f in script)) throw new Error(`Lack of Script field to compute Script Set MD5: ${f}`);

        _script[f] = script[f];
      });

      dataToMD5.scripts.push(_script);
    });

    dataToMD5.scripts.sort(function compareFn(a, b) {
      if (a.id < b.id)      return -1;
      else if (a.id > b.id) return 1;
      else                  return 0;
    });
  }

  var strToMD5 = sortedJSON.sortify(dataToMD5, { stringify: true });
  var md5 = toolkit.getMD5(strToMD5);

  return md5;
};

common.replaceImportDataOrigin = function(importData, origin, originId) {
  IMPORT_DATA_KEYS_WITH_ORIGIN.forEach(function(key) {
    var data = importData[key];
    if (toolkit.isNothing(data)) return;

    data.forEach(function(d) {
      d.origin   = origin;
      d.originId = originId;
    });
  });

  return importData;
};

common.getGuanceNodes = function() {
  var guanceNodes = [];

  [ 'guance', 'truewatch' ].forEach(function(type) {
    var nodeUrls = toolkit.safeReadFileSync(path.join(__dirname, `../../${type}-node-urls.json`), 'json').urls || {};

    // Convert format
    for (var key in nodeUrls) {
      var urlMap = nodeUrls[key];

      var nodeKey = 'guance' === type ? key : `${key}_${type}`;
      guanceNodes.push({
        type        : type,
        key         : nodeKey,
        'name_en'   : (urlMap.name_en   || key).replace(/([^ ])\(/g, '$1 ('),
        'name_zh-CN': urlMap.name      || key,
        openapi     : urlMap.open_api  || urlMap.openapi || null,
        openway     : urlMap.openway   || null,
        websocket   : urlMap.websocket || null,
      });
    }
  });

  // Add private node info
  guanceNodes.push({
    key         : 'private',
    'name_en'   : 'Private or Customized',
    'name_zh-CN': '私有部署或自定义',
    'name_zh-HK': '私有部署或自定義',
    'name_zh-TW': '私有部署或自定義',
    'name_ja'   : 'プライベートまたはカスタマイズ',
    openapi     : 'https://openapi.YOUR_DOMAIN.com',
    openway     : 'https://openway.YOUR_DOMAIN.com',
    websocket   : 'https://websocket.YOUR_DOMAIN.com',
  });

  // Add testing node info when running in dev version
  if (['0.0.0', 'dev'].indexOf(IMAGE_INFO.VERSION) >= 0) {
    guanceNodes.push({
      key         : 'testing',
      'name_en'   : 'Testing',
      'name_zh-CN': '测试环境',
      'name_zh-HK': '測試環境',
      'name_zh-TW': '測試環境',
      'name_ja'   : 'テスト環境',
      openapi  : 'http://testing-ft2x-open-api.dataflux.cn',
      openway  : 'http://testing-openway.dataflux.cn',
      websocket: 'http://testing-ft2x-websocket.dataflux.cn',
    });
  }

  return guanceNodes;
};

common.checkGuanceAPIKey = function(guanceNode, guanceAPIKeyID, guanceAPIKey, callback) {
  async.series([
    // Try to call Guance, TrueWatch OpenAPI
    function(asyncCallback) {
      var requestOptions = {
        method : 'get',
        url    : `${guanceNode.openapi}/api/v1/workspace/accesskey/list`,
        headers: { 'DF-API-KEY': guanceAPIKeyID },
        json   : true,
      };
      request(requestOptions, function(err, _res, _body) {
        if (err) return asyncCallback(err);

        if (_res.statusCode >= 400) {
          return asyncCallback(new Error('Calling Guance API Failed'));
        }

        var matchedData = _body.content.filter(function(d) {
          return d.ak === guanceAPIKeyID && d.sk === guanceAPIKey;
        });
        if (matchedData.length <= 0) {
          return asyncCallback(new Error('Guance API Key ID and API Key not match'));
        }

        return asyncCallback();
      });
    },
  ], function(err) {
    if (err) return callback(err);
    return callback();
  });
};

common.getLockConfigMemberAllowMap = function(lockConfig) {
  lockConfig         = lockConfig         || {};
  lockConfig.members = lockConfig.members || [];

  var memberAllowMap = {};
  lockConfig.members.forEach(function(m) {
    m.allowedOperations.forEach(function(op) {
      var key = `${m.userId}@${op}`;
      memberAllowMap[key] = true;
    });
  })

  return memberAllowMap;
};

common.lockConfigCan = function(currentUser, data, operations) {
  // No limit if not locked
  if (!data.lockedByUserId) return true;

  // No limit to sa admin
  if (currentUser.is('sa')) return true;

  // No limit to lock owner
  if (currentUser.id === data.lockedByUserId) return true;

  // Check lock config member config
  var lockConfigMemberAllowMap = data.lockConfigMemberAllowMap || {};
  operations = operations || [];

  operations = toolkit.asArray(operations);
  for (let i = 0; i < operations.length; i++) {
    let key           = `${currentUser.id}@${operations[i]}`;
    let key_allOthers = `_ALL@${operations[i]}`;
    if (lockConfigMemberAllowMap[key] || lockConfigMemberAllowMap[key_allOthers]) {
      return true;
    }
  }

  return false;
}
