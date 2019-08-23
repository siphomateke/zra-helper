<template>
  <CardCollapse :title="outputFile.label">
    <button
      v-if="outputFile.children.length > 0"
      slot="header-buttons"
      class="button"
      title="Download all descendent outputs"
      @click="downloadAll"
    >
      <b-icon
        icon="download"
        size="is-small"
      />
    </button>

    <LoadingMessage
      v-if="loading"
      message="Getting output"
    />

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
  </CardCollapse>
</template>

<script lang="ts">
import CardCollapse from '@/components/CardCollapse.vue';
import ClientActionOutputFile from './ClientActionOutputFile.vue';
import LoadingMessage from '@/components/LoadingMessage.vue';
import { validateActionOutputFile } from '../../backend/client_actions/base';
import { ClientActionOutputFile } from '@/backend/client_actions/base';

export default {
  name: 'ClientActionOutputFileWrapper',
  components: {
    CardCollapse,
    ClientActionOutputFile,
    LoadingMessage,
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
    loading: {
      type: Boolean,
      default: false,
    },
  },
  methods: {
    clickCardHeader({ target }) {
      // Don't do anything if this was triggered by clicking a button within the card header
      if (this.$refs.cardHeaderButtons.contains(target)) return;

      this.collapseIsOpen = !this.collapseIsOpen;
    },
    downloadOutputFiles(
      outputFiles: ClientActionOutputFile[],
      options: { anonymizeClients: boolean }
    ) {
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
