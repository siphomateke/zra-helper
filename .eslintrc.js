module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es6: true,
    webextensions: true,
  },
  extends: [
    'plugin:vue/recommended',
    '@vue/airbnb',
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'max-len': ['error', 120],
    'no-restricted-syntax': ['off'],
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-shadow': 'off',
    'vue/prop-name-casing': 'error',
  },
  parserOptions: {
    parser: 'babel-eslint',
  },
};
