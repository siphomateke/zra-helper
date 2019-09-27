<template>
  <b-field
    class="download-pills"
    grouped
    group-multiline
  >
    <DownloadPill
      v-for="downloadId of downloadIds"
      :id="downloadId"
      :key="downloadId"
    />
  </b-field>
</template>

<script>
import DownloadPill from './DownloadPill.vue';

export default {
  name: 'DownloadPills',
  components: {
    DownloadPill,
  },
  props: {
    downloadIds: {
      type: Array,
      required: true,
      validator(value) {
        return !value.find(item => typeof item !== 'number');
      },
    },
  },
};
</script>

<style lang="scss">
$margin: 0.25rem;
.field.is-grouped.download-pills {
  & > .control {
    &:not(:last-child),
    &:last-child {
      margin-bottom: $margin;
    }

    &:not(:last-child) {
      margin-right: $margin;
    }
  }
  &.is-grouped-multiline:last-child {
    margin-bottom: -$margin;
  }
}
</style>
