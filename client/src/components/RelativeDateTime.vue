<template>
  <el-tooltip effect="dark" placement="right">
    <div slot="content">
      <span class="datetime-tip">{{ datetime | datetime }}</span>
    </div>
    <span>
      <span v-if="fromNowLimit === 'before'">{{ datetime | toNow }}</span>
      <span v-else-if="fromNowLimit === 'after'">{{ datetime | toFuture }}</span>
      <span v-else>{{ datetime | fromNow }}</span>
    </span>
  </el-tooltip>

</template>

<script>
export default {
  name: 'RelativeDateTime',
  components: {
  },
  watch: {
  },
  methods: {
  },
  computed: {
  },
  props: {
    datetime    : String,
    fromNowLimit: String
  },
  computed: {
  },
  data() {
    return {}
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.datetime-tip {
  font-size: 16px;
}
</style>
