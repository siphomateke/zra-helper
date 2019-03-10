<template>
  <CenterMessage
    :message="message"
    :icon="icon"
  >
    <div class="spinner is-centered"/>
  </CenterMessage>
</template>

<script>
import CenterMessage from '@/components/CenterMessage.vue';

export default {
  name: 'LoadingMessage',
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
