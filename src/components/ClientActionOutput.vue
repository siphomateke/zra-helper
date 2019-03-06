<template>
  <div class="client-action-output">
    <div class="field">
      <div v-if="defaultOutput">
        <label class="label">{{ action.name }} output</label>
        <div class="control client-action-output-control">
          <textarea
            :value="defaultOutput"
            class="textarea"
            readonly
            rows="7"
          />
        </div>
        <ExportButtons
          :generators="generators"
          :default-format="defaultFormat"
          :filename="`${action.id}Output`"
        />
      </div>
      <EmptySection
        v-else
        message="Nothing has been outputted yet"
      />
    </div>
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import EmptySection from '@/components/EmptySection.vue';
import { mapState } from 'vuex';

export default {
  name: 'ClientActionOutput',
  components: {
    ExportButtons,
    EmptySection,
  },
  props: {
    actionId: {
      type: String,
      default: '',
    },
    clients: {
      type: Object,
      default: () => {},
    },
  },
  data() {
    return {
      defaultOutput: null,
    };
  },
  computed: {
    ...mapState('clientActions', {
      allActions: 'all',
      outputs: 'outputs',
    }),
    action() {
      return this.allActions[this.actionId];
    },
    /**
     * Gets the outputs of all this action's clients.
     * @returns {import('@/backend/constants').ClientActionOutputFormatterDataItem}
     */
    clientOutputs() {
      const results = [];
      for (const outputId of this.action.outputs) {
        const output = this.outputs[outputId];
        results.push(output);
      }
      return results;
    },
    defaultFormat() {
      return this.action.defaultOutputFormat;
    },
    generators() {
      const generators = {};
      for (const format of this.action.outputFormats) {
        generators[format] = () => this.formatOutput(format);
      }
      return generators;
    },
  },
  watch: {
    defaultOutputFormat() {
      this.getDefaultOutput();
    },
    clientOutputs() {
      this.getDefaultOutput();
    },
  },
  created() {
    this.getDefaultOutput();
  },
  methods: {
    /**
     * Gets a client that has a certain ID.
     * @param {string} id The ID of the client we wish to retreive.
     * @returns {import('@/backend/constants').Client}
     */
    clientFromId(id) {
      return this.clients[id];
    },
    /**
     * @param {import('@/backend/constants').ExportFormatCode} format
     */
    async formatOutput(format) {
      return this.action.outputFormatter(this.clientOutputs, format);
    },
    async getDefaultOutput() {
      this.defaultOutput = await this.formatOutput(this.defaultFormat);
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';

.client-action-output {
  width: 100%;
  margin-bottom: 0.5em;

  .client-action-output-control {
    margin-bottom: $export-buttons-margin;
  }
}
</style>
