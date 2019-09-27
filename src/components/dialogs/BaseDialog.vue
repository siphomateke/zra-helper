<template>
  <div
    :class="{overflow: !scrollable}"
    class="modal-card"
  >
    <header
      v-if="title"
      class="modal-card-head"
    >
      <p class="modal-card-title">
        {{ title }}
      </p>
    </header>

    <section class="modal-card-body">
      <div
        :class="{'is-flex': hasIcon, 'has-extra': typeof this.$slots['extra'] !== 'undefined'}"
        class="media"
      >
        <div
          v-if="hasIcon"
          class="media-left"
        >
          <b-icon
            :icon="icon ? icon : iconByType"
            :type="type"
            :both="!icon"
            size="is-large"
          />
        </div>
        <div class="media-content">
          <slot />
        </div>
      </div>
      <slot
        name="extra"
        class="extra"
      />
    </section>

    <footer class="modal-card-foot">
      <button
        v-if="canCancel"
        ref="cancelButton"
        class="button"
        @click="cancel"
      >
        {{ cancelText }}
      </button>
      <slot name="buttons" />
      <button
        ref="confirmButton"
        :class="type"
        class="button"
        @click="confirm"
      >
        {{ confirmText }}
      </button>
    </footer>
  </div>
</template>

<script>
export default {
  name: 'BaseDialog',
  props: {
    title: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      default: 'is-primary',
    },
    hasIcon: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: String,
      default: '',
    },
    confirmText: {
      type: String,
      default: 'OK',
    },
    cancelText: {
      type: String,
      default: 'Cancel',
    },
    canCancel: {
      type: Boolean,
      default: true,
    },
    scrollable: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    iconByType() {
      switch (this.type) {
      case 'is-info':
        return 'information';
      case 'is-success':
        return 'check-circle';
      case 'is-warning':
        return 'alert';
      case 'is-danger':
        return 'alert-circle';
      default:
        return null;
      }
    },
  },
  mounted() {
    this.$nextTick(() => {
      this.$refs.confirmButton.focus();
    });
  },
  methods: {
    cancel() {
      this.$emit('cancel');
    },
    confirm() {
      this.$emit('confirm');
    },
  },
};
</script>

<style lang="scss" scoped>
.modal-card {
  .modal-card-body {
    .field {
      margin-top: 16px;
    }
    .media.has-extra {
      margin-bottom: 1em;
    }
  }
  .modal-card-foot {
    justify-content: flex-end;
    .button {
      display: inline; // Fix Safari centering
      min-width: 5em;
      font-weight: 600;
    }
  }
}
</style>
