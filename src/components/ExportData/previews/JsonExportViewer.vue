<template>
  <pre
    v-highlightjs="output"
    class="scrollable-section"
  ><code class="json" /></pre>
</template>


<script>
import BaseExportViewer from './BaseExportViewer.vue';

export default {
  name: 'JsonExportViewer',
  extends: BaseExportViewer,
};
</script>

<style scoped>
@import '~highlight.js/styles/default.css';
/* Remove default styling added by Bulma since highlightjs has its own styling. */
pre {
  padding: 0;
  background: none;
}
</style>
