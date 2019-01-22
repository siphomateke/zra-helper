<template>
  <textarea
    :value="output"
    class="client-action-output"
    readonly
    rows="7"/>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  name: 'TheClientActionOutput',
  computed: {
    ...mapGetters('output', { output: 'content' }),
  },
};
</script>

<style lang="scss">
.client-action-output {
  width: 100%;
}
</style>
