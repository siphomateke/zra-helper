<template>
  <div>
    <textarea
      :value="output"
      class="client-action-output"
      readonly
      rows="7"/>
    <ExportButtons
      :raw="() => output"
      :csv="() => output"
      :disabled="output.length === 0"
      filename="output"/>
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { mapGetters } from 'vuex';

export default {
  name: 'TheClientActionOutput',
  components: {
    ExportButtons,
  },
  computed: {
    ...mapGetters('output', { output: 'content' }),
  },
};
</script>

<style lang="scss">
.client-action-output {
  width: 100%;
}
</style>
