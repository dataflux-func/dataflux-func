import Vue from 'vue'
import * as T from '@/toolkit'

import locales_en   from '@/assets/yaml/locales.en.yaml'
import locales_zhCN from '@/assets/yaml/locales.zh-CN.yaml'
import locales_zhHK from '@/assets/yaml/locales.zh-HK.yaml'
import locales_zhTW from '@/assets/yaml/locales.zh-TW.yaml'
import locales_ja   from '@/assets/yaml/locales.ja.yaml'

import messages_en   from '@/assets/yaml/messages.en.yaml'
import messages_zhCN from '@/assets/yaml/messages.zh-CN.yaml'
import messages_zhHK from '@/assets/yaml/messages.zh-HK.yaml'
import messages_zhTW from '@/assets/yaml/messages.zh-TW.yaml'
import messages_ja   from '@/assets/yaml/messages.ja.yaml'

import elementUILocale_en   from 'element-ui/lib/locale/lang/en'
import elementUILocale_zhCN from 'element-ui/lib/locale/lang/zh-CN'
import elementUILocale_zhTW from 'element-ui/lib/locale/lang/zh-TW'
import elementUILocale_ja   from 'element-ui/lib/locale/lang/ja'

let i18nData = {
  en     : {},
  'zh-CN': {},
  'zh-HK': {},
  'zh-TW': {},
  ja     : {},
};

Object.assign(i18nData['en'],    locales_en,   messages_en,   elementUILocale_en);
Object.assign(i18nData['zh-CN'], locales_zhCN, messages_zhCN, elementUILocale_zhCN);
Object.assign(i18nData['zh-HK'], locales_zhHK, messages_zhHK, elementUILocale_zhTW);
Object.assign(i18nData['zh-TW'], locales_zhTW, messages_zhTW, elementUILocale_zhTW);
Object.assign(i18nData['ja'],    locales_ja,   messages_ja,   elementUILocale_ja);

import VueI18n from 'vue-i18n'
Vue.use(VueI18n);

const i18n = new VueI18n({
  // Reference: https://zh.wikipedia.org/wiki/%E5%8C%BA%E5%9F%9F%E8%AE%BE%E7%BD%AE
  locale                : T.getUILocale(),
  fallbackLocale        : 'en',
  formatFallbackMessages: true,
  silentFallbackWarn    : true,
  silentTranslationWarn : true,
  messages              : i18nData,
});

// ElementUI
// Reference: https://blog.csdn.net/songhsia/article/details/104800966
import ElementLocale from 'element-ui/lib/locale';
ElementLocale.i18n((key, value) => i18n.t(key, value));

export default i18n
