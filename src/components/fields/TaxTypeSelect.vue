<template>
  <div class="field">
    <label class="label">{{ fieldLabel }}</label>
    <template v-if="multiple">
      <CheckboxList
        key="tax-type-checkbox-list"
        v-model="taxTypeIds"
        v-validate="validationRules"
        :checkboxes="checkboxes"
        :disabled="disabled"
        :name="name"
      />
    </template>
    <b-select
      v-else
      key="tax-type-select"
      v-validate="validationRules"
      :value="value"
      :multiple="multiple"
      :disabled="disabled"
      :name="name"
      @input="onInput"
    >
      <option
        v-for="taxTypeId in allTaxTypeIds"
        :key="taxTypeId"
        :value="taxTypeId"
      >
        {{ taxTypeLabels[taxTypeId] }}
      </option>
    </b-select>
    <p
      v-if="$errors.has(name)"
      class="help is-danger"
    >
      {{ $errors.first(name) }}
    </p>
  </div>
</template>

<script>
import { TaxTypeNumericalCode, taxTypeHumanNames } from '@/backend/constants';
import CheckboxList from './CheckboxList.vue';

export default {
  name: 'TaxTypeSelect',
  components: {
    CheckboxList,
  },
  inject: ['$validator'],
  props: {
    value: {
      type: [String, Array],
      default: null,
    },
    multiple: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    /**
     * Same as HTML input 'name' attribute.
     *
     * Must be set when there is more than one TaxTypeSelect in use.
     */
    name: {
      type: String,
      default: 'tax_types',
    },
    label: {
      type: String,
      default: '',
    },
    validationRules: {
      type: String,
      default: 'required',
    },
  },
  data() {
    return {
      taxTypeLabels: taxTypeHumanNames,
      taxTypeIds: [],
    };
  },
  computed: {
    fieldLabel() {
      if (this.label) {
        return this.label;
      }
      return this.multiple ? 'Tax types' : 'Tax type';
    },
    allTaxTypeIds() {
      return Object.keys(this.taxTypeLabels);
    },
    checkboxes() {
      return this.allTaxTypeIds.map(taxTypeId => ({
        label: this.taxTypeLabels[taxTypeId],
        value: taxTypeId,
      }));
    },
  },
  watch: {
    value: {
      handler(value) {
        if (this.multiple) {
          if (Array.isArray(value)) {
            this.taxTypeIds = value;
          }
        } else {
          this.taxTypeIds = value;
        }
      },
      immediate: true,
    },
    taxTypeIds(value) {
      this.onInput(value);
    },
  },
  methods: {
    onInput(value) {
      this.$emit('input', value);
    },
  },
};
</script>
