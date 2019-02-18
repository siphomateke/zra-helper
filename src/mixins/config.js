export default {
  data() {
    return {
      isLoading: false,
    };
  },
  methods: {
    async loadConfig() {
      this.isLoading = true;
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
        this.isLoading = false;
      }
    },
  },
};
