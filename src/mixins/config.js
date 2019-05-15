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
        this.$dialog.alert({
          title: 'Error loading settings',
          message: e.toString(),
          type: 'is-danger',
          hasIcon: true,
        });
      } finally {
        this.configIsLoading = false;
      }
    },
  },
};
