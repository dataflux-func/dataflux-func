<i18n locale="zh-CN" lang="yaml">
Func not exists     : 函数不存在
Blueprint not exists: 蓝图不存在

Get from the arguments when calling: 在调用时从参数中获取
</i18n>

<!-- Generated by OpenCC START -->
<i18n locale="zh-HK" lang="yaml">
Blueprint not exists: 藍圖不存在
Func not exists: 函數不存在
Get from the arguments when calling: 在調用時從參數中獲取
</i18n>
<i18n locale="zh-TW" lang="yaml">
Blueprint not exists: 藍圖不存在
Func not exists: 函式不存在
Get from the arguments when calling: 在呼叫時從引數中獲取
</i18n>
<!-- Generated by OpenCC END -->

<template>
  <div class="func-info">
    <!-- Func / Blueprint title -->
    <strong class="func-title">
      <span v-if="id">{{ title || name }}</span>
      <span v-else-if="origin === 'scriptLib'" class="func-not-exists text-bad">{{ $t('Func not exists') }}</span>
      <span v-else-if="origin === 'blueprint'" class="func-not-exists text-bad">{{ $t('Blueprint not exists') }}</span>
    </strong>
    <GotoFuncButton v-if="origin === 'scriptLib' && id && !hideGotoFunc" :funcId="id"></GotoFuncButton>

    <!-- Func def -->
    <br>
    <template v-if="origin === 'scriptLib'">
      <strong class="code-font text-info">def</strong>
      <template v-if="fullDefinition">
        <!-- Prefer to use the definition to display -->
        <code class="code-font text-main">{{ fullDefinition }}</code>
      </template>
      <template v-else>
        <!-- Use parsed result to display -->
        <code class="code-font text-main">{{ configFuncId }}(</code
        ><code v-if="!kwargsJSON" class="code-font">...</code
        ><template v-else>
          <div class="code-font func-kwargs-block" v-for="(value, name, index) in kwargsJSON">
            <el-tooltip placement="top">
              <div slot="content">
                <pre class="func-kwargs-value" v-if="common.isFuncArgumentPlaceholder(value)">{{ $t('Get from the arguments when calling') }}</pre>
                <pre class="func-kwargs-value" v-else>{{ T.limitText(JSON.stringify(value, null, 2), 300, { showLength: 'newLine' }) }}</pre>
              </div>
              <code class="func-kwargs-name">{{ name }}</code>
            </el-tooltip><span v-if="index < T.jsonLength(kwargsJSON) - 1">,&nbsp;</span>
          </div>
        </template
        ><code class="code-font text-main">)</code>
      </template>
    </template>
    <template v-else-if="origin === 'blueprint'">
      <el-tooltip effect="dark" :content="$t('Blueprint')" placement="left">
        <i class="fa fa-fw fa-sitemap fa-rotate-270"></i>
      </el-tooltip>
      <code class="code-font text-main">{{ blueprintId }}</code>
    </template>
  </div>
</template>

<script>
export default {
  name: 'FuncInfo',
  components: {
  },
  watch: {
  },
  methods: {
  },
  computed: {
    name() {
      return this.id.split('.').pop();
    },
    fullDefinition() {
      if (this.id && this.definition) {
        return `${this.id.split('.')[0]}.${this.definition}`;
      } else {
        return '';
      }
    },
    origin() {
      let id = this.id ||this.configFuncId;
      if (!id) return null;
      if (this.T.startsWith(id, '_bp_')) return 'blueprint';
      return 'scriptLib';
    },
    blueprintId() {
      if (this.origin !== 'blueprint') return null;

      let id = this.id ||this.configFuncId;
      return id.replace(/^_bp_/g, '').split('__')[0];
    },
  },
  props: {
    configFuncId: String,
    id          : String,
    title       : String,
    definition  : String,
    kwargsJSON  : Object,
    hideGotoFunc: Boolean,
  },
  data() {
    return {}
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.func-title {
  font-size: 16px;
}
.func-info {
  font-size: 16px;
}
.func-not-exists {
  font-size: 14px;
}
.func-kwargs-block {
  display: inline-block;
}
.func-kwargs-name {
  color: #ff6600;
  padding: 0px 5px;
}
pre.func-kwargs-value {
  padding: 0;
  margin: 0;
}
</style>
