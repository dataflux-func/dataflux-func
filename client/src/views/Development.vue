<template>
  <split-pane v-on:resize="resizeVueSplitPane" ref="vueSplitPane" :min-percent="0" :default-percent="20" split="vertical">
    <!-- Aside -->
    <template slot="paneL">
      <div class="aside">
        <div class="aside-content">
          <el-tabs v-model="currentTab" stretch type="border-card">
            <el-tab-pane :label="$t('Script Lib')" name="aside-script">
              <AsideScript ref="asideScript"></AsideScript>
            </el-tab-pane>
            <el-tab-pane :label="$t('Connector')" name="aside-connector">
              <AsideConnector ref="asideConnector"></AsideConnector>
            </el-tab-pane>
            <el-tab-pane :label="$t('ENV')" name="aside-env-variable">
              <AsideEnvVariable ref="asideEnvVariable"></AsideEnvVariable>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </template>

    <!-- Editor -->
    <template slot="paneR">
      <router-view />
    </template>
  </split-pane>
</template>

<script>
// @ is an alias to /src
import AsideScript      from '@/components/Development/AsideScript'
import AsideConnector   from '@/components/Development/AsideConnector'
import AsideEnvVariable from '@/components/Development/AsideEnvVariable'

export default {
  name: 'Development',
  components: {
    // Aside navi area
    AsideScript,
    AsideConnector,
    AsideEnvVariable,
  },
  watch: {
    $route: {
      immediate: true,
      handler(to, from) {
        const NO_FADE_ROUTES = [
          'code-editor',
          'code-viewer',
        ];
        if (NO_FADE_ROUTES.indexOf(to.name) >= 0) {
          this.transitionName = null;
        } else {
          this.transitionName = 'fade';
        }
      }
    },
    splitPanePercent(val) {
      this.resizeVueSplitPane(val);
    },
  },
  methods: {
    resizeVueSplitPane(percent) {
      if (percent > this.SPLIT_PANE_MAX_PERCENT) {
        percent = this.SPLIT_PANE_MAX_PERCENT;
      } else if (percent < this.SPLIT_PANE_MIN_PERCENT) {
        percent = this.SPLIT_PANE_MIN_PERCENT;
      }

      this.$refs.vueSplitPane.percent = percent;
      this.debouncedUpdatePanePercent(this.$store, percent);
    },
  },
  computed: {
    SPLIT_PANE_MAX_PERCENT: () => 35,
    SPLIT_PANE_MIN_PERCENT: () => 10,
    splitPanePercent() {
      return this.$store.state.Editor_splitPanePercent || this.$store.getters.DEFAULT_STATE.Editor_splitPanePercent;
    },
  },
  data() {
    return {
      currentTab: 'aside-script',
    }
  },
  created() {
    this.debouncedUpdatePanePercent = this.T.debounce((store, nextPercent) => {
      store.commit('updateEditor_splitPanePercent', nextPercent);
    }, 100);
  },
  mounted() {
    // Load split pane position
    this.resizeVueSplitPane(this.splitPanePercent);
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.aside {
  height: 100%;
  overflow: hidden;
}
.aside-content {
  position: relative;
  height: 100%;
}
</style>

<style>
.aside-content .aside-inner-content {
  padding-top: 15px;
}
.aside-content .jump-to-select-wrap {
  z-index: 1;
  width: calc(100% - 3px);
  height: 50px;
  position: absolute;
  left: 0;
  top: 1px;
  padding-top: 8px;
  background: linear-gradient(to bottom, var(--base) 50%, var(--base-transparent) 100%);
}
.aside-content .el-tabs__header {
  z-index: 1;
}
.aside-content > .el-tabs > .el-tabs__content > .el-tab-pane {
  height: 100%;
}
.aside-content > .el-tabs > .el-tabs__content > .el-tab-pane > div {
  height: 100%;
  padding-right: 5px;
  overflow-y: auto;
}
.aside-content > .el-tabs > .el-tabs__content {
  padding: 0px 0px 10px 5px;
  position: absolute;
  top: 38px;
  left: 0;
  right: 0;
  bottom: 0;
}
.aside-content>.el-tabs>.el-tabs__content.el-tab-pane {
  padding: 10px;
  background-color: white;
}
.aside-content>.el-tabs.el-tabs--border-card {
  border: none;
  box-shadow: none;
}
.aside-tip {
  padding: 12px !important;
  max-width: 600px;
  min-width: 300px;
}

@keyframes highlight-code-line-blink {
  from, to {
    opacity: 1.0;
  }
  50% {
    opacity: 0.3;
  }
}
.highlight-code-line-blink {
  animation: highlight-code-line-blink .25s ease-in-out 0s 3;
  animation-fill-mode: forwards;
}
</style>
