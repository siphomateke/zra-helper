<template>
  <FileUpload @input="fileUploaded"/>
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
