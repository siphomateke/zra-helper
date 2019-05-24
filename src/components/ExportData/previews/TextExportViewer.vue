<template>
  <pre class="scrollable-section">{{ output }}</pre>
</template>

<script>
import BaseExportViewer from './BaseExportViewer.vue';

export default {
  name: 'TextExportViewer',
  extends: BaseExportViewer,
};
</script>

<style lang="scss" scoped>
pre {
  border: 1px solid rgb(197, 197, 197);
  border-radius: 5px;
}
</style>
