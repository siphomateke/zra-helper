<template>
  <b-upload @input="fileInput">
    <div
      :class="{'has-name': file}"
      class="file"
    >
      <div class="file-label">
        <span class="file-cta">
          <span class="file-icon">
            <b-icon
              size="is-small"
              icon="upload"
            />
          </span>
          <span class="file-label">Browse...</span>
        </span>
        <span
          v-if="file"
          class="file-name"
        >{{ file.name }}</span>
      </div>
    </div>
  </b-upload>
</template>

<script>
export default {
  name: 'BaseFileUpload',
  data() {
    return {
      file: null,
    };
  },
  methods: {
    fileInput(file) {
      this.file = file;
      this.$emit('input', file);
    },
  },
};
</script>
