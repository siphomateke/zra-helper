<template>
  <div class="buttons has-addons">
    <CopyToClipboardButton
      :content="raw"
      :size="size"
      :compact="compact"
      :disabled="disabled"/>
    <DownloadButton
      v-if="csv"
      :content="csv"
      :filename="filename"
      :size="size"
      :compact="compact"
      :disabled="disabled"
      type="csv"/>
    <DownloadButton
      v-if="json"
      :content="json"
      :filename="filename"
      :size="size"
      :compact="compact"
      :disabled="disabled"
      type="json"/>
  </div>
</template>

<script>
import CopyToClipboardButton from '@/components/ExportData/CopyToClipboardButton.vue';
import DownloadButton from '@/components/ExportData/DownloadButton.vue';

export default {
  name: 'ExportButtons',
  components: {
    CopyToClipboardButton,
    DownloadButton,
  },
  props: {
    size: {
      type: String,
      default: '',
    },
    compact: {
      type: Boolean,
      default: false,
    },
    filename: {
      type: String,
      default: 'export',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    raw: {
      type: Function,
      default: () => '',
    },
    csv: {
      type: Function,
      default: () => '',
    },
    json: {
      type: Function,
      default: () => '',
    },
  },
};
</script>
