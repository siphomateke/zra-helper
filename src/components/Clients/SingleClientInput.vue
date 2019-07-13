<template>
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
    <div
      v-if="showNameField"
      class="column"
    >
      <b-field
        :type="$bFieldType('client_name')"
        :message="$bFieldValidationError('client_name')"
        label="Name"
      >
        <b-input
          v-model="client.name"
          name="client_name"
        />
      </b-field>
    </div>
    <div class="column">
      <b-field
        :type="$bFieldType('client_username')"
        :message="$bFieldValidationError('client_username')"
        label="Username"
      >
        <b-input
          v-validate="'required|clientUsername'"
          v-model="client.username"
          name="client_username"
        />
      </b-field>
    </div>
    <div class="column">
      <b-field
        :type="$bFieldType('client_password')"
        :message="$bFieldValidationError('client_password')"
        label="Password"
      >
        <b-input
          v-validate="'required|clientPassword'"
          v-model="client.password"
          name="client_password"
          type="password"
          password-reveal
        />
      </b-field>
    </div>
  </div>
</template>

<script>
import parseAndValidateLoginDetails from '@/validation/rules/loginDetails';
import { objectHasProperties } from '@/utils';

export default {
  name: 'SingleClientInput',
  $_veeValidate: {
    validator: 'new',
  },
  props: {
    value: {
      type: Object,
      default: () => ({
        name: '',
        username: '',
        password: '',
      }),
      validator(value) {
        const keys = ['name', 'username', 'password'];
        const { missing: missingKeys } = objectHasProperties(value, keys);
        if (missingKeys.length > 0) return false;
        for (const key of keys) {
          if (typeof value[key] !== 'string') {
            return false;
          }
        }
        return true;
      },
    },
    showNameField: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      loginDetails: '',
      client: null,
    };
  },
  watch: {
    value: {
      handler(value) {
        this.client = value;
      },
      immediate: true,
    },
    client: {
      handler(value) {
        this.$emit('input', value);
      },
      deep: true,
    },
  },
  methods: {
    updateLoginDetails() {
      const response = parseAndValidateLoginDetails(this.loginDetails);
      if (response.valid) {
        const { name, username, password } = response.data;
        if (name) {
          this.client.name = name;
        } else {
          this.client.name = username;
        }
        this.client.username = username;
        this.client.password = password;
      }
    },
    focus() {
      this.$refs.loginDetailsInput.focus();
      this.$nextTick(() => {
        /** @type {{input: HTMLInputElement}} */
        const { input } = this.$refs.loginDetailsInput.$refs;
        input.setSelectionRange(0, input.value.length);
      });
    },
  },
};
</script>
