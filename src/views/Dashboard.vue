<template>
  <div id="dashboard">
    <section class="hero is-primary is-bold is-small">
      <div class="hero-body">
        <div class="container">
          <h1 class="title">
            ZRA Helper
          </h1>
          <h2 class="subtitle">
            Dashboard
          </h2>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="dashboard container">
        <section class="dashboard-section">
          <form id="action-form">
            <div class="field">
              <label class="label">Client list</label>
              <div class="control">
                <input
                  id="clientList"
                  type="file"
                  name="clientList">
              </div>
            </div>
            <div
              id="actions-field"
              class="field">
              <label class="label">Select actions</label>
            </div>
            <button
              class="button is-primary"
              type="submit">Run selected action(s)</button>
          </form>
        </section>
        <section
          id="log-wrapper"
          class="dashboard-section">
          <h1 class="title is-4">Log</h1>
          <log/>
        </section>
        <section class="dashboard-section">
          <h1 class="title is-4">Tasks</h1>
          <task-list
            :tasks="tasks"
            :is-root="true"/>
        </section>
        <section class="dashboard-section">
          <h1 class="title is-4">Output</h1>
          <textarea
            id="output"
            rows="7"/>
        </section>
      </div>
    </section>
  </div>
</template>

<script>
import TaskList from '@/components/TaskList.vue';
import Log from '@/components/Log.vue';
import { mapState } from 'vuex';

export default {
  name: 'Dashboard',
  components: {
    TaskList,
    Log,
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.all,
    }),
  },
};
</script>
