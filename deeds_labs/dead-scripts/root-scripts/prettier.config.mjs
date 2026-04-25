/** @type {import("prettier").Config} */
export default {
  // --- Base formatting rules ---
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  endOfLine: 'lf',

  // --- Plugins ---
  plugins: [
    'prettier-plugin-svelte',
    'prettier-plugin-tailwindcss', // works fine with UnoCSS
  ],
  pluginSearchDirs: ['.'],

  // --- Svelte 5 (runes) support ---
  overrides: [
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',
        svelteSortOrder: 'scripts-markup-styles',
        svelteStrictMode: true,
        svelteBracketNewLine: true,
        svelteAllowShorthand: true,
        svelteIndentScriptAndStyle: true,
        svelteExperimentalRunes: true, // ✅ enables $state, $derived, etc.
      },
    },
  ],

  // --- Experimental language features ---
  experimentalTernaries: true,
};
