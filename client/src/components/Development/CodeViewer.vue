<i18n locale="en" lang="yaml">
codeLines: '{n} line | {n} lines'
</i18n>

<i18n locale="zh-CN" lang="yaml">
Fold Code   : 折叠代码
Fold Level 2: 折叠层级 2
Fold Level 3: 折叠层级 3
Unfold All  : 全部展开

'Script is under editing in other client, please wait...'                   : '其他客户端正在编辑此脚本，请等待...'
'Script is under editing by other user ({user}), please wait...'            : '其他用户（{user}）正在编辑此脚本，请等待...'
'Script is under editing in your other tab, please close it and continue'   : '您的其他标签页或窗口正在编辑此脚本，请关闭后继续'
'Script is under editing in you other browser, please close it and continue': '您的其他浏览器正在编辑此脚本，请关闭后继续'

Shortcut                                                              : 快捷键
Select Target                                                         : 选择跳转目标
Download {type}                                                       : 下载{type}
Code Editor setting                                                   : 代码编辑器设置
This is a built-in Script, code will be reset when the system restarts: 这是一个内置脚本，代码会在系统重启后复位
This Script is locked by other user ({user})                          : 当前脚本被其他用户（{user}）锁定
Currently in view mode, click Edit button to enter edit mode          : 当前为查看模式，点击「编辑」按钮进入编辑模式
VIEW MODE                                                             : 查看模式

Published Code  : 已发布的代码
Saved Draft Code: 已保存的草稿代码
</i18n>

<!-- Generated by OpenCC START -->
<i18n locale="zh-HK" lang="yaml">
Code Editor setting: 代碼編輯器設置
Currently in view mode, click Edit button to enter edit mode: 當前為查看模式，點擊「編輯」按鈕進入編輯模式
Download {type}: 下載{type}
Fold Code: 摺疊代碼
Fold Level 2: 摺疊層級 2
Fold Level 3: 摺疊層級 3
Published Code: 已發佈的代碼
Saved Draft Code: 已保存的草稿代碼
Script is under editing by other user ({user}), please wait...: 其他用户（{user}）正在編輯此腳本，請等待...
Script is under editing in other client, please wait...: 其他客户端正在編輯此腳本，請等待...
Script is under editing in you other browser, please close it and continue: 您的其他瀏覽器正在編輯此腳本，請關閉後繼續
Script is under editing in your other tab, please close it and continue: 您的其他標籤頁或窗口正在編輯此腳本，請關閉後繼續
Select Target: 選擇跳轉目標
Shortcut: 快捷鍵
This Script is locked by other user ({user}): 當前腳本被其他用户（{user}）鎖定
This is a built-in Script, code will be reset when the system restarts: 這是一個內置腳本，代碼會在系統重啓後復位
Unfold All: 全部展開
VIEW MODE: 查看模式
</i18n>
<i18n locale="zh-TW" lang="yaml">
Code Editor setting: 程式碼編輯器設定
Currently in view mode, click Edit button to enter edit mode: 當前為檢視模式，點選「編輯」按鈕進入編輯模式
Download {type}: 下載{type}
Fold Code: 摺疊程式碼
Fold Level 2: 摺疊層級 2
Fold Level 3: 摺疊層級 3
Published Code: 已釋出的程式碼
Saved Draft Code: 已儲存的草稿程式碼
Script is under editing by other user ({user}), please wait...: 其他使用者（{user}）正在編輯此指令碼，請等待...
Script is under editing in other client, please wait...: 其他客戶端正在編輯此指令碼，請等待...
Script is under editing in you other browser, please close it and continue: 您的其他瀏覽器正在編輯此指令碼，請關閉後繼續
Script is under editing in your other tab, please close it and continue: 您的其他標籤頁或視窗正在編輯此指令碼，請關閉後繼續
Select Target: 選擇跳轉目標
Shortcut: 快捷鍵
This Script is locked by other user ({user}): 當前指令碼被其他使用者（{user}）鎖定
This is a built-in Script, code will be reset when the system restarts: 這是一個內建指令碼，程式碼會在系統重啟後復位
Unfold All: 全部展開
VIEW MODE: 檢視模式
</i18n>
<!-- Generated by OpenCC END -->

<template>
  <transition name="fade-s">
    <el-container v-show="$store.state.isLoaded">
      <!-- Operation area -->
      <el-header class="code-viewer" style="height: unset !important">
        <div class="code-viewer-action-left">
          <code class="code-viewer-action-title">
            <i class="fa fa-file-code-o"></i>
            {{ data.id }}
          </code>
        </div>
        <div class="code-viewer-action-breaker hidden-lg-and-up"></div>
        <div class="code-viewer-action-right">
          <div v-if="conflictInfo" class="conflict-info">
            <i class="fa fa-fw fa-exclamation-triangle"></i>
            <span v-if="conflictInfo.user.username !== userInfo.username">
              <template v-if="!conflictUser">
                {{ $t('Script is under editing in other client, please wait...') }}
              </template>
              <template v-else>
                {{ $t('Script is under editing by other user ({user}), please wait...', { user: conflictUser }) }}
              </template>
            </span>
            <span v-else-if="conflictInfo.scope === 'sameClientOtherTab'">{{ $t('Script is under editing in your other tab, please close it and continue') }}</span>
            <span v-else-if="conflictInfo.scope === 'otherClient'">{{ $t('Script is under editing in you other browser, please close it and continue') }}</span>
          </div>

          <div>
            <el-dropdown split-button size="mini" @click="foldCode(1)" @command="foldCode">
              {{ $t('Fold Code') }}
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item :command="2">{{ $t('Fold Level 2') }}</el-dropdown-item>
                <el-dropdown-item :command="3">{{ $t('Fold Level 3') }}</el-dropdown-item>
                <el-dropdown-item :command="-1" divided>{{ $t('Unfold All') }}</el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>
          </div>

          <div>
            <el-select
              style="width: 150px"
              popper-class="code-font"
              v-model="selectedItemId"
              size="mini"
              filterable default-first-option
              @keyup.native.enter="redoSelectedItem(selectedItemId)"
              :placeholder="$t('Select Target')">
              <el-option v-for="item in selectableItems" :key="item.id" :label="item.name" :value="item.id">
                <div @click="redoSelectedItem(item.id)">
                  <el-tag v-if="item.type === 'todo'"
                    size="mini"
                    class="select-todo-tag" :type="C.TODO_TYPE_MAP.get(item.todoType).tagType">
                    <i class="fa fa-fw" :class="C.TODO_TYPE_MAP.get(item.todoType).icon"></i>
                    {{ item.todoType }}
                  </el-tag>
                  <el-tag v-else class="select-item-tag" type="info" size="mini">{{ item.type }}</el-tag>
                  {{ item.name }}
                </div>
              </el-option>
            </el-select>
          </div>

          <div v-if="!conflictInfo">
            <el-tooltip placement="bottom" :enterable="false">
              <div slot="content">
                {{ $t('Shortcut') }}{{ $t(':') }}<kbd>{{ T.getSuperKeyName() }}</kbd> + <kbd>E</kbd>
              </div>
              <el-button
                @click="startEdit"
                type="primary" plain
                size="mini">
                <i class="fa fa-fw" :class="[C.CODE_VIEWR_USER_OPERATION_MAP.get(userOperation).icon]"></i> {{ C.CODE_VIEWR_USER_OPERATION_MAP.get(userOperation).name }}</el-button>
            </el-tooltip>
          </div>

          <div>
            <el-radio-group v-model="showMode" size="mini">
              <el-tooltip placement="bottom" v-for="mode, i in C.CODE_VIEWER_SHOW_MODE" :key="mode.key" :enterable="false">
                <div slot="content">
                  {{ $t('Shortcut') }}{{ $t(':') }}<kbd>{{ T.getSuperKeyName() }}</kbd> + <kbd>{{ i + 1 }}</kbd>
                </div>
                <el-radio-button :label="mode.key">{{ mode.name }}</el-radio-button>
              </el-tooltip>
            </el-radio-group>
          </div>

          <div>
            <el-tooltip :content="$t('Download')" placement="bottom" :enterable="false">
              <el-button v-prevent-re-click :disabled="!canReadCode" @click="download" plain size="mini">{{ $t('Download {type}', { type: C.CODE_VIEWER_SHOW_MODE_MAP.get(showMode).name } ) }}</el-button>
            </el-tooltip>
          </div>

          <div>
            <el-tooltip :content="$t('Code Editor setting')" placement="bottom" :enterable="false">
              <el-button
                @click="$refs.codeEditorSetting.open()"
                plain
                size="mini"><i class="fa fa-fw fa-cog"></i></el-button>
            </el-tooltip>
          </div>
        </div>

        <InfoBlock v-if="isLockedByOther" :type="canEditCode ? 'warning' : 'error'" :title="$t('This Script is locked by other user ({user})', { user: lockedByUser })" />
        <InfoBlock v-else-if="data.sset_origin === 'builtin'" type="warning" :title="$t('This is a built-in Script, code will be reset when the system restarts')" />
        <InfoBlock v-else type="info" :title="$t('Currently in view mode, click Edit button to enter edit mode')" />
      </el-header>

      <!-- Code area -->
      <el-main id="editorContainer_CodeViewer" :style="$store.getters.codeMirrorSettings.style" :data-view-mode-text="$t('VIEW MODE')">
        <textarea id="editor_CodeViewer"></textarea>
      </el-main>

      <CodeEditorSetting :codeMirror="codeMirror" ref="codeEditorSetting" />
    </el-container>
  </transition>
</template>

<script>
// @ is an alias to /src
import CodeEditorSetting from '@/components/Development/CodeEditorSetting'

import { createPatch } from 'diff'
import FileSaver from 'file-saver';

export default {
  name: 'CodeViewer',
  components: {
    CodeEditorSetting,
  },
  watch: {
    $route: {
      immediate: true,
      async handler(to, from) {
        await this.loadData();
      }
    },
    showMode(val) {
      this.loadData();
    },
    codeMirrorTheme(val) {
      this.codeMirror.setOption('theme', val);
    },
    selectedItemId(val) {
      this.$store.commit('updateEditor_selectedItemId', val);
      this.highlightQuickSelectItem();
    },
    '$store.state.Editor_selectedItemId'(val) {
      if (this.selectedItemId !== val) {
        this.selectedItemId = val;
      }
    },
    '$store.state.shortcutAction'(val) {
      switch(val.action) {
        case 'codeViewer.showDraft':
          this.showMode = 'draft';
          break;

        case 'codeViewer.showPublished':
          this.showMode = 'published';
          break;

        case 'codeViewer.showDiff':
          this.showMode = 'diff';
          break;

        case 'codeViewer.enterEditor':
          if (!this.conflictInfo) {
            this.startEdit();
          }
          break;
      }
    },
  },
  methods: {
    async loadData() {
      let apiRes = await this.T.callAPI_getOne('/api/v1/scripts/do/list', this.$route.params.id, {
        query: { _withCode: true, _withCodeDraft: true },
      });
      if (!apiRes.ok || !apiRes.data) {
        // Redirect to the Intro page if it fails to fetch the script.
        this.$router.push({ name: 'intro' });
        return;
      };

      this.data = apiRes.data;

      // Redirect to the lock reminder page if no permission is granted
      if (!this.canReadCode) {
        this.$router.push({ name: 'script-locked' });
        return;
      }

      this.$store.commit('updateLoadStatus', true);

      setImmediate(() => {
        // Load code
        this.codeMirror.setValue('');
        switch(this.showMode) {
          case 'draft':
          case 'published':
            let codeField = this.C.CODE_VIEWER_SHOW_MODE_MAP.get(this.showMode).codeField;

            this.codeMirror.setValue(this.data[codeField] || '');
            this.T.setCodeMirrorMode(this.codeMirror, 'python');
            break;

          case 'diff':
            let fileTitle = this.data.title ? ` (${this.data.title})` : '';
            let fileName  = `${this.scriptId}${fileTitle}`;
            let oldStr    = this.data.code      || '';
            let newStr    = this.data.codeDraft || '';
            let oldHeader = this.$t('Published Code');
            let newHeader = this.$t('Saved Draft Code');
            let diffPatch = createPatch(fileName, oldStr, newStr, oldHeader, newHeader);

            this.codeMirror.setValue(diffPatch);
            this.T.setCodeMirrorMode(this.codeMirror, 'diff');
            break;
        }
        this.codeMirror.refresh();
        this.codeMirror.focus();

        // Updating the list of Funcs
        this.updateSelectableItems();

        if (this.$store.state.Editor_selectedItemId) {
          // Highlight the selected Func
          this.selectedItemId = this.$store.state.Editor_selectedItemId;
          this.highlightQuickSelectItem();
        } else {
          // Previous line
          let cursor = this.$store.state.Editor_scriptCursorMap[this.scriptId];
          this.T.jumpToCodeMirrorLine(this.codeMirror, cursor);
        }

        this.isReady = true;
      });
    },
    foldCode(level) {
      this.T.foldCode(this.codeMirror, level);
    },
    redoSelectedItem(selectedItemId) {
      if (selectedItemId !== this.selectedItemId) return;

      this.selectedItemId = null;
      this.$nextTick(() => {
        this.selectedItemId = selectedItemId;
      });
    },
    startEdit() {
      this.$router.push({
        name  : 'code-editor',
        params: {id: this.data.id},
      });
    },
    updateSelectableItems() {
      this.selectableItems = this.common.getPythonCodeSelectableItems(this.data.codeDraft, this.scriptId);
    },
    _clearLineHighlight(line) {
      try {
        this.codeMirror.removeLineClass(line, 'text');
        this.codeMirror.removeLineClass(line, 'background');
        this.codeMirror.removeLineClass(line, 'wrap');

        let widgets = this.codeMirror.lineInfo(line).widgets;
        if (Array.isArray(widgets)) {
          widgets.forEach((w) => {
            w.clear();
          });
        }

      } catch(err) {
        // Nope
      }
    },
    _setLineHighlight(options) {
      if (!this.codeMirror) return null;

      options = options || {};

      // Add style
      if (options.textClass) {
        this.codeMirror.addLineClass(options.line, 'text', options.textClass);
      }
      if (options.backgroundClass) {
        this.codeMirror.addLineClass(options.line, 'background', options.backgroundClass);
      }
      if (options.wrapClass) {
        this.codeMirror.addLineClass(options.line, 'wrap', options.wrapClass);
      }

      // Add extras
      if (options.lineWidgetConfig) {
        let config = options.lineWidgetConfig;

        let div = null;
        switch(config.type) {
        }

        if (div) {
          this.codeMirror.addLineWidget(options.line, div);
        }
      }

      this.T.jumpToCodeMirrorLine(this.codeMirror, options.line);

      return this.codeMirror.lineInfo(options.line);
    },
    updateHighlightLineConfig(key, config) {
      let nextHighlightedLineConfigMap = this.T.jsonCopy(this.$store.state.codeViewer_highlightedLineConfigMap) || {};

      if (config === null) {
        // Clear highlighting
        if (nextHighlightedLineConfigMap[this.scriptId]) {
          delete nextHighlightedLineConfigMap[this.scriptId][key];
        }

      } else {
        // Set highlighting
        if (!nextHighlightedLineConfigMap[this.scriptId]) {
          nextHighlightedLineConfigMap[this.scriptId] = {};
        }
        nextHighlightedLineConfigMap[this.scriptId][key] = config;
      }

      if (!this.codeMirror) return;

      // Remove all old highlighting
      for (let scriptId in this.highlightedLineInfoMap) if (this.highlightedLineInfoMap.hasOwnProperty(scriptId)) {
        let lineInfoMap = this.highlightedLineInfoMap[scriptId];
        for (let key in lineInfoMap) if (lineInfoMap.hasOwnProperty(key)) {
          let lineInfo = lineInfoMap[key];
          this._clearLineHighlight(lineInfo.handle.lineNo());
        }
      }

      // Re-set highlighting
      let nextHighlightedInfoMap = {};
      let configMap = nextHighlightedLineConfigMap[this.scriptId] || {};
      for (let key in configMap) if (configMap.hasOwnProperty(key)) {
        let config = configMap[key];
        let lineInfo = this._setLineHighlight(config);
        if (lineInfo) {
          if (!nextHighlightedInfoMap[this.scriptId]) {
            nextHighlightedInfoMap[this.scriptId] = {};
          }
          nextHighlightedInfoMap[this.scriptId][key] = lineInfo;
        }
      }
      this.highlightedLineInfoMap = nextHighlightedInfoMap;

      this.$store.commit('updateCodeViewer_highlightedLineConfigMap', nextHighlightedLineConfigMap);
    },
    highlightQuickSelectItem() {
      if (!this.$store.state.isLoaded) return;
      if (!this.codeMirror) return;
      if (!this.selectedItem) return;

      // Clear previous selections
      this.updateHighlightLineConfig('selectedFuncLine', null);

      // Locate the selection line
      this.updateHighlightLineConfig('selectedFuncLine', {
        line           : this.selectedItem.line,
        marginType     : 'next',
        textClass      : 'highlight-text',
        backgroundClass: 'current-func-background highlight-code-line-blink',
      });
    },
    download() {
      let blob = new Blob([this.codeMirror.getValue()], {type: 'text/plain'});

      let fileName = null;
      switch(this.showMode) {
        case 'draft':
          fileName = this.data.id + '.draft.py';
          break;

        case 'published':
          fileName = this.data.id + '.py';
          break;

        case 'diff':
          fileName = this.data.id + '.py.diff';
          break;
      }
      FileSaver.saveAs(blob, fileName);
    },
  },
  computed: {
    userInfo() {
      if (!this.$store.getters.isSignedIn) return {};
      return {
        username: this.$store.state.userProfile.username,
        name    : this.$store.state.userProfile.name,
      };
    },

    codeMirrorTheme() {
      return this.T.getCodeMirrorThemeName();
    },
    scriptId() {
      return this.$route.params.id;
    },
    scriptSetId() {
      return this.scriptId.split('__')[0];
    },
    conflictInfo() {
      return this.$store.getters.getConflictInfo(this.$route);
    },
    conflictUser() {
      if (!this.conflictInfo) return null;
      return this.conflictInfo.user.name || this.conflictInfo.user.username || 'Unknown';
    },

    lockedByUserId() {
      return this.data.sset_lockedByUserId || this.data.lockedByUserId;
    },
    lockedByUser() {
      if (this.data.sset_lockedByUserId) {
        return `${this.data.sset_lockedByUserName || this.data.sset_lockedByUsername}`;
      } else if (this.data.lockedByUserId) {
        return `${this.data.lockedByUserName || this.data.lockedByUsername}`;
      }
    },
    isLockedByMe() {
      return this.lockedByUserId === this.$store.getters.userId
    },
    isLockedByOther() {
      return this.lockedByUserId && !this.isLockedByMe;
    },

    canReadCode() {
      return this.common.lockConfigCan( this.data.lockedByUserId, this.data.lockConfigMemberAllowMap, [
          'scriptSet_readScriptCode',
          'scriptSet_editScriptCode',
          'script_readCode',
          'script_editCode']);
    },
    canEditCode() {
      return this.common.lockConfigCan(this.data.lockedByUserId, this.data.lockConfigMemberAllowMap, [
          'scriptSet_editScriptCode',
          'script_editCode' ]);
    },

    userOperation() {
      return this.canEditCode ? 'edit' : 'debug';
    },
    codeLines() {
      return (this.data.code || '').split('\n').length;
    },
    codeDraftLines() {
      return (this.data.codeDraft || '').split('\n').length;
    },

    selectedItem() {
      if (!this.selectedItemId) return null;

      for (let i = 0; i < this.selectableItems.length; i++) {
        let _item = this.selectableItems[i];
        if (_item.id === this.selectedItemId) {
          return _item;
        }
      }
    },
  },
  props: {
  },
  data() {
    return {
      isReady: false,
      codeMirror: null,

      highlightedLineInfoMap: {},

      data: {},

      selectableItems: [],
      selectedItemId : '',

      showMode: 'draft', // 'draft|published|diff'
    }
  },
  mounted() {
    setImmediate(() => {
      // Init editor
      this.codeMirror = this.T.initCodeMirror('editor_CodeViewer');
      this.codeMirror.setOption('theme', this.codeMirrorTheme);
      this.codeMirror.on('cursorActivity', () => {
        if (!this.isReady) return;

        let cursorInfo = {
          scriptId: this.scriptId,
          cursor  : this.codeMirror.getCursor(),
        };
        this.$store.commit('updateEditor_scriptCursorMap', cursorInfo);
      });

      this.T.setCodeMirrorReadOnly(this.codeMirror, true);
    });
  },
  beforeDestroy() {
    this.T.destoryCodeMirror(this.codeMirror);
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.select-todo-tag {
  width: 62px;
  text-align: left;
}
.select-item-tag {
  width: 42px;
  text-align: center;
}
#editor_CodeViewer {
  display: none;
}
.conflict-info {
  color: var(--danger);
  font-size: 12px;
}
.el-header {
  box-shadow: var(--code-editor-shadow);
  z-index: 5;
}
.code-viewer {
  padding-right: 5px;
}
.code-viewer-action-title {
  font-size: 22px;
}
.code-viewer-action-title i.fa {
  font-size: 18px;
}
.code-viewer-action-left {
  padding: 10px 25px 10px 0;
  position: absolute;
  background-image: linear-gradient(to left, var(--base-transparent) 0%, var(--base) 20px);
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.code-viewer-action-left:hover {
  z-index: 1;
}
.code-viewer-action-breaker {
  height: 50px;
}
.code-viewer-action-right {
  float: right;
  padding: 10px 0 10px 25px;
  background-image: linear-gradient(to right, var(--base-transparent) 0%, var(--base) 20px);
  position: relative;
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.code-viewer-action-right > div {
  margin-right: 10px;
}
</style>
<style>
#editorContainer_CodeViewer::after {
  content: attr(data-view-mode-text);
  position: absolute;
  top: 45%;
  left: 45%;
  font-size: 100px;
  font-weight: bold;
  opacity: .05;
  transform: translate(-50%, -50%) rotate(-20deg);
  user-select: none;
  pointer-events: none;
}
#viewModeHint span {
  padding: 30px;
}
#editorContainer_CodeViewer {
  padding: 1px 0 0 5px;
  position: relative;
}
#editorContainer_CodeViewer .CodeMirror {
  height: 100% !important;
  position: absolute !important;
  top: 0;
  left: 5px;
  right: 0;
}
#editorContainer_CodeViewer .CodeMirror-wrap {
  border: none !important;
}
.CodeMirror .highlight-text {
  text-shadow: var(--text-shadow);
}

.CodeMirror .current-func-background {
  border: 2px solid;
  border-image: linear-gradient(to right, var(--primary) 30%, var(--primary-transparent) 100%) 1 1;
  border-right: none;
}
</style>
