<template>
  <div
    :class="[
      state,
      open ? 'open' : '',
      hasParent ? 'task sub-task' : 'task',
      complete ? 'complete' : '']">
    <div class="task-content">
      <div class="header">
        <div class="title is-6">{{ title }}</div>
        <div
          :title="childStateString"
          class="subtasks-info">
          <span
            v-for="(count, state) in childStateCounts"
            :key="state"
            :class="state"
            class="item">
            <span class="icon">
              <i
                :class="getStateIcon(state)"
                class="fas"/>
            </span>
            <span class="count">{{ count }}</span>
          </span>
        </div>
      </div>
      <div
        v-show="status"
        class="status">{{ status }}</div>
      <Progress
        v-if="progress !== -2"
        :value="progress"
        :max="progressMax"
        :complete="complete"
        :hide-on-complete="true"
        type="is-info"/>
      <button
        v-if="hasChildren"
        type="button"
        class="button open-details"
        @click="showChildren()">
        <span class="icon">
          <i class="fas fa-caret-right closed-icon"/>
          <i class="fas fa-caret-down open-icon"/>
        </span>
        Details
      </button>
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
  [taskStates.ERROR]: 'fa-exclamation-circle',
  [taskStates.WARNING]: 'fa-exclamation-triangle',
  [taskStates.SUCCESS]: 'fa-check-circle',
};

// TODO: Improve details button
// FIXME: Make indeterminate progress bar. Can't at the moment due
// to vue.js not having a way to remove attributes
// TODO: Interpolate progress
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
      'children',
    ]),
    taskStates: () => taskStates,
  },
  methods: {
    getStateIcon(state) {
      return stateIcons[state];
    },
    showChildren() {
      this.open = !this.open;
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

    & > .task-content {
        background: rgb(245, 245, 245);
        border: $taskBorderWidth solid rgb(139, 139, 139);
        border-radius: $taskBorderRadius;
        border-left-width: 5px;
        padding: 0.5em;
        .header {
            display: flex;
            .title {
                margin-bottom: 0.2em;
            }

            .subtasks-info {
                margin-left: auto;
                display: flex;
                white-space: nowrap;
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

        progress {
            width: 100%;
        }

        .open-details .icon {
            white-space: nowrap;
            padding-right: 0.5em;
            .closed-icon {
                display: inline-block;
            }
            .open-icon {
                display: none;
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

    &.complete > .task-content progress {
        display: none;
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

            .open-details .icon {
                .closed-icon {
                    display: none;
                }
                .open-icon {
                    display: inline-block;
                }
            }
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
