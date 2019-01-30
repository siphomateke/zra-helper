<template>
  <div class="client-action-output">
    <div class="field">
      <div v-if="output">
        <div class="control client-action-output-control">
          <textarea
            :value="output"
            class="textarea"
            readonly
            rows="7"/>
        </div>
        <ExportButtons
          :raw="() => output"
          :csv="() => output"
          :disabled="output.length === 0"
          filename="output"/>
      </div>
      <EmptySection
        v-else
        message="Nothing has been outputted yet"/>
    </div>
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import EmptySection from '@/components/EmptySection.vue';
import { mapGetters } from 'vuex';

export default {
  name: 'TheClientActionOutput',
  components: {
    ExportButtons,
    EmptySection,
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
