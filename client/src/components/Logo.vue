<template>
  <div class="logo-container" v-show="$store.state.isSystemInfoLoaded">
    <img v-if="$store.getters.SYSTEM_SETTINGS('CUSTOM_LOGO_ENABLED') && $store.getters.SYSTEM_SETTINGS('CUSTOM_LOGO_IMAGE_SRC')"
      class="custom-logo-img"
      :style="customLogoStyle"
      :src="$store.getters.SYSTEM_SETTINGS('CUSTOM_LOGO_IMAGE_SRC')" />
    <div v-else class="logo-img" :class="logoClass" :style="logoStyle">
      <svg xmlns="http://www.w3.org/2000/svg" version="1.1">
        <text x="87%" y="48%" style="font-size: 30%; font-weight: bolder">{{ MAJOR_VERSION }}</text>
      </svg>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Logo',
  components: {
  },
  watch: {
  },
  methods: {
  },
  props: {
    width : String,
    height: String,
    type  : String,
  },
  computed: {
    MAJOR_VERSION() {
      return 6
    },

    customLogoStyle() {
      let style = {
        maxWidth : this.width  || '165px',
        maxHeight: this.height || '25px',
      }
      return style;
    },

    logoClass() {
      let theme = null;
      if (this.type === 'auto') {
        theme = this.$store.getters.uiTheme;
      } else {
        theme = this.type;
      }

      return `logo-img-${theme}`;
    },
    logoStyle() {
      let height = this.height || '30px'
      let style = {
        height  : height,
        fontSize: height,
        width   : `${(parseInt(height) * 750 / 180)}px`,
      }
      return style;
    },
  },
  data() {
    return {}
  },
  created() {
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.logo-container {
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  text-align: center;
}

.custom-logo-img {
  margin: 0 auto;
}

.logo-img {
  margin: 0 auto;
  background-size: contain;
  background-repeat: no-repeat;
  line-height: 1 !important;
}
.logo-img > svg {
  height: 100%;
  width: 100%;
}

.logo-img-light { background-image: url(../assets/img/logo-dataflux-func.png); fill: #FF6600 }
.logo-img-dark  { background-image: url(../assets/img/logo-dataflux-func-w.png); fill: white }

@media (prefers-color-scheme: light) {
  .logo-img-auto { background-image: url(../assets/img/logo-dataflux-func.png); fill: #FF6600 }
}
@media (prefers-color-scheme: dark) {
  .logo-img-auto { background-image: url(../assets/img/logo-dataflux-func-w.png); fill: white }
}
</style>
