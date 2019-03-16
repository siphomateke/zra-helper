<template>
  <div class="client-action-output">
    <div class="field">
      <template v-if="!loading">
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
        <div
          v-else
          class="bordered-section"
        >
          <EmptyMessage message="Nothing has been outputted yet"/>
        </div>
      </template>
      <div
        v-else
        class="bordered-section"
      >
        <LoadingMessage message="Getting outputs"/>
      </div>
    </div>
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import EmptyMessage from '@/components/EmptyMessage.vue';
import LoadingMessage from '@/components/LoadingMessage.vue';
import { mapState } from 'vuex';

export default {
  name: 'ClientActionOutput',
  components: {
    ExportButtons,
    EmptyMessage,
    LoadingMessage,
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
    loading: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      defaultOutput: null,
      clientOutputs: null,
    };
  },
  computed: {
    ...mapState('clientActions', {
      allActions: 'actions',
    }),
    action() {
      return this.allActions[this.actionId];
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
    loading(loading) {
      if (!loading) {
        this.updateOutput();
      }
    },
  },
  created() {
    this.getDefaultOutput();
  },
  methods: {
    /**
     * Gets the outputs of all this action's clients.
     * @returns {import('@/store/modules/client_actions').ClientActionOutputs}
     */
    getClientOutputs() {
      this.clientOutputs = this.$store.getters['clientActions/getOutputsOfAction'](this.actionId);
    },
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
      const clients = Object.keys(this.clients).map(id => this.clientFromId(id));
      return this.action.outputFormatter(clients, this.clientOutputs, format);
    },
    async getDefaultOutput() {
      this.defaultOutput = await this.formatOutput(this.defaultFormat);
    },
    updateOutput() {
      this.getClientOutputs();
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
