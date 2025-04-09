import axios from 'axios'
import router from '@/router'
import store from '@/store'
import i18n from '@/i18n'
import C from '@/const'
import { MessageBox, Notification } from 'element-ui';

// CodeMirror
import CodeMirror from 'codemirror/lib/codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/keymap/sublime'
// CodeMirror code highlight
import 'codemirror/mode/python/python'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/diff/diff'
// CodeMirror code highlight theme
import 'codemirror/theme/eclipse.css'
import 'codemirror/theme/monokai.css'
import 'codemirror/theme/base16-light.css'
import 'codemirror/theme/base16-dark.css'
import 'codemirror/theme/duotone-light.css'
import 'codemirror/theme/duotone-dark.css'
import 'codemirror/theme/neat.css'
import 'codemirror/theme/material-darker.css'
import 'codemirror/theme/eclipse.css'
import 'codemirror/theme/idea.css'
import 'codemirror/theme/darcula.css'
// CodeMirror Addon: code fold
import 'codemirror/addon/fold/foldgutter.css'
import 'codemirror/addon/fold/foldcode.js'
import 'codemirror/addon/fold/foldgutter.js'
import 'codemirror/addon/fold/brace-fold.js'
import 'codemirror/addon/fold/indent-fold.js'
import 'codemirror/addon/fold/comment-fold.js'
// CodeMirror Addon: active line
import 'codemirror/addon/selection/active-line.js'
// CodeMirror Addon: hint
import 'codemirror/addon/hint/show-hint.js'
// CodeMirror Addon: brackets matching / closing
import 'codemirror/addon/edit/matchbrackets.js'
import 'codemirror/addon/edit/closebrackets.js'
// CodeMirror Addon: trailingspace
import 'codemirror/addon/edit/trailingspace.js'
// CodeMirror Addon: comment
import 'codemirror/addon/comment/comment.js'
import 'codemirror/addon/comment/continuecomment.js'
// CodeMirror Addon: search
import 'codemirror/addon/search/search.js'
import 'codemirror/addon/search/searchcursor.js'
import 'codemirror/addon/dialog/dialog.js'
import 'codemirror/addon/dialog/dialog.css'

// ID
import { customAlphabet } from 'nanoid'
const nanoid        = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 12)
const nanoid_simple = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6)

// Base64
import { Base64 } from 'js-base64'

// Time handling
import moment from 'moment'

// Diff
import { diffTrimmedLines } from 'diff'

// Useragent
import Bowser from "bowser"

// byte size
import byteSize from 'byte-size'

// DataFlux Func hint
import '@/assets/css/dff-hint.css'
import '@/assets/js/dff-anyword.js'

export const MIN_UNIX_TIMESTAMP    = moment('2000-01-01T00:00:00Z').unix();
export const MIN_UNIX_TIMESTAMP_MS = MIN_UNIX_TIMESTAMP * 1000;
export const MAX_UNIX_TIMESTAMP    = moment('2099-12-31T23:59:59Z').unix();
export const MAX_UNIX_TIMESTAMP_MS = MAX_UNIX_TIMESTAMP * 1000;

// Markdown
import { marked } from 'marked'

// Network error alert
let IS_UNDER_NETWORK_ERROR_NOTICE = false;

let handleCircular = function() {
  let cache = [];
  let keyCache = []
  return function(key, value) {
    if (typeof value === 'object' && value !== null) {
      let index = cache.indexOf(value);
      if (index !== -1) {
          return '[Circular ' + keyCache[index] + ']';
      }
      cache.push(value);
      keyCache.push(key || 'root');
    }
    return value;
  }
}

let originalJSONStringify = JSON.stringify;
JSON.stringify = function(value, replacer, space) {
  replacer = replacer || handleCircular();
  return originalJSONStringify(value, replacer, space);
}

export function _switchToBuiltinAuth() {
  store.commit('switchToBuiltinAuth');
};

export function getNavigateType() {
  try {
    return performance.getEntriesByType('navigation')[0].type;
  } catch(err) {
    return null;
  }
};

export function getUILocale() {
  var vuexData = localStorage.getItem('vuex');
  if (!vuexData) {
    vuexData = {};
  } else if ('string' === typeof vuexData) {
    vuexData = JSON.parse(vuexData);
  }

  let uiLocale = vuexData.uiLocale || window.navigator.language;
  let uiLocaleParts = uiLocale.split('.')[0].split(/[_-]/);

  // English does not distinguish between countries
  if (uiLocaleParts[0] == 'en') uiLocale = 'en';

  return uiLocale;
};

export function getVirtualDir() {
  let virtualDir = location.pathname.split('/').slice(0, -2).join('/');
  return virtualDir;
};

export function getBaseURL() {
  let baseURL = store.getters.SYSTEM_INFO('WEB_BASE_URL')
              || process.env.VUE_APP_BACKEND_SERVER
              || `${location.origin}${getVirtualDir()}`;
  return baseURL;
};

export function getOfficialSiteURL() {
  let uiLocale = getUILocale();
  return C.UI_LOCALE_MAP.get(uiLocale).officialSite;
};
export function getOfficialDocURL(path) {
  path = path || '/';

  let uiLocale = getUILocale();
  return C.UI_LOCALE_MAP.get(uiLocale).officialDocBaseURL + path;
};

export function isLocalhost() {
  return location.hostname === 'localhost' || location.hostname === 'localdev';
};
export function isFuncDev() {
  return location.hostname === 'func-dev.dataflux.cn' || isLocalhost();
};

export function isFuncDemo() {
  return location.hostname === 'func-demo.dataflux.cn' || isLocalhost();
};

export function autoScrollTable() {
  let key = router.currentRoute.name;
  let y = (store.state.TableList_scrollY || {})[key];

  if (y && store.state.highlightedTableDataId && document.getElementsByClassName('hl-row')[0]) {
    // Scroll to specified height
    let el = document.getElementsByClassName('el-table__body-wrapper')[0];
    if (el) {
      el.scrollTo(null, y);
      return;
    }
  }
};

export function getTableScrollY() {
  let el = document.getElementsByClassName('el-table__body-wrapper')[0];
  if (!el) return null;

  return el.scrollTop;
};

export function getBrowser() {
  return Bowser.getParser(window.navigator.userAgent).getBrowserName();
};
export function getEngine() {
  return Bowser.getParser(window.navigator.userAgent).getEngineName();
};

export function isMac() {
  return (navigator.platform == 'Mac68K')
      || (navigator.platform == 'MacPPC')
      || (navigator.platform == 'Macintosh')
      || (navigator.platform == 'MacIntel');
};

export function getSuperKeyName() {
  return isMac() ? 'command' : 'Ctrl';
};
export function getAltKeyName() {
  return isMac() ? 'option' : 'Alt';
};
export function getShiftKeyName() {
  return isMac() ? 'shift' : 'Shift';
};

export function debounce(fn, delay) {
  delay = delay || 300;
  let T;

  return function() {
    let self = this;
    let args = arguments;

    if (T) clearTimeout(T);
    T = setTimeout(function() {
      T = null;
      fn.apply(self, args);
    }, delay);
  };
};

export function throttle(fn, interval) {
  interval = interval || 1000;
  let last = 0;

  return function () {
    let self = this;
    let args = arguments;
    let now = Date.now();
    // Determine the frequency based on the difference between the current time and the last run time
    if (now - last >= interval) {
      last = now;
      fn.apply(self, args);
    }
  };
};

export function sleep(duration) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, duration)
  })
};

export function strf() {
  let args = Array.prototype.slice.call(arguments);
  if (0 === args.length) {
    return '';
  }

  let pattern = args.shift();
  try {
    pattern = pattern.toString();
  } catch (err) {
    pattern = '';
  }

  return pattern.replace(/\{(\d+)\}/g, function replaceFunc(m, i) {
    return args[i] + '';
  });
};

export function genDataId(prefix) {
  prefix = prefix || 'data';
  return prefix + '-' + nanoid();
};

export function genSimpleDataId(prefix) {
  prefix = prefix || 'node';
  return prefix + '-' + nanoid_simple();
}

export function byteSizeHuman(s) {
  return byteSize(s, { units: 'iec' });
};

export function getBase64(str, uriSafe) {
  if (uriSafe) {
    return Base64.encodeURI(str);
  } else {
    return Base64.encode(str);
  }
};

export function fromBase64(base64str) {
  return Base64.decode(base64str);
};

export function genRandString(len, chars) {
  if (!len) len = 32;

  var samples = chars || '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  var randString = '';
  for (var i = 0; i < len; i++) {
    var randIndex = Math.floor(Math.random() * samples.length);
    randString += samples[randIndex];
  }

  return randString;
};

export function isNullOrUndefined(o) {
  if (o === null || o === undefined) {
    return true;
  }

  return false;
};

export function isNullOrEmpty(o) {
  if (isNullOrUndefined(o) === true) {
    return true;
  }

  if ('string' === typeof o && o.length === 0) {
    return true;
  }

  return false;
};

export function isNullOrWhiteSpace(o) {
  if (isNullOrEmpty(o) === true) {
    return true;
  }

  if ('string' === typeof o && o.trim().length === 0) {
    return true;
  }

  return false;
};

export function noNullOrWhiteSpace(o) {
  var newObj = {};
  for (var k in o) {
    if (isNullOrWhiteSpace(o[k])) continue;

    newObj[k] = o[k];
  }

  return newObj;
};

export function isNothing(o) {
  if (isNullOrWhiteSpace(o) === true) {
    return true;
  }

  if ('number' === typeof o) {
    return false;
  } else if ('boolean' === typeof o) {
    return false;
  } else if ('string' === typeof o) {
    return o.trim().length === 0;
  } else if (Array.isArray(o)) {
    return o.length === 0;
  } else if ('object' === typeof o){
    try {
      return JSON.stringify(o) === '{}';
    } catch(err) {
      return false;
    }
  }

  return false;
};

export function notNothing(o) {
  return !isNothing(o);
};

export function asArray(o) {
  if (isNullOrUndefined(o)) {
    return o;

  } else if (Array.isArray(o)) {
    return o;

  } else {
    return [o];
  }
};

export function toBoolean(o) {
  if (isNullOrUndefined(o)) {
    return o;
  }

  if ('boolean' === typeof o) {
    return o;
  }

  if ('number' === typeof o || !isNaN(parseInt(o))) {
    return (parseInt(o) > 0);
  }

  if ('string' === typeof o) {
    if (['true',  '1', 'o', 'y', 'yes', 'ok', 'on' ].indexOf(o.toLowerCase()) >= 0) return true;
    if (['false', '0', 'x', 'n', 'no',  'ng', 'off'].indexOf(o.toLowerCase()) >= 0) return false;
  }

  return null;
};

export function sort(arr) {
  return arr.sort((a, b) => {
    if (a < b) return -1;
    else if (a > b) return 1;
    else return 0;
  });
};

export function noDuplication(arr) {
  let dumpsArr = [];
  for (let i = 0; i < arr.length; i++) {
    let xDumps = JSON.stringify(arr[i]);
    if (dumpsArr.indexOf(xDumps) < 0) {
      dumpsArr.push(xDumps);
    }
  }

  return dumpsArr.map(x => {
    return JSON.parse(x);
  });
};

export function limitText(text, maxLength, options) {
  text      = text      || '';
  maxLength = maxLength || 30;
  options   = options   || {};

  if (text.length <= maxLength) {
    return text;
  } else {
    var limited = text.slice(0, maxLength - 3) + '...';

    if (options.showLength) {
      if (options.showLength === 'newLine') {
        limited += `\n <Length: ${text.length}>`;
      } else {
        limited += ` <Length: ${text.length}>`;
      }
    }
    return limited;
  }
};

export function limitLines(text, lineLimit, columnLimit) {
  if (!text) return text;

  if (!lineLimit) lineLimit = 5;

  let start = 0;
  let end   = lineLimit;
  if (lineLimit < 0) {
    start = lineLimit;
    end   = undefined;
  }

  let lines = text.split('\n');
  if (lines.length > Math.abs(lineLimit)) {
    lines = lines.slice(start, end);

    if (lineLimit > 0) {
      lines.push('...');
    } else if (lineLimit < 0) {
      lines.unshift('...');
    }
  }

  if (columnLimit) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > columnLimit) {
        lines[i] = lines[i].slice(0, columnLimit) + '...';
      }
    }
  }

  return lines.join('\n');
};

export function numberLimit(n, limit) {
  n     = n || 0;
  limit = limit || 99;

  if (n > limit) {
    return `${limit}+`;
  } else {
    return n;
  }
};

export function numberComma(n) {
  n = n.toString();
  let parts = n.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

export function jsonFind(j, path, safe) {
  if (j === null || 'undefined' === typeof j) {
    if (safe) {
      return null;
    } else {
      throw new Error('jsonFind() - hit `null`');
    }
  }

  if (path === null) {
    if (safe) {
      return null;
    } else {
      throw new Error('jsonFind() - `null` path');
    }
  }

  var currPath = '<TOP>';
  var subJ = j;
  var steps = path.split('.');
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    currPath = [currPath, step].join('.');

    if ('undefined' === typeof subJ) {
      if (safe) {
        return null;
      } else {
        throw new Error('jsonFind() - hit `undefined` at `' + currPath + '`');
      }

      break;
    }

    subJ = subJ[step];
  }

  return subJ;
};
export function jsonFindSafe(j, path) {
  return jsonFind(j, path, true);
}

export function jsonCopy(j) {
  return JSON.parse(JSON.stringify(j));
};

export function jsonPick(j, keys) {
  if (isNothing(keys)) return j;

  keys = asArray(keys);

  var ret = {};
  var _copied = jsonCopy(j);

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    ret[k] = _copied[k];
  }

  return ret;
};

export function jsonUpdate(src, dest, options) {
  options = options || {};

  let next = jsonCopy(src || {});
  if (dest) {
    for (let k in dest) {
      let v = dest[k];

      if (isNothing(v)) {
        delete next[k];
      } else {
        next[k] = v;
      }
    }
  }

  return next;
};

export function jsonClear(j, clearValue) {
  clearValue = clearValue || null;

  for (let k in j) if (j.hasOwnProperty(k)) {
    j[k] = clearValue
  }
};

export function jsonLength(j) {
  return Object.keys(j).length;
};

export function startsWith(s, prefix) {
  return s.indexOf(prefix) === 0;
};

export function endsWith(s, suffix) {
  return (s.slice(-1 * suffix.length) === suffix);
};

export function splitCamel(s) {
  var converted = '';

  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (s.charCodeAt(i) < 90 && s.charCodeAt(i - 1) > 96) {
      converted = converted.trim() + ' ';
    }
    if (s.charCodeAt(i) < 90 && s.charCodeAt(i + 1) > 96) {
      converted = converted.trim() + ' ';
      ch = ch.toLowerCase();
    }

    converted += ch;
  };

  return converted;
};

export function getDiffInfo(src, dest) {
  src  = src  || '';
  dest = dest || '';

  let diffResult = diffTrimmedLines(src, dest);

  let srcTotalCount  = src.split('\n').length;
  let destTotalCount = dest.split('\n').length;

  let addedCount   = 0;
  let removedCount = 0;
  diffResult.forEach(x => {
    if (x.added) {
      addedCount += x.value.split('\n').length - 1;
    } else if (x.removed) {
      removedCount += x.value.split('\n').length - 1;
    }
  });

  let diffInfo = {
    srcTotalCount : srcTotalCount,
    destTotalCount: destTotalCount,
    addedCount    : addedCount,
    removedCount  : removedCount,
  };
  return diffInfo;
};

export function padZero(num, length, char) {
  var len = num.toString().length;
  while (len < length) {
    num = (char || '0') + num;
    len++;
  }

  return num;
};

export function formatQuery(query) {
  let queryString = '';
  if (query) {
    let queryStringParts = [];
    for (let k in query) if (query.hasOwnProperty(k)) {
      let v = query[k];
      if ('undefined' === typeof v || null === v) continue;

      switch(typeof v) {
        case 'string':
        case 'number':
        case 'boolean':
          v = v.toString();
          break;

        case 'object':
          v = JSON.stringify(v);
          break;
      }

      v = encodeURIComponent(v);

      queryStringParts.push(`${k}=${v}`);
    }

    if (queryStringParts.length > 0) {
      queryString = `${queryStringParts.join('&')}`;
    }
  }

  return queryString;
};

export function formatURL(pathPattern, options) {
  options = options || {};

  let path = pathPattern;
  if (options.params) {
    for (let k in options.params) if (options.params.hasOwnProperty(k)) {
      let v = options.params[k].replace('', '');
      path = path.replace(`/:${k}`, `/${v}`);
    }
  }

  let baseURL = options.baseURL || '';
  if (baseURL === true) {
    baseURL = getBaseURL();
  }
  if (baseURL && baseURL.slice(-1) === '/') {
    baseURL = baseURL.slice(0, -1);
  }

  if (options.auth) {
    options.query = options.query || {};
    let authQuery = store.getters.SYSTEM_INFO('_WEB_AUTH_QUERY');
    options.query[authQuery] = store.state.xAuthToken;
  }

  let queryString = '';
  if (options.query) {
    queryString = formatQuery(options.query);
    if (queryString) {
      queryString = '?' + queryString;
    }
  }

  let url = `${baseURL}${path}${queryString}`;

  return url;
};

export function getQuery(url) {
  var query = {};

  url = url || '';
  var queryString = url.split('#')[0].split('?')[1];
  if (!queryString) {
    return query;
  }

  var parts = queryString.split('&');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split('=');
    var k = kv[0];
    var v = kv[1];

    if (!query[k]) {
      query[k] = v;
    } else {
      if (Array.isArray(query[k])) {
        query[k].push(v);
      } else {
        query[k] = [query[k], v];
      }
    }
  }

  return query;
};

export function parseVersion(ver) {
  let m = ('' + ver).trim().match(/^\d+(\.\d+)+$/g);
  if (!m) {
    return false;
  } else {
    return m[0].split('.').map(x => parseInt(x));
  }
};

export function compareVersion(a, b) {
  let aParts = parseVersion(a);
  let bParts = parseVersion(b);

  if (!aParts && bParts) return -1;
  else if (aParts && !bParts) return 1;
  else if (!aParts && !bParts) return 0;

  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    if (aParts[i] < bParts[i]) return -1;
    else if (aParts[i] > bParts[i]) return 1;
  }

  if (aParts.length < bParts.length) return -1;
  else if (aParts.length > bParts.length) return -1;
  else return 0;
};

export function isExpired(dt) {
  return getMoment(dt).unix() < getMoment().unix();
};

export function getMoment(d) {
  if ('number' === typeof d || ('string' === typeof d && d.match(/^\d+$/))) {
    d = parseInt(d);
    if (d < MIN_UNIX_TIMESTAMP_MS) {
      d *= 1000;
    }
  }

  return moment(d || undefined);
};

export function getTimestampMs(d) {
  let timestampMs = getMoment(d).valueOf();
  return timestampMs;
};

export function getTimestamp(d, ndigits) {
  let timestamp = getTimestampMs(d) / 1000;

  ndigits = ndigits || 0;
  if (ndigits === 0) {
    return Math.round(timestamp);
  } else if (ndigits === 3) {
    return timestamp;
  } else {
    return parseFloat((timestamp).toFixed(ndigits));
  }
};

export function getDateTimeString(d, f) {
  let uiLocale = getUILocale();
  let utcOffset = (0 - new Date().getTimezoneOffset() / 60);
  return getMoment(d).locale(uiLocale).utcOffset(utcOffset).format(f || 'YYYY-MM-DD HH:mm:ss');
};

export function fromNow(d, limit) {
  let now = getTimestampMs();
  let dm  = getMoment(d);
  if (limit) {
    limit = limit.toLowerCase();

    let dmTimestampMs = dm.valueOf();
    if (limit === 'before' && dmTimestampMs > now) {
      dm = getMoment();
    } else if (limit == 'after' && dmTimestampMs < now) {
      dm = getMoment();
    }
  }
  let uiLocale = getUILocale();
  return dm.locale(uiLocale).fromNow();
};

export function toNow(d) {
  return fromNow(d, 'before');
};

export function toFuture(d) {
  return fromNow(d, 'after');
};

export function duration(d, humanized) {
  let uiLocale = getUILocale();
  let duration = moment.duration(d).locale(uiLocale);
  if (humanized) {
    return duration.humanize();
  } else {
    var parts = [];
    [ 'y', 'd', 'h', 'm', 's' ].forEach(t => {
      let v = duration.get(t);
      if (v) parts.push(i18n.tc(`n${t.toUpperCase()}`, v));
    });
    return parts.join(' ');
  }
};

export function getTimeDiff(from, to, humanized) {
  let diff = getMoment(to).diff(getMoment(from));
  return duration(diff, humanized);
};

export function alert(message, type) {
  type = type || 'error';

  let confirmButtonText = null;
  switch(type) {
    case 'success':
      confirmButtonText = i18n.t('Very good');
      break;

    default:
      confirmButtonText = i18n.t('OK');
      break;
  }

  if (!message) return;

  // Simple tips, no need to distinguish between title and content
  return MessageBox.alert(message, {
    showClose               : false,
    dangerouslyUseHTMLString: true,
    confirmButtonText       : confirmButtonText,
    type                    : type,
  });
};

export async function confirm(message) {
  try {
    // Simple tips, no need to distinguish between title and content
    await MessageBox.confirm(message, {
      dangerouslyUseHTMLString: true,
      confirmButtonText       : i18n.t('Yes'),
      cancelButtonText        : i18n.t('No'),
      type                    : 'warning',
    });

    // Clicked Yes
    return true;

  } catch(err) {
    // Clicked No
    return false;
  }
};

export async function prompt(message, defaultValue, options) {
  options = options || {};

  try {
    Object.assign(options, {
      inputValue              : defaultValue,
      dangerouslyUseHTMLString: true,
      closeOnClickModal       : false,
      confirmButtonText       : i18n.t('Confirm'),
      cancelButtonText        : i18n.t('Cancel'),
    })
    let promptRes = await MessageBox.prompt(message, options);

    return promptRes ? promptRes.value || null : null;

  } catch(err) {
    // Clicked Cancel
    return null;
  }
};

export function notify(message, type) {
  type = type || 'success';

  let duration = null;
  switch(type) {
    case 'success':
    case 'info':
      duration = 3 * 1000;
      break

    default:
      duration = 10 * 1000;
      break;
  }

  // Simple tips, no need to distinguish between title and content
  return Notification({
    title                   : null,
    message                 : message,
    dangerouslyUseHTMLString: true,
    type                    : type,
    position                : 'top-right',
    duration                : duration,
    offset                  : 85,
  });
};

function _createAxiosOpt(method, pathPattern, options) {
  options = options || {};

  let url = formatURL(pathPattern, {
    params: options.params,
  });

  let axiosOpt = {
    method      : method,
    url         : url,
    extraOptions: options.extraOptions,
  };

  axiosOpt.baseURL = process.env.VUE_APP_BACKEND_SERVER || getBaseURL();

  if (options.timeout !== false) {
    axiosOpt.timeout = options.timeout || 3 * 60 * 1000;
  }

  if (options.query) {
    axiosOpt.params = options.query;
  }
  if (options.body) {
    axiosOpt.data = options.body;
  }
  if (options.headers) {
    axiosOpt.headers = options.headers;
  }
  if (options.respType) {
    axiosOpt.responseType = options.respType;
  }

  if (options.onUploadProgress) {
    axiosOpt.onUploadProgress = options.onUploadProgress;
  }

  axiosOpt.headers = axiosOpt.headers || {};

  // Add client uiLocale
  if (store.getters.SYSTEM_INFO('_WEB_CLIENT_UILOCALE_HEADER')) {
    axiosOpt.headers[store.getters.SYSTEM_INFO('_WEB_CLIENT_UILOCALE_HEADER')] = store.getters.uiLocale;
  }

  // Add client time
  if (store.getters.SYSTEM_INFO('_WEB_CLIENT_TIME_HEADER')) {
    axiosOpt.headers[store.getters.SYSTEM_INFO('_WEB_CLIENT_TIME_HEADER')] = new Date().toISOString();
  }

  // Add auth info
  if (store.state.xAuthToken) {
    axiosOpt.headers[store.getters.SYSTEM_INFO('_WEB_CLIENT_ID_HEADER')] = store.getters.clientId;

    let authHeaderField = store.getters.SYSTEM_INFO('_WEB_AUTH_HEADER');
    if (store.state.xAuthToken) {
      axiosOpt.headers[authHeaderField] = store.state.xAuthToken;
    }
  }

  // Convert old query fields automatically
  if (axiosOpt.params) {
    for (let k in axiosOpt.params) if (axiosOpt.params.hasOwnProperty(k)) {
      let v = axiosOpt.params[k];

      switch(k) {
        // New version
        case 'fields':
        case 'sort':
        // Old version
        case 'fieldPicking':
        case 'fieldKicking':
          if (Array.isArray(v)) axiosOpt.params[k] = v.join(',');
          break;
      }
    }
  }

  return axiosOpt;
};

async function _prepareAxiosRes(axiosRes) {
  let respContentType = null;
  if (axiosRes && axiosRes.headers) {
    respContentType = axiosRes.headers['content-type'];
  }

  if ('string' === typeof respContentType && respContentType.indexOf('application/json') >= 0) {
    let apiRespData = axiosRes.data;

    switch (Object.prototype.toString.call(apiRespData)) {
      case '[object Blob]':
        apiRespData = await apiRespData.text();
        apiRespData = JSON.parse(apiRespData);
        break;

      case '[object String]':
        apiRespData = JSON.parse(apiRespData);
        break;
    }

    axiosRes.data = apiRespData;
  }

  return axiosRes;
};

async function _doAxios(axiosOpt) {
  let isNoCount = false;
  if (axiosOpt.extraOptions && axiosOpt.extraOptions.noCountProcessing) {
    isNoCount = true;
  }

  if (!isNoCount){
    store.commit('startProcessing');
  }

  try {
    // if (axiosOpt.method.toLowerCase() === 'post' && isNothing(axiosOpt.body)) {
    //   axiosOpt.body = {};
    // }

    let axiosRes = await axios(axiosOpt);

    // Upgrade check
    let serverInfo = {
      VERSION          : axiosRes.headers[store.getters.SYSTEM_INFO('_WEB_SERVER_VERSION_HEADER')],
      RELEASE_TIMESTAMP: parseInt(axiosRes.headers[store.getters.SYSTEM_INFO('_WEB_SERVER_RELEASE_TIMESTAMP_HEADER')]),
    }
    store.dispatch('checkServerUpgradeInfo', serverInfo);

    axiosRes = await _prepareAxiosRes(axiosRes);
    return axiosRes;

  } catch (err) {
    if (err.response) {
      // Server responsed error
      if (err.response.status === 401) {
        // Auth failed, Clear token
        store.commit('updateXAuthToken', null);
      }

      let errResp = await _prepareAxiosRes(err.response)
      return errResp;

    } else {
      if (!IS_UNDER_NETWORK_ERROR_NOTICE) {
        // Preventing repeated prompts for multiple requests
        IS_UNDER_NETWORK_ERROR_NOTICE = true;

        // Communication failure, no response from the server
        await MessageBox.alert(`${i18n.t('Failed to communicate with the server, please refresh the page and try again.')}
            <br>${i18n.t('If the problem continues to occur, please contact the administrator to check the status of the server.')}
            <br><small>${err.toString()}</small>`, {
          showClose               : false,
          dangerouslyUseHTMLString: true,
          confirmButtonText       : i18n.t('OK'),
          type                    : 'error',
        });

        IS_UNDER_NETWORK_ERROR_NOTICE = false;
      }

      throw err;
    }

  } finally {
    if (!isNoCount){
      store.commit('endProcessing');
    }
  }
};

export async function callAPI(method, pathPattern, options) {
  /* Request */
  if (method[0] === '/') {
    options     = pathPattern;
    pathPattern = method;
    method      = 'get';
  }

  options = options || {};

  const axiosOpt = _createAxiosOpt(method, pathPattern, options);
  let axiosRes = await _doAxios(axiosOpt);

  /* Feedback */
  let feedback = options.feedback || {};
  if (axiosRes.status < 400) {
    // Success feedback
    if (feedback.okMessage) {
      setImmediate(() => {
        Notification({
          title                   : null, // Simple tips, no need to distinguish between title and content
          message                 : feedback.okMessage,
          dangerouslyUseHTMLString: true,
          type                    : 'success',
          position                : 'top-right',
          duration                : 3000,
          offset                  : 85,
        });
      });
    }

  } else {
    // Failure feedback
    if (axiosRes.status === 401) {
      // Special handling: no pop-up box for expired tokens, etc.

    } else {
      // General handling for other errors

      if (!feedback.muteError) {
        // Gen messages based on error info automatically
        let message = feedback.reasonMap && feedback.reasonMap[axiosRes.data.reason]
                    ? feedback.reasonMap[axiosRes.data.reason]
                    : i18n.t(axiosRes.data.message);

        // Add small text to show details
        [ 'message', 'exception' ].forEach(detailField => {
          if (axiosRes.data.detail && axiosRes.data.detail[detailField]) {
            message += `<br><small class="text-smaller">${i18n.t(axiosRes.data.detail[detailField].replace(/\n/g, '<br>'))}<small>`;
          }
        });

        // Simple tips, no need to distinguish between title and content
        if (!message) {
          message = `${i18n.t('Failed to access data, please refresh the page and try again.')}<br><small>${method.toUpperCase()} ${pathPattern}</small>`
        }
        MessageBox.alert(message, {
          showClose               : false,
          dangerouslyUseHTMLString: true,
          confirmButtonText       : i18n.t('OK'),
          type                    : 'error',
        });
      }
    }
  }

  let apiRes = axiosRes.data;

  // Special handling: return JSON if binary data is received
  if (options.packResp && axiosRes.status < 400) {
    apiRes = {
      ok     : true,
      error  : axiosRes.status,
      message: '',
      data   : axiosRes.data,
      extra: {
        contentType: axiosRes.headers['content-type'],
      }
    };
  }

  return apiRes;
};

export async function callAPI_get(pathPattern, options) {
  if (endsWith(pathPattern, '/do/delete')) {
    throw Error(`toolkit.callAPI_get(...) can not be used for ~/do/delete APIs, got pathPattern: ${pathPattern}`)
  }

  return await callAPI('get', pathPattern, options);
};

export async function callAPI_getOne(pathPattern, id, options) {
  if (!endsWith(pathPattern, '/do/list')) {
    throw Error(`toolkit.callAPI_getOne(...) can only be used for ~/do/list APIs, got pathPattern: ${pathPattern}`)
  }

  /* Request */
  options = options || {};
  options.query = options.query || {}
  options.query.id = id;
  let apiRes = await callAPI('get', pathPattern, options);

  // Get first item
  if (Array.isArray(apiRes.data)) {
    apiRes.data = apiRes.data[0];
  }

  /* Feedback */
  if (options.feedback) {
    let feedback = options.feedback;

    if (isNothing(apiRes.data)) {
      apiRes.ok = false;

      // No data alert
      if (!feedback.muteError) {
        setTimeout(() => {
          // Simple tips, no need to distinguish between title and content
          MessageBox.alert(i18n.t('Data not found. It may have been deleted'), {
            showClose: false,
            confirmButtonText: i18n.t('OK'),
            type: 'error',
          });
        }, 300);
      }
    }
  }

  return apiRes;
};

export async function callAPI_getAll(pathPattern, options) {
  if (!endsWith(pathPattern, '/do/list')) {
    throw Error(`toolkit.callAPI_getAll(...) can only be used for ~/do/list APIs, got pathPattern: ${pathPattern}`)
  }

  /* Request */
  options = options || {};

  let axiosOpt = _createAxiosOpt('get', pathPattern, options);
  let pagingOpt = { pageSize: 100 };

  let apiRes   = null;
  let isFailed = false;
  let axiosRes = null;
  while (true) {
    // Add paging options
    axiosOpt        = axiosOpt        || {};
    axiosOpt.params = axiosOpt.params || {};
    Object.assign(axiosOpt.params, pagingOpt)

    axiosRes = await _doAxios(axiosOpt);

    if (axiosRes.data.ok) {
      // Turn page if succeed
      if (!apiRes) {
        // First page
        apiRes = axiosRes.data;

      } else {
        // Follow-up page
        apiRes.data = apiRes.data.concat(axiosRes.data.data);
      }

    } else {
      // Interrupt if failed
      apiRes = axiosRes.data;
      isFailed = true;

      break;
    }

    // No more data/no support for paging/non-list/unknown paging type: end loop
    if (!axiosRes.data.pageInfo
        || !Array.isArray(axiosRes.data.data)
        || axiosRes.data.pageInfo.count < axiosRes.data.pageInfo.pageSize
        || ['simple', 'normal', 'marker'].indexOf(axiosRes.data.pageInfo.pagingStyle) < 0) {
      break;
    }

    // Next page of data
    switch (axiosRes.data.pageInfo.pagingStyle) {
      case 'simple':
      case 'normal':
        pagingOpt.pageNumber = (axiosRes.data.pageInfo.pageNumber || 1) + 1;
        break;

      case 'marker':
        pagingOpt.pageNumber = (axiosRes.data.pageInfo.pageNumber || 1) + 1;
        break;

      default:
        // Should never be here
        return apiResp.data;
    }
  }

  /* Feedback */
  let feedback = options.feedback || {};
  if (isFailed) {
    // Request failed
    if (axiosRes.status === 401) {
      // Special handling: no pop-up box for expired tokens, etc.

    } else {
      // General handling for other errors

      if (!feedback.muteError) {
        setTimeout(() => {
          // Gen messages based on error info automatically
          let message = feedback.reasonMap && feedback.reasonMap[axiosRes.data.reason]
                      ? feedback.reasonMap[axiosRes.data.reason]
                      : i18n.t(axiosRes.data.message);

          // Add small text to show details
          [ 'message', 'exception' ].forEach(detailField => {
            if (axiosRes.data.detail && axiosRes.data.detail[detailField]) {
              message += `<br><small class="text-smaller">${i18n.t(axiosRes.data.detail[detailField].replace(/\n/g, '<br>'))}<small>`;
            }
          });

          // Simple tips, no need to distinguish between title and content
          if (!message) {
            message = `${i18n.t('Failed to access data, please refresh the page and try again.')}<br><small>GET ${pathPattern}</small>`
          }
          MessageBox.alert(message, {
            showClose               : false,
            dangerouslyUseHTMLString: true,
            confirmButtonText       : i18n.t('OK'),
            type                    : 'error',
          });
        }, 300);
      }
    }
  }

  // Remove paging info when getting all data
  try { delete apiRes.pageInfo } catch(_) {};

  return apiRes;
};

export function isPageFiltered(options) {
  options = options || {};

  let filter = router.currentRoute.query.filter;

  let listQuery = {};
  if (!isNothing(filter)) {
    try {
      listQuery = JSON.parse(fromBase64(filter));
    } catch(err) {
      console.error(err);
    }
  }

  options.ignore = options.ignore || {};
  options.ignore.pageNumber = 1;
  for (let k in options.ignore) {
    if (listQuery[k] === options.ignore[k]) {
      delete listQuery[k];
    }
  }

  return !isNothing(listQuery);
};

export function createListQuery(nextListQuery) {
  let filter = router.currentRoute.query.filter;

  let listQuery = {};
  if (notNothing(filter)) {
    try {
      listQuery = JSON.parse(fromBase64(filter));
    } catch(err) {
      console.error(err);
    }
  }

  Object.assign(listQuery, nextListQuery || {});

  listQuery = noNullOrWhiteSpace(listQuery);
  return listQuery;
};

export function createPageInfo() {
  return {
    totalCount: 0,
    pageCount : 0,
    pageSize  : 20,
    pageNumber: 1,
  };
};

export function createPageFilter(listQuery) {
  return getBase64(JSON.stringify(listQuery), true);
};

export function doPageFilter(nextListQuery, pushNow=true) {
  if (isNothing(nextListQuery)) return;

  let listQuery = createListQuery(nextListQuery);
  let filter = createPageFilter(listQuery);

  let currentRoute = router.currentRoute;
  let nextRoute = {
    name  : jsonCopy(currentRoute.name),
    params: jsonCopy(currentRoute.params),
    query : jsonCopy(currentRoute.query),
  };
  nextRoute.query.filter = filter;
  nextRoute.query.ts = Date.now();

  if (pushNow) {
    setImmediate(() => {
      router.push(nextRoute);
    })
  }
  return nextRoute;
};

export function changePageSize(pageSize) {
  doPageFilter({
    pageNumber: null,
    pageSize  : pageSize,
  });
};

export function changePageFilter(listQuery, nextListQuery) {
  listQuery = listQuery || {};
  if (nextListQuery) {
    for (var k in nextListQuery) {
      listQuery[k] = nextListQuery[k];
    }
  }
  listQuery['pageNumber'] = null;
  doPageFilter(listQuery);
};

export function goToPageNumber(pageNumber) {
  doPageFilter({
    pageNumber: pageNumber,
  });
};

export function gotoPageMarker(pageMarker) {
  doPageFilter({
    pageMarker: pageMarker,
  });
};

export function packRouteQuery() {
  let packedRouteQuery = getBase64(JSON.stringify(router.currentRoute.query), true);
  return { prevRouteQuery: packedRouteQuery };
};

export function unpackRouteQuery(collectedRouteQuery) {
  if (isNothing(collectedRouteQuery)) return null;
  return JSON.parse(fromBase64(collectedRouteQuery));
};

export function getPrevQuery() {
  return unpackRouteQuery(router.currentRoute.query.prevRouteQuery);
};

export function initCodeMirror(id, options) {
  options = options || {};

  let config = {
    autoRefresh : true,
    autofocus   : true,
    indentUnit  : 4,
    tabSize     : 4,
    lineNumbers : true,
    keyMap      : 'sublime',
    lineWrapping: true,

    // Code fold
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],

    // Highlight current line
    styleActiveLine: true,

    // Code hint
    hintOptions: {
      hint          : CodeMirror.hint['dff-anyword'],
      completeSingle: false,
      closeOnUnfocus: true,
    },

    // Brackets matching / closing
    matchBrackets    : true,
    autoCloseBrackets: true,

    // Trailing space
    showTrailingSpace: true,

    // Comments
    continueComments: true,

    // Shortcuts
    extraKeys: {
      // Tab-to-space handling
      Tab: (cm) => {
        if (cm.somethingSelected()) {
          cm.indentSelection('add');
        } else {
          cm.replaceSelection(' '.repeat(cm.getOption('indentUnit')), 'end', '+input');
        }
      },
      'Cmd-F' : 'findPersistent',
      'Ctrl-F': 'findPersistent',
    },
  }

  if (options.config) {
    Object.assign(config, options.config);
  }

  let cm = CodeMirror.fromTextArea(document.getElementById(id), config);

  // Show hint when typing
  cm.on('change', debounce((editor, change) => {
    if (change.origin == "+input" && change.text.join().match(/[a-zA-Z]/)) {
      editor.showHint();
    }
  }, 150));

  resetCodeMirrorPhrases(cm);
  setCodeMirrorMode(cm, options.mode || 'python');
  return cm;
};

export function destoryCodeMirror(codeMirror) {
  if (!codeMirror) return;

  const codeMirrorElem = codeMirror.doc.cm.getWrapperElement();
  codeMirrorElem && codeMirrorElem.remove && codeMirrorElem.remove();
};

export function resetCodeMirrorPhrases(codeMirror) {
  if (!codeMirror) return;

  setImmediate(() => {
    var phrases = {
      "(Use /re/ syntax for regexp search)": i18n.t("(Use /re/ syntax for regexp search)"),
      "All"                                : i18n.t("All"),
      "No"                                 : i18n.t("No"),
      "Replace all:"                       : i18n.t("Replace all:"),
      "Replace with:"                      : i18n.t("Replace with:"),
      "Replace:"                           : i18n.t("Replace:"),
      "Replace?"                           : i18n.t("Replace?"),
      "Search:"                            : i18n.t("Search:"),
      "Stop"                               : i18n.t("Stop"),
      "With:"                              : i18n.t("With:"),
      "Yes"                                : i18n.t("Yes"),
    }
    codeMirror.setOption('phrases', phrases);
  });
};

export function setCodeMirrorReadOnly(codeMirror, readOnly) {
  if (!codeMirror) return;

  if (readOnly) {
    // codeMirror.setOption('readOnly', 'nocursor');
    codeMirror.setOption('readOnly', true);
    codeMirror.setOption('styleActiveLine', false);
  } else {
    codeMirror.setOption('readOnly', false);
    codeMirror.setOption('styleActiveLine', true);
  }

  return codeMirror;
};

export function setCodeMirrorMode(codeMirror, mode) {
  let opt = mode || null;
  switch(mode) {
    case 'python':
      opt = {
        name          : 'python',
        version       : 3,
        extra_keywords: ['DFF'],
      }
      break;
  }

  codeMirror.setOption('mode', opt);
  return codeMirror;
};

export function getCodeMirrorThemeName() {
  return store.getters.codeMirrorSettings.theme || C.CODE_MIRROR_THEME_DEFAULT.key;
};

export function jumpToCodeMirrorLine(codeMirror, cursor) {
  if (!cursor) return;

  // Editor height
  let margin = parseInt(codeMirror.getWrapperElement().clientHeight / 3);

  // Cursor position
  if ('number' === typeof cursor) {
    cursor = { line: cursor, ch: 0 };
  }

  codeMirror.scrollIntoView(cursor, margin);
  codeMirror.setCursor(cursor);
};

export function foldCode(codeMirror, level) {
  if (!codeMirror) return;

  // Unfold all
  codeMirror.execCommand('unfoldAll');

  if (level < 0) return;

  // Fold specified level
  let foldBlankCount = (level - 1) * 4;
  for (let i = 0; i < codeMirror.lineCount(); i++) {
    let linePreBlank = codeMirror.lineInfo(i).text.trimEnd().match(/^ */)[0] || '';
    let linePreBlankCount = linePreBlank.length;

    if (foldBlankCount === linePreBlankCount) {
      codeMirror.foldCode(i);
    }
  }
};

export function getEchartTextColor() {
  let colorMap = {
    light: '#333130',
    dark : '#BBBBBB',
  };
  return colorMap[store.getters.uiThemeResolved];
};

export function getEchartTextFadedColor() {
  let colorMap = {
    light: '#33313030',
    dark : '#BBBBBB30',
  };
  return colorMap[store.getters.uiThemeResolved];
};

export function getEchartLineColor() {
  let colorMap = {
    light: '#E6DFDC',
    dark : '#404040',
  };
  return colorMap[store.getters.uiThemeResolved];
};

export function getEchartBackgroundColor() {
  let colorMap = {
    light: '#fafafa',
    dark : '#141414',
  };
  return colorMap[store.getters.uiThemeResolved];
};

export function htmlSpace(count, lang) {
  let s = null;
  switch(lang) {
    case 'zh':
      s = '&#12288;';
      break;

    default:
      s = '&ensp;';
      break;
  }

  if ('number' !== typeof count) {
    count = 1;
  }
  count = parseInt(count);
  return s.repeat(count);
};

export function openURL(url) {
  if ('object' === typeof url) {
    url = router.resolve(url).href;
  }
  window.open(url);
};

export function renderMarkdown(text, options) {
  options = options || {};

  let renderer = options.renderer || false;
  delete options.renderer;

  marked.use({ renderer });

  if (options.inline === true) {
    return marked.parseInline(text, options);
  } else {
    return marked.parse(text, options);
  }
};

export function textLength(str) {
  return str.replace(/[\u0391-\uFFE5]/g, '__').length;
};

let waitLoading = function(minLoadingTime) {
  this.startTime = Date.now();
  this.minLoadingTime = minLoadingTime || 500;
};

waitLoading.prototype.end = function(fn) {
  let endTime = Date.now();
  let processedTime = endTime - this.startTime;
  if (processedTime > this.minLoadingTime) {
    fn();

  } else {
    setTimeout(() => {
      fn();
    }, this.minLoadingTime - processedTime);
  }
};

export function createWaitLoading(minLoadingTime) {
  return new waitLoading(minLoadingTime);
};

export function toDebugText(text) {
  return text.replace(/\s+/g, ' ').trim();
};
