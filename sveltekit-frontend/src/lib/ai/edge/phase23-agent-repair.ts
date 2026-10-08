import type { AssetProbeResult } from './phase23-model-probe.js';
/** ACP/A2A-safe descriptive payload. NO filesystem writes, external URLs fetches, or agent tool invocations. */
export interface EdgeRepairTaskV1 {
  schema: 'atlas.edge-model-repair.v1';
  taskId: string;
  action: 'REVIEW_MISSING_MODEL' | 'VERIFY_MODEL_ARTIFACT' | 'INVESTIGATE_PROBE';
  status: 'NEEDS_HUMAN_APPROVAL';
  evidence: { code: string; localUrl: string; sourceUrl: string; observed: string };
  instructions: readonly string[];
}
export function toRepairTask(result: AssetProbeResult): EdgeRepairTaskV1 | null {
  if (result.repairCode === 'NONE') return null;
  const action = result.repairCode === 'ASSET_MISSING' ? 'REVIEW_MISSING_MODEL'
    : result.repairCode === 'ASSET_UNVERIFIED' ? 'VERIFY_MODEL_ARTIFACT' : 'INVESTIGATE_PROBE';
  return {
    schema: 'atlas.edge-model-repair.v1',
    taskId: 'edge-asset:' + encodeURIComponent(result.assetId),
    action,
    status: 'NEEDS_HUMAN_APPROVAL',
    evidence: { code: result.repairCode, localUrl: result.localUrl, sourceUrl: result.sourceUrl, observed: result.message },
    instructions: [
      'Validate model family, license, exact upstream revision and SHA256 with an authorized operator.',
      'Check local static asset path and tokenizer/engine compatibility.',
      'Do not download, replace services, or change canonical embeddings automatically.',
      'After approval, re-probe and issue revision-qualified Eval Gym evidence.',
    ],
  };
}
