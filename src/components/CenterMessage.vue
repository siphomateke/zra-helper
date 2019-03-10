<template>
  <div class="content has-text-grey has-text-centered">
    <slot/>
    <p v-if="icon">
      <b-icon
        :icon="icon"
        size="is-large"
      />
    </p>
    <p>{{ message }}</p>
  </div>
</template>

<script>
export default {
  name: 'CenterMessage',
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
