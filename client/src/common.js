import router from '@/router'
import store from '@/store'
import * as T from '@/toolkit'
import C from '@/const'
import i18n from '@/i18n';

export function getHighlightRowCSS({row, rowIndex}) {
  return (store.state.highlightedTableDataId === row.id) ? 'hl-row' : '';
};

export function appendSearchKeywords(data, searchKeywords) {
  searchKeywords = T.asArray(searchKeywords);

  if (T.isNothing(data.searchKeywords)) {
    data.searchKeywords = [];
  }

  searchKeywords.forEach(v => {
    if (v) data.searchKeywords.push(('' + v).trim());
  })

  return data;
};

export function appendSearchFields(data, keys) {
  keys = T.asArray(keys);

  let searchKeywords = [];
  keys.forEach(k => {
    let v = '';
    try {
      v = T.jsonFindSafe(data, k) || '';
    } catch(err) {
      // Nope
    }

    if (v) {
      searchKeywords.push(('' + v).trim());
    }
  });

  if (T.isNothing(data.searchKeywords)) {
    data.searchKeywords = [];
  }

  data.searchKeywords = data.searchKeywords.concat(searchKeywords);
  return data;
};

export function filterByKeywords(s, l) {
  let searchTexts = s
  .replace(/[.\-_ \(\)（）]/g, ' ')
  .toLowerCase()
  .split(' ')
  .filter(x => T.notNothing(x));

  let maxScore = 0;

  let listScore = l.reduce((acc, x) => {
    let exactlyMatch = false;
    let score        = 0;

    x.searchKeywords.forEach(keyword => {
      keyword = keyword.toLowerCase().trim();

      if (keyword === s) {
        exactlyMatch = true;
      }

      searchTexts.forEach(searchText => {
        // Search string
        if (keyword === searchText) {
          score += 200;
        } else if (keyword.indexOf(searchText) >= 0) {
          score += parseInt(searchText.length * 100 / keyword.length);
        }
      });
    });

    if (score <= 0) return acc;

    let item = {
      exactlyMatch: exactlyMatch,
      score       : score,
      item        : x,
    };

    maxScore = Math.max(maxScore, item.score);
    acc.push(item);
    return acc;
  }, []);

  listScore.sort((a, b) => {
    if (a.exactlyMatch && !b.exactlyMatch) return -1;
    else if (!a.exactlyMatch && b.exactlyMatch) return 1;
    else {
      if (a.score > b.score) return -1;
      else if (a.score < b.score) return 1;
      else return 0;
    }
  });

  let result = listScore.map(x => x.item);
  return result;
};

export function jumpDeletedEntity(id) {
  if (id !== router.currentRoute.params.id) return;

  switch(router.currentRoute.name) {
    case 'code-editor':
    case 'code-viewer':
      router.push({
        name: 'intro',
      });
      break;
  }
};

export function asideItemSorter(a, b) {
  // Order by pin
  let isPinnedA = !!a.pinTime;
  let isPinnedB = !!b.pinTime;

  if (isPinnedA < isPinnedB) return 1;
  if (isPinnedA > isPinnedB) return -1;

  if (isPinnedA && isPinnedB) {
    if (a.pinTime > b.pinTime) return -1;
    if (a.pinTime < b.pinTime) return 1;
  }

  if (a.label < b.label) return -1;
  if (a.label > b.label) return 1;

  return 0;
};

export function scriptSetSorter(a, b) {
  // Order by pin
  let isPinnedA = !!a.pinTime;
  let isPinnedB = !!b.pinTime;

  if (isPinnedA < isPinnedB) return 1;
  if (isPinnedA > isPinnedB) return -1;

  if (isPinnedA && isPinnedB) {
    if (a.pinTime > b.pinTime) return -1;
    if (a.pinTime < b.pinTime) return 1;
  }

  // Order by origin
  let aOrigin = a.origin;
  let bOrigin = b.origin;
  let orders = [ 'user', 'scriptMarket', 'builtin' ];
  if (orders.indexOf(aOrigin) < orders.indexOf(bOrigin)) return -1;
  if (orders.indexOf(aOrigin) > orders.indexOf(bOrigin)) return 1;

  // Order by name / ID
  let aLabel = a.label || a.title || a.id;
  let bLabel = b.label || b.title || b.id;
  if (aLabel < bLabel) return -1;
  if (aLabel > bLabel) return 1;

  return 0;
};

export function getPythonCodeSelectableItems(pythonCode, scriptId) {
  if (!pythonCode) [];

  let todoItems    = [];
  let codeItems    = [];
  let commentStack = [];
  pythonCode.split('\n').forEach((l, i) => {
    l = l.trimEnd();

    // Checks if it's in a block comment.
    let isOneLineBlockCommnet = false;
    [ '"""', "'''" ].forEach(kw => {
      if (l.indexOf(kw) < 0) return;

      if (l.indexOf(kw) !== l.lastIndexOf(kw)) {
        // single-line block comment
        isOneLineBlockCommnet = true;
      } else {
        // multi-line block comment
        if (commentStack.length > 0 && commentStack[commentStack.length - 1] === kw) {
          commentStack.pop(kw);
        } else {
          commentStack.push(kw);
        }
      }
    })

    // Skip when inside a comment
    if (isOneLineBlockCommnet || commentStack.length > 0) return;

    try {
      // Comment items
      C.TODO_TYPE.forEach(x => {
        let _tag = `# ${x.key}`;
        let _pos = l.indexOf(_tag);
        if (_pos >= 0) {
          let id   = `${scriptId}.__L${i}`;
          let name = (l.slice(_pos + _tag.length) || '').replace(/^[ :：]*/, '').trim() || x.key;
          todoItems.push({
            id      : id,
            type    : 'todo',
            todoType: x.key,
            name    : name,
            line    : i,
          })
        }
      })

      // Code items
      if (l.indexOf('def ') === 0 && l.indexOf('def _') < 0) {
        // Func def
        let _parts = l.slice(4).split('(');

        let name = _parts[0];
        let id   = `${scriptId}.${name}`;

        let kwargs = _parts[1].slice(0, -2).split(',').reduce((acc, x) => {
          let k = x.trim().split('=')[0];
          if (k && k.indexOf('*') < 0) {
            // acc[k] = `${k.toUpperCase()}`; // Use field name to fill by default
            acc[k] = null; // Use null to fill by default
          }
          return acc;
        }, {});

        codeItems.push({
          id    : id,
          type  : 'def',
          name  : name,
          kwargs: kwargs,
          line  : i,
        });

      } else if (l.indexOf('class ') === 0 && l.indexOf('class _') < 0) {
        // Class def
        let _parts = l.slice(6).split('(');

        let name = _parts[0];
        let id   = `${scriptId}.${name}`;

        codeItems.push({
          id    : id,
          type  : 'class',
          name  : name,
          line  : i,
        });
      }

    } catch(e) {
      // Ignore parsing errors
    }
  });

  let allItems = todoItems.concat(codeItems);
  return allItems;
}

export async function getAPIAuthList() {
  let apiAuthList = [];

  let apiRes = await T.callAPI_getAll('/api/v1/api-auth/do/list', {
    query: {
      fields: [
        'id',
        'title',
        'type',
      ]
    },
  });
  if (!apiRes || !apiRes.ok) return;

  apiRes.data.forEach(d => {
    let _typeName = C.API_AUTH_MAP.get(d.type).name;
    d.label = `[${_typeName}] ${d.title || ''}`;
    apiAuthList.push(d);
  })

  return apiAuthList;
}

export async function getFuncList(options) {
  options = options || {};

  // Get related data
  let scriptSetMap = {};
  let scriptMap    = {};
  let funcMap      = {};
  let blueprints   = [];
  let funcs        = [];

  let apiRes = null;

  let relatedScriptSetIds = {};
  let relatedScriptIds    = {};

  // Func
  apiRes = await T.callAPI_getAll('/api/v1/funcs/do/list', {
    query: { fields: ['id', 'scriptSetId', 'scriptId', 'title', 'definition', 'argsJSON', 'kwargsJSON', 'extraConfigJSON', 'sset_title', 'scpt_title'] },
  });
  if (!apiRes || !apiRes.ok) return;

  // Collect related Script Set, Secript
  apiRes.data.forEach(d => {
    relatedScriptSetIds[d.scriptSetId] = true;
    relatedScriptIds[d.scriptId]       = true;
  });

  funcs = apiRes.data;

  // Script Set
  if (T.notNothing(relatedScriptSetIds)) {
    apiRes = await T.callAPI_getAll('/api/v1/script-sets/do/list', {
      query: {
        fields: ['id', 'title', 'origin', 'originId'],
      },
    });
    if (!apiRes || !apiRes.ok) return;

    apiRes.data.forEach(d => {
      if (!relatedScriptSetIds[d.id]) return;

      // Blueprint
      if (!options.scriptLibOnly && d.origin === 'blueprint') {
        let blueprintId = d.id.replace(/^_bp_/g, '');
        blueprints.push({
          label: d.title || blueprintId,
          value: `${d.id}__main.run`,
          title: d.title,
          tip  : d.id,
        });
      }

      // Script Set
      if (!shouldScriptSetHidden(d) && d.origin !== 'blueprint') {
        scriptSetMap[d.id] = {
          label   : d.title || d.id,
          value   : d.id,
          title   : d.title,
          origin  : d.origin,
          originId: d.originId,
          children: [],
          tip     : d.id,
        };
      }
    });
  }

  // Script
  if (T.notNothing(relatedScriptIds)) {
    apiRes = await T.callAPI_getAll('/api/v1/scripts/do/list', {
      query: {
        fields: ['id', 'title', 'scriptSetId']
      },
    });
    if (!apiRes || !apiRes.ok) return;

    apiRes.data.forEach(d => {
      if (!relatedScriptIds[d.id]) return;

      scriptMap[d.id] = {
        label   : d.title || d.id,
        value   : d.id,
        title   : d.title,
        children: [],
        tip     : d.id,
      };

      // Insert Script into the "children" array in upper layer
      if (scriptSetMap[d.scriptSetId]) {
        scriptSetMap[d.scriptSetId].children.push(scriptMap[d.id]);
      }
    });
  }

  // Insert Func into the "children" array in upper layer
  funcs.forEach(d => {
    funcMap[d.id] = {
      label          : d.title || d.definition,
      value          : d.id,
      id             : d.id,
      title          : d.title,
      definition     : d.definition,
      argsJSON       : d.argsJSON,
      kwargsJSON     : d.kwargsJSON,
      extraConfigJSON: d.extraConfigJSON,
      scriptSetId    : d.scriptSetId,
      scriptSetTitle : d.sset_title,
      scriptId       : d.scriptId,
      scriptTitle    : d.scpt_title,
      tip            : d.id,
    };
    appendSearchFields(funcMap[d.id], ['label', 'value', 'title', 'scriptSetId', 'scriptSetTitle', 'scriptId', 'scriptTitle']);

    if (scriptMap[d.scriptId]) {
      scriptMap[d.scriptId].children.push(funcMap[d.id]);
    }
  });

  let scriptSets = Object.values(scriptSetMap);
  scriptSets.sort(scriptSetSorter);

  let result = { map: funcMap };
  if (options.scriptLibOnly || blueprints.length <= 0) {
    result.cascader = scriptSets;

  } else {
    result.cascader = [
      { label: i18n.t('Script Lib'), children: scriptSets },
      { label: i18n.t('Blueprint'),  children: blueprints },
    ];
  }

  return result;
}

export function funcCascaderFilter(node, searchText) {
  searchText = (searchText || '').toLowerCase().trim();

  if (T.isNothing(node.data.searchKeywords)) {
    return false;

  } else {
    for (let i = 0; i < node.data.searchKeywords.length; i++) {
      let keyword = node.data.searchKeywords[i].toLowerCase().trim();

      if (keyword.indexOf(searchText) >= 0) {
        return true;
      }
    }
  }

  return false;
}

export function isFuncArgumentPlaceholder(v) {
  const FUNC_ARGUMENT_PLACEHOLDERS = store.getters.SYSTEM_INFO('_FUNC_ARGUMENT_PLACEHOLDER_LIST');
  for (let i = 0; i < FUNC_ARGUMENT_PLACEHOLDERS.length; i++) {
    if (v === FUNC_ARGUMENT_PLACEHOLDERS[i]) return true;
  }
  return false;
}

export function getScriptMarketLogo(scriptMarket) {
  if (scriptMarket.type === 'git') {
    try {
      let brandLogo = C.SCRIPT_MARKET_TYPE_MAP.get('git').brandLogo;
      for (let keyword in brandLogo) {
        if (scriptMarket.configJSON
        && scriptMarket.configJSON.url
        && scriptMarket.configJSON.url.indexOf(keyword) >= 0) {
          return brandLogo[keyword];
        }
      }

    } catch (err) {
      // Nope
      console.log(err)
    }
  }

  return C.SCRIPT_MARKET_TYPE_MAP.get(scriptMarket.type).logo;
}

export function getScriptMarketTitle(scriptMarket) {
  if (scriptMarket.title) {
    return scriptMarket.title;
  } else {
    switch(scriptMarket.type) {
      case 'git':
      case 'httpService':
        var urlObj = new URL(scriptMarket.configJSON.url);
        return `${urlObj.hostname}${urlObj.pathname}`;

      case 'aliyunOSS':
        var endpointObj = new URL(scriptMarket.configJSON.endpoint);
        return `${scriptMarket.configJSON.bucket}.${endpointObj.hostname}/${scriptMarket.configJSON.folder}`;
    }
  }
}

export function goToScript(scriptId) {
  T.openURL({
    name  : 'code-editor',
    params: { id: scriptId },
  });
}

export function goToList(name, filter) {
  T.openURL({
    name: name,
    query: { filter: T.createPageFilter(filter) },
  })
}

export function goToPIPTools(requirements, opt) {
  opt = opt || {};
  opt.newTab = opt.newTab || false;

  let requirementsLine = null;
  if ('string' === typeof requirements) {
    requirementsLine = requirements.split(/\s+/).join(' ');

  } else {
    let requirementsParts = [];
    for (let pkg in requirements) {
      let ver = requirements[pkg];
      requirementsParts.push(ver ? `${pkg}==${ver}` : pkg);
    };

    requirementsLine = requirementsParts.join(' ');
  }

  let nextRoute = {
    name: 'pip-tool',
    query: { requirements: T.getBase64(requirementsLine) },
  }
  if (opt.newTab) {
    T.openURL(router.resolve(nextRoute).href);
  } else {
    router.push(nextRoute);
  }
}

export function goToPage(routeName, query, options) {
  options = options || {};

  let nextRouteQuery = T.packRouteQuery();
  nextRouteQuery.filter = T.createPageFilter(query);

  if (options.hlDataId) {
    store.commit('updateHighlightedTableDataId', options.hlDataId);
    store.commit('updateTableList_scrollY');
  }

  router.push({
    name  : routeName,
    query : nextRouteQuery,
  });
}

export async function getFuncTaskRecordCountMap(groupField, groupIds) {
  let countMap = {};

  const bulkSize = 20;
  while (groupIds.length > 0) {
    let _groupIds = groupIds.slice(0, bulkSize);
    groupIds = groupIds.slice(bulkSize);

    let apiRes = await T.callAPI_get('/api/v1/task-records/func/do/get-count', {
      query: {
        groupField: groupField,
        groupIds  : _groupIds.join(','),
      },
    });

    if (apiRes.ok) {
      Object.assign(countMap, apiRes.data);
    }
  }

  return countMap;
}

export async function checkScriptMarketUpdate(scriptMarketId) {
  let apiRes = await T.callAPI_get('/api/v1/script-markets/do/check-update', {
    query: { scriptMarketId: scriptMarketId },
  });
  if (!apiRes || !apiRes.ok) return;

  let nextResult = null;
  if (!scriptMarketId) {
    // Check for all Script Market updates
    nextResult = apiRes.data;
  } else {
    // Check for specified Script Market updates
    nextResult = T.jsonCopy(store.state.scriptMarketCheckUpdateResult || [])
      .filter(r => {
        return scriptMarketId !== r.scriptMarketId;
      })
      .concat(apiRes.data);
  }

  store.commit('updateScriptMarketCheckUpdateResult', nextResult);
}

export function getScriptMarketUpdateBadge(scriptMarketId, scriptSetId) {
  let result = store.state.scriptMarketCheckUpdateResult || [];

  if (!result) {
    return null;
  } else if (!scriptMarketId) {
    return result.length || null;
  } else if (scriptMarketId && !scriptSetId) {
    return result.filter(r => {
      return scriptMarketId === r.scriptMarketId;
    }).length || null;
  } else if (scriptMarketId && scriptSetId) {
    return result.filter(r => {
      return scriptMarketId === r.scriptMarketId && scriptSetId === r.scriptSetId;
    }).length || null;
  }
}

export function hasNewVersion() {
  let version       = store.getters.SYSTEM_INFO('VERSION');
  let latestVersion = store.state.latestVersion;
  if (!T.parseVersion(version) || !T.parseVersion(latestVersion)) return;

  return T.compareVersion(version, latestVersion) < 0 ? 1 : null;
}

export function shouldScriptSetHidden(scriptSet) {
  // Hide Script Sets from the Script Market
  if (store.getters.SYSTEM_SETTINGS('SCRIPT_SET_HIDDEN_OFFICIAL_SCRIPT_MARKET')
    && scriptSet.origin === 'scriptMarket' && scriptSet.originId === 'smkt-official') {
    return true;
  }

  // Hide built-in Script Set
  if (store.getters.SYSTEM_SETTINGS('SCRIPT_SET_HIDDEN_BUILTIN')
    && scriptSet.origin === 'builtin') {
    return true;
  }

  // Hide Blueprint Script Set
  if (store.getters.SYSTEM_SETTINGS('SCRIPT_SET_HIDDEN_BLUEPRINT')
    && scriptSet.origin === 'blueprint') {
    return true;
  }

  return false;
}

export function lockConfigCan(lockedByUserId, lockConfigMemberAllowMap, operations) {
  // No limit if not locked
  if (!lockedByUserId) return true;

  // No limit to Admin
  if (store.getters.isAdmin) return true;

  // No limit to lock owner
  if (store.getters.userId === lockedByUserId) return true;

  // Check lock config
  lockConfigMemberAllowMap = lockConfigMemberAllowMap || {};
  operations               = operations               || [];

  operations = T.asArray(operations);
  for (let i = 0; i < operations.length; i++) {
    let key           = `${store.getters.userId}@${operations[i]}`;
    let key_allOthers = `_ALL@${operations[i]}`;
    if (lockConfigMemberAllowMap[key] || lockConfigMemberAllowMap[key_allOthers]) {
      return true;
    }
  }

  return false;
}

export function scrollAside(asideContentId, entryId) {
  setTimeout(() => {
    // Scroll to position of target
    let $asideContent = document.getElementById(asideContentId);
    let $target = document.querySelector(`[entry-id="${entryId}"]`);
    if (!$target) return;

    let scrollTop     = 0;
    let topPadding    = 35;
    let bottomPadding = 25;
    if ($asideContent.scrollTop > $target.offsetTop - topPadding) {
      scrollTop = $target.offsetTop - topPadding;
    } else if ($asideContent.scrollTop < $target.offsetTop - $asideContent.offsetHeight + $target.offsetHeight + bottomPadding) {
      scrollTop = $target.offsetTop - $asideContent.offsetHeight + $target.offsetHeight + bottomPadding;
    } else {
      return;
    }
    $asideContent.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }, 300);
}
