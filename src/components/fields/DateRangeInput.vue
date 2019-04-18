<template>
  <b-field grouped>
    <b-field label="From date">
      <DateInput v-model="fromDate"/>
    </b-field>
    <b-field label="To date">
      <DateInput v-model="toDate"/>
    </b-field>
  </b-field>
</template>

<script>
import DateInput from '@/components/fields/DateInput.vue';

export default {
  name: 'DateRangeInput',
  components: {
    DateInput,
  },
  props: {
    value: {
      type: Array,
      default: () => ([]),
      validator(value) {
        if (value.length > 0 && value.length !== 2) {
          return false;
        }
        return true;
      },
    },
  },
  data() {
    return {
      fromDate: '',
      toDate: '',
    };
  },
  computed: {
    internalValue() {
      return {
        fromDate: this.fromDate,
        toDate: this.toDate,
      };
    },
  },
  watch: {
    value: {
      handler([fromDate, toDate]) {
        this.fromDate = fromDate;
        this.toDate = toDate;
      },
      immediate: true,
    },
    fromDate() {
      this.onInput();
    },
    toDate() {
      this.onInput();
    },
  },
  methods: {
    onInput() {
      this.$emit('input', this.internalValue);
    },
  },
};
</script>
