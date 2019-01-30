<template>
  <div :class="[isRoot ? 'tasks' : 'sub-tasks']">
    <TaskListItem
      v-for="id in tasks"
      :key="id"
      :id="id"/>
    <EmptySection
      v-if="isRoot && tasks.length === 0"
      message="No tasks are currently running"/>
  </div>
</template>

<script>
import EmptySection from '@/components/EmptySection.vue';

export default {
  name: 'TaskList',
  components: {
    EmptySection,
    // TODO: Find out why this breaks Vetur
    // TaskListItem: () => import(/* webpackChunkName: "task-list-item" */'./TaskListItem.vue')
  },
  props: {
    tasks: {
      type: Array,
      default: () => [],
    },
    isRoot: {
      type: Boolean,
      default: false,
    },
  },
  beforeCreate() {
    // TODO: Use async import instead of require
    // eslint-disable-next-line global-require, max-len
    this.$options.components.TaskListItem = require(/* webpackChunkName: "task-list-item" */'./TaskListItem.vue').default;
  },
};
</script>
