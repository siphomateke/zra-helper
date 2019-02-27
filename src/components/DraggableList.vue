<template>
  <draggable
    :value="list"
    :options="dragOptions"
    :class="{'disabled': disabled}"
    class="draggable-list"
    @input="updateList"
    @start="drag = true"
    @end="drag = false">
    <transition-group
      :name="!drag ? 'flip-list' : null"
      type="transition">
      <div
        v-for="item in list"
        :key="item.id"
        :data-id="item.id"
        :class="{'drag-anywhere': dragAnywhere}"
        class="draggable-list--item">
        <b-icon
          v-if="showHandleInternal"
          icon="grip-vertical"
          size="is-small"
          class="handle"/>
        <slot :item="item"/>
      </div>
    </transition-group>
  </draggable>
</template>

<script>
import draggable from 'vuedraggable';

export default {
  name: 'DraggableList',
  components: {
    draggable,
  },
  props: {
    value: {
      type: Array,
      required: true,
      validator(list) {
        for (const item of list) {
          if (typeof item === 'object') {
            if (!('id' in item)) {
              return false;
            }
          } else {
            return false;
          }
        }
        return true;
      },
    },
    showHandle: {
      type: Boolean,
      default: true,
    },
    dragAnywhere: {
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
      list: this.value,
      drag: false,
    };
  },
  computed: {
    dragOptions() {
      const options = {
        animation: 200,
        dragoverBubble: true,
        disabled: this.disabled,
      };
      if (!this.dragAnywhere) {
        options.handle = '.handle';
      }
      return options;
    },
    showHandleInternal() {
      return !this.disabled ? this.showHandle : false;
    },
  },
  watch: {
    value(value) {
      this.list = value;
    },
  },
  methods: {
    updateList(value) {
      this.$emit('input', value);
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';

.draggable-list {
  .draggable-list--item {
    display: flex;
    align-items: center;

    border-color: $region-outline-color;
    border-style: solid;
    border-top-width: $draggable-list-border-width;
    border-bottom-width: 0;
    border-left-width: $draggable-list-border-width;
    border-right-width: $draggable-list-border-width;
    padding: .2em .5em;
    background-color: #fff;

    &:first-child {
      border-radius: $draggable-list-border-radius $draggable-list-border-radius 0 0;
    }

    &:last-child {
      border-bottom-width: $draggable-list-border-width;
      border-radius: 0 0 $draggable-list-border-radius $draggable-list-border-radius;
    }

    &.sortable-drag {
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
    }

    &.sortable-ghost{
      border-color: $ghost-border-color;
      background-color: $ghost-color;

      & + .draggable-list--item {
        border-top-color: $ghost-border-color;
      }
    }

    &.drag-anywhere {
      cursor: grab;
    }

    .handle {
      cursor: grab;
      padding: 0.75em;
      margin-right: 0.5em;
    }
  }

  &.disabled .draggable-list--item.drag-anywhere {
    cursor: default;
  }
}
</style>
