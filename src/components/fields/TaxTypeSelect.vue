<template>
  <div class="field">
    <label class="label">{{ fieldLabel }}</label>
    <template v-if="multiple">
      <CheckboxList
        v-model="taxTypeIds"
        :checkboxes="checkboxes"
      />
    </template>
    <b-select
      v-else
      :value="value"
      :multiple="multiple"
      @input="onInput"
    >
      <option
        v-for="taxTypeId in allTaxTypeIds"
        :key="taxTypeId"
        :value="taxTypeId"
      >{{ taxTypeLabels[taxTypeId] }}</option>
    </b-select>
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
  props: {
    value: {
      type: [String, Array],
      default: null,
    },
    multiple: {
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
