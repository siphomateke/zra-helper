import Vue, { ComponentOptions } from 'vue';
import { mapState } from 'vuex';

const ConfigMixin: ComponentOptions<Vue> = {
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
export default ConfigMixin;
