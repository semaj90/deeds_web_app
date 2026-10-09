import type { EdgeEngine, EdgeModelIdentity } from './phase23-edge-model-harness.js';
/** EDGE-06 admission adapter. No package import before pinned version/API review. */
export interface PinnedLitertBridge {
  readonly runtimeVersion: string;
  load(modelUrl: string, signal: AbortSignal): Promise<void>;
  generate(prompt: string, signal: AbortSignal): Promise<{ text: string; tokenCount: number }>;
  dispose(): Promise<void>;
}
export function makeLitertEngine(bridge: PinnedLitertBridge, config: {
  modelUrl: string; pinnedRuntimeVersion: string; pinnedModelRevision: string;
}): EdgeEngine {
  if (!config.modelUrl.startsWith('/') || config.modelUrl.includes('..')) throw new Error('local model URL required');
  if (config.pinnedRuntimeVersion === 'UNPINNED' || config.pinnedModelRevision === 'UNPINNED' || !config.pinnedRuntimeVersion || !config.pinnedModelRevision) throw new Error('pinned versions required');
  if (bridge.runtimeVersion !== config.pinnedRuntimeVersion) throw new Error('LiteRT runtime revision mismatch');
  return {
    async load(identity: EdgeModelIdentity, signal) {
      if (identity.modelRevision !== config.pinnedModelRevision || identity.runtimeRevision !== config.pinnedRuntimeVersion) throw new Error('model/runtime identity mismatch');
      if (signal.aborted) throw new Error('load aborted');
      await bridge.load(config.modelUrl, signal);
    },
    async generate(prompt, signal) { if (signal.aborted) throw new Error('generate aborted'); return bridge.generate(prompt, signal); },
    async dispose() { await bridge.dispose(); },
  };
}
// TODO(EDGE-06): implement PinnedLitertBridge against *verified* @litert-lm/core JS version/API.
// TODO: worker isolation, token counts from actual tokenizer and no automatic asset fetch.
