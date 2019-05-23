<template>
  <div :class="[isRoot ? 'tasks' : 'sub-tasks']">
    <TaskListItem
      v-for="id in tasks"
      :key="id"
      :id="id"
      :open-tasks.sync="internalOpenTasks"
    />
    <div
      v-if="isRoot && tasks.length === 0"
      class="bordered-section"
    >
      <EmptyMessage message="No tasks are currently running"/>
    </div>
    <div v-if="isRoot">
      <b-checkbox
        v-model="onlyExportClientTasks"
        :disabled="tasks.length === 0"
        title="Whether only the top level client tasks should be included in the export."
      >Only export client tasks</b-checkbox>
      <ExportButtons
        :generators="exportGenerators"
        :disabled="tasks.length === 0"
        filename="tasks"
      />
    </div>
  </div>
</template>

<script>
import EmptyMessage from '@/components/EmptyMessage.vue';
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { writeJson, unparseCsv, renderTable } from '@/backend/file_utils';
import { taskStates } from '@/store/modules/tasks';
import { exportFormatCodes } from '@/backend/constants';
import { anonymizeClientsInOutput } from '@/backend/client_actions/utils';
import { mapState } from 'vuex';
import { generatePropSyncMixin } from '@/mixins/sync_prop';

function objectWithoutKey(obj, key) {
  const { [key]: deletedKey, ...otherKeys } = obj;
  return otherKeys;
}

/** @type {import('@/backend/constants').ExportFormatCode[]} */
const exportFormats = [exportFormatCodes.TXT, exportFormatCodes.CSV, exportFormatCodes.JSON];

const taskGettersToExport = [
  'hasParent',
  'hasChildren',
  'childStateCounts',
  'complete',
  'progress',
  'progressMax',
];

// FIXME: Cache export values
export default {
  name: 'TaskList',
  components: {
    EmptyMessage,
    // TODO: Find out why this breaks Vetur
    // TaskListItem: () => import(/* webpackChunkName: "task-list-item" */'./TaskListItem.vue'),
    ExportButtons,
  },
  mixins: [
    generatePropSyncMixin('internalOpenTasks', 'openTasks'),
  ],
  props: {
    tasks: {
      type: Array,
      default: () => [],
    },
    isRoot: {
      type: Boolean,
      default: false,
    },
    openTasks: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      onlyExportClientTasks: true,
    };
  },
  computed: {
    exportGenerators() {
      const generators = {};
      for (const format of exportFormats) {
        generators[format] = () => this.getExport(format);
      }
      return generators;
    },
    ...mapState({
      clients: state => Object.values(state.clients.all),
    }),
    anonymizeClientsInExports() {
      return this.$store.state.config.debug.anonymizeClientsInExports;
    },
    exportTaskDuration() {
      return this.$store.state.config.export.taskDuration;
    },
    eolCharacter() {
      return this.$store.state.eol;
    },
  },
  beforeCreate() {
    // TODO: Use async import instead of require
    // eslint-disable-next-line global-require, max-len
    this.$options.components.TaskListItem = require(/* webpackChunkName: "task-list-item" */'./TaskListItem.vue').default;
  },
  methods: {
    getTaskById(id) {
      return this.$store.getters['tasks/getTaskById'](id);
    },
    tasksToJson(ids) {
      const tasks = [];
      for (const id of ids) {
        const task = this.getTaskById(id);

        // Add various getters to the task JSON
        const taskCopy = objectWithoutKey(task, 'children');
        const getters = taskGettersToExport.slice();
        if (this.exportTaskDuration) {
          getters.push('duration');
        }
        for (const getter of getters) {
          taskCopy[getter] = this.$store.getters[`tasks/${getter}`](id);
        }

        // Include children if not only exporting client tasks
        // or, if we are exporting client tasks, only include children of the root task.
        let childrenJson = null;
        if (!this.onlyExportClientTasks || (this.onlyExportClientTasks && taskCopy.isRoot)) {
          childrenJson = this.tasksToJson(task.children);
          taskCopy.children = childrenJson;
          taskCopy.childrenIds = task.children;
        }

        if (this.onlyExportClientTasks && taskCopy.isRoot) {
          // If we are only exporting client tasks, ignore the root task
          tasks.push(...childrenJson);
        } else {
          if (this.anonymizeClientsInExports) {
            taskCopy.title = taskCopy.anonymousTitle;
          }
          delete taskCopy.anonymousTitle;
          tasks.push(taskCopy);
        }
      }
      return tasks;
    },
    getStateEmoji(state) {
      if (state === 'success') {
        return '✔';
      }
      if (state === 'error') {
        return 'X';
      }
      if (state === 'warning') {
        return '!';
      }
      return '?';
    },
    getTextExportMetadata(tasks, indent = 0) {
      const rows = [];
      for (const task of tasks) {
        let childStates = '';
        if (Object.values(taskStates).length > 0) {
          for (const state of Object.values(taskStates)) {
            if (state in task.childStateCounts) {
              const count = task.childStateCounts[state];
              if (count > 0) {
                childStates += `(${this.getStateEmoji(state)} ${count})`;
              }
            }
          }
        }
        const row = {
          indent,
          emoji: this.getStateEmoji(task.state),
          title: task.title,
          childStates,
          error: null,
          children: [],
          isRoot: task.isRoot,
        };
        if (task.error) {
          row.error = task.errorString;
        }
        if (task.duration) row.duration = task.duration;
        if (!this.onlyExportClientTasks && task.children) {
          row.children = this.getTextExportMetadata(task.children, indent + 1);
        }
        rows.push(row);
      }
      return rows;
    },
    getExportTable(tasks) {
      const table = [];
      for (const task of tasks) {
        table.push([
          task.emoji,
          task.title,
          task.childStates,
          task.duration ? task.duration : '',
          task.error ? task.error : '',
        ]);
      }
      return table;
    },
    getTextExportTopLevel(tasks) {
      const table = this.getExportTable(tasks);
      return renderTable(table);
    },
    getTextExportAllLevels(tasks) {
      let string = '';
      for (const task of tasks) {
        for (let i = 0; i < task.indent; i++) {
          string += '|  ';
        }
        string += `${task.emoji} ${task.title} ${task.childStates}`;
        if (task.duration) {
          string += ` | ${task.duration}`;
        }
        if (task.error) {
          string += ` | ${task.error}`;
        }
        string += this.eolCharacter;
        if (task.children.length > 0) {
          string += this.getTextExportAllLevels(task.children);
        }
      }
      return string;
    },
    getTextExport(tasks) {
      if (this.onlyExportClientTasks) {
        return this.getTextExportTopLevel(tasks);
      }
      return this.getTextExportAllLevels(tasks);
    },
    getCsvExport(tasks) {
      const table = this.getExportTable(tasks);
      // TODO: Make this configurable
      table.unshift([
        'State',
        'Title',
        'Child states',
        'Error',
      ]);
      if (this.exportTaskDuration) {
        table[0].splice(3, 0, 'Duration');
      }
      return unparseCsv(table);
    },
    async getExport(format) {
      const tasksJson = this.tasksToJson(this.tasks);
      let output = '';
      if (format === exportFormatCodes.TXT || format === exportFormatCodes.CSV) {
        const tasks = this.getTextExportMetadata(tasksJson);
        if (format === exportFormatCodes.TXT) {
          output = this.getTextExport(tasks);
        } else if (format === exportFormatCodes.CSV) {
          output = this.getCsvExport(tasks);
        }
      } else {
        output = writeJson({
          version: '1',
          tasks: tasksJson,
        });
      }
      if (this.anonymizeClientsInExports) {
        output = anonymizeClientsInOutput(output, this.clients);
      }
      return output;
    },
  },
};
</script>

<style lang="scss">
.tasks:not(:first-child) {
  margin-top: 1rem;
}
</style>
