#!/usr/bin/env node
const moduleUrl = new URL('../../src/lib/server/observability/inference-log.ts', import.meta.url);

const mod = await import(moduleUrl.href);
const stats = typeof mod.getInferenceLogStats === 'function' ? mod.getInferenceLogStats() : null;

console.log(JSON.stringify({
  ok: true,
  exports: {
    logInference: typeof mod.logInference === 'function',
    logLLMInference: typeof mod.logLLMInference === 'function',
    logVectorSearch: typeof mod.logVectorSearch === 'function',
    flushInferenceLog: typeof mod.flushInferenceLog === 'function',
    cleanupOldInferenceLogs: typeof mod.cleanupOldInferenceLogs === 'function',
    getInferenceLogStats: typeof mod.getInferenceLogStats === 'function',
    startInferenceLogCleanup: typeof mod.startInferenceLogCleanup === 'function',
  },
  stats,
}, null, 2));
