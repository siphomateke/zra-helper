<template>
  <div class="empty-section">
    <EmptyMessage
      :icon="icon"
      :message="message"
    />
  </div>
</template>

<script>
import EmptyMessage from '@/components/EmptyMessage.vue';

export default {
  name: 'EmptySection',
  components: {
    EmptyMessage,
  },
  props: {
    message: {
      type: String,
      default: '',
    },
    icon: {
      type: String,
      default: '',
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';

.empty-section {
  border: 1px solid $region-outline-color;
  border-radius: 5px;
  padding: 1em;
  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
}
</style>
