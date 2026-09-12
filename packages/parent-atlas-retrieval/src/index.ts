// Parent Atlas Retrieval Package — portable package surface.
// Application-owned retrieval orchestration (TurboVec/Qdrant/DB/workers) remains in SvelteKit.

export * from './bifrost/index.js';
export * from './crossencoder/index.js';
export * from './gpu/index.js';

// Export native addon path for manual loading.
export const NATIVE_ADDON_PATH = new URL('../native/tensorrt_bridge.node', import.meta.url).pathname;
