module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es6: true,
    webextensions: true,
    jest: true,
  },
  extends: [
    'plugin:vue/recommended',
    '@vue/airbnb',
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-restricted-syntax': ['off'],
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-shadow': 'off',
    'vue/prop-name-casing': 'error',
  },
  overrides: [
    {
      files: ['*.vue'],
      rules: {
        indent: 'off',
        'vue/script-indent': ['error', 2, { baseIndent: 0 }],
      },
    },
  ],
  parserOptions: {
    parser: 'babel-eslint',
  },
};
