<template>
  <b-modal
    :active.sync="internalActive"
    has-modal-card
    @close="$emit('close')"
  >
    <div
      :class="{overflow: !scrollable}"
      class="modal-card"
    >
      <header
        v-if="this.$slots.head || title"
        class="modal-card-head"
      >
        <slot name="head">
          <p class="modal-card-title">
            {{ title }}
          </p>
        </slot>
      </header>
      <section
        v-if="this.$slots.body"
        class="modal-card-body"
      >
        <slot name="body" />
      </section>
      <section
        v-if="this.$slots.foot"
        class="modal-card-foot"
      >
        <slot name="foot" />
      </section>
    </div>
  </b-modal>
</template>

<script>
import { generatePropSyncMixin } from '@/mixins/sync_prop';

export default {
  name: 'CardModal',
  mixins: [
    generatePropSyncMixin('internalActive', 'active'),
  ],
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: '',
    },
    scrollable: {
      type: Boolean,
      default: true,
    },
  },
};
</script>
