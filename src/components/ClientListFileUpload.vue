<template>
  <b-upload
    v-model="file"
    @input="fileUploaded">
    <div
      :class="{'has-name': file}"
      class="file">
      <div class="file-label">
        <span class="file-cta">
          <span class="file-icon">
            <b-icon
              size="is-small"
              icon="upload"/>
          </span>
          <span class="file-label">
            Browse...
          </span>
        </span>
        <span
          v-if="file"
          class="file-name">
          {{ file.name }}
        </span>
      </div>
    </div>
  </b-upload>
</template>

<script>
import { getClientsFromFile } from '@/backend/client_file_reader';

// TODO: Move CSV file validation from client_file_reader.js to this component

export default {
  name: 'ClientListFileUpload',
  data() {
    return {
      file: null,
      clients: [],
    };
  },
  methods: {
    async fileUploaded(file) {
      this.clients = await getClientsFromFile(file);
      this.$emit('input', this.clients);
    },
  },
};
</script>
