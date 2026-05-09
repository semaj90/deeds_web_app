#!/usr/bin/env node
/**
 * compile-demo-scene.mjs
 *
 * Phase 0B runner — exercises the deterministic crime-scene compiler
 * against the hand-written demo plan. NO model calls. NO Blender shell-
 * out. NO database writes. NO Redis/Qdrant/Neo4j mutations.
 *
 * Output (under memory/reconstruction/):
 *   demo-scene.py             Generated Blender Python script
 *   demo-scene-metadata.json  Annotations + actors + events + plan_hash
 *
 * Usage:
 *   node scripts/reconstruction/compile-demo-scene.mjs
 *   node scripts/reconstruction/compile-demo-scene.mjs --plan path/to/other.json
 *
 * Verify deterministic: re-running with the same plan must produce a
 * byte-identical script (modulo the `Compiled at:` ISO timestamp comment).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const PLAN_PATH = (() => {
  const eq = args.find(a => a.startsWith('--plan='));
  if (eq) return resolve(ROOT, eq.split('=')[1]);
  const idx = args.indexOf('--plan');
  if (idx !== -1 && args[idx + 1]) return resolve(ROOT, args[idx + 1]);
  return resolve(__dirname, 'demo-crime-scene.json');
})();

console.log(`\n🔨 scene-compiler — phase 0B (deterministic)`);
console.log(`   plan: ${PLAN_PATH}\n`);

// Load TS via tsx if available; fall back to a precompiled .js peer in ../dist if present.
let compileCrimeScene;
try {
  // Use --import tsx if running with tsx, otherwise dynamic-import .ts via tsx loader
  const tsxRegister = await import('tsx/esm/api').catch(() => null);
  if (tsxRegister?.register) tsxRegister.register();
  const mod = await import(pathToFileURL(
    resolve(ROOT, 'src/lib/server/reconstruction/scene-compiler.ts')
  ).href);
  compileCrimeScene = mod.compileCrimeScene;
} catch (err) {
  console.error('❌ Could not load scene-compiler.ts. Install tsx (npm i -D tsx) or invoke via:');
  console.error('   npx tsx scripts/reconstruction/compile-demo-scene.mjs');
  console.error('Underlying error:', err.message);
  process.exit(2);
}

const planRaw = JSON.parse(await readFile(PLAN_PATH, 'utf8'));

let result;
try {
  result = compileCrimeScene(planRaw);
} catch (err) {
  console.error('❌ Compile failed (Zod validation or compiler error):');
  console.error(err.message);
  process.exit(1);
}

const outDir = resolve(ROOT, 'memory/reconstruction');
await mkdir(outDir, { recursive: true });
const scriptPath   = join(outDir, 'demo-scene.py');
const metadataPath = join(outDir, 'demo-scene-metadata.json');

await writeFile(scriptPath, result.blenderScript, 'utf8');
await writeFile(metadataPath, JSON.stringify(result.sceneMetadata, null, 2), 'utf8');

console.log(`   ✅ Plan validated: ${result.sceneMetadata.scene_id}`);
console.log(`      events:       ${result.sceneMetadata.events.length}`);
console.log(`      actors:       ${result.sceneMetadata.actors.length}`);
console.log(`      annotations:  ${result.sceneMetadata.annotations.length}`);
console.log(`      evidence_ids: ${result.sceneMetadata.evidence_ids.length}`);
console.log(`      plan_hash:    ${result.planHash}`);
console.log(`      compiler:     ${result.sceneMetadata.generator.version}`);
console.log(`\n   📄 Blender script   → ${scriptPath}`);
console.log(`   📄 Scene metadata   → ${metadataPath}`);
console.log(`\n   Next step (NOT run by this script):`);
console.log(`      blender --background --python ${scriptPath}\n`);
