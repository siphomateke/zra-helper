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
        const data = await this.generator();
        return data;
      } finally {
        this.generatingData = false;
      }
    },
  },
};
export default mixin;
