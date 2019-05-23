export default {
  data() {
    return {
      configIsLoading: false,
    };
  },
  methods: {
    async loadConfig() {
      this.configIsLoading = true;
      try {
        await this.$store.dispatch('config/load');
      } catch (e) {
        this.$showError({
          title: 'Error loading settings',
          error: e,
        });
      } finally {
        this.configIsLoading = false;
      }
    },
  },
};
