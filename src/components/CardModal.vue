<template>
  <b-modal
    :active.sync="internalActive"
    has-modal-card
  >
    <div class="modal-card">
      <header
        v-if="this.$slots.head || title"
        class="modal-card-head"
      >
        <slot name="head">
          <p class="modal-card-title">{{ title }}</p>
        </slot>
      </header>
      <section
        v-if="this.$slots.body"
        class="modal-card-body"
      >
        <slot name="body"/>
      </section>
      <section
        v-if="this.$slots.foot"
        class="modal-card-foot"
      >
        <slot name="foot"/>
      </section>
    </div>
  </b-modal>
</template>

<script>
export default {
  name: 'CardModal',
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      internalActive: this.active,
    };
  },
  watch: {
    active(value) {
      this.internalActive = value;
    },
    internalActive(value) {
      this.$emit('update:active', value);
    },
  },
};
</script>
