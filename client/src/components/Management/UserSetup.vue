<i18n locale="zh-CN" lang="yaml">
Add User  : 添加用户
Setup User: 配置用户

Username: 登录账号
Password: 密码

Leave blank when not changing: 不修改时请留空

User created: 用户已创建
User saved  : 用户已保存

Please input username: 请输入登录账号
Only alphabets, numbers and underscore are allowed: 只能包含大小写英文、数字及下划线
Please input name: 请输入名称
Please input password: 请输入密码
</i18n>

<!-- Generated by OpenCC START -->
<i18n locale="zh-HK" lang="yaml">
Add User: 添加用户
Leave blank when not changing: 不修改時請留空
Only alphabets, numbers and underscore are allowed: 只能包含大小寫英文、數字及下劃線
Password: 密碼
Please input name: 請輸入名稱
Please input password: 請輸入密碼
Please input username: 請輸入登錄賬號
Setup User: 配置用户
User created: 用户已創建
User saved: 用户已保存
Username: 登錄賬號
</i18n>
<i18n locale="zh-TW" lang="yaml">
Add User: 新增使用者
Leave blank when not changing: 不修改時請留空
Only alphabets, numbers and underscore are allowed: 只能包含大小寫英文、數字及下劃線
Password: 密碼
Please input name: 請輸入名稱
Please input password: 請輸入密碼
Please input username: 請輸入登入賬號
Setup User: 配置使用者
User created: 使用者已建立
User saved: 使用者已儲存
Username: 登入賬號
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
      {{ pageTitle }} <code class="text-main">{{ data.name || data.username }}</code>
    </template>

    <el-container direction="vertical">
      <el-main>
        <div class="setup-form">
          <el-form ref="form" label-width="135px" :model="form" :rules="formRules">
            <!-- Fake user/password -->
            <el-form-item style="height: 0; overflow: hidden">
              <input tabindex="-1" type="text" name="username" />
              <input tabindex="-1" type="password" name="password" />
            </el-form-item>

            <el-form-item :label="$t('Username')" prop="username">
              <el-input :disabled="pageMode === 'setup'"
                maxlength="60"
                v-model="form.username"></el-input>
            </el-form-item>

            <el-form-item :label="$t('Name')" prop="name">
              <el-input
                maxlength="200"
                v-model="form.name"></el-input>
            </el-form-item>

            <el-form-item :label="$t('Email')" prop="email">
              <el-input
                v-model="form.email"></el-input>
            </el-form-item>

            <el-form-item :label="$t('Password')" prop="password">
              <el-input :placeholder="passwordPlaceholder"
                maxlength="100"
                show-password
                v-model="form.password"></el-input>
            </el-form-item>

           <el-form-item class="setup-footer">
              <el-button type="primary" v-prevent-re-click @click="submitData">{{ $t('Save') }}</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-main>
    </el-container>
  </el-dialog>
</template>

<script>
export default {
  name: 'UserSetup',
  components: {
  },
  watch: {
    show(val) {
      if (val && this.$refs.form) {
        this.$refs.form.clearValidate();
      }

      if (!val) {
        this.$root.$emit('reload.userList');
      }
    },
  },
  methods: {
    async loadData(id) {
      if (!id) {
        this.pageMode = 'add';
        this.T.jsonClear(this.form);
        this.data = {};

      } else {
        this.pageMode = 'setup';
        this.data.id = id;

        let apiRes = await this.T.callAPI_getOne('/api/v1/users/do/list', this.data.id);
        if (!apiRes || !apiRes.ok) return;

        this.data = apiRes.data;

        let nextForm = {};
        Object.keys(this.form).forEach(f => nextForm[f] = this.data[f]);
        this.form = nextForm;
      }

      // Password is required for adding user
      this.formRules['password'][0].required = !!!id;

      this.show = true;
    },
    async submitData() {
      try {
        await this.$refs.form.validate();
      } catch(err) {
        return console.error(err);
      }

      switch(this.pageMode) {
        case 'add':
          return await this.addData();
        case 'setup':
          return await this.modifyData();
      }
    },
    async addData() {
      let _formData = this.T.jsonCopy(this.form);
      _formData.roles = ['user'];

      let apiRes = await this.T.callAPI('post', '/api/v1/users/do/add', {
        body    : { data: _formData },
        feedback: { okMessage: this.$t('User created') },
      });
      if (!apiRes || !apiRes.ok) return;

      this.$store.commit('updateHighlightedTableDataId', apiRes.data.id);
      this.show = false;
    },
    async modifyData() {
      let _formData = this.T.jsonCopy(this.form);
      if (this.T.isNothing(_formData.password)) {
        delete _formData.password;
      }

      let apiRes = await this.T.callAPI('post', '/api/v1/users/:id/do/modify', {
        params  : { id: this.data.id },
        body    : { data: _formData },
        feedback: { okMessage: this.$t('User saved') },
      });
      if (!apiRes || !apiRes.ok) return;

      this.$store.commit('updateHighlightedTableDataId', apiRes.data.id);
      this.show = false;
    },
  },
  computed: {
    pageTitle() {
      const _map = {
        setup: this.$t('Setup User'),
        add  : this.$t('Add User'),
      };
      return _map[this.pageMode];
    },
    passwordPlaceholder() {
      if (this.pageMode === 'add') {
        return '';
      } else {
        return this.$t('Leave blank when not changing');
      }
    },
  },
  props: {
  },
  data() {
    return {
      show    : false,
      pageMode: null,

      data: {},
      form: {
        username: null,
        name    : null,
        email   : null,
        password: null,
      },
      formRules: {
        username: [
          {
            trigger : 'blur',
            message : this.$t('Please input username'),
            required: true,
          },
          {
            trigger : 'change',
            message: this.$t('Only alphabets, numbers and underscore are allowed'),
            pattern: /^[a-zA-Z0-9_]*$/g,
          }
        ],
        name: [
          {
            trigger : 'blur',
            message : this.$t('Please input name'),
            required: true,
          }
        ],
        password: [
          {
            trigger : 'blur',
            message : this.$t('Please input password'),
            required: false,
          }
        ],
      },
    }
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
