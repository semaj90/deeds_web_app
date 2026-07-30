// Repo-root ESLint flat config.
// Covers the SvelteKit frontend plus repo-level Atlas scripts so out-of-tree
// .mts files are not treated as ignored when linted from the frontend workspace.

import { createRequire } from 'node:module';
import svelteConfig from './sveltekit-frontend/svelte.config.js';

const require = createRequire(new URL('./sveltekit-frontend/package.json', import.meta.url));
const js = require('@eslint/js');
const ts = require('typescript-eslint');
const svelte = require('eslint-plugin-svelte');
const prettier = require('eslint-config-prettier');

const sharedRules = {
  'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
  'no-undef': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'off',
  'svelte/no-at-html-tags': 'off',
};

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,

  // Svelte 5 components + rune files.
  {
    files: ['sveltekit-frontend/**/*.svelte', 'sveltekit-frontend/**/*.svelte.ts', 'sveltekit-frontend/**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
    rules: sharedRules,
  },

  // Typed frontend TypeScript.
  {
    files: ['sveltekit-frontend/**/*.{ts,mts,cts}', 'sveltekit-frontend/src/**/*.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },

  // Untyped frontend Node scripts.
  {
    files: ['sveltekit-frontend/**/*.{mjs,cjs}', 'sveltekit-frontend/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { project: null, ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Repo-level Atlas scripts are linted from the frontend workspace too.
  {
    files: ['scripts/**/*.{mjs,mts,cts,js}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { project: null, ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Ignore generated or unrelated artifacts.
  {
    ignores: [
      '**/node_modules',
      'sveltekit-frontend/.svelte-kit',
      'sveltekit-frontend/build',
      'sveltekit-frontend/dist',
      'sveltekit-frontend/coverage',
      'sveltekit-frontend/**/src/proto/*.js',
      'sveltekit-frontend/**/src/proto/**/*.js',
      'sveltekit-frontend/src/service-worker.ts',
      'sveltekit-frontend/src/tests/**',
      'sveltekit-frontend/**/*.d.ts',
      'sveltekit-frontend/static/**',
      '**/*.config.*',
    ],
  },
);
