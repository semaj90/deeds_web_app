import { loadRuntimeEnv } from './lib/server/config/load-runtime-env.js';

// Vitest sets NODE_ENV=test; explicitly use the development env loader so
// import-time runtime contracts see the same local configuration as SvelteKit.
loadRuntimeEnv({ mode: 'development' });

if (!process.env.ROTORQUANT_MODEL_PATH && !process.env.TURBO_MODEL_PATH) {
	process.env.ROTORQUANT_MODEL_PATH = 'C:\\Users\\james\\Videos\\deeds-web-app\\models\\test-stub.gguf';
}
