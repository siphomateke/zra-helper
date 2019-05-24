/** @type {import('vue').ComponentOptions} */
const mixin = {
  props: {
    /**
     * Asynchronous function that generates the data to export.
     */
    generator: {
      type: Function,
      required: true,
    },
    format: {
      type: String,
      required: true,
    },
    compact: {
      type: Boolean,
      default: false,
    },
    size: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      generatingData: false,
    };
  },
  methods: {
    async generateData() {
      this.generatingData = true;
      try {
        try {
          const data = await this.generator();
          return data;
        } catch (error) {
          this.$showError({
            title: 'Failed to generate export',
            error,
          });
          throw error;
        }
      } finally {
        this.generatingData = false;
      }
    },
  },
  computed: {
    buttonProps() {
      return {
        label: this.label,
        description: this.description,
        icon: this.icon,
        compact: this.compact,
        size: this.size,
        disabled: this.disabled,
      };
    },
  },
};
export default mixin;
