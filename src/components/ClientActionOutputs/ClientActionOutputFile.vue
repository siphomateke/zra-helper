<template>
  <div>
    <ExportButtons
      :generators="generators"
      :default-format="defaultFormat"
      :filename="outputFile.filename"
    />
    <ClientActionOutputPreview
      v-if="outputFile.preview"
      :output-value="outputFile.value"
      :generators="generators"
      :default-format="defaultFormat"
    />
  </div>
</template>

<script>
import ClientActionOutputPreview from './ClientActionOutputPreview.vue';
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { validateActionOutputFile } from '../../backend/client_actions/base';

export default {
  name: 'ClientActionOutputFile',
  components: {
    ExportButtons,
    ClientActionOutputPreview,
  },
  props: {
    clients: {
      type: Array,
      required: true,
    },
    // FIXME: Remove this as it's no longer needed
    actionId: {
      type: String,
      required: true,
    },
    outputFile: {
      type: Object,
      required: true,
      validator(value) {
        const errors = validateActionOutputFile(value);
        return errors.length === 0;
      },
    },
  },
  computed: {
    defaultFormat() {
      return this.outputFile.defaultFormat;
    },
    anonymizeClientsInExports() {
      return this.$store.state.config.debug.anonymizeClientsInExports;
    },
    generators() {
      const generators = {};
      for (const format of this.outputFile.formats) {
        // `anonymizeClientsInExports` can't just be passed as an argument to formatOutput because
        // vue.js won't re-compute `generators` when `anonymizeClientsInExports` changes.
        if (this.anonymizeClientsInExports) {
          generators[format] = () => this.formatOutput(format, true);
        } else {
          generators[format] = () => this.formatOutput(format, false);
        }
      }
      return generators;
    },
  },
  methods: {
    /**
     * @param {import('@/backend/constants').ExportFormatCode} format
     */
    async formatOutput(format, anonymizeClients = false) {
      return this.outputFile.formatter({
        output: this.outputFile.value,
        format,
        anonymizeClients,
      });
    },
  },
};
</script>
