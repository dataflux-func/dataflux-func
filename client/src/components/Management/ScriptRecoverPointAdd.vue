<i18n locale="zh-CN" lang="yaml">
Create Recover Point: 创建还原点
Script Lib Recover Points: 脚本库还原点

'Recover Point created by {userName}': '{userName} 创建的还原点'

Meaningful notes can provide a reliable reference for the future: 有意义的备注可以为将来提供可靠的参考

Please input note: 请输入备注

Script Lib Recover Point created: 脚本库还原点已创建
</i18n>

<!-- Generated by OpenCC START -->
<i18n locale="zh-HK" lang="yaml">
Create Recover Point: 創建還原點
Meaningful notes can provide a reliable reference for the future: 有意義的備註可以為將來提供可靠的參考
Please input note: 請輸入備註
Recover Point created by {userName}: '{userName} 創建的還原點'
Script Lib Recover Point created: 腳本庫還原點已創建
Script Lib Recover Points: 腳本庫還原點
</i18n>
<i18n locale="zh-TW" lang="yaml">
Create Recover Point: 建立還原點
Meaningful notes can provide a reliable reference for the future: 有意義的備註可以為將來提供可靠的參考
Please input note: 請輸入備註
Recover Point created by {userName}: '{userName} 建立的還原點'
Script Lib Recover Point created: 指令碼庫還原點已建立
Script Lib Recover Points: 指令碼庫還原點
</i18n>
<!-- Generated by OpenCC END -->

<template>
  <el-dialog
    id="ScriptSetSetup"
    :visible.sync="show"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="750px">

    <template slot="title">
      {{ $t('Create Recover Point') }}
    </template>

    <el-container direction="vertical">
      <el-main>
        <div class="setup-form">
          <el-form ref="form" label-width="135px" :model="form" :rules="formRules">
            <el-form-item :label="$t('Note')" prop="note">
              <el-input
                type="textarea"
                resize="none"
                :autosize="{minRows: 5}"
                maxlength="5000"
                v-model="form.note"></el-input>
              <InfoBlock :title="$t('Meaningful notes can provide a reliable reference for the future')" />
            </el-form-item>

            <el-form-item class="setup-footer">
              <el-button type="primary" v-prevent-re-click @click="submitData">{{ $t('Create') }}</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-main>
    </el-container>
  </el-dialog>
</template>

<script>
export default {
  name: 'ScriptRecoverPointAdd',
  components: {
  },
  watch: {
    show(val) {
      if (!val) {
        this.$root.$emit('reload.scriptRecoverPointList');
      }
    },
  },
  methods: {
    async loadData() {
      this.show = true;
    },
    async submitData() {
      try {
        await this.$refs.form.validate();
      } catch(err) {
        return console.error(err);
      }

      return await this.addData();
    },
    async addData() {
      let apiRes = await this.T.callAPI('post', '/api/v1/script-recover-points/do/add', {
        body    : { data: this.T.jsonCopy(this.form) },
        feedback: { okMessage: this.$t('Script Lib Recover Point created') },
      });
      if (!apiRes || !apiRes.ok) return;

      this.show = false;
    },
  },
  props: {
  },
  data() {
    let userName = this.$store.state.userProfile.name || this.$store.state.userProfile.username;
    let defaultNote = this.$t('Recover Point created by {userName}', { userName: userName });

    return {
      show: false,

      form: {
        note: defaultNote,
      },
      formRules: {
        note: [
          {
            trigger : 'blur',
            message : this.$t('Please input note'),
            required: true,
            min     : 1,
          }
        ]
      }
    }
  },
  created() {
    this.$store.commit('updateLoadStatus', true);
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
