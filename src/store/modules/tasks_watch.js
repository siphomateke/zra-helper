import store from '@/store';

// Set task completion time as soon as their 'complete' getter is true.
store.watch(
  (_state, getters) => getters['tasks/completedTasks'],
  (currentCompletedTasks, previousCompletedTasks) => {
    const { calculateTaskDuration } = store.state.config.debug;

    if (calculateTaskDuration) {
      for (const taskId of currentCompletedTasks) {
        if (!previousCompletedTasks.includes(taskId)) {
          store.dispatch('tasks/setTaskCompletionTime', { id: taskId, time: Date.now() });
        }
      }
    }
  },
);
