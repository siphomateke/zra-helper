<template>
  <b-collapse
    v-if="!isOnlyOutput"
    class="card"
  >
    <div
      slot="trigger"
      slot-scope="props"
      class="card-header"
      role="button"
    >
      <span
        v-if="showLabel"
        class="card-header-title"
      >{{ outputFile.label }}</span>
      <a class="card-header-icon">
        <b-icon
          :icon="props.open ? 'caret-down' : 'caret-left'"
          size="is-small"
        />
      </a>
    </div>
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
  <div v-else>
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
  computed: {
    showLabel() {
      return !this.isOnlyOutput;
    },
  },
};
</script>
