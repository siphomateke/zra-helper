import { exportFormats, ExportFormatCode } from '@/backend/constants';
import Vue, { ComponentOptions } from 'vue';

const ExportGeneratorsMixin: ComponentOptions<Vue> = {
  props: {
    generators: {
      type: Object,
      default: () => ({}),
      validator(value) {
        for (const format of Object.keys(value)) {
          const generator = value[format];
          if (!(format in exportFormats) && typeof generator !== 'function') {
            return false;
          }
        }
        return true;
      },
      required: true,
    },
    /**
     * Default export format used when buttons are not separate.
     */
    defaultFormat: {
      type: String,
      default: ExportFormatCode.TXT,
    },
  },
  data() {
    return {
      selectedFormat: null,
    };
  },
  created() {
    this.selectedFormat = this.getDefaultFormat();
  },
  computed: {
    formats() {
      return Object.keys(this.generators);
    },
    generator() {
      return this.getGeneratorFromFormat(this.selectedFormat);
    },
  },
  methods: {
    getDefaultFormat() {
      if (this.formats.includes(this.defaultFormat)) {
        // Make sure the default format exists.
        return this.defaultFormat;
      } if (this.formats.length > 0) {
        // If it doesn't, just use the first format.
        return this.formats[0];
      }
      return null;
    },
    getGeneratorFromFormat(format) {
      return this.generators[format];
    },
    getFormatName(format) {
      return exportFormats[format].name;
    },
  },
};
export default ExportGeneratorsMixin;
