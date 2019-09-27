<template>
  <div
    v-if="!separateButtonsInternal"
    class="buttons has-addons"
  >
    <b-field>
      <p class="control">
        <span
          :class="[size]"
          class="button is-static"
        >{{ 'Export as ' }}</span>
      </p>
      <b-select
        v-model="selectedFormat"
        :disabled="disabled"
        placeholder="Format"
      >
        <option
          v-for="format of formats"
          :key="format"
          :value="format"
          :disabled="disabled"
        >
          {{ getFormatName(format) }}
        </option>
      </b-select>
      <CopyToClipboardButton
        :format="selectedFormat"
        :generator="generator"
        :size="size"
        :compact="compact"
        :disabled="disabled"
      />
      <DownloadButton
        :format="selectedFormat"
        :generator="generator"
        :size="size"
        :compact="compact"
        :disabled="disabled"
        :filename="filename"
      />
      <PreviewButton
        :format="selectedFormat"
        :generator="generator"
        :size="size"
        :compact="compact"
        :disabled="disabled"
      />
    </b-field>
  </div>
  <b-field
    v-else
    :group-multiline="formats.length > 1"
    :grouped="formats.length > 1"
  >
    <b-field
      v-for="format of formats"
      :key="format"
    >
      <p class="control">
        <span
          :class="[size]"
          class="button is-static"
        >{{ getFormatName(format) }}</span>
      </p>
      <p class="control">
        <CopyToClipboardButton
          :format="format"
          :generator="getGeneratorFromFormat(format)"
          :size="size"
          :compact="true"
          :disabled="disabled"
        />
      </p>
      <p class="control">
        <DownloadButton
          :format="format"
          :generator="getGeneratorFromFormat(format)"
          :size="size"
          :compact="true"
          :disabled="disabled"
          :filename="filename"
        />
      </p>
      <p class="control">
        <PreviewButton
          :format="format"
          :generator="getGeneratorFromFormat(format)"
          :size="size"
          :compact="true"
          :disabled="disabled"
        />
      </p>
    </b-field>
  </b-field>
</template>

<script>
import CopyToClipboardButton from '@/components/ExportData/CopyToClipboardButton.vue';
import DownloadButton from '@/components/ExportData/DownloadButton.vue';
import PreviewButton from '@/components/ExportData/PreviewButton.vue';
import ExportGeneratorsMixin from './export_generators_mixin';

export default {
  name: 'ExportButtons',
  components: {
    CopyToClipboardButton,
    DownloadButton,
    PreviewButton,
  },
  mixins: [ExportGeneratorsMixin],
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
  },
  computed: {
    separateButtonsInternal() {
      if (this.separateButtons !== null) {
        return this.separateButtons;
      }
      if (this.formats.length < 5) {
        return true;
      }
      return false;
    },
  },
};
</script>
