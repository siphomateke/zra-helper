<template>
  <b-upload
    v-bind="$attrs"
    @input="fileInput"
  >
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
// FIXME: Indicate that upload is disabled
export default {
  name: 'BaseFileUpload',
  $_veeValidate: {
    value() {
      // Tell VeeValidate that this input is not empty
      return this.file;
    },
  },
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
