<template>
  <div
    :class="[
      state,
      {'open': open},
      hasParent ? 'task sub-task' : 'task',
      {'has-children': hasChildren}]">
    <div
      class="task-content"
      @click="showChildren()">
      <div class="header">
        <div class="title is-6">
          <b-icon
            v-if="hasChildren"
            :icon="open ? 'caret-down' : 'caret-right'"
            size="is-small"/>{{ title }}</div>
        <div
          :title="childStateString"
          class="subtasks-info">
          <span
            v-for="(count, state) in childStateCounts"
            :key="state"
            :class="state"
            class="item">
            <b-icon
              :icon="getStateIcon(state)"
              size="is-small"/>
            <span class="count">{{ count }}</span>
          </span>
        </div>
      </div>
      <div
        v-show="messages"
        class="messages">{{ messages }}</div>
      <Progress
        :value="progress"
        :max="progressMax"
        :complete="complete"
        :hide-on-complete="true"
        :indeterminate="indeterminate"
        :state="state"
        size="is-small"/>
    </div>
    <TaskList
      v-if="hasChildren"
      :tasks="children"/>
  </div>
</template>

<script>
import { mapGettersById, mapProperties } from '@/store/helpers';
import { taskStates } from '@/store/modules/tasks';
import TaskList from './TaskList.vue';
import Progress from './BaseProgress.vue';

export const stateIcons = {
  [taskStates.ERROR]: 'exclamation-circle',
  [taskStates.WARNING]: 'exclamation-triangle',
  [taskStates.SUCCESS]: 'check-circle',
};

// TODO: Improve details button
export default {
  name: 'TaskListItem',
  components: {
    TaskList,
    Progress,
  },
  props: {
    id: {
      type: Number,
      default: null,
    },
  },
  data() {
    return {
      open: false,
    };
  },
  computed: {
    ...mapGettersById('tasks', [
      'childStateCounts',
      'childStateString',
      'hasParent',
      'hasChildren',
      'progress',
      'progressMax',
      'complete',
    ]),
    ...mapGettersById('tasks', {
      model: 'getTaskById',
      actualProgress: 'progress',
    }),
    ...mapProperties('model', [
      'state',
      'title',
      'status',
      'errorString',
      'children',
      'indeterminate',
    ]),
    taskStates: () => taskStates,
    messages() {
      return this.errorString ? this.errorString : this.status;
    },
  },
  methods: {
    getStateIcon(state) {
      return stateIcons[state];
    },
    showChildren() {
      if (this.hasChildren) {
        this.open = !this.open;
      }
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';

.task {
    &:not(:last-child) {
        margin-bottom: 1em;
    }

    &.has-children > .task-content {
      cursor: pointer;
    }

    & > .task-content {
        background: rgb(245, 245, 245);
        border: $taskBorderWidth solid rgb(139, 139, 139);
        border-radius: $taskBorderRadius;
        border-left-width: 5px;
        padding: 0.5em;
        .header {
            display: flex;
            align-items: center;
            .title {
                margin-bottom: 0;
            }

            .subtasks-info {
                margin-left: auto;
                display: flex;
                white-space: nowrap;
                .item .count {
                  padding-left: 0.2em;
                }
                .item:not(:last-child) {
                    padding-right: 1em;
                }
                @each $state, $color in $taskColors {
                    .#{$state} .icon {
                        color: $color;
                    }
                }
            }
        }
    }

    @mixin taskState($color) {
        border-color: $color;
        color: darken($color, 20%);
        background-color: lighten($color, 50%);
    }

    @each $state, $color in $taskColors {
        &.#{$state} > .task-content {
            @include taskState($color);
        }
    }

    & > .sub-tasks {
        display: none;
        background: #eee;
        padding: 1em;
        border: 1px solid #bdbdbd;
    }

    &.open {
        & > .task-content {
            border-bottom-width: 0;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
        }

        & > .sub-tasks {
            display: block;
        }
    }
}

.sub-task {
    margin-bottom: 0;
    &:not(:last-child) {
        // Override .task
        margin-bottom: 0;
    }

    & > .task-content {
        border-radius: 0;
        border-bottom-width: 0;
    }
    &:not(.open) {
        &:last-child > .task-content {
            border-bottom-width: $taskBorderWidth;
            border-bottom-left-radius: $taskBorderRadius;
            border-bottom-right-radius: $taskBorderRadius;
        }
        &:first-child > .task-content {
            border-top-width: $taskBorderWidth;
            border-top-left-radius: $taskBorderRadius;
            border-top-right-radius: $taskBorderRadius;
        }
    }
}
</style>
