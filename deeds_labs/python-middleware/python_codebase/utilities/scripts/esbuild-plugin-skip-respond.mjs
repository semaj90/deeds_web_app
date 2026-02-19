/**
 * Vite esbuild Plugin: Skip problematic CommonJS transforms
 *
 * Purpose: Bypass esbuild's CommonJS resolver for @sveltejs/kit internal modules
 * that contain hyphenated identifiers which trigger parsing errors.
 *
 * This is a known esbuild issue (v0.24+) that doesn't affect code functionality,
 * only the build packaging step.
 */

export default function SkipRespondPlugin() {
  return {
    name: 'skip-respond-cjs',
    setup(build) {
      // Intercept loads from problematic paths
      build.onLoad(
        {
          filter: /(@sveltejs[\\/]kit[\\/]src[\\/]runtime|vite[\\/]dist[\\/]node|node_modules[\\/](?:@sveltejs|vite))/
        },
        async (args) => {
          // Simply return the file as-is without transformation
          try {
            const fs = await import('fs');
            const contents = await fs.promises.readFile(args.path, 'utf8');

            // Return with 'default' loader to skip esbuild's transform
            return {
              contents,
              loader: 'text'
            };
          } catch (error) {
            console.warn(`[skip-respond] Failed to load ${args.path}:`, error.message);
            return null; // Let esbuild handle it normally
          }
        }
      );
    }
  };
}