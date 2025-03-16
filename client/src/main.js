import Vue from 'vue'
import App from '@/App.vue'
import router from '@/router'
import store from '@/store'

// Toolkit
import * as T from '@/toolkit'
Vue.prototype.T = T;

// Const
import C from '@/const'
Vue.prototype.C = C;

// Icons
import 'font-awesome/css/font-awesome.css'

// SplitPane
import splitPane from 'vue-splitpane'
Vue.component('split-pane', splitPane);

// Frontend Framework
import ElementUI from 'element-ui'
ElementUI.Footer.props.height.default = '80px';

ElementUI.Tooltip.props.transition.default = false;

ElementUI.Popover.props.transition.default = false;
ElementUI.Popover.props.openDelay.default  = 50;
ElementUI.Popover.props.closeDelay.default = 500;

ElementUI.Link.props.underline.default = true;
ElementUI.Link.props.type.default      = 'primary';

ElementUI.Dialog.props.modalAppendToBody.default = true;
ElementUI.Dialog.props.appendToBody.default      = true;
ElementUI.Dialog.props.top.default               = '10vh';
ElementUI.Dialog.props.destroyOnClose.default    = true;

ElementUI.Form.props.validateOnRuleChange.default = false;

if (store.getters.uiThemeResolved === 'dark') {
  ElementUI.Progress.props.defineBackColor.default = '#555';
}

Vue.use(ElementUI);
window.ElementUI = ElementUI;

// i18n
import i18n from '@/i18n'
Vue.prototype.i18n = i18n;

// Time handling
import moment, { locale } from 'moment'
Vue.prototype.M = moment;

Vue.filter('datetime', function(d, f) {
  return T.getDateTimeString(d, f);
});
Vue.filter('fromNow', function(d) {
  return T.fromNow(d);
});
Vue.filter('toNow', function(d) {
  return T.toNow(d);
});
Vue.filter('toFuture', function(d) {
  return T.toFuture(d);
});

// Validator
import validator from 'validator';
Vue.prototype.validator = validator;

// Clipboard
import clipboardJS from 'clipboard';
Vue.prototype.clipboardJS = clipboardJS;

// JSON Viewer
import JsonViewer from 'vue-json-viewer';
Vue.use(JsonViewer);

// Prevent re-click
import preventReClick from '@/preventReClick'
Vue.use(preventReClick);

// Common
import * as common from '@/common'
Vue.prototype.common = common;

// Common biz components
import Logo             from '@/components/Logo'
import InfoBlock        from '@/components/InfoBlock'
import RelativeDateTime from '@/components/RelativeDateTime'
import FuncInfo         from '@/components/FuncInfo'
import FuzzySearchInput from '@/components/FuzzySearchInput'
import Pager            from '@/components/Pager'
import PageLoading      from '@/components/PageLoading'
import GotoFuncButton   from '@/components/GotoFuncButton'
import CopyButton       from '@/components/CopyButton'
Vue.component('Logo', Logo);
Vue.component('InfoBlock', InfoBlock);
Vue.component('RelativeDateTime', RelativeDateTime);
Vue.component('FuncInfo', FuncInfo);
Vue.component('FuzzySearchInput', FuzzySearchInput);
Vue.component('Pager', Pager);
Vue.component('PageLoading', PageLoading);
Vue.component('GotoFuncButton', GotoFuncButton);
Vue.component('CopyButton', CopyButton);

// API exception handling
const apiRespErrorHandler = (err, vm) => {
  if (err.status) {
    console.error(err);
  } else {
    throw err;
  }
};

Vue.config.errorHandler = apiRespErrorHandler;
Vue.prototype.$throw = err => apiRespErrorHandler(err, this);

// TODO: Add shaking effect to error popups
let originAlert = Vue.prototype.$alert;
Vue.prototype.$alert = (message, title, options) => {
  options = options || {};
  if (options.type === 'error') {
    options.customClass = 'error-input-shake';
  }
  return originAlert(message, title, options);
}

// Listen LocalStorage
window.addEventListener('storage', function(ev) {
  if (ev.key !== 'vuex') return;

  let nextState = null;
  try {
    nextState = JSON.parse(ev.newValue);
  } catch(err) {
    console.error(err)
  }

  store.commit('syncState', nextState);
});

// Vue instance
const app = new Vue({
  router,
  store,
  i18n,
  render: h => h(App),

  async created() {
    this.$store.dispatch('loadSystemInfo');
    this.$store.dispatch('loadUserProfile');

    let apiNamesLocales_zhCN = await this.$store.dispatch('getAPINamesLocales');
    i18n.mergeLocaleMessage('zh-CN', apiNamesLocales_zhCN);
  },
  computed: {
    systemSettings() {
      return this.$store.getters.SYSTEM_INFO('SYSTEM_SETTINGS', {});
    },
  },
  methods: {
    goToSignOut() {
      this.$router.push({ name: 'sign-out' });
    },
    reloadPage() {
      this.$loading();

      setImmediate(() => {
        location.reload();
      });
    },
    setUILocale(uiLocale) {
      this.$store.commit('updateUILocale', uiLocale);

      // Some front-end components can't support switching directly, refreshing the page is the safest way to do it
      this.reloadPage();
    },
    setUITheme(uiTheme) {
      this.$store.commit('updateUITheme', uiTheme);

      // Some front-end components can't support switching directly, refreshing the page is the safest way to do it
      this.reloadPage();
    },

    checkUserProfileForGit() {
      let userProfile = this.$store.state.userProfile || {};

      if (!userProfile.name || !userProfile.email) {
        this.$store.commit('updateShowCompleteUserProfile', true);
        return false;
      }
      return true;
    },
  }
}).$mount('#app');
window.app = app;

// Global configuration
Vue.config.devtools      = true;
Vue.config.productionTip = false;
Vue.config.silent        = true;

import * as thanks from '@/thanks'
window.thanks = thanks.thanks;

window.conflictId = `${store.getters.clientId}:${T.genRandString()}`;

export default app
