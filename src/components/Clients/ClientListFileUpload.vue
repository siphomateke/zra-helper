<template>
  <div>
    <FileUpload @input="fileUploaded"/>
    <p v-show="clients.length > 0">Parsed {{ clients.length }} client(s)</p>
  </div>
</template>

<script>
import getClientsFromFile from '@/backend/client_file_reader';
import FileUpload from '@/components/BaseFileUpload.vue';

export default {
  name: 'ClientListFileUpload',
  components: {
    FileUpload,
  },
  data() {
    return {
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
