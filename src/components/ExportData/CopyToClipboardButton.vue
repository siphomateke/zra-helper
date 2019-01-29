<template>
  <button
    :class="[size]"
    :title="compact ? longDescription : ''"
    :disabled="disabled"
    class="button"
    @click="copy">
    <b-tooltip
      :active="showTooltip"
      :label="tooltip"
      always
      animated
      type="is-dark">
      <b-icon
        icon="clipboard"
        size="is-small"/>
      <span>{{ compact ? shortDescription: longDescription }}</span>
    </b-tooltip>
  </button>
</template>

<script>
// FIXME: Wrap tooltip around button without breaking .buttons.has-addons
export default {
  name: 'CopyToClipboardButton',
  props: {
    content: {
      type: Function,
      default: () => '',
    },
    compact: {
      type: Boolean,
      default: false,
    },
    size: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      showTooltip: false,
      tooltip: '',
      tooltipTimeout: 3000,
      longDescription: 'Copy to clipboard',
      shortDescription: 'Copy',
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
    copy() {
      this.$copyText(this.content())
        .then(() => {
          this.copyComplete(true);
        }).catch(() => {
          this.copyComplete(false);
        });
    },
  },
};
</script>
