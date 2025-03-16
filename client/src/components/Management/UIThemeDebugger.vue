<template>
  <transition name="fade">
    <el-container direction="vertical" v-show="$store.state.isLoaded">
      <el-main class="debugger">
        <el-divider>el-card</el-divider>

        <el-row>
          <el-card shadow="always">Always show shadow</el-card>
          <el-card shadow="hover">Show shadow when mouse hover</el-card>
          <el-card shadow="never">Never show shadow</el-card>
        </el-row>

        <el-divider>el-button</el-divider>

        <p>
          <el-button>Default Button</el-button>
          <el-button type="primary">Primary Button</el-button>
          <el-button type="success">Success Button</el-button>
          <el-button type="info">Info Button</el-button>
          <el-button type="warning">Warning Button</el-button>
          <el-button type="danger">Danger Button</el-button>
        </p>

        <p>
          <el-button plain>Plain Button</el-button>
          <el-button plain type="primary">Primary Button</el-button>
          <el-button plain type="success">Success Button</el-button>
          <el-button plain type="info">Info Button</el-button>
          <el-button plain type="warning">Warning Button</el-button>
          <el-button plain type="danger">Danger Button</el-button>
        </p>

        <p>
          <el-button disabled>Default Button</el-button>
          <el-button disabled type="primary">Primary Button</el-button>
          <el-button disabled type="success">Success Button</el-button>
          <el-button disabled type="info">Info Button</el-button>
          <el-button disabled type="warning">Warning Button</el-button>
          <el-button disabled type="danger">Danger Button</el-button>
        </p>

        <p>
          <el-button plain disabled>Plain Button</el-button>
          <el-button plain disabled type="primary">Primary Button</el-button>
          <el-button plain disabled type="success">Success Button</el-button>
          <el-button plain disabled type="info">Info Button</el-button>
          <el-button plain disabled type="warning">Warning Button</el-button>
          <el-button plain disabled type="danger">Danger Button</el-button>
        </p>

        <p>
          <el-button type="text">Text Button</el-button>
          <el-button type="text" disabled>Text Button</el-button>
        </p>

        <el-divider>el-link</el-divider>

        <p>
          <el-link>Default Link</el-link>
          <el-link type="primary">Primary Link</el-link>
          <el-link type="success">Success Link</el-link>
          <el-link type="warning">Warning Link</el-link>
          <el-link type="danger">Danger Link</el-link>
          <el-link type="info">Info Link</el-link>
        </p>

        <p>
          <el-link disabled>Default Link</el-link>
          <el-link disabled type="primary">Primary Link</el-link>
          <el-link disabled type="success">Success Link</el-link>
          <el-link disabled type="warning">Warning Link</el-link>
          <el-link disabled type="danger">Danger Link</el-link>
          <el-link disabled type="info">Info Link</el-link>
        </p>

        <el-divider>el-radio</el-divider>

        <p>
          <el-radio v-model="radio1" label="1">Option 1</el-radio>
          <el-radio v-model="radio1" label="2">Option 2</el-radio>
        </p>

        <p>
          <el-radio disabled v-model="radio2" label="Disabled">Option 1</el-radio>
          <el-radio disabled v-model="radio2" label="Selected and Disabled">Option 2</el-radio>
        </p>

        <p>
          <el-radio-group v-model="radio3">
            <el-radio-button label="Shanghai"></el-radio-button>
            <el-radio-button label="New York"></el-radio-button>
            <el-radio-button label="Tokyo"></el-radio-button>
            <el-radio-button label="Singapore"></el-radio-button>
          </el-radio-group>
        </p>

        <p>
          <el-radio v-model="radio4" label="1" border>Option 1</el-radio>
          <el-radio v-model="radio4" label="2" border>Option 2</el-radio>
        </p>

        <el-divider>el-checkbox</el-divider>

        <p>
          <el-checkbox v-model="check1">Option</el-checkbox>
        </p>

        <p>
          <el-checkbox v-model="check2" disabled>Option 1</el-checkbox>
          <el-checkbox v-model="check3" disabled>Option 2</el-checkbox>
        </p>

        <p>
          <el-checkbox-group v-model="check4">
            <el-checkbox label="Checkbox 1"></el-checkbox>
            <el-checkbox label="Checkbox 2"></el-checkbox>
            <el-checkbox label="Checkbox 3"></el-checkbox>
            <el-checkbox label="Disabled" disabled></el-checkbox>
            <el-checkbox label="Selected and Disabled" disabled></el-checkbox>
          </el-checkbox-group>
        </p>

        <p>
          <el-checkbox-group v-model="check5">
            <el-checkbox-button label="Shanghai">Shanghai</el-checkbox-button>
            <el-checkbox-button label="New York">New York</el-checkbox-button>
            <el-checkbox-button label="Tokyo">Tokyo</el-checkbox-button>
            <el-checkbox-button label="Singapore">Singapore</el-checkbox-button>
          </el-checkbox-group>
        </p>

        <p>
          <el-checkbox v-model="check6" label="Option 1" border></el-checkbox>
          <el-checkbox v-model="check7" label="Option 2" border></el-checkbox>
        </p>

        <el-divider>Mixed Form</el-divider>

        <div class="controls-bar">
          <el-button>Button</el-button>

          <el-button-group>
            <el-button type="warning" plain>Button 1</el-button>
            <el-button type="success" plain>Button 2</el-button>
            <el-button type="danger" plain>Button 3</el-button>
          </el-button-group>

          <el-button-group>
            <el-button type="danger" plain>Single Button</el-button>
          </el-button-group>

          <el-input placeholder="Input Box" style="width: 100px"></el-input>

          <el-select placeholder="Selector" style="width: 100px">
            <el-option label="Option 1" value="1"></el-option>
            <el-option label="Option 2" value="2"></el-option>
            <el-option label="Option 3" value="3"></el-option>
          </el-select>

          <el-radio-group v-model="radio3">
            <el-radio-button label="Shanghai"></el-radio-button>
            <el-radio-button label="New York"></el-radio-button>
          </el-radio-group>
          <el-radio v-model="radio4" label="1" border>Option 1</el-radio>

          <el-checkbox-group v-model="check5">
            <el-checkbox-button label="Shanghai">Shanghai</el-checkbox-button>
            <el-checkbox-button label="New York">New York</el-checkbox-button>
          </el-checkbox-group>
          <el-checkbox v-model="check6" label="Option 1" border></el-checkbox>
        </div>

        <el-divider>el-tag</el-divider>

        <p>
          <el-tag>Tag Default</el-tag>
          <el-tag type="success">Tag Success</el-tag>
          <el-tag type="info">Tag Info</el-tag>
          <el-tag type="warning">Tag Warning</el-tag>
          <el-tag type="danger">Tag Danger</el-tag>
        </p>

        <p>
          <el-tag>Tag Default</el-tag>
          <el-tag type="success closable">Tag Success</el-tag>
          <el-tag type="info closable">Tag Info</el-tag>
          <el-tag type="warning closable">Tag Warning</el-tag>
          <el-tag type="danger closable">Tag Danger</el-tag>
        </p>

        <p>
          <el-tag type="success" effect="dark">Tag Success</el-tag>
          <el-tag type="info" effect="dark">Tag Info</el-tag>
          <el-tag type="warning" effect="dark">Tag Warning</el-tag>
          <el-tag type="danger" effect="dark">Tag Danger</el-tag>
        </p>

        <p>
          <el-tag type="success" effect="plain">Tag Success</el-tag>
          <el-tag type="info" effect="plain">Tag Info</el-tag>
          <el-tag type="warning" effect="plain">Tag Warning</el-tag>
          <el-tag type="danger" effect="plain">Tag Danger</el-tag>
        </p>

        <el-divider>el-alert</el-divider>

        <p style="width: 800px">
          <el-alert title="Success Alert. Balabala Balabala" type="success"></el-alert>
          <el-alert title="Info Alert. Balabala Balabala" type="info"></el-alert>
          <el-alert title="Warning Alert. Balabala Balabala" type="warning"></el-alert>
          <el-alert title="Error Alert. Balabala Balabala" type="error"></el-alert>
        </p>

        <p style="width: 800px">
          <el-alert title="Success Alert. Balabala Balabala" type="success" effect="dark"></el-alert>
          <el-alert title="Info Alert. Balabala Balabala" type="info" effect="dark"></el-alert>
          <el-alert title="Warning Alert. Balabala Balabala" type="warning" effect="dark"></el-alert>
          <el-alert title="Error Alert. Balabala Balabala" type="error" effect="dark"></el-alert>
        </p>

        <p style="width: 800px">
          <el-alert title="Alert not closable" type="success" :closable="false"></el-alert>
          <el-alert title="Custom close-text" type="info" close-text="OK, thank you"></el-alert>
        </p>

        <p style="width: 800px">
          <el-alert title="Success Alert. Balabala Balabala" type="success" show-icon></el-alert>
          <el-alert title="Info Alert. Balabala Balabala" type="info" show-icon></el-alert>
          <el-alert title="Warning Alert. Balabala Balabala" type="warning" show-icon></el-alert>
          <el-alert title="Error Alert. Balabala Balabala" type="error" show-icon></el-alert>
        </p>

        <el-divider>el-message</el-divider>

        <p>
          <el-button :plain="true" @click="$message({ message: 'Success', type: 'success' })">Success</el-button>
          <el-button :plain="true" @click="$message({ message: 'Warning', type: 'warning' })">Warning</el-button>
          <el-button :plain="true" @click="$message({ message: 'Info', type: 'info' })">Info</el-button>
          <el-button :plain="true" @click="$message({ message: 'Error', type: 'error' })">Error</el-button>
        </p>
      </el-main>
    </el-container>
  </transition>
</template>

<script>
export default {
  name: 'UIThemeDebugger',
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
      this.$store.commit('updateLoadStatus', true);
    }
  },
  data() {
    return {
      radio1: '1',
      radio2: 'Selected and Disabled',
      radio3: 'Shanghai',
      radio4: '1',

      check1: true,
      check2: false,
      check3: true,
      check4: ['Selected and Disabled', 'Checkbox 3'],
      check5: ['Shanghai'],
      check6: true,
      check7: false,
    }
  },
  created() {
  },
  mounted() {
  },
}
</script>

<style scoped>
.debugger .el-card {
  width: 165px;
  height: 100px;
  display: inline-block;
  margin: 10px 10px;
  position: relative;
}
.debugger .el-alert {
  margin-top: 5px;
}
</style>
<style>
</style>
