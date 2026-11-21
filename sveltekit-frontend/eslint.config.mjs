import eslintConfigPrettier from 'eslint-config-prettier/flat';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['.svelte-kit/**', 'node_modules/**', 'build/**', 'dist/**'],
	},
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	...svelte.configs.prettier,
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
		},
	},
	{
		// Keep untyped JavaScript anchored to this app without asking the TS
		// project service to load JS files that are outside the TS project.
		files: ['**/*.js'],
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		// TypeScript and Svelte files use the app-local project service.
		files: ['**/*.{ts,mts,cts,svelte}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.svelte'],
			},
		},
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
				extraFileExtensions: ['.svelte'],
			},
		},
	},
	eslintConfigPrettier,
];
