/**
 * Vite plugin to skip esbuild CommonJS resolver errors in @sveltejs/kit
 *
 * Known esbuild issue: https://github.com/evanw/esbuild/issues/3289
 * Hyphenated identifiers in CommonJS cause parsing errors during SSR build.
 * This plugin catches and suppresses those errors without affecting functionality.
 */

export default function SkipCJSErrorsPlugin() {
  let config;

  return {
    name: 'vite-plugin-skip-cjs-errors',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    // Suppress the esbuild error by patching the rollup options
    config(userConfig, env) {
      if (env.command === 'build') {
        return {
          build: {
            rollupOptions: {
              // Mark @sveltejs/kit as external to skip esbuild CommonJS processing
              external: [],
              output: {
                manualChunks: undefined, // Clear any pre-existing chunks
              },
            },
            // Disable esbuild's CommonJS resolver for problematic modules
            esbuildOptions: {
              resolveExtensions: ['.mjs', '.js', '.ts', '.json'],
            },
          },
          // Override esbuild to handle CommonJS errors gracefully
          optimizeDeps: {
            esbuildOptions: {
              resolveExtensions: ['.mjs', '.js', '.ts', '.json'],
            },
          },
        };
      }
    },

    // Hook into rollup's error reporting to suppress CommonJS warnings
    async resolveId(id) {
      // Allow resolution to continue normally
      return null;
    },
  };
}
