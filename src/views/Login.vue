<template>
  <div>
    <form
      class="login-form"
      @submit.prevent="submit"
    >
      <div class="columns">
        <div class="column">
          <!-- eslint-disable max-len -->
          <b-field
            :type="$bFieldType('login_details')"
            :message="$bFieldValidationError('login_details')"
            title="Client login details separated by tabs or commas. The details can either be name, username and password or just username and password."
            label="Login details"
          >
            <!-- eslint-enable max-len -->
            <b-input
              v-validate="'loginDetails'"
              ref="loginDetailsInput"
              v-model="loginDetails"
              name="login_details"
              @input="updateLoginDetails"
            />
          </b-field>
        </div>
        <div class="column">
          <b-field
            :type="$bFieldType('username')"
            :message="$bFieldValidationError('username')"
            label="Username"
          >
            <b-input
              v-validate="'required|clientUsername'"
              v-model="username"
              name="username"
            />
          </b-field>
        </div>
        <div class="column">
          <b-field
            :type="$bFieldType('password')"
            :message="$bFieldValidationError('password')"
            label="Password"
          >
            <b-input
              v-validate="'required|clientPassword'"
              v-model="password"
              name="password"
              type="password"
              password-reveal
            />
          </b-field>
        </div>
      </div>
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
import TaskList from '@/components/tasks/TaskList.vue';
import { robustLogin } from '@/backend/client_actions/user';
import createTask from '@/transitional/tasks';
import { taskFunction } from '@/backend/client_actions/utils';
import parseAndValidateLoginDetails from '@/validation/rules/loginDetails';

export default {
  name: 'LoginView',
  $_veeValidate: {
    validator: 'new',
  },
  components: {
    TaskList,
  },
  data() {
    return {
      loginDetails: '',
      username: '',
      password: '',
      tasks: [],
    };
  },
  activated() {
    this.$refs.loginDetailsInput.focus();
    this.$nextTick(() => {
      /** @type {{input: HTMLInputElement}} */
      const { input } = this.$refs.loginDetailsInput.$refs;
      input.setSelectionRange(0, input.value.length);
    });
  },
  methods: {
    updateLoginDetails() {
      const response = parseAndValidateLoginDetails(this.loginDetails);
      if (response.valid) {
        this.username = response.data.username;
        this.password = response.data.password;
      }
    },
    async login() {
      const task = await createTask(this.$store, {
        title: `Login client ${this.username}`,
        list: 'login',
      });
      this.tasks.push(task.id);
      await taskFunction({
        task,
        func: () => robustLogin({
          client: {
            name: this.username,
            username: this.username,
            password: this.password,
          },
          parentTaskId: task.id,
          keepTabOpen: true,
          closeOnErrors: false,
          maxAttempts: this.$store.state.config.maxLoginAttempts,
        }),
      });
    },
    async submit() {
      const valid = await this.$validator.validateAll();
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
