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
            :type="fields.loginDetails.type"
            :message="fields.loginDetails.message"
            title="Client login details separated by tabs or commas. The details can either be name, username and password or just username and password."
            label="Login details"
          >
            <!-- eslint-enable max-len -->
            <b-input
              ref="loginDetailsInput"
              v-model="loginDetails"
              @blur="updateLoginDetails"
            />
          </b-field>
        </div>
        <div class="column">
          <b-field
            :type="fields.username.type"
            :message="fields.username.message"
            label="Username"
          >
            <b-input
              v-model="username"
              @blur="onBlurUsername"
            />
          </b-field>
        </div>
        <div class="column">
          <b-field
            :type="fields.password.type"
            :message="fields.password.message"
            label="Password"
          >
            <b-input
              v-model="password"
              type="password"
              password-reveal
              @blur="onBlurPassword"
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
import TaskList from '@/components/TaskList.vue';
import { validateClientUsername, validateClientPassword } from '../backend/client_file_reader';
import { robustLogin } from '@/backend/client_actions/user';
import createTask from '@/transitional/tasks';
import { taskFunction } from '@/backend/client_actions/utils';
import Papa from 'papaparse';
import { clientPropValidationErrorMessages } from '@/backend/constants';

export default {
  name: 'LoginView',
  components: {
    TaskList,
  },
  data() {
    return {
      loginDetails: '',
      username: '',
      password: '',
      fields: {
        loginDetails: {
          type: '',
          message: '',
        },
        username: {
          type: '',
          message: '',
        },
        password: {
          type: '',
          message: '',
        },
      },
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
    showFieldValidation(field, valid, errors) {
      if (!valid) {
        this.fields[field].type = 'is-danger';
        this.fields[field].message = errors.join(', ');
      } else {
        this.fields[field].type = 'is-success';
        this.fields[field].message = '';
      }
    },
    getErrorMessageFromCode(code) {
      if (code in clientPropValidationErrorMessages) {
        return clientPropValidationErrorMessages[code];
      }
      return 'Unknown error';
    },
    validateProperty(prop, validationFunc) {
      const validation = validationFunc(this[prop]);
      const errors = validation.errors.map(code => this.getErrorMessageFromCode(code));
      this.showFieldValidation(prop, validation.valid, errors);
      return validation.valid;
    },
    validateUsername() {
      return this.validateProperty('username', validateClientUsername);
    },
    validatePassword() {
      return this.validateProperty('password', validateClientPassword);
    },
    validateLoginDetails() {
      let valid = true;
      let errorMessage = '';
      const data = {
        name: '',
        username: '',
        password: '',
      };
      if (this.loginDetails) {
        const parsed = Papa.parse(this.loginDetails);
        if (parsed.errors.length > 0) {
          valid = false;
          errorMessage += parsed.errors.map(error => error.message).join(', ');
        } else {
          const fields = parsed.data[0];
          if (fields.length === 2 || fields.length === 3) {
            if (fields.length === 2) {
              [data.username, data.password] = fields;
            } else {
              [data.name, data.username, data.password] = fields;
            }
            if (data.username.length === 0 || data.password.length === 0) {
              valid = false;
              if (data.username.length === 0 && data.password.length === 0) {
                errorMessage = 'Username and password must not be blank.';
              } else if (data.username.length === 0) {
                errorMessage = 'Username must not be blank.';
              } else if (data.password.length === 0) {
                errorMessage = 'Password must not be blank.';
              }
            }
          } else {
            valid = false;
            if (fields.length > 3) {
              errorMessage += 'Too many fields.';
            } else {
              errorMessage += 'Too few fields. Must contain at least a username and password separated by a tab or a comma.';
            }
          }
        }
      }
      this.showFieldValidation('loginDetails', valid, [errorMessage]);
      return {
        valid,
        data,
      };
    },
    onBlurUsername() {
      this.validateUsername();
    },
    onBlurPassword() {
      this.validatePassword();
    },
    updateLoginDetails() {
      const response = this.validateLoginDetails();
      if (this.loginDetails && response.valid) {
        this.username = response.data.username;
        this.password = response.data.password;
        this.validateUsername();
        this.validatePassword();
      }
    },
    validateForm() {
      const validations = [];
      const validationResult = this.validateLoginDetails();
      validations.push(validationResult.valid);
      validations.push(this.validateUsername());
      validations.push(this.validatePassword());
      return !validations.includes(false);
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
      this.updateLoginDetails();
      const valid = this.validateForm();
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
