#!/usr/bin/env node
/**
 * smoke-comfyui-client.mjs
 *
 * Probes the ComfyUI HTTP bridge. Imports the TypeScript client directly
 * via tsx, so it works without a running SvelteKit dev server. If
 * ComfyUI is not running, the script EXITS 0 with a clearly-marked
 * "skipped" line — pass `--strict` to fail in that case (useful for CI).
 *
 * Usage:
 *   npm run comfyui:smoke
 *   npm run comfyui:smoke:strict
 *   COMFYUI_BASE_URL=http://localhost:8188 node scripts/comfyui/smoke-comfyui-client.mjs
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

const STRICT = process.argv.includes('--strict');

console.log(`\n🩺 ComfyUI HTTP bridge smoke${STRICT ? ' (strict)' : ''}`);
console.log(`   COMFYUI_BASE_URL = ${process.env.COMFYUI_BASE_URL ?? 'http://127.0.0.1:8188'} (default if unset)\n`);

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
  console.error('   Or run via:              npx tsx scripts/comfyui/smoke-comfyui-client.mjs');
  console.error('   Underlying error:', err.message);
  process.exit(2);
}

const client = new ComfyUIClient();
const result = await client.healthCheck();

console.log(`   baseUrl:   ${result.baseUrl}`);
console.log(`   reachable: ${result.reachable ? '✅ yes' : '❌ no'}`);
if (result.queue) {
  console.log(`   queue:     running=${result.queue.running}  pending=${result.queue.pending}`);
}
if (result.error) {
  console.log(`   error:     ${result.error}`);
}

if (!result.reachable) {
  if (STRICT) {
    console.log(`\n❌ ComfyUI not reachable and --strict was passed.\n`);
    process.exit(1);
  }
  console.log(`\n⚠ ComfyUI is not running — skipping. (Start ComfyUI on ${result.baseUrl} or pass --strict to fail.)\n`);
  process.exit(0);
}

console.log(`\n✅ ComfyUI bridge OK — POST a workflow_api.json to /api/comfyui/render to enqueue work.\n`);
process.exit(0);