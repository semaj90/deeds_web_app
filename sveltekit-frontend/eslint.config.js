// ESM-compatible flat config for ESLint 9+
// Works with Svelte 5 (runes), TypeScript 7 (`tsgo`), and Prettier integration.
//
// Canonical 2026 pattern from https://sveltejs.github.io/eslint-plugin-svelte/user-guide/:
//   - projectService: true (auto-discovers tsconfigs, supports tsconfig lib: es2024+)
//   - ts.parser as the script-block parser inside .svelte files
//   - .svelte / .svelte.ts / .svelte.js globs for Svelte 5 rune files
//   - svelteConfig forwarded from svelte.config.js
//
// Why three lanes:
//   1. SVELTE  — uses svelte-eslint-parser delegating script to ts.parser
//   2. TYPED   — pure .ts under src/, type-aware via projectService
//   3. UNTYPED — Node scripts (.mjs/.cjs) outside tsconfig; project: null forces
//                syntax-only parsing so 307 build/CI scripts don't break linting

import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import svelteConfig from './svelte.config.js';

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

  // ── SVELTE LANE — Svelte 5 components + rune files ─────────────────────
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
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

  // ── TYPED LANE — pure TypeScript covered by tsconfig.json ──────────────
  {
    files: ['**/*.ts', 'src/**/*.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: sharedRules,
  },

  // ── UNTYPED LANE — Node scripts (.mjs/.cjs/standalone .js) ────────────
  // 307 build/CI/dev scripts. project:null forces syntax-only parsing so
  // typescript-eslint doesn't demand they appear in tsconfig.
  {
    files: ['**/*.{mjs,cjs}', 'scripts/**/*.js'],
    languageOptions: {
      parserOptions: { project: null },
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

  // ── IGNORES ─────────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules',
      '.svelte-kit',
      'build',
      'dist',
      'coverage',
      '**/*.config.*',
      'src/proto/*.js',
      'src/proto/**/*.js',
      'src/service-worker.ts',
      'src/tests/**',
      '**/*.d.ts',
      'static/**',
    ],
  },
);
