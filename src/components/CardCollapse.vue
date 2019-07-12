<template>
  <div class="card">
    <div
      class="card-header"
      @click="clickCardHeader"
    >
      <a class="card-header-icon">
        <b-icon
          :icon="collapseIsOpen ? 'caret-down' : 'caret-right'"
          size="is-small"
        />
      </a>
      <span class="card-header-title">{{ title }}</span>
      <div
        ref="cardHeaderButtons"
        class="card-header-buttons"
      >
        <slot name="header-buttons" />
      </div>
    </div>
    <b-collapse
      :open.sync="collapseIsOpen"
      :animation="null"
      v-bind="$attrs"
    >
      <div class="card-content">
        <slot />
      </div>
    </b-collapse>
  </div>
</template>

<script>
import { generatePropSyncMixin } from '@/mixins/sync_prop';

export default {
  name: 'ClientActionOutputFileWrapper',
  mixins: [generatePropSyncMixin('collapseIsOpen', 'active')],
  props: {
    active: {
      type: Boolean,
      default: true,
    },
    title: {
      type: String,
      default: '',
    },
  },
  methods: {
    clickCardHeader({ target }) {
      // Don't do anything if this was triggered by clicking a button within the card header
      if (this.$refs.cardHeaderButtons.contains(target)) return;

      this.collapseIsOpen = !this.collapseIsOpen;
    },
  },
};
</script>

<style lang="scss" scoped>
.card-header {
  cursor: pointer;
}
</style>
