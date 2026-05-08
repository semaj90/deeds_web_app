#!/usr/bin/env node
/**
 * submit-workflow-smoke.mjs
 *
 * Optional smoke for the ComfyUI HTTP bridge — submits a real
 * workflow_api.json (exported from ComfyUI Desktop via "Save (API
 * Format)") to /prompt and prints the prompt_id. One optional poll of
 * /history is included so the operator sees status without writing a
 * full waitForCompletion loop.
 *
 * The default path is `scripts/comfyui/workflows/dev-workflow-api.json`,
 * which is .gitkeep-only by convention — the operator drops their own
 * exported workflow there. Missing file → skipped (exit 0); --strict
 * promotes skips to exit 1.
 *
 * Hard gates (do NOT relax):
 *   • No model downloads
 *   • No node-pack installs
 *   • No output processing (no GLB / image fetch / decode)
 *   • No DB writes
 *   • No RabbitMQ publishes
 *   • Does NOT require the SvelteKit dev server — uses tsx to import
 *     the ComfyUIClient directly
 *
 * Usage:
 *   npm run comfyui:submit-smoke
 *   npm run comfyui:submit-smoke:strict
 *   node scripts/comfyui/submit-workflow-smoke.mjs --workflow path/to/wf.json
 *   node scripts/comfyui/submit-workflow-smoke.mjs --poll-once
 *
 * Env:
 *   COMFYUI_BASE_URL   default http://127.0.0.1:8188 (Desktop is often :8000)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const STRICT     = args.includes('--strict');
const POLL_ONCE  = args.includes('--poll-once');
const wfArgIdx   = args.indexOf('--workflow');
const WORKFLOW_PATH = resolve(
  wfArgIdx !== -1 && args[wfArgIdx + 1]
    ? args[wfArgIdx + 1]
    : 'scripts/comfyui/workflows/dev-workflow-api.json',
);

const skip = (reason) => {
  console.log(`⚠ ${reason}`);
  if (STRICT) {
    console.log(`✗ --strict was passed.`);
    process.exit(1);
  }
  process.exit(0);
};

console.log('\n📤 ComfyUI workflow submission smoke');
console.log(`   workflow:  ${WORKFLOW_PATH}`);
console.log(`   strict:    ${STRICT}`);
console.log('');

// ── Workflow file gate ─────────────────────────────────────────────────────
if (!existsSync(WORKFLOW_PATH)) {
  skip(`skipped: no workflow file at ${WORKFLOW_PATH}\n   (drop a "Save (API Format)" export from ComfyUI Desktop into scripts/comfyui/workflows/)`);
}

let workflow;
try {
  workflow = JSON.parse(readFileSync(WORKFLOW_PATH, 'utf8'));
} catch (e) {
  skip(`skipped: workflow file is not valid JSON: ${e.message}`);
}

if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
  skip('skipped: workflow file is not an object — expected the "Save (API Format)" shape, not the visual workflow JSON');
}

const nodeCount = Object.keys(workflow).length;
console.log(`   workflow nodes: ${nodeCount}`);

// ── Reachability gate ──────────────────────────────────────────────────────
let ComfyUIClient;
try {
  const tsxRegister = await import('tsx/esm/api').catch(() => null);
  if (tsxRegister?.register) tsxRegister.register();
  const mod = await import(pathToFileURL(
    resolve(ROOT, 'src/lib/server/comfyui/comfyui-client.ts')
  ).href);
  ComfyUIClient = mod.ComfyUIClient;
} catch (err) {
  console.error('❌ Could not load comfyui-client.ts via tsx loader.');
  console.error('   Install tsx if missing:  npm i -D tsx');
  console.error('   Underlying error:', err.message);
  process.exit(2);
}

const client = new ComfyUIClient();
console.log(`   baseUrl:   ${client.baseUrl}`);

const health = await client.healthCheck();
if (!health.reachable) {
  skip(`skipped: ComfyUI unreachable at ${client.baseUrl} — ${health.error ?? 'unknown'}`);
}
console.log(`   reachable: ✅ yes  ${health.queue ? `(running=${health.queue.running} pending=${health.queue.pending})` : ''}`);
console.log('');

// ── Submit ─────────────────────────────────────────────────────────────────
const submit = await client.submitPrompt(workflow, 'comfyui-submit-smoke');
if (!submit.ok || !submit.prompt_id) {
  console.log(`✗ submitPrompt failed: ${submit.error ?? 'no prompt_id returned'}`);
  if (submit.node_errors) {
    console.log(`   node_errors:`, JSON.stringify(submit.node_errors, null, 2).slice(0, 500));
  }
  process.exit(STRICT ? 1 : 0);
}
console.log(`✅ submitted: prompt_id = ${submit.prompt_id}`);

// ── Optional one-shot poll ─────────────────────────────────────────────────
if (POLL_ONCE) {
  console.log(`   polling /history/${submit.prompt_id} once…`);
  const hist = await client.getHistory(submit.prompt_id);
  console.log(`   history:   ok=${hist.ok} done=${hist.done} status=${hist.status ?? '—'}`);
  if (hist.outputs) {
    console.log(`   outputs:   ${Object.keys(hist.outputs).length} node(s) reported`);
  }
}

console.log('');
console.log('Next: poll /history/<prompt_id> until completed, then build /view URLs for output assets.');
console.log('      Or use ComfyUIClient.waitForCompletion(prompt_id, timeoutMs) for a blocking flow.');
