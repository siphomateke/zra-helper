<template>
  <div :class="[isRoot ? 'tasks' : 'sub-tasks']">
    <TaskListItem
      v-for="id in tasks"
      :key="id"
      :id="id"/>
    <EmptySection
      v-if="isRoot && tasks.length === 0"
      message="No tasks are currently running"/>
    <div v-if="isRoot">
      <b-checkbox
        v-model="onlyExportTopLevel"
        :disabled="tasks.length === 0"
        title="Whether only the top level tasks should be included in the export.">
        Only export root tasks
      </b-checkbox>
      <ExportButtons
        :generators="exportGenerators"
        :disabled="tasks.length === 0"
        filename="tasks"/>
    </div>
  </div>
</template>

<script>
import EmptySection from '@/components/EmptySection.vue';
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { writeJson } from '@/backend/file_utils';
import { errorToString } from '@/backend/errors';
import { taskStates } from '@/store/modules/tasks';
import renderTable from 'text-table';
import Papa from 'papaparse';
import { exportFormatCodes } from '@/backend/constants';

function objectWithoutKey(obj, key) {
  const { [key]: deletedKey, ...otherKeys } = obj;
  return otherKeys;
}

/** @type {import('@/backend/constants').ExportFormatCode[]} */
const exportFormats = [exportFormatCodes.TXT, exportFormatCodes.CSV, exportFormatCodes.JSON];

// FIXME: Cache export values
export default {
  name: 'TaskList',
  components: {
    EmptySection,
    // TODO: Find out why this breaks Vetur
    // TaskListItem: () => import(/* webpackChunkName: "task-list-item" */'./TaskListItem.vue'),
    ExportButtons,
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
  data() {
    return {
      onlyExportTopLevel: true,
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
    getChildStateCounts(id) {
      return this.$store.getters['tasks/childStateCounts'](id);
    },
    tasksToJson(ids) {
      const tasks = [];
      for (const id of ids) {
        const task = this.getTaskById(id);
        const childStateCounts = this.getChildStateCounts(id);
        const json = this.tasksToJson(task.children);
        const taskCopy = objectWithoutKey(task, 'children');
        taskCopy.children = json;
        taskCopy.childrenIds = task.children;
        taskCopy.childStateCounts = childStateCounts;
        tasks.push(taskCopy);
      }
      return tasks;
    },
    getStateEmoji(state) {
      if (state === 'success') {
        return '✔';
      } else if (state === 'error') {
        return 'X';
      } else if (state === 'warning') {
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
        };
        if (task.error) {
          row.error = errorToString(task.error);
        }
        if (!this.onlyExportTopLevel && task.children) {
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
        if (task.error) {
          string += ` | ${task.error}`;
        }
        string += '\n';
        if (task.children.length > 0) {
          string += this.getTextExportAllLevels(task.children);
        }
      }
      return string;
    },
    getTextExport(tasks) {
      if (this.onlyExportTopLevel) {
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
      return Papa.unparse(table, { quotes: true });
    },
    async getExport(format) {
      const tasksJson = this.tasksToJson(this.tasks);
      if (format === exportFormatCodes.TXT || format === exportFormatCodes.CSV) {
        const tasks = this.getTextExportMetadata(tasksJson);
        if (format === exportFormatCodes.TXT) {
          return this.getTextExport(tasks);
        } else if (format === exportFormatCodes.CSV) {
          return this.getCsvExport(tasks);
        }
      }
      return writeJson(tasksJson);
    },
  },
};
</script>
