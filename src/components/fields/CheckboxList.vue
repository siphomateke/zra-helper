<template>
  <div>
    <b-checkbox
      :value="isAllChecked"
      @change.native="checkAll"
    >
      <b>{{ isAllChecked ? 'Un-check all' : 'Check all' }}</b>
    </b-checkbox>
    <div
      v-for="checkbox in checkboxes"
      :key="checkbox.value"
      class="control"
    >
      <b-checkbox
        v-model="checked"
        :native-value="checkbox.value"
      >{{ checkbox.label }}</b-checkbox>
    </div>
  </div>
</template>

<script>
import generateValueSyncMixin from '@/mixins/sync_value';

export default {
  name: 'CheckboxList',
  mixins: [generateValueSyncMixin('checked')],
  props: {
    value: {
      type: Array,
      default: () => [],
    },
    checkboxes: {
      type: Array,
      default: () => [],
      validator(value) {
        for (const item of value) {
          if (!('label' in item && 'value' in item)) {
            return false;
          }
        }
        return true;
      },
    },
  },
  data() {
    return {
      checked: [],
    };
  },
  computed: {
    isAllChecked() {
      return this.checked.length === this.checkboxes.length;
    },
  },
  methods: {
    checkAll() {
      if (this.isAllChecked) {
        this.checked = [];
      } else {
        for (const { value } of this.checkboxes) {
          if (!this.checked.includes(value)) {
            this.checked.push(value);
          }
        }
      }
    },
  },
};
</script>
