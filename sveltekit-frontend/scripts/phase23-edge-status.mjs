#!/usr/bin/env node
/** Read-only local source/asset census. Node builtins only. No network requests. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname, '..');
const files = [
  'src/lib/ai/edge/phase23-edge-model-harness.ts',
  'src/lib/ai/edge/phase23-model-manifest.ts',
  'src/lib/ai/edge/phase23-model-probe.ts',
  'src/lib/ai/edge/phase23-runtime-readiness.ts',
  'src/lib/ai/edge/phase23-agent-repair.ts',
  'src/lib/ai/edge/phase23-validation-status.ts',
  'src/lib/ai/edge/phase23-artifact-integrity.ts',
  'src/lib/ai/onnx/gemma4-e2b-session.ts',
  'scripts/startup/dev-gpu-runtime.mjs',
];
const assets = [
  'static/gemma4_e2b_onnx/model.onnx',
  'static/gemma4_e2b_onnx/tokenizer.json',
  'static/models/gemma4-e2b/model.litertlm',
];
const inventory = (xs) => xs.map(path => {
  const full = resolve(root, path);
  const exists = existsSync(full);
  return { path, exists, bytes: exists && statSync(full).isFile() ? statSync(full).size : null };
});
const report = {
  schema: 'atlas.phase23.edge-status.v1',
  verifiedAt: new Date().toISOString(),
  sourceFiles: inventory(files),
  modelAssets: inventory(assets),
  status: 'NOT_PROVEN',
  reason: 'Source existence and local asset sizes are not proof of browser inference',
  missingGates: ['browser token generation', 'SHA256 hashes', 'runtime identity', 'lifecycle/cancel', 'Eval Gym', 'EmbeddingGemma 2 parity', 'ACP/A2A approvals'],
};
console.log(JSON.stringify(report, null, 2));
for (const asset of report.modelAssets.filter(a => !a.exists)) {
  const url = asset.path.includes('.litertlm')
    ? 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm'
    : 'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX';
  console.log('TODO MODEL_MISSING:', asset.path, '\n  review source:', url);
}
