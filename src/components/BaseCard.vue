<template>
  <div class="card">
    <header class="card-header">
      <span class="card-header-title">{{ title }}</span>
    </header>
    <div class="card-content">
      <slot/>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BaseCard',
  props: {
    title: {
      type: String,
      default: '',
    },
  },
};
</script>
