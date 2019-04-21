<template>
  <div
    :class="[
      state,
      {'open': open},
      hasParent ? 'task sub-task' : 'task',
      {'has-children': hasChildren}]"
  >
    <div
      class="task-content"
      @click="showChildren"
    >
      <div class="header">
        <div class="title is-6">
          <b-icon
            v-if="hasChildren"
            :icon="open ? 'caret-down' : 'caret-right'"
            size="is-small"
          />
          <span>{{ title }}</span>
        </div>
        <div class="header-right">
          <div
            ref="taskButtons"
            class="task-buttons"
          >
            <template v-if="hasChildren">
              <button
                class="button is-small is-hover-button"
                type="button"
                title="Collapse all descendants"
                @click="collapseAllTasks"
              >
                <b-icon
                  icon="minus-square"
                  pack="fas"
                />
              </button>
              <button
                class="button is-small is-hover-button"
                type="button"
                title="Expand all descendants"
                @click="expandAllTasks"
              >
                <b-icon
                  icon="plus-square"
                  pack="fas"
                />
              </button>
            </template>
          </div>
          <span
            v-if="calculateTaskDuration && complete"
            :title="duration === null ? unknownDurationMessage : ''"
            class="task-duration"
          >{{ duration !== null ? duration : 'Unknown duration' }}</span>
          <div
            :title="childStateString"
            class="subtasks-info"
          >
            <span
              v-for="(count, state) in childStateCounts"
              :key="state"
              :class="state"
              class="item"
            >
              <b-icon
                :icon="getStateIcon(state)"
                size="is-small"
              />
              <span class="count">{{ count }}</span>
            </span>
          </div>
        </div>
      </div>
      <div
        v-show="messages"
        class="messages"
      >
        {{ messages }}
      </div>
      <Progress
        :value="progress"
        :max="progressMax"
        :complete="complete"
        :hide-on-complete="true"
        :indeterminate="indeterminate"
        :state="state"
        size="is-small"
      />
      <DownloadPills
        v-if="downloadIds.length > 0"
        :download-ids="downloadIds"
      />
    </div>
    <TaskList
      v-if="hasChildren && open"
      :tasks="children"
      :open-tasks.sync="internalOpenTasks"
    />
  </div>
</template>

<script lang="ts">
import { mapGetters } from 'vuex';
import { mapGettersById, mapProperties } from '@/store/helpers';
import { TaskState } from '@/store/modules/tasks';
import TaskList from './TaskList.vue';
import Progress from '@/components/BaseProgress.vue';
import { generatePropSyncMixin } from '@/mixins/sync_prop';
import DownloadPills from './DownloadPills.vue';

export const stateIcons = {
  [TaskState.ERROR]: 'exclamation-circle',
  [TaskState.WARNING]: 'exclamation-triangle',
  [TaskState.SUCCESS]: 'check-circle',
};

// TODO: Improve details button
export default {
  name: 'TaskListItem',
  components: {
    TaskList,
    Progress,
    DownloadPills,
  },
  mixins: [
    generatePropSyncMixin('internalOpenTasks', 'openTasks'),
  ],
  props: {
    id: {
      type: Number,
      default: null,
    },
    openTasks: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      unknownDurationMessage: 'Duration is unknown. The "Measure task duration" setting must be enabled before the tasks are run for their duration to be computed.',
    };
  },
  computed: {
    ...mapGetters('tasks', [
      'getTaskById',
    ]),
    ...mapGettersById('tasks', [
      'childStateCounts',
      'childStateString',
      'hasParent',
      'hasChildren',
      'progress',
      'progressMax',
      'complete',
      'duration',
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
      'isRoot',
      'downloadIds',
    ]),
    // TODO: Remove this if it is no longer needed.
    TaskState: () => TaskState,
    messages() {
      return this.errorString ? this.errorString : this.status;
    },
    open: {
      get() {
        return this.internalOpenTasks.includes(this.id);
      },
      set(value) {
        this.setTaskOpenState(this.id, value);
      },
    },
    calculateTaskDuration() {
      return this.$store.state.config.debug.calculateTaskDuration;
    },
  },
  created() {
    // Expand the root task by default
    if (this.isRoot) {
      this.open = true;
    }
  },
  methods: {
    getStateIcon(state) {
      return stateIcons[state];
    },
    showChildren({ target }) {
      // Don't do anything if this was triggered by clicking a button within the task
      if (this.$refs.taskButtons.contains(target)) return;

      if (this.hasChildren) {
        this.open = !this.open;
      }
    },
    setTaskOpenState(id, open) {
      const index = this.internalOpenTasks.indexOf(id);
      const taskIsOpen = index > -1;
      if (open) {
        if (!taskIsOpen) {
          this.internalOpenTasks.push(id);
        }
      } else if (taskIsOpen) {
        this.internalOpenTasks.splice(index, 1);
      }
    },
    setChildrenOpenState(parentTask, state) {
      if (parentTask.children.length > 0) {
        this.setTaskOpenState(parentTask.id, state);
        for (const childTaskId of parentTask.children) {
          const task = this.getTaskById(childTaskId);
          this.setChildrenOpenState(task, state);
        }
      }
    },
    setExpandAllState(state) {
      this.setChildrenOpenState(this, state);
    },
    expandAllTasks() {
      this.setExpandAllState(true);
    },
    collapseAllTasks() {
      this.setExpandAllState(false);
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
      align-items: center;
      line-height: 1.125;

      .title {
        margin-bottom: 0;
      }

      .header-right {
        margin-left: auto;
        display: flex;
      }

      .subtasks-info {
        display: flex;
        white-space: nowrap;
        .item .count {
          padding-left: 0.2em;
        }
        .item:not(:last-child) {
          padding-right: 0.5em;
        }
        @each $state, $color in $taskColors {
          .#{$state} .icon {
            color: $color;
          }
        }
      }
      .task-duration {
        padding-right: 0.5rem;
      }
      .task-buttons {
        display: none;
        margin-left: auto;
        padding-right: 0.5rem;
        height: 1em;

        .button {
          margin-top: -0.375rem;
        }
      }
    }
  }

  &.has-children > .task-content {
    cursor: pointer;

    &:hover .task-buttons {
      display: flex;
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
    display: block;
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
