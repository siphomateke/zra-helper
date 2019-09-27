<template>
  <div
    id="app"
    class="page-content"
  >
    <Settings @cancel="cancel" />
  </div>
</template>

<script>
import Settings from '@/views/Settings.vue';

export default {
  components: {
    Settings,
  },
  methods: {
    cancel() {
      window.close();
    },
  },
};
</script>


<style lang="scss">
@import "@/assets/scss/app.scss";
</style>
