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
