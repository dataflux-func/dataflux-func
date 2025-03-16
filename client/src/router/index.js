import Vue from 'vue'
import VueRouter from 'vue-router'
import store from '@/store'

import * as T from '@/toolkit'
import * as common from '@/common'

// Do not throw error when route error occured
const originalPush = VueRouter.prototype.push;
VueRouter.prototype.push = function push(location) {
  return originalPush.call(this, location).catch(err => err);
}

Vue.use(VueRouter)

const routes = [
  // Homepage (Login page)
  {
    path: '/index',
    name: 'index',
    component: () => import('../views/Index.vue'),
  },

  // Sign out
  {
    path: '/sign-out',
    name: 'sign-out',
    component: () => import('../views/SignOut.vue'),
  },

  // Development
  {
    path: '/development',
    component: () => import('../views/Development.vue'),
    children: [
      {
        path: 'intro',
        name: 'intro',
        component: () => import('../components/Development/Intro.vue'),
      },
      {
        path: 'code-editor/:id',
        name: 'code-editor',
        component: () => import('../components/Development/CodeEditor.vue'),
      },
      {
        path: 'code-viewer/:id',
        name: 'code-viewer',
        component: () => import('../components/Development/CodeViewer.vue'),
      },
      {
        path: 'script-locked',
        name: 'script-locked',
        component: () => import('../components/Development/ScriptLocked.vue'),
      },
    ]
  },

  // Blueprint
  {
    path: '/blueprint-list',
    name: 'blueprint-list',
    component: () => import('../components/Blueprint/BlueprintList.vue'),
  },
  {
    path: '/blueprint-canvas/:id',
    name: 'blueprint-canvas',
    component: () => import('../components/Blueprint/BlueprintCanvas.vue'),
  },

  // Script Market
  {
    path: '/script-market-list',
    name: 'script-market-list',
    component: () => import('../components/ScriptMarket/ScriptMarketList.vue'),
  },

  {
    path: '/script-market-contents/:id',
    name: 'script-market-contents',
    component: () => import('../components/ScriptMarket/ScriptMarketContents.vue'),
  },

  // Management
  {
    path: '/management',
    name: 'management',
    component: () => import('../views/Management.vue'),
    children: [
      {
        path: 'overview',
        name: 'overview',
        component: () => import('../components/Management/Overview.vue'),
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('../components/Management/About.vue'),
      },

      {
        path: 'api-auth-list',
        name: 'api-auth-list',
        component: () => import('../components/Management/APIAuthList.vue'),
      },

      {
        path: 'sync-api-list',
        name: 'sync-api-list',
        component: () => import('../components/Management/SyncAPIList.vue'),
      },

      {
        path: 'async-api-list',
        name: 'async-api-list',
        component: () => import('../components/Management/AsyncAPIList.vue'),
      },

      {
        path: 'cron-job-list',
        name: 'cron-job-list',
        component: () => import('../components/Management/CronJobList.vue'),
      },

      {
        path: 'task-record-func-list',
        name: 'task-record-func-list',
        component: () => import('../components/Management/TaskRecordFuncList.vue'),
      },
      {
        path: 'sub-task-record-func-list/:id',
        name: 'sub-task-record-func-list',
        component: () => import('../components/Management/TaskRecordFuncList.vue'),
      },

      {
        path: 'script-set-export-history-list',
        name: 'script-set-export-history-list',
        component: () => import('../components/Management/ScriptSetExportHistoryList.vue'),
      },
      {
        path: 'script-set-import-history-list',
        name: 'script-set-import-history-list',
        component: () => import('../components/Management/ScriptSetImportHistoryList.vue'),
      },

      {
        path: 'script-recover-point-list',
        name: 'script-recover-point-list',
        component: () => import('../components/Management/ScriptRecoverPointList.vue'),
      },
      {
        path: 'script-recover-point-add',
        name: 'script-recover-point-add',
        component: () => import('../components/Management/ScriptRecoverPointAdd.vue'),
      },

      {
        path: 'user-list',
        name: 'user-list',
        component: () => import('../components/Management/UserList.vue'),
      },

      {
        path: 'operation-record-list',
        name: 'operation-record-list',
        component: () => import('../components/Management/OperationRecordList.vue'),
      },

      {
        path: 'system-setting',
        name: 'system-setting',
        component: () => import('../components/Management/SystemSetting.vue'),
      },

      /* Experimental Features */
      {
        path: 'experimental-features',
        name: 'experimental-features',
        component: () => import('../components/Management/ExperimentalFeatures.vue'),
      },

      {
        path: 'pip-tool',
        name: 'pip-tool',
        component: () => import('../components/Management/PIPTool.vue'),
      },

      {
        path: 'file-service-list',
        name: 'file-service-list',
        component: () => import('../components/Management/FileServiceList.vue'),
      },
      {
        path: 'file-manager',
        name: 'file-manager',
        component: () => import('../components/Management/FileManager.vue'),
      },
      {
        path: 'func-cache-manager',
        name: 'func-cache-manager',
        component: () => import('../components/Management/FuncCacheManager.vue'),
      },
      {
        path: 'func-store-manager',
        name: 'func-store-manager',
        component: () => import('../components/Management/FuncStoreManager.vue'),
      },

      {
        path: 'system-metrics',
        name: 'system-metrics',
        component: () => import('../components/Management/SystemMetrics.vue'),
      },
      {
        path: 'system-logs',
        name: 'system-logs',
        component: () => import('../components/Management/SystemLogs.vue'),
      },
      {
        path: 'abnormal-request-list',
        name: 'abnormal-request-list',
        component: () => import('../components/Management/AbnormalRequestList.vue'),
      },

      {
        path: 'script-publish-history-list',
        name: 'script-publish-history-list',
        component: () => import('../components/Management/ScriptPublishHistoryList.vue'),
      },

      {
        path: 'access-key-add',
        name: 'access-key-add',
        component: () => import('../components/Management/AccessKeySetup.vue'),
      },
      {
        path: 'access-key-list',
        name: 'access-key-list',
        component: () => import('../components/Management/AccessKeyList.vue'),
      },

      {
        path: 'ui-theme',
        name: 'ui-theme-debugger',
        component: () => import('../components/Management/UIThemeDebugger.vue'),
      },
      {
        path: 'guance-websocket',
        name: 'guance-websocket-debugger',
        component: () => import('../components/Management/GuanceWebSocketDebugger.vue'),
      },
    ],
  },

  // Setting
  {
    path: '/setting',
    name: 'setting',
    component: () => import('../views/Setting.vue'),
    children: [
      {
        path: 'profile-setup',
        name: 'profile-setup',
        component: () => import('../components/Setting/ProfileSetup.vue'),
      },
      {
        path: 'password-setup',
        name: 'password-setup',
        component: () => import('../components/Setting/PasswordSetup.vue'),
      },
      {
        path: 'clear-cache',
        name: 'clear-cache',
        component: () => import('../components/Setting/ClearCache.vue'),
      },
    ],
  },

  // Func doc
  {
    path: '/func-doc',
    name: 'func-doc',
    component: () => import('../views/FuncDoc.vue'),
  },

  // Func API doc
  {
    path: '/func-api-doc',
    name: 'func-api-doc',
    component: () => import('../views/FuncAPIDoc.vue'),
  },

  // Redirection
  {
    path: '/',
    redirect: '/index',
  },
  {
    path: '*',
    redirect: {
      name: 'index',
      query: null,
    }
  }
];

const router = new VueRouter({
  routes,
});

const noAuthRoutes = [
  'index',
  'func-doc',
  'func-api-doc',
  'dream',
];
const adminOnlyRoutes = [
  'access-key-list',
  'system-setting',
];


router.beforeEach((to, from, next) => {
  // When changing paths, the loaded flag is set to false and waits until it is loaded
  // to prevents screen flashing
  store.commit('updateLoadStatus', false);

  // Redirect if already signed in
  if (store.state.xAuthToken && to.name === 'index') {
    return next({ name: 'intro' });
  }

  // Redirect if not signed in
  if (!store.state.xAuthToken && noAuthRoutes.indexOf(to.name) < 0) {
    return next({ name: 'index' });
  }

  // Redirect for SA privilege control
  if (adminOnlyRoutes.indexOf(to.name) >= 0 && !store.getters.isAdmin) {
    console.warn('This page is only accessible by Admin:', to.name);
    return next({ name: 'index' });
  }

  // Controls accessing code editor page
  if (T.getNavigateType() === 'reload' && (!from || !from.name) && to.name === 'code-editor') {
    // Allow direct access to code editing page when refreshing
  } else {
    // Otherwise it must be accessed via the code view page
    if (to.name === 'code-editor' && !(from && from.name === 'code-viewer')) {
      return next({
        name  : 'code-viewer',
        params: to.params,
      });
    }
  }

  // Set page title
  if (from.name) {
    let siteTitle = 'DataFlux Func';
    if (store.getters.SYSTEM_SETTINGS('CUSTOM_SITE_TITLE_ENABLED')
    && store.getters.SYSTEM_SETTINGS('CUSTOM_SITE_TITLE_TEXT')) {
      siteTitle = store.getters.SYSTEM_SETTINGS('CUSTOM_SITE_TITLE_TEXT');
    }

    if (['code-editor', 'code-viewer'].indexOf(to.name) >= 0) {
      document.title = `[${to.params.id}] - ${siteTitle}`;
    } else {
      document.title = siteTitle;
    }
  }

  return next();
});

router.afterEach((to, from) => {
  if (store.getters.isSignedIn && !store.getters.isScriptMarketCheckUpdatedRecently) {
    common.checkScriptMarketUpdate().then(() => {
      store.commit('updateScriptMarketCheckUpdateDate');
    });
  }
});

export default router
