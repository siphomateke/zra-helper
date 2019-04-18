<template>
  <b-datepicker
    :value="date"
    :max-date="maxDate"
    editable
    placeholder="Type or select a date..."
    icon="calendar-alt"
    icon-pack="fas"
    @input="onInput"
  />
</template>

<script>
import moment from 'moment';

export default {
  name: 'DateInput',
  props: {
    value: {
      type: String,
      default: '',
    },
  },
  data() {
    const today = new Date();
    return {
      maxDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    };
  },
  computed: {
    date() {
      if (this.value) {
        return moment(this.value, 'DD/MM/YYYY').toDate();
      }
      return undefined;
    },
  },
  methods: {
    onInput(value) {
      this.$emit('input', moment(value).format('DD/MM/YYYY'));
    },
  },
};
</script>
