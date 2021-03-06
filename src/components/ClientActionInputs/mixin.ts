import Vue, { ComponentOptions } from 'vue';
import { deepClone } from '@/utils';
import { ClientActionObject } from '@/backend/client_actions/base';

function ClientActionInputsMixin(action: ClientActionObject<any, any, any>): ComponentOptions<Vue> {
  return {
    $_veeValidate: {
      validator: 'new',
    },
    props: {
      disabled: {
        type: Boolean,
        default: false,
      },
      bus: {
        type: Object,
        default: new Vue(),
      },
      value: {
        type: Object,
        default: () => (typeof action.defaultInput !== 'undefined' ? action.defaultInput() : {}),
      },
    },
    data() {
      return {
        input: deepClone(this.value),
      };
    },
    watch: {
      value(value) {
        this.input = deepClone(value);
      },
    },
    created() {
      this.bus.$on('submit', this.submit);
    },
    destroyed() {
      this.bus.$off('submit', this.submit);
    },
    methods: {
      submit() {
        // Make sure the new inputs have been actually processed before validating.
        // If we don't wait till the next tick, inputs like the datepicker may still be set to an
        // outdated value when the form is submitted and validated after pressing enter.
        this.$nextTick(() => {
          this.$validator.validateAll().then((valid) => {
            if (valid) this.$emit('input', this.input);
          });
        });
      },
    },
  };
}
export default ClientActionInputsMixin;
