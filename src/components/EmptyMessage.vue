<template>
  <div class="content has-text-grey has-text-centered">
    <p v-if="icon">
      <b-icon
        :icon="icon"
        size="is-large"/>
    </p>
    <p>{{ message }}</p>
  </div>
</template>

<script>
export default {
  name: 'EmptyMessage',
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
