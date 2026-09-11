#!/usr/bin/env node
/**
 * Read-only/static VLM owner audit.
 *
 * Proves the active Docling and TensorRT fallback surfaces target the
 * workstation Ornith 1.5 llama.cpp VLM rather than Ollama/Gemma4. Historical
 * Ollama files are intentionally outside this active-surface audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const surfaces = {
  doclingDockerfile: 'docker/docling-vlm/Dockerfile',
  doclingWrapper: 'docker/docling-vlm/app_ornith.py',
  doclingClient: 'docker/docling-vlm/ornith_vlm_client.py',
  tensorRtRoute: 'sveltekit-frontend/src/routes/api/ai/tensorrt/vlm/+server.ts',
  launcher: 'scripts/launch-turboquant.ps1',
  proof: 'docs/reports/ornith-vlm-mmproj-01-proof-v1.json',
};

const text = Object.fromEntries(Object.entries(surfaces).map(([key, rel]) => [key, read(rel)]));
const executableText = (value) => value
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/^\s*#.*$/gm, '')
  .replace(/'''[\s\S]*?'''/g, '')
  .replace(/"""[\s\S]*?"""/g, '');
const activeDoclingClient = executableText(text.doclingClient);
const activeTensorRtRoute = executableText(text.tensorRtRoute);
const checks = [
  ['docling_entrypoint_is_ornith', /uvicorn\",\s*\"app_ornith:app/.test(text.doclingDockerfile)],
  ['docling_client_targets_8090', /host\.docker\.internal:8090\/v1/.test(text.doclingClient)],
  ['docling_client_uses_openai_multimodal', /image_url/.test(text.doclingClient) && /chat\/completions/.test(text.doclingClient)],
  ['docling_active_wrapper_has_no_ollama', !/ollama/i.test(text.doclingWrapper) || /historical Ollama/.test(text.doclingWrapper)],
  ['docling_client_has_no_ollama', !/ollama/i.test(activeDoclingClient)],
  ['tensorrt_fallback_has_no_ollama', !/ollama/i.test(activeTensorRtRoute)],
  ['tensorrt_fallback_requires_ornith', /ornith-1\.5/.test(text.tensorRtRoute)],
  ['tensorrt_fallback_requires_vision_prop', /modalities\?\.vision|modalities\.vision/.test(text.tensorRtRoute)],
  ['launcher_has_ornith_vlm_profile', /ornith-1\.5-vlm/.test(text.launcher)],
  ['launcher_family_keys_mmproj', /ORNITH_MMPROJ_PATH/.test(text.launcher)],
  ['live_vlm_proof_exists', /"gateStatus"\s*:\s*"LIVE_GET_PROVEN"/.test(text.proof)],
  ['live_proof_no_gemma_fallback', /"noFallbackToGemma4"\s*:\s*true/.test(text.proof)],
];

const failed = checks.filter(([, pass]) => !pass).map(([name]) => name);
const result = {
  schema: 'atlas.ornith-vlm-owner-audit.v1',
  readOnly: true,
  activeVlmOwner: 'ornith-1.5-vlm',
  endpoint: 'http://127.0.0.1:8090/v1',
  provider: 'llama.cpp',
  ollamaRole: 'EMBEDDING_FALLBACK_ONLY_OUTSIDE_VLM_AUDIT',
  defaultDevGpuVisionMode: 'EXPLICIT_SWITCH_REQUIRED',
  explicitVisionCommand: 'pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/launch-ornith-vlm.ps1',
  checks: Object.fromEntries(checks),
  failed,
  status: failed.length === 0 ? 'ORNITH_VLM_OWNER_STATICALLY_PROVEN' : 'ORNITH_VLM_OWNER_AUDIT_FAILED',
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
