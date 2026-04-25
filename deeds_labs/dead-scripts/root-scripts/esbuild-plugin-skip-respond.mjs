/**
 * esbuild plugin to skip problematic @sveltejs/kit/src/runtime/server/respond.js
 * This file has a CommonJS issue with esbuild but is not critical for builds
 */
export const skipRespondPlugin = {
  name: 'skip-respond',
  setup(build) {
    build.onResolve({ filter: /@sveltejs\/kit.*respond\.js/ }, (args) => {
      return {
        path: args.path,
        namespace: 'skip',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'skip' }, () => {
      return {
        contents: 'module.exports = {};',
        loader: 'js',
      };
    });
  },
};
