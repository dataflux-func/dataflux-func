<i18n locale="zh-CN" lang="yaml">
Type     : 类型
Expires  : 有效期
Never    : 永不过期
Data Size: 数据大小

Func Store data deleted: 函数缓存数据已删除

No Func Store data has ever been added: 从未添加过任何函数存储数据

Are you sure you want to delete the Func Store data?: 是否确认删除此函数存储数据？

Using {0} and {1} to setting and getting store data in Script: 可以使用 {0} 和 {1} 在脚本中存取数据
See {0} for more information: 查看 {0} 来获取更多信息
</i18n>

<!-- Generated by OpenCC START -->
<i18n locale="zh-HK" lang="yaml">
Are you sure you want to delete the Func Store data?: 是否確認刪除此函數存儲數據？
Data Size: 數據大小
Expires: 有效期
Func Store data deleted: 函數緩存數據已刪除
Never: 永不過期
No Func Store data has ever been added: 從未添加過任何函數存儲數據
See {0} for more information: 查看 {0} 來獲取更多信息
Type: 類型
Using {0} and {1} to setting and getting store data in Script: 可以使用 {0} 和 {1} 在腳本中存取數據
</i18n>
<i18n locale="zh-TW" lang="yaml">
Are you sure you want to delete the Func Store data?: 是否確認刪除此函式儲存資料？
Data Size: 資料大小
Expires: 有效期
Func Store data deleted: 函式快取資料已刪除
Never: 永不過期
No Func Store data has ever been added: 從未新增過任何函式儲存資料
See {0} for more information: 檢視 {0} 來獲取更多資訊
Type: 型別
Using {0} and {1} to setting and getting store data in Script: 可以使用 {0} 和 {1} 在指令碼中存取資料
</i18n>
<!-- Generated by OpenCC END -->

<template>
  <transition name="fade">
    <el-container direction="vertical" v-show="$store.state.isLoaded">
      <!-- Header area -->
      <el-header height="60px">
        <div class="common-page-header">
          <h1>{{ $t('Func Store Manager') }}</h1>
          <div class="header-control">
            <FuzzySearchInput :dataFilter="dataFilter"></FuzzySearchInput>
          </div>
        </div>
      </el-header>

      <!-- List area -->
      <el-main class="common-table-container">
        <div class="no-data-area" v-if="T.isNothing(data)">
          <h1 class="no-data-title" v-if="T.isPageFiltered()"><i class="fa fa-fw fa-search"></i>{{ $t('No matched data found') }}</h1>
          <h1 class="no-data-title" v-else><i class="fa fa-fw fa-info-circle"></i>{{ $t('No Func Store data has ever been added') }}</h1>

          <p class="no-data-tip">
            <i18n path="Using {0} and {1} to setting and getting store data in Script">
              <code class="code-font">DFF.STORE.set('key', 'value')</code>
              <code class="code-font">DFF.STORE('key')</code>
            </i18n>
            <br>
            <i18n path="See {0} for more information">
              <el-link href="https://func.guance.com/doc/development-guide-builtin-features-dff-store/" target="_blank">
                <i class="fa fa-fw fa-book"></i>
                {{ $t('Document') }}
              </el-link>
            </i18n>
          </p>
        </div>
        <el-table v-else
          class="common-table" height="100%"
          :data="data">

          <el-table-column :label="$t('Type')" width="120">
            <template slot-scope="scope">
              <code>{{ scope.row.type.toLowerCase() }}</code>
            </template>
          </el-table-column>

          <el-table-column label="Key">
            <template slot-scope="scope">
              <code class="text-main">{{ scope.row.key }}</code>
              <CopyButton :content="scope.row.key" />
            </template>
          </el-table-column>

          <el-table-column label="Scope">
            <template slot-scope="scope">
              <code class="text-main">{{ scope.row.scope }}</code>
              <CopyButton :content="scope.row.scope" />
            </template>
          </el-table-column>

          <el-table-column :label="$t('Expires')" width="180">
            <template slot-scope="scope">
              <span v-if="!scope.row.expireAt" class="text-bad">{{ $t('Never') }}</span>
              <template v-else>
                <code :class="T.isExpired(scope.row.expireAt * 1000) ? 'text-bad' : 'text-good'">{{ scope.row.expireAt - parseInt(Date.now() / 1000) }}</code>
                <small class="text-info">{{ $t('(') }}{{ scope.row.expireAt * 1000 | toFuture }}{{ $t(')') }}</small>
              </template>
            </template>
          </el-table-column>

          <el-table-column :label="$t('Data Size')" sortable sort-by="dataSize" align="right" width="150">
            <template slot-scope="scope">
              <code :class="{ 'text-bad': scope.row.isOverSized }">{{ scope.row.dataSizeHuman }}</code>
            </template>
          </el-table-column>

          <el-table-column align="right" width="320">
            <template slot-scope="scope">
              <el-link v-if="!scope.row.isOverSized" @click="preview(scope.row)">{{ $t('Preview') }}</el-link>
              <el-link @click="download(scope.row)">{{ $t('Download') }}</el-link>
              <el-link type="danger" @click="quickSubmitData(scope.row, 'delete')">{{ $t('Delete') }}</el-link>
            </template>
          </el-table-column>
        </el-table>
      </el-main>

      <!-- Paging area -->
      <Pager :pageInfo="pageInfo" />

      <LongTextDialog :showDownload="true" ref="longTextDialog" />
    </el-container>
  </transition>
</template>

<script>
import LongTextDialog from '@/components/LongTextDialog'
import FileSaver from 'file-saver';

export default {
  name: 'FuncStoreManager',
  components: {
    LongTextDialog,
  },
  watch: {
    $route: {
      immediate: true,
      async handler(to, from) {
        await this.loadData();
      }
    },
  },
  methods: {
    async loadData() {
      let _listQuery = this.dataFilter = this.T.createListQuery();

      let apiRes = await this.T.callAPI_get('/api/v1/func-stores/do/list', {
        query: _listQuery,
      });
      if (!apiRes || !apiRes.ok) return;

      this.data = apiRes.data;
      this.pageInfo = apiRes.pageInfo;

      this.data.forEach(d => {
        if (d.dataSize) {
          d.dataSizeHuman = this.T.byteSizeHuman(d.dataSize);
          d.isOverSized   = d.dataSize > (100 * 1024);
        }
      });

      this.$store.commit('updateLoadStatus', true);
    },
    async quickSubmitData(d, operation) {
      let extraInfo = `<small>
          <br>Key: <code class="text-main">${d.key}</code>
          <br>Scope: <code class="text-main">${d.scope}</code>
        <small>`;

      switch(operation) {
        case 'delete':
          if (!await this.T.confirm(this.$t('Are you sure you want to delete the Func Store data?') + extraInfo)) return;
          break;
      }

      let apiRes = null;
      switch(operation) {
        case 'delete':
          apiRes = await this.T.callAPI('/api/v1/func-stores/:id/do/delete', {
            params  : { id: d.id },
            feedback: { okMessage: this.$t('Func Store data deleted') },
          });
          break;
      }
      if (!apiRes || !apiRes.ok) return;

      await this.loadData();
    },
    async preview(d) {
      let apiRes = await this.T.callAPI_get('/api/v1/func-stores/:id/do/get', {
        params: { id: d.id }
      });
      if (!apiRes.ok) return

      let content = apiRes.data.valueJSON;
      content = JSON.stringify(content, null, 2);

      let createTimeStr = this.M(d.createTime).format('YYYYMMDD_HHmmss');
      let fileName = `DFF.STORE.${d.scope}.${d.key}.${createTimeStr}.json`;
      this.$refs.longTextDialog.update(content, fileName);
    },
    async download(d) {
      let apiRes = await this.T.callAPI_get('/api/v1/func-stores/:id/do/get', {
        params: { id: d.id }
      });
      if (!apiRes.ok) return

      let content = apiRes.data.valueJSON;
      content = JSON.stringify(content, null, 2);

      let blob = new Blob([content], {type: 'text/plain'});
      let createTimeStr = this.M(d.createTime).format('YYYYMMDD_HHmmss');
      let fileName = `DFF.STORE.${d.scope}.${d.key}.${createTimeStr}.json`;
      FileSaver.saveAs(blob, fileName);

      return fileName;
    },
  },
  computed: {
  },
  props: {
  },
  data() {
    let _pageInfo   = this.T.createPageInfo();
    let _dataFilter = this.T.createListQuery();

    return {
      data    : [],
      pageInfo: _pageInfo,

      dataFilter: {
        _fuzzySearch: _dataFilter._fuzzySearch,
      },
    }
  },
}
</script>

<style scoped>
</style>

<style>
</style>
