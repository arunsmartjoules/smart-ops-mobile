// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // This codebase intentionally re-exports services/logger as BOTH a default
      // and a same-named named export (e.g. `export const logger; export default logger`).
      // The default imports are correct, so this rule is pure noise here.
      'import/no-named-as-default': 'off',
    },
  },
]);
