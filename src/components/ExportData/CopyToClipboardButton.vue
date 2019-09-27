<template>
  <BaseExportButton
    v-bind="buttonProps"
    @click="copy"
  >
    <b-tooltip
      slot="label"
      :active="showTooltip"
      :label="tooltip"
      always
      animated
      type="is-dark"
    >
      <b-icon
        :icon="icon"
        size="is-small"
      />
      <span v-if="!compact">{{ label }}</span>
    </b-tooltip>
  </BaseExportButton>
</template>

<script>
import ExportButtonMixin from './export_button_mixin';
import BaseExportButton from './BaseExportButton.vue';

// FIXME: Wrap tooltip around button without breaking .buttons.has-addons
export default {
  name: 'CopyToClipboardButton',
  components: {
    BaseExportButton,
  },
  mixins: [ExportButtonMixin],
  data() {
    return {
      label: 'Copy',
      description: 'Copy to clipboard',
      icon: 'clipboard',
      showTooltip: false,
      tooltip: '',
      tooltipTimeout: 3000,
    };
  },
  methods: {
    showTooltipMessage(message) {
      this.tooltip = message;
      this.showTooltip = true;
      setTimeout(() => {
        this.showTooltip = false;
      }, this.tooltipTimeout);
    },
    copyComplete(success) {
      if (success) {
        this.showTooltipMessage('Copied!');
      } else {
        // TODO: Test this (Find out why this error may occur)
        this.showTooltipMessage('Failed to copy! Try pressing Ctrl+C');
      }
    },
    async copy() {
      const data = await this.generateData();
      this.$copyText(data)
        .then(() => {
          this.copyComplete(true);
        }).catch(() => {
          this.copyComplete(false);
        });
    },
  },
};
</script>
