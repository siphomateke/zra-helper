<template>
  <div>
    <b-message
      :active="showWarning"
      type="is-warning"
      title="Warning"
      has-icon
      icon-size="small"
      @close="warningDismissed"
    >Running this may interfere with tasks elsewhere such as those in the Dashboard.</b-message>
    <b-field
      :type="fileUploadFieldType"
      :message="fileUploadFieldMessage"
      label="Tasks JSON"
    >
      <FileUpload @input="fileUploaded"/>
    </b-field>
    <b-loading
      :active="importing || configIsLoading"
      is-full-page
    />
    <TaskList
      :tasks="tasks"
      :is-root="true"
    />
  </div>
</template>

<script>
import FileUpload from '@/components/BaseFileUpload.vue';
import TaskList from '@/components/tasks/TaskList.vue';
import { loadFile, getExtension } from '@/backend/file_utils';
import configMixin from '@/mixins/config';

// FIXME: Keep this in sync with the actual task properties somehow.
const jsonTaskProperties = [
  'title',
  'id',
  'status',
  'state',
  'progress',
  'progressMax',
  'indeterminate',
  'complete',
  'error',
  'errorString',
  'parent',
  'unknownMaxProgress',
  'sequential',
  'autoUpdateParent',
  'isRoot',
];

function getTasksObjectFromJson(version, jsonTasks, allTasks = {}) {
  for (const jsonTask of jsonTasks) {
    const taskState = {};
    if (version > 0) {
      jsonTaskProperties.push(...['startedAt', 'completedAt', 'duration']);
    }
    for (const property of jsonTaskProperties) {
      if (property in jsonTask) {
        taskState[property] = jsonTask[property];
      }
    }
    if ('childrenIds' in jsonTask && Array.isArray(jsonTask.children)) {
      taskState.children = jsonTask.childrenIds;
    } else {
      taskState.children = [];
    }
    allTasks[taskState.id] = taskState;
    if ('children' in jsonTask && Array.isArray(jsonTask.children)) {
      getTasksObjectFromJson(version, jsonTask.children, allTasks);
    }
  }
  return allTasks;
}

// FIXME: Make this not inefere with tasks in the dashboard.
export default {
  name: 'TaskViewerView',
  components: {
    FileUpload,
    TaskList,
  },
  mixins: [configMixin],
  data() {
    return {
      taskListName: 'taskViewer',
      importedTasks: {},
      imported: false,
      importSuccess: false,
      errorMessage: null,
      importing: false,
    };
  },
  computed: {
    tasks() {
      return this.$store.state.tasks.taskViewer;
    },
    importedTaskCount() {
      return Object.keys(this.importedTasks).length;
    },
    fileUploadFieldType() {
      if (this.imported) {
        return this.importSuccess ? 'is-success' : 'is-danger';
      }
      return '';
    },
    fileUploadFieldMessage() {
      if (this.imported) {
        if (this.importSuccess) {
          return `Successfully imported ${this.importedTaskCount} task(s).`;
        }
        return this.errorMessage;
      }
      return 'Select a previously exported tasks JSON file to view it visually';
    },
    showWarning() {
      return !this.configIsLoading && !this.$store.state.config.dismissed.taskViewerWarning;
    },
  },
  async created() {
    await this.loadConfig();
  },
  methods: {
    async createTasksFromJson(json) {
      let version = null;
      let jsonTasks = null;
      if (Array.isArray(json)) {
        version = 0;
        jsonTasks = json;
      } else if (typeof json === 'object' && 'version' in json) {
        version = Number(json.version);
        jsonTasks = json.tasks;
      }
      if (version === null) throw new Error('Unrecognized tasks JSON version.');

      // Clear tasks from last import
      this.$store.commit('tasks/clearList', { name: this.taskListName });
      this.$store.commit('tasks/removeTasks', { ids: Object.keys(this.importedTasks) });

      const tasks = getTasksObjectFromJson(version, jsonTasks);
      this.importedTasks = tasks;

      // Fix tasks with invalid parents
      for (const task of Object.values(tasks)) {
        if (typeof task.parent === 'number' && !(task.parent in tasks)) {
          task.parent = null;
        }
      }

      this.$store.commit('tasks/batchCreate', tasks);
      for (const task of Object.values(tasks)) {
        if (typeof task.parent !== 'number') {
          this.$store.commit('tasks/addToList', { id: task.id, name: this.taskListName });
        }
      }
    },
    async fileUploaded(file) {
      this.importing = true;
      try {
        const ext = getExtension(file.name);
        if (ext !== 'json') {
          throw new Error(`Tasks file must be a JSON file. The uploaded file's extension was '.${ext}' instead of '.json'.`);
        }
        const text = await loadFile(file);
        await this.createTasksFromJson(JSON.parse(text));
        this.importSuccess = true;
        this.errorMessage = null;
      } catch (error) {
        this.importSuccess = false;
        this.errorMessage = error.toString();
        this.$dialog.alert({
          title: 'Error importing tasks',
          message: this.errorMessage,
          type: 'is-danger',
          hasIcon: true,
        });
      } finally {
        this.imported = true;
        this.importing = false;
      }
    },
    warningDismissed() {
      this.$store.dispatch('config/set', {
        dismissed: {
          taskViewerWarning: true,
        },
      });
      this.$store.dispatch('config/save');
    },
  },
};
</script>
