import { logSynthesisRun } from 'sveltekit-frontend/src/lib/server/observability/synthesis-logger.ts';

// ... (rest of the file content)

// Inside the chat stream endpoint logic, after calling synthesize(query, context):
// ...
// --- Synthesis Step ---
const synthesisResult = await synthesize(query, context);

// --- Memory Logging & Enrichment ---
await logSynthesisRun(runId, synthesisResult.payload, {
  pathMapping: synthesisResult.enrichments?.pathMapping,
  dynamicImports: synthesisResult.enrichments?.dynamicImports,
  runtimeDependencies: synthesisResult.enrichments?.runtimeDependencies,
  routeFlow: synthesisResult.enrichments?.routeFlow,
});
// ...
