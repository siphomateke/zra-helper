<template>
  <nav class="tabs">
    <ul>
      <li
        v-for="(tab, index) in tabs"
        :key="index"
        :class="{ 'is-active': activeTab === index}">
        <a @click="tabClick(index)">
          <b-icon
            v-if="tab.icon"
            :icon="tab.icon"/>
          <span>{{ tab.label }}</span>
        </a>
      </li>
    </ul>
  </nav>
</template>

<script>
export default {
  name: 'TabNav',
  props: {
    value: {
      type: Number,
      default: 0,
    },
    tabs: {
      type: Array,
      default: () => [],
      validator(items) {
        for (const item of items) {
          if (!('label' in item)) {
            return false;
          }
        }
        return true;
      },
    },
  },
  data() {
    return {
      activeTab: this.value,
    };
  },
  watch: {
    value(newIndex) {
      this.activeTab = newIndex;
    },
  },
  methods: {
    tabClick(newIndex) {
      this.$emit('input', newIndex);
      if (this.activeTab === newIndex) return;
      this.activeTab = newIndex;
      this.$emit('change', newIndex);
    },
  },
};
</script>

