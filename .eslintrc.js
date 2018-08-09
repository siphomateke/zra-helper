module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es6: true,
    webextensions: true
  },
  'extends': [
    'plugin:vue/recommended',
    '@vue/airbnb'
  ],
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'no-restricted-syntax': ['off']
  },
  parserOptions: {
    parser: 'babel-eslint'
  }
}