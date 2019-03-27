import { mapState } from 'vuex';

export default {
  computed: {
    ...mapState(['configIsLoading']),
  },
  methods: {
    async loadConfig() {
      try {
        await this.$store.dispatch('config/load');
      } catch (e) {
        this.$showError({
          title: 'Error loading settings',
          error: e,
        });
      }
    },
  },
};
