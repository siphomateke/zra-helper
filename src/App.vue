<template>
  <div
    id="app"
    class="container"
  >
    <TabNav
      :tabs="tabs"
      v-model="activeTab"
      @change="tabChanged"
    />
    <keep-alive>
      <router-view class="page-content" />
    </keep-alive>
    <b-loading
      :active="configIsLoading"
      :is-full-page="true"
    />
  </div>
</template>

<script>
import TabNav from '@/components/TabNav.vue';
import configMixin from '@/mixins/config';

export default {
  components: {
    TabNav,
  },
  mixins: [configMixin],
  data() {
    return {
      activeTab: 0,
      tabs: [],
    };
  },
  async created() {
    await this.loadConfig();
  },
  mounted() {
    const { routes } = this.$router.options;
    this.tabs = [];
    let i = 0;
    for (const route of routes) {
      if (route.path !== '/') {
        this.tabs.push({
          label: route.meta.title,
          icon: route.meta.icon,
          link: route.path,
        });
        if (this.$route.path === route.path) {
          this.activeTab = i;
        }
        i++;
      }
    }
  },
  methods: {
    tabChanged(activeTab) {
      const tab = this.tabs[activeTab];
      this.$router.push(tab.link);
    },
  },
};
</script>


<style lang="scss">
@import '@/assets/scss/app.scss';
</style>
