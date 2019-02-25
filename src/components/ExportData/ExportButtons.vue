<template>
  <div
    v-if="!separateButtonsInternal"
    class="buttons has-addons">
    <b-field>
      <p class="control">
        <span
          :class="[size]"
          class="button is-static">{{ 'Export as ' }}</span>
      </p>
      <b-select
        v-model="selectedFormat"
        :disabled="disabled"
        placeholder="Format">
        <option
          v-for="format of formats"
          :key="format"
          :value="format"
          :disabled="disabled">{{ getFormatName(format) }}</option>
      </b-select>
      <CopyToClipboardButton
        :content="generator"
        :size="size"
        :compact="compact"
        :disabled="disabled"/>
      <DownloadButton
        :content="generator"
        :size="size"
        :compact="compact"
        :disabled="disabled"
        :filename="filename"
        :type="selectedFormat"/>
    </b-field>
  </div>
  <b-field
    v-else
    grouped
    group-multiline>
    <b-field
      v-for="format of formats"
      :key="format">
      <p class="control">
        <span
          :class="[size]"
          class="button is-static">{{ getFormatName(format) }}</span>
      </p>
      <p class="control">
        <CopyToClipboardButton
          :content="getGeneratorFromFormat(format)"
          :size="size"
          :compact="true"
          :disabled="disabled"/>
      </p>
      <p class="control">
        <DownloadButton
          :content="getGeneratorFromFormat(format)"
          :size="size"
          :compact="true"
          :disabled="disabled"
          :filename="filename"
          :type="format"/>
      </p>
    </b-field>
  </b-field>
</template>

<script>
import CopyToClipboardButton from '@/components/ExportData/CopyToClipboardButton.vue';
import DownloadButton from '@/components/ExportData/DownloadButton.vue';
import { exportFormats, exportFormatCodes } from '@/backend/constants';

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
    /**
     * Set to true to hide labels on buttons. Only works when buttons are not separate.
     */
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
    /**
     * Whether each export format should have it's own copy and download buttons.
     * If unset, the buttons will be separate only if there are less than 5 formats.
     */
    separateButtons: {
      type: Boolean,
      default: null,
    },
    generators: {
      type: Object,
      default: () => {},
      validator(value) {
        for (const format of Object.keys(value)) {
          const generator = value[format];
          if (!(format in exportFormats) && typeof generator !== 'function') {
            return false;
          }
        }
        return true;
      },
      required: true,
    },
    /**
     * Default export format used when buttons are not separate.
     */
    defaultFormat: {
      type: String,
      default: exportFormatCodes.TXT,
    },
  },
  data() {
    return {
      selectedFormat: null,
    };
  },
  computed: {
    formats() {
      return Object.keys(this.generators);
    },
    generator() {
      return this.getGeneratorFromFormat(this.selectedFormat);
    },
    separateButtonsInternal() {
      if (this.separateButtons !== null) {
        return this.separateButtons;
      }
      if (this.formats.length < 5) {
        return true;
      }
      return false;
    },
    defaultFormatInternal() {
      if (this.formats.includes(this.defaultFormat)) {
        // Make sure the default format exists.
        return this.defaultFormat;
      } else if (this.formats.length > 0) {
        // If it doesn't, just use the first format.
        return this.formats[0];
      }
      return null;
    },
  },
  created() {
    this.selectedFormat = this.defaultFormatInternal;
  },
  methods: {
    getFormatName(format) {
      return exportFormats[format].name;
    },
    getGeneratorFromFormat(format) {
      return this.generators[format];
    },
  },
};
</script>
