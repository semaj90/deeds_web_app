import { loadRuntimeEnv } from './lib/server/config/load-runtime-env.js';

// Vitest sets NODE_ENV=test; explicitly use the development env loader so
// import-time runtime contracts see the same local configuration as SvelteKit.
loadRuntimeEnv({ mode: 'development' });
