import Vue from 'vue'
import Vuex from 'vuex'
import createPersistedState from 'vuex-persistedstate'
import router from '@/router'

import C from '@/const'
import * as T from '@/toolkit'

import moment from 'moment'

const STATE_CONFIG = {
  isSystemInfoLoaded                             : { persist: false, syncXTab: false },
  serverUpgradeInfo                              : { persist: false, syncXTab: false },
  systemInfo                                     : { persist: true,  syncXTab: true  },
  isLoaded                                       : { persist: false, syncXTab: false },
  processingTaskCount                            : { persist: false, syncXTab: false },
  processingTaskUpdateTime                       : { persist: false, syncXTab: false },
  conflictedRouteMap                             : { persist: false, syncXTab: false },
  clientId                                       : { persist: true,  syncXTab: true  },
  userProfile                                    : { persist: true,  syncXTab: true  },
  xAuthToken                                     : { persist: true,  syncXTab: true  },
  uiLocale                                       : { persist: true,  syncXTab: true  },
  uiTheme                                        : { persist: true,  syncXTab: true  },
  codeMirrorSettings                             : { persist: true,  syncXTab: true  },
  asideScript_expandedNodeMap                    : { persist: false, syncXTab: false },
  asideScript_quickViewWindowPosition            : { persist: true,  syncXTab: false },
  asideConnector_connectorSimpleGUIWindowPosition: { persist: true,  syncXTab: false },
  codeEditor_splitPanePercent                    : { persist: false, syncXTab: false },
  codeEditor_highlightedLineConfigMap            : { persist: false, syncXTab: false },
  codeEditor_isCodeLoaded                        : { persist: false, syncXTab: false },
  codeViewer_highlightedLineConfigMap            : { persist: false, syncXTab: false },
  Editor_scriptCursorMap                         : { persist: false, syncXTab: false },
  Editor_selectedItemId                          : { persist: false, syncXTab: false },
  Editor_splitPanePercent                        : { persist: false, syncXTab: false },
  TableList_scrollY                              : { persist: false, syncXTab: false },
  scriptListSyncTime                             : { persist: true,  syncXTab: true  },
  connectorListSyncTime                          : { persist: true,  syncXTab: true  },
  envVariableListSyncTime                        : { persist: true,  syncXTab: true  },
  experimentalFeatureShowMap                     : { persist: true,  syncXTab: true  },
  highlightedTableDataId                         : { persist: false, syncXTab: false },
  shortcutAction                                 : { persist: false, syncXTab: false },
  fuzzySearchHistoryMap                          : { persist: true,  syncXTab: true  },
  scriptMarketCheckUpdateDate                    : { persist: true,  syncXTab: true  },
  scriptMarketCheckUpdateResult                  : { persist: true,  syncXTab: true  },
  showCompleteUserProfile                        : { persist: false, syncXTab: false },
  featureNoticeDismissedMap                      : { persist: false, syncXTab: true  },
  featureNoticeDisabledMap                       : { persist: true,  syncXTab: true  },
  latestVersion                                  : { persist: false, syncXTab: false },
};
const MUTATION_CONFIG = {
  updateSystemInfo                                     : { persist: true  },
  updateLoadStatus                                     : { persist: false },
  startProcessing                                      : { persist: false },
  endProcessing                                        : { persist: false },
  updateSocketIOStatus                                 : { persist: false },
  updateConflictedRoute                                : { persist: false },
  updateUserProfile                                    : { persist: true  },
  updateXAuthToken                                     : { persist: true  },
  updateUILocale                                       : { persist: true  },
  updateUITheme                                        : { persist: true  },
  updateCodeMirrorSettings                             : { persist: true  },
  updateAsideScript_expandedNodeMap                    : { persist: true  },
  updateAsideScript_quickViewWindowPosition            : { persist: true  },
  updateAsideConnector_connectorSimpleGUIWindowPosition: { persist: true  },
  updateCodeEditor_splitPanePercent                    : { persist: true  },
  updateCodeEditor_highlightedLineConfigMap            : { persist: true  },
  updateCodeEditor_isCodeLoaded                        : { persist: false },
  updateCodeViewer_highlightedLineConfigMap            : { persist: true  },
  updateEditor_scriptCursorMap                         : { persist: false },
  updateEditor_selectedItemId                          : { persist: true  },
  updateEditor_splitPanePercent                        : { persist: true  },
  updateTableList_scrollY                              : { persist: false },
  updateScriptListSyncTime                             : { persist: false },
  updateConnectorListSyncTime                          : { persist: false },
  updateEnvVariableListSyncTime                        : { persist: false },
  updateExperimentalFeatureShowMap                     : { persist: true  },
  updateHighlightedTableDataId                         : { persist: false },
  updateShortcutAction                                 : { persist: false },
  addFuzzySearchHistory                                : { persist: true  },
  updateScriptMarketCheckUpdateDate                    : { persist: true  },
  updateScriptMarketCheckUpdateResult                  : { persist: true  },
  updateShowCompleteUserProfile                        : { persist: false },
  dismissFeatureNotice                                 : { persist: false },
  disableFeatureNotice                                 : { persist: true  },
  resetFeatureNotice                                   : { persist: true  },

  syncState: { persist: false },
};

Vue.use(Vuex)

function getRouteKey(routeInfo) {
  let routeKey = routeInfo.name;

  if (routeInfo.params) {
    let paramsParts = [];
    Object.keys(routeInfo.params).sort().forEach(key => {
      paramsParts.push(`${key}=${routeInfo.params[key]}`);
    });
    routeKey += `#${paramsParts.join('&')}`;
  }

  return routeKey;
}

export default new Vuex.Store({
  state: {
    // Server upgrade info
    serverUpgradeInfo: null,

    // System info
    systemInfo: {},

    // Flag for page data loaded
    isLoaded: false,

    // Processing task count
    processingTaskCount     : 0,
    processingTaskUpdateTime: 0,

    // Flag for Socket.io auth
    isSocketIOAuthed: false,

    // Conflicted routes
    conflictedRouteMap: {},

    // Client ID
    clientId: null,
    // User profile
    userProfile: null,
    // X Auth Token
    xAuthToken: null,

    // UI locale
    uiLocale: null,
    // UI theme
    uiTheme: null,
    // CodeMirror setting
    codeMirrorSettings: {
      theme: null,
      style: {
        fontSize  : null,
        lineHeight: null,
      }
    },

    // UI window status
    asideScript_expandedNodeMap: {},

    asideScript_quickViewWindowPosition            : null,
    asideConnector_connectorSimpleGUIWindowPosition: null,

    codeEditor_splitPanePercent        : null,
    codeEditor_highlightedLineConfigMap: null,
    codeEditor_isCodeLoaded            : null,

    codeViewer_highlightedLineConfigMap: null,

    Editor_scriptCursorMap: {},
    Editor_selectedItemId: null,
    Editor_splitPanePercent : null,

    TableList_scrollY: 0,

    // List sync time
    scriptListSyncTime     : null,
    connectorListSyncTime  : null,
    envVariableListSyncTime: null,

    // Enabled experimental features
    experimentalFeatureShowMap: null,

    // Highlighted table data ID
    highlightedTableDataId: null,

    // Shortcut action
    shortcutAction: null,

    // FuzzySearch history
    fuzzySearchHistoryMap: null,

    // Flag for hiding Script Market homepage notice
    isScriptMarketHomepageNoticeDismissed: false,
    isScriptMarketHomepageNoticeDisabled : false,

    // Script Market check update result
    scriptMarketCheckUpdateResult: [],

    // Flag for show git user profile dialog for Script Market
    showCompleteUserProfile: null,

    // Flag for show feature notice
    featureNoticeDismissedMap: {},
    featureNoticeDisabledMap : {},

    // Latest version
    latestVersion: null,
  },
  getters: {
    DEFAULT_STATE: state => {
      return {
        codeMirrorStyle: {
          fontSize  : 16,
          lineHeight: 1.5,
        },
        codeEditor_splitPanePercent: 60,
        Editor_splitPanePercent    : 20,
      }
    },
    SYSTEM_INFO: state => (key, defaultValue) => {
      if (state.systemInfo && (key in state.systemInfo)) {
        let value = state.systemInfo[key];
        if (T.endsWith(key, '_HEADER')) {
          value = value.toLowerCase();
        }
        return value;
      }

      return defaultValue || null;
    },
    SYSTEM_SETTINGS: state => (key) => {
      if (state.systemInfo && state.systemInfo.SYSTEM_SETTINGS) {
        if (!key) {
          return state.systemInfo.SYSTEM_SETTINGS;
        } else if (key in state.systemInfo.SYSTEM_SETTINGS) {
          return state.systemInfo.SYSTEM_SETTINGS[key] || null;
        }
      }

      return null;
    },
    isProcessing: state => {
      return state.processingTaskCount > 0 && (Date.now() - state.processingTaskUpdateTime) > 3000;
    },
    clientId: state => {
      if (!state.clientId) {
        state.clientId = 'c_ui_' + T.genRandString(8);
      }

      return state.clientId;
    },
    userId: state => {
      if (!state.userProfile) return null;
      return state.userProfile.id || null;
    },
    isSignedIn: state => {
      if (!state.xAuthToken) return false;
      if (!state.userProfile || !state.userProfile.roles) {
        return false;
      }

      return true;
    },
    integratedSignInFuncId: state => {
      if (!state.userProfile || !state.userProfile.roles) {
        return null;
      }

      return state.userProfile.integratedSignInFuncId;
    },
    integratedSignInFuncTitle: state => {
      if (!state.userProfile || !state.userProfile.roles) {
        return null;
      }

      return state.userProfile.integratedSignInFuncTitle;
    },
    isAdmin: (state, getters) => {
      return !!(state.userProfile
        && (state.userProfile.roles.indexOf('sa') >= 0
          || state.userProfile.roles.indexOf('admin') >= 0));
    },
    isSocketIOReady: state => {
      return state.isSocketIOAuthed && state.xAuthToken;
    },
    getConflictInfo: state => routeInfo => {
      let routeKey = getRouteKey(routeInfo);
      let conflictInfo = state.conflictedRouteMap[routeKey];
      if (!conflictInfo) {
        // No conflict
        return false;

      } else {
        // No conflict
        let conflictId = conflictInfo.conflictId;
        let conflictScope = conflictId.split(':')[0] === window.conflictId.split(':')[0]
                          ? 'sameClientOtherTab' // Same client, different tab
                          : 'otherClient'        // Different client

        let user = conflictInfo.user;
        return {
          scope: conflictScope,
          user : user,
        }
      }
    },
    uiLocale: (state, getters) => {
      if (!state.uiLocale) {
        state.uiLocale = T.getUILocale();
      }
      return state.uiLocale;
    },
    uiTheme: (state, getters) => {
      if (state.uiTheme !== 'dark' && state.uiTheme !== 'light') {
        state.uiTheme = 'auto';
      }
      return state.uiTheme;
    },
    uiThemeResolved: (state, getters) => {
      if (getters.uiTheme === 'auto') {
        let isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDark ? 'dark' : 'light';
      } else {
        return getters.uiTheme;
      }
    },
    codeMirrorSettings: (state, getters) => {
      let theme = state.codeMirrorSettings.theme || C.CODE_MIRROR_THEME_DEFAULT.key;

      let fontSize = state.codeMirrorSettings.style.fontSize || getters.DEFAULT_STATE.codeMirrorStyle.fontSize;
      fontSize = Math.max(fontSize, 12);
      fontSize = Math.min(fontSize, 36);

      let lineHeight = state.codeMirrorSettings.style.lineHeight || getters.DEFAULT_STATE.codeMirrorStyle.lineHeight;
      lineHeight = Math.max(lineHeight, 1);
      lineHeight = Math.min(lineHeight, 2);

      return {
        theme: theme,
        style: {
          fontSize  : fontSize + 'px',
          lineHeight: lineHeight,
        }
      };
    },
    showExperimentalFeature: state => key => {
      return !!(state.experimentalFeatureShowMap && state.experimentalFeatureShowMap[key]);
    },
    showFeatureNotice: state => key =>{
      return !state.featureNoticeDismissedMap[key] && !state.featureNoticeDisabledMap[key];
    },

    isScriptMarketCheckUpdatedRecently: state => {
      return state.scriptMarketCheckUpdateDate === moment.utc().format('YYYY-MM-DD');
    },
  },
  mutations: {
    updateSystemInfo(state, info) {
      state.systemInfo = info || {};
      state.isSystemInfoLoaded = true;
    },

    updateLoadStatus(state, isLoaded) {
      if (isLoaded === false) {
        state.isLoaded = false;
      } else {
        setImmediate(() => {
          state.isLoaded = true;
        });
      }
    },
    startProcessing(state) {
      state.processingTaskCount++;
      state.processingTaskUpdateTime = Date.now();
    },
    endProcessing(state) {
      state.processingTaskCount--;
      state.processingTaskUpdateTime = Date.now();
    },
    updateSocketIOStatus(state, isAuthed) {
      state.isSocketIOAuthed = isAuthed;
    },

    updateConflictedRoute(state, payload) {
      let routeKey = getRouteKey(payload.routeInfo);

      let nextConflictedRouteMap = T.jsonCopy(state.conflictedRouteMap);
      if (payload.isConflict) {
        let conflictInfo = {};
        for (let k in payload) {
          if (k === 'routeInfo') continue;
          conflictInfo[k] = payload[k];
        }

        nextConflictedRouteMap[routeKey] = conflictInfo;

      } else {
        delete nextConflictedRouteMap[routeKey];
      }

      state.conflictedRouteMap = nextConflictedRouteMap;
    },

    updateUserProfile(state, value) {
      state.userProfile = value || null;
    },
    updateXAuthToken(state, value) {
      state.xAuthToken = value || null;
    },

    updateUILocale(state, value) {
      state.uiLocale = value || null;
    },
    updateUITheme(state, value) {
      state.uiTheme = value || null;
    },

    updateCodeMirrorSettings(state, value) {
      state.codeMirrorSettings = value || {
        theme: C.CODE_MIRROR_THEME_DEFAULT.key,
        style: {},
      };
    },

    updateAsideScript_expandedNodeMap(state, value) {
      state.asideScript_expandedNodeMap = value || null;
    },

    updateAsideScript_quickViewWindowPosition(state, value) {
      state.asideScript_quickViewWindowPosition = value || null;
    },
    updateAsideConnector_connectorSimpleGUIWindowPosition(state, value) {
      state.asideConnector_connectorSimpleGUIWindowPosition = value || null;
    },

    updateCodeEditor_splitPanePercent(state, value) {
      state.codeEditor_splitPanePercent = value || null;
    },
    updateCodeEditor_highlightedLineConfigMap(state, value) {
      state.codeEditor_highlightedLineConfigMap = value || null;
    },
    updateCodeEditor_isCodeLoaded(state, isCodeLoaded) {
      if (isCodeLoaded === false) {
        state.codeEditor_isCodeLoaded = false;
      } else {
        setImmediate(() => {
          state.codeEditor_isCodeLoaded = true;
        })
      }
    },

    updateCodeViewer_highlightedLineConfigMap(state, value) {
      state.codeViewer_highlightedLineConfigMap = value || null;
    },

    updateEditor_scriptCursorMap(state, value) {
      if (!value.cursor) return;
      state.Editor_scriptCursorMap[value.scriptId] = value.cursor;
    },
    updateEditor_selectedItemId(state, value) {
      state.Editor_selectedItemId = value || null;
    },
    updateEditor_splitPanePercent(state, value) {
      state.Editor_splitPanePercent = value || null;
    },

    updateTableList_scrollY(state, key) {
      if (key === null) {
        state.TableList_scrollY = {};
        return;
      } else {
        key = router.currentRoute.name;
      }

      let y = T.getTableScrollY();
      if (!state.TableList_scrollY) {
        let _map = {}
        _map[key] = y || 0;
        state.TableList_scrollY = _map;
      } else {
        state.TableList_scrollY[key] = y || 0;
      }
    },

    updateScriptListSyncTime(state, name) {
      state.scriptListSyncTime = Date.now();
    },
    updateConnectorListSyncTime(state, name) {
      state.connectorListSyncTime = Date.now();
    },
    updateEnvVariableListSyncTime(state, name) {
      state.envVariableListSyncTime = Date.now();
    },

    updateExperimentalFeatureShowMap(state, value) {
      state.experimentalFeatureShowMap = value || null;
    },

    updateHighlightedTableDataId(state, value) {
      state.highlightedTableDataId = value || null;
    },
    updateShortcutAction(state, value) {
      state.shortcutAction = value;
    },

    clearFuzzySearchHistory(state) {
      state.fuzzySearchHistoryMap = {};
    },
    addFuzzySearchHistory(state, queryString) {
      let key = router.currentRoute.name;

      if (!queryString) return;

      if (!state.fuzzySearchHistoryMap) {
        state.fuzzySearchHistoryMap = {};
      }
      if (!state.fuzzySearchHistoryMap[key]) {
        state.fuzzySearchHistoryMap[key] = [];
      }

      state.fuzzySearchHistoryMap[key] = state.fuzzySearchHistoryMap[key].filter(item => item.value !== queryString);
      state.fuzzySearchHistoryMap[key].push({ value: queryString, timestamp: Date.now() });
      state.fuzzySearchHistoryMap[key].sort((a, b) => { return b.timestamp - a.timestamp })
      state.fuzzySearchHistoryMap[key] = state.fuzzySearchHistoryMap[key].slice(0, 10);
    },

    updateScriptMarketCheckUpdateDate(state) {
      state.scriptMarketCheckUpdateDate = moment.utc().format('YYYY-MM-DD');
    },
    updateScriptMarketCheckUpdateResult(state, updatedScriptSets) {
      state.scriptMarketCheckUpdateResult = updatedScriptSets;
    },

    updateShowCompleteUserProfile(state, show) {
      state.showCompleteUserProfile = show;
    },

    dismissFeatureNotice(state, key) {
      state.featureNoticeDismissedMap[key] = true;
    },
    disableFeatureNotice(state, key) {
      state.featureNoticeDisabledMap[key] = true;
    },
    resetFeatureNotice(state) {
      state.featureNoticeDismissedMap = {};
      state.featureNoticeDisabledMap  = {};
    },

    updateLatestVersion(state, latestVersion) {
      state.latestVersion = latestVersion;
    },

    syncState(state, nextState) {
      if (!nextState) return;

      for (let key in nextState) {
        if (STATE_CONFIG[key]
            && STATE_CONFIG[key].syncXTab
            && state[key] !== nextState[key]) {
          state[key] = nextState[key];
        }
      }
    },
  },
  actions: {
    async signIn({ commit, dispatch }, xAuthToken) {
      commit('updateXAuthToken', xAuthToken);
      dispatch('loadUserProfile');
    },
    async signOut({ commit }) {
      await T.callAPI_get('/api/v1/auth/do/sign-out');

      commit('updateSocketIOStatus', false);
      commit('updateXAuthToken', null);
    },
    async loadSystemInfo({ commit }) {
      let apiRes = await T.callAPI_get('/api/v1/system-info');
      if (!apiRes || !apiRes.ok) return;

      await commit('updateSystemInfo', apiRes.data);
      window._DFF_isSystemInfoLoaded = true;
    },
    async loadUserProfile({ commit, state }) {
      if (!state.xAuthToken) return;

      let apiRes = await T.callAPI_get('/api/v1/auth/profile/do/get');
      if (!apiRes || !apiRes.ok) return;

      commit('updateUserProfile', apiRes.data);
    },
    async getAPINamesLocales({ commit, getters }) {
      if (!getters.isSignedIn) return;

      let apiRes = await T.callAPI_get('/api');

      let apiNamesLocales_zhCN = {};
      for (let moduleKey in apiRes.data) {
        if (moduleKey[0] === '$') continue;

        for (let apiKey in apiRes.data[moduleKey]) {
          if (apiKey[0] === '$') continue;

          let api = apiRes.data[moduleKey][apiKey];
          apiNamesLocales_zhCN[api.name] = api.name_zhCN;
        }
      }

      return apiNamesLocales_zhCN;
    },

    async checkServerUpgradeInfo({ dispatch, state }, serverInfo) {
      let nextServerUpgradeInfo = null;

      if (state.systemInfo && !state.serverUpgradeInfo) {
        if (state.systemInfo.VERSION
            && serverInfo.VERSION
            && state.systemInfo.VERSION !== serverInfo.VERSION) {
          nextServerUpgradeInfo = {
            prev: `Version: ${state.systemInfo.VERSION}`,
            next: `Version: ${serverInfo.VERSION}`,
          }

        } else if (state.systemInfo.RELEASE_TIMESTAMP
            && serverInfo.RELEASE_TIMESTAMP
            && state.systemInfo.RELEASE_TIMESTAMP !== serverInfo.RELEASE_TIMESTAMP) {
          nextServerUpgradeInfo = {
            prev: `Build: ${T.getDateTimeString(state.systemInfo.RELEASE_TIMESTAMP * 1000)}`,
            next: `Build: ${T.getDateTimeString(serverInfo.RELEASE_TIMESTAMP       * 1000)}`,
          }
        }
      }

      if (nextServerUpgradeInfo) {
        await dispatch('loadSystemInfo');
        state.serverUpgradeInfo = nextServerUpgradeInfo;
      }
    },
  },
  modules: {
  },
  plugins: [
    createPersistedState({
      reducer: (state) => {
        let persistState = {};
        for (let key in STATE_CONFIG) {
          if (STATE_CONFIG[key].persist) {
            persistState[key] = state[key];
          }
        }
        return persistState;
      },
      filter: (mutation) => {
        if (MUTATION_CONFIG[mutation.type]) {
          return MUTATION_CONFIG[mutation.type].persist || false;
        } else {
          return false;
        }
      },
    }),
  ],
});
