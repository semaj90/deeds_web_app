#!/usr/bin/env node
/**
 * emit-aesthetic-preset.mjs
 *
 * Loads the canonical AESTHETIC_PRESET_TABLE from
 * src/lib/server/reconstruction/aesthetic-presets.ts and emits a deterministic
 * JSON snapshot to memory/reconstruction/aesthetic-presets.json. The JSON
 * is consumed by:
 *   - the WebGPU canvas (uniform values)
 *   - the Blender Python preamble (sanity-check the table didn't drift)
 *   - any future render worker / export bundle
 *
 * Same input → byte-identical output (the source-of-truth preset table is
 * `as const`-frozen). Determinism is asserted at the bottom by re-emitting
 * and comparing sha256 — if they don't match, somebody added entropy.
 *
 * Usage:
 *   node scripts/reconstruction/emit-aesthetic-preset.mjs
 *   npm run reconstruction:emit-presets
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..', '..');                         // sveltekit-frontend/
const SRC_TS     = resolve(ROOT, 'src/lib/server/reconstruction/aesthetic-presets.ts');
const OUT_DIR    = resolve(ROOT, 'memory/reconstruction');
const OUT_JSON   = resolve(OUT_DIR, 'aesthetic-presets.json');

// Load the .ts source via tsx, same pattern as compile-demo-scene.mjs.
const tsxRegister = await import('tsx/esm/api').catch(() => null);
if (tsxRegister?.register) tsxRegister.register();
const { AESTHETIC_PRESET_TABLE, presetByName } = await import(pathToFileURL(SRC_TS).href);

const presetKeys = Object.keys(AESTHETIC_PRESET_TABLE);
console.log(`\n🎨 Aesthetic preset emit — ${presetKeys.length} presets`);
for (const k of presetKeys) {
  const p = AESTHETIC_PRESET_TABLE[k];
  console.log(`   ${k.padEnd(18)} internal=${p.internal_resolution.join('×')}  filter=${p.texture_filter}  jitter=${p.vertex_jitter}  affine=${p.affine_warp_enable === undefined ? p.affine_texture_warp : p.affine_warp_enable}  bits=${p.palette_bits_per_channel}  crt=${p.crt_postprocess}`);
}

// Canonical-JSON serialization: sorted keys at every level so the same table
// always serializes to the same bytes. Otherwise key insertion order in
// Object.freeze() can drift across Node versions.
function canonical(obj) {
  if (Array.isArray(obj)) return obj.map(canonical);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = canonical(obj[k]);
    return out;
  }
  return obj;
}

const payload = canonical({
  schema_version:  'v1',
  emitted_by:      'emit-aesthetic-preset.mjs',
  source_file:     'src/lib/server/reconstruction/aesthetic-presets.ts',
  presets:         AESTHETIC_PRESET_TABLE,
});

const text = JSON.stringify(payload, null, 2) + '\n';
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_JSON, text, 'utf8');

const hash = createHash('sha256').update(text).digest('hex');
console.log(`\n📄 wrote ${OUT_JSON.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
console.log(`   sha256: ${hash}`);

// Determinism assertion — re-emit, hash, compare.
const text2 = JSON.stringify(canonical({
  schema_version:  'v1',
  emitted_by:      'emit-aesthetic-preset.mjs',
  source_file:     'src/lib/server/reconstruction/aesthetic-presets.ts',
  presets:         AESTHETIC_PRESET_TABLE,
}), null, 2) + '\n';
const hash2 = createHash('sha256').update(text2).digest('hex');
if (hash !== hash2) {
  console.error(`\n❌ NON-DETERMINISTIC: emit-1 ${hash} ≠ emit-2 ${hash2}`);
  process.exit(1);
}
console.log(`   determinism: ✅ same-bytes across two consecutive emits`);

// Round-trip check: presetByName resolves each key and the result equals
// the table entry (proves the lookup helper is consistent with the data).
for (const k of presetKeys) {
  const a = JSON.stringify(canonical(presetByName(k)));
  const b = JSON.stringify(canonical(AESTHETIC_PRESET_TABLE[k]));
  if (a !== b) {
    console.error(`❌ presetByName('${k}') drift`);
    process.exit(1);
  }
}
console.log(`   round-trip:  ✅ presetByName matches table for all ${presetKeys.length} presets\n`);
