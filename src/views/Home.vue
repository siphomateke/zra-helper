<template>
  <div class="home">
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
            <div class="field">
              <label class="label">Select actions</label>
              <div class="control">
                <label class="checkbox">
                  <input
                    type="checkbox"
                    name="actions"
                    value="pending-liabilities">
                  Get all pending liabilites
                </label>
              </div>
            </div>
            <button
              class="button is-primary"
              type="submit">Run selected action(s)</button>
          </form>
        </section>
        <section
          id="log-wrapper"
          class="dashboard-section hidden">
          <h1 class="title is-4">Log</h1>
          <div class="log">
            <div class="log-inner"/>
          </div>
        </section>
        <section class="dashboard-section">
          <h1 class="title is-4">Tasks</h1>
          <div class="tasks"/>
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

export default {
  name: 'Home',
};
</script>
