<template>
  <div class="field">
    <label class="label">{{ fieldLabel }}</label>
    <template v-if="multiple">
      <CheckboxList
        v-validate="'required'"
        key="tax-type-checkbox-list"
        v-model="taxTypeIds"
        :checkboxes="checkboxes"
        :disabled="disabled"
        name="tax_types"
      />
    </template>
    <b-select
      v-validate="'required'"
      v-else
      key="tax-type-select"
      :value="value"
      :multiple="multiple"
      :disabled="disabled"
      name="tax_types"
      @input="onInput"
    >
      <option
        v-for="taxTypeId in allTaxTypeIds"
        :key="taxTypeId"
        :value="taxTypeId"
      >{{ taxTypeLabels[taxTypeId] }}</option>
    </b-select>
    <p
      v-if="$errors.has('tax_types')"
      class="help is-danger"
    >{{ $errors.first('tax_types') }}</p>
  </div>
</template>

<script>
import { taxTypeNumericalCodes } from '@/backend/constants';
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
  },
  data() {
    return {
      taxTypeLabels: {
        [taxTypeNumericalCodes.ITX]: 'Income tax',
        [taxTypeNumericalCodes.VAT]: 'Value added tax',
        [taxTypeNumericalCodes.PAYE]: 'Employment tax (pay as you earn)',
        [taxTypeNumericalCodes.TOT]: 'Turnover tax',
        [taxTypeNumericalCodes.WHT]: 'Withholding tax',
        [taxTypeNumericalCodes.PTT]: 'Property transfer tax',
        [taxTypeNumericalCodes.MINROY]: 'Mineral royalty',
        [taxTypeNumericalCodes.TLEVY]: 'Medical levy tax',
      },
      taxTypeIds: [],
    };
  },
  computed: {
    fieldLabel() {
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
