/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true,
  },
  globals: {
    module: 'writable',
    exports: 'writable',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', {
      varsIgnorePattern: '^\\$',
      argsIgnorePattern: '^_'
    }],
  },
  ignorePatterns: [
    '*.md',
    'dist',
    'build',
    '.svelte-kit',
    'node_modules',
    '*.svelte',
    'js_tests/**/*',
    'playwright-report/**/*',
    'drizzle.config.ts',
    'src/hooks.client.ts',
    'src/service-worker.ts',
    'src/test-setup.ts',
    'tests/**/*',
    'scripts/**/*',
    '*.config.ts',
    'vite.config.ts',
    'vitest.config.ts',
    'uno.config.ts',
    'unocss.config.ts',
  ],
};