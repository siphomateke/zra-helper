<template>
  <div>
    <form
      class="login-form"
      @submit.prevent="submit"
    >
      <SingleClientInput
        ref="singleClient"
        v-model="client"
      />
      <button
        class="button is-primary"
        type="submit"
      >Login</button>
    </form>
    <TaskList
      :tasks="tasks"
      :is-root="true"
    />
  </div>
</template>

<script>
import SingleClientInput from '@/components/Clients/SingleClientInput.vue';
import TaskList from '@/components/tasks/TaskList.vue';
import { robustLogin } from '@/backend/client_actions/user';
import createTask from '@/transitional/tasks';
import { taskFunction } from '@/backend/client_actions/utils';

export default {
  name: 'LoginView',
  components: {
    SingleClientInput,
    TaskList,
  },
  data() {
    return {
      client: {
        name: '',
        username: '',
        password: '',
      },
      tasks: [],
    };
  },
  activated() {
    this.$refs.singleClient.focus();
  },
  methods: {
    async login() {
      const task = await createTask(this.$store, {
        title: `Login client ${this.client.name}`,
        list: 'login',
      });
      this.tasks.push(task.id);
      await taskFunction({
        task,
        func: () => robustLogin({
          client: this.client,
          parentTaskId: task.id,
          keepTabOpen: true,
          closeOnErrors: false,
          maxAttempts: this.$store.state.config.maxLoginAttempts,
        }),
      });
    },
    async submit() {
      const validator = this.$refs.singleClient.$validator;
      const valid = await validator.validateAll();
      if (valid) {
        await this.login();
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.login-form {
  margin-bottom: 1rem;
}
</style>
