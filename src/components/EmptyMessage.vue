<template>
  <CenterMessage
    :message="message"
    :icon="icon"
  />
</template>

<script>
import CenterMessage from '@/components/CenterMessage.vue';

export default {
  name: 'EmptyMessage',
  components: {
    CenterMessage,
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
