<template>
  <div class="card">
    <div
      class="card-header"
      @click="clickCardHeader"
    >
      <a class="card-header-icon">
        <b-icon
          :icon="collapseIsOpen ? 'caret-down' : 'caret-right'"
          size="is-small"
        />
      </a>
      <span class="card-header-title">{{ outputFile.label }}</span>
      <div
        ref="cardHeaderButtons"
        class="card-header-buttons"
      >
        <button
          v-if="outputFile.children.length > 0"
          class="button"
          title="Download all descendent outputs"
          @click="downloadAll"
        >
          <b-icon
            icon="download"
            size="is-small"
          />
        </button>
      </div>
    </div>
    <b-collapse
      :open.sync="collapseIsOpen"
      :animation="null"
    >
      <div class="card-content">
        <ClientActionOutputFile
          v-if="!outputFile.wrapper"
          :clients="clients"
          :action-id="actionId"
          :output-file="outputFile"
        />

        <template v-else-if="outputFile.children.length > 0">
          <ClientActionOutputFileWrapper
            v-for="(childOutputFile, idx) in outputFile.children"
            :key="idx"
            :clients="clients"
            :action-id="actionId"
            :output-file="childOutputFile"
          />
        </template>
      </div>
    </b-collapse>
  </div>
</template>

<script>
import ClientActionOutputFile from './ClientActionOutputFile.vue';
import { validateActionOutputFile } from '../../backend/client_actions/base';

export default {
  name: 'ClientActionOutputFileWrapper',
  components: {
    ClientActionOutputFile,
  },
  props: {
    clients: {
      type: Array,
      required: true,
    },
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
    isOnlyOutput: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      collapseIsOpen: true,
    };
  },
  methods: {
    clickCardHeader({ target }) {
      // Don't do anything if this was triggered by clicking a button within the card header
      if (this.$refs.cardHeaderButtons.contains(target)) return;

      this.collapseIsOpen = !this.collapseIsOpen;
    },
    /**
     * @param {import('@/backend/client_actions/base').ClientActionOutputFile[]} outputFiles
     * @param {Object} options
     * @param {boolean} options.anonymizeClients
     */
    downloadOutputFiles(outputFiles, options) {
      for (const outputFile of outputFiles) {
        if (!outputFile.wrapper && outputFile.formatter) {
          const format = outputFile.defaultFormat;
          const data = outputFile.formatter({
            output: outputFile.value,
            format,
            anonymizeClients: options.anonymizeClients,
          });
          this.$store.dispatch('exports/download', {
            data,
            format,
            filename: outputFile.filename,
            // Don't spam the user with 'save as' dialogs
            showSaveAsDialog: false,
          });
        }

        this.downloadOutputFiles(outputFile.children, options);
      }
    },
    downloadAll() {
      this.downloadOutputFiles(this.outputFile.children, {
        anonymizeClients: this.$store.state.config.debug.anonymizeClientsInExports,
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.card-header {
  cursor: pointer;
}
</style>
