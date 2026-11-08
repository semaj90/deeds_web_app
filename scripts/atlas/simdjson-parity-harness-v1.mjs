// simdjson export parity harness: simdJsonParse / simdJsonValidate / simdJsonExtractNumbers vs JS references.
// Valid documents must round-trip equal to JSON.parse; invalid ones must be rejected by both; pointer extraction
// must match an RFC 6901 reference. A self-test with deliberately faulty wrappers proves the checks can fail.
// Usage: node scripts/atlas/simdjson-parity-harness-v1.mjs [--addon=<path to tensorrt_bridge.node>]
// Writes one new receipt under .tmp/atlas/. No service or database access.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argAddon = process.argv.find((a) => a.startsWith('--addon='))?.slice('--addon='.length);
const ADDON = resolve(argAddon ?? process.env.SIMDJSON_ADDON_PATH
  ?? resolve(ROOT, 'simd-bridge', 'cpp', 'build-x64-fallback', 'Release', 'tensorrt_bridge.node'));
const SEED = 20261108;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genValue(rng, depth) {
  const r = rng();
  if (depth <= 0 || r < 0.35) {
    const k = Math.floor(rng() * 6);
    if (k === 0) return null;
    if (k === 1) return rng() < 0.5;
    if (k === 2) return Math.floor((rng() - 0.5) * 2e9);
    if (k === 3) return (rng() - 0.5) * Math.pow(10, Math.floor(rng() * 20) - 10);
    if (k === 4) return `stré中"\\\n\t${Math.floor(rng() * 1000)}${rng() < 0.2 ? '😀' : ''}`;
    return '';
  }
  if (r < 0.65) return Array.from({ length: Math.floor(rng() * 5) }, () => genValue(rng, depth - 1));
  const o = {};
  const n = Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) o[`k${Math.floor(rng() * 50)}${rng() < 0.2 ? 'é' : ''}`] = genValue(rng, depth - 1);
  return o;
}

const nested = (d) => '['.repeat(d) + ']'.repeat(d);
const VALID_FIXED = ['0', '-0', '1e5', '1E+2', '0.5', '123456789012345678901234567890', '"\\ud800"', '[]', '{}', 'null',
  'true', '  [1]  ', '[1,2,3]', nested(200), '{"a":1,"a":2}', '"\\u00e9\\n"', '1e400'];
const INVALID = ['', ' ', '{', '[1,]', '{"a":1,}', "{'a':1}", '{a:1}', 'NaN', 'Infinity', '01', '1.', '.5', '+1',
  '{} x', '"unterminated', '"\n"', '﻿{}', '[1 2]', '{"a" 1}', '// c\n{}', '[1]]', 'tru', '"\\x"', '"\\u12"', '-', '--1'];

// Documented simdjson-vs-JSON.parse differences (4.5.0 vendored build), identical across all four builds tested
// on 2026-11-08. The app's wrapper routes these shapes to V8 (simdjson-bridge.ts). Any divergence NOT listed fails.
// Keys are `${kind}:${doc}` exactly as recorded in the divergence entries.
const KNOWN_DIVERGENCES = new Set([
  'valid-corpus:-0',                                   // sign of negative zero lost
  'valid-corpus:123456789012345678901234567890',       // integer beyond 64 bits: native rejects, JS accepts
  'valid-corpus:"\\ud800"',                            // lone surrogate escape becomes U+FFFD
  'valid-corpus:1e400',                                // number out of range: native rejects, JS gives Infinity
  'invalid:"﻿{}"',                                // BOM-prefixed input accepted by native, rejected by JS
]);

const jsParse = (s) => { try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; } };
const nativeTry = (fn) => { try { return { ok: true, value: fn() }; } catch { return { ok: false }; } };

function checkParseValidate(addon, rng) {
  const cases = [];
  const docs = [];
  for (let i = 0; i < 300; i++) {
    const v = genValue(rng, 5);
    const indent = [0, 2, '\t'][i % 3];
    docs.push(JSON.stringify(v, null, indent));
  }
  docs.push(...VALID_FIXED);
  for (const doc of docs) {
    const js = jsParse(doc);
    const parsed = nativeTry(() => addon.simdJsonParse(doc));
    const validated = nativeTry(() => addon.simdJsonValidate(doc));
    let agree;
    let note = null;
    if (js.ok) {
      const roundTrip = parsed.ok ? jsParse(parsed.value) : { ok: false };
      agree = parsed.ok && roundTrip.ok && isDeepStrictEqual(roundTrip.value, js.value) && validated.ok && validated.value === true;
      if (!agree) note = 'JS accepts; native rejected or round-trip differs';
    } else {
      agree = !parsed.ok && validated.ok && validated.value === false;
      if (!agree) note = 'JS rejects; native accepted';
    }
    if (!agree) cases.push({ kind: 'valid-corpus', doc: doc.slice(0, 80), note });
  }
  for (const doc of INVALID) {
    const js = jsParse(doc);
    const parsed = nativeTry(() => addon.simdJsonParse(doc));
    const validated = nativeTry(() => addon.simdJsonValidate(doc));
    const nativeAccepts = parsed.ok || (validated.ok && validated.value === true);
    if (js.ok === false && nativeAccepts) cases.push({ kind: 'invalid', doc: JSON.stringify(doc).slice(0, 60), note: 'UNSAFE_ACCEPT: JS rejects, native accepts' });
    if (js.ok === true && !nativeAccepts) cases.push({ kind: 'invalid', doc: JSON.stringify(doc).slice(0, 60), note: 'JS accepts, native rejects' });
  }
  const known = cases.filter((c) => KNOWN_DIVERGENCES.has(`${c.kind}:${c.doc}`));
  const unexpected = cases.filter((c) => !KNOWN_DIVERGENCES.has(`${c.kind}:${c.doc}`));
  const observed = new Set(known.map((c) => `${c.kind}:${c.doc}`));
  return { name: 'simdJsonParse+simdJsonValidate', documents: docs.length + INVALID.length, divergences: unexpected,
    knownDivergences: known,
    // Listed but no longer seen: a simdjson upgrade may have fixed them. Informational, never a failure.
    knownDivergencesNotObserved: [...KNOWN_DIVERGENCES].filter((k) => !observed.has(k)),
    status: unexpected.length === 0 ? 'PASS' : 'FAIL' };
}

// RFC 6901 reference: returns Float64Array of finite numbers, or throws.
function refExtract(doc, pointer) {
  let cur = JSON.parse(doc);
  if (pointer !== '') {
    if (!pointer.startsWith('/')) throw new Error('POINTER_INVALID');
    for (const raw of pointer.slice(1).split('/')) {
      const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
      if (cur === null || typeof cur !== 'object' || !(key in cur)) throw new Error('POINTER_NOT_FOUND');
      cur = cur[key];
    }
  }
  if (!Array.isArray(cur) || !cur.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error('NOT_NUMERIC_ARRAY');
  return Float64Array.from(cur);
}

const EXTRACT_CASES = [
  ['{"a":[1.5,2,3]}', '/a'], ['{"a":{"b":[4,5]}}', '/a/b'], ['[1,2]', ''], ['[-1.5e3,2E-2,0]', ''],
  ['{"a/b":[7]}', '/a~1b'], ['{"a~b":[8]}', '/a~0b'], ['{"a":[]}', '/a'], ['{"a":[1]}', '/zzz'],
  ['{"a":[1,"x",3]}', '/a'], ['{"a":[1,null]}', '/a'], ['{"a":[[1],[2]]}', '/a'], ['{"a":[9007199254740993]}', '/a'],
  ['{"a":[0.1,0.2,0.30000000000000004]}', '/a'], ['{"a":[1e308,-1e308]}', '/a'], ['{"a":5}', '/a'],
];

function checkExtractNumbers(addon) {
  const divergences = [];
  for (const [doc, pointer] of EXTRACT_CASES) {
    let ref; try { ref = { ok: true, value: refExtract(doc, pointer) }; } catch { ref = { ok: false }; }
    const nat = nativeTry(() => addon.simdJsonExtractNumbers(doc, pointer));
    const agree = ref.ok
      ? nat.ok && isDeepStrictEqual(Array.from(nat.value), Array.from(ref.value))
      : !nat.ok;
    if (!agree) divergences.push({ doc: doc.slice(0, 60), pointer, reference: ref.ok ? Array.from(ref.value) : 'throws', native: nat.ok ? Array.from(nat.value) : 'throws' });
  }
  return { name: 'simdJsonExtractNumbers', cases: EXTRACT_CASES.length, divergences, status: divergences.length === 0 ? 'PASS' : 'FAIL' };
}

// Deliberately faulty wrapper: every check must report FAIL against it.
function faultyAddon(real) {
  return {
    simdJsonParse: (s) => real.simdJsonParse(s).replace(/\d/, (d) => String((Number(d) + 1) % 10)),
    simdJsonValidate: () => true,
    simdJsonExtractNumbers: (s, p) => { const r = real.simdJsonExtractNumbers(s, p); if (r.length) r[0] += 1; return r; },
  };
}

function selfTest(real) {
  const faulty = faultyAddon(real);
  const cases = [
    { check: 'parse+validate', detected: checkParseValidate(faulty, mulberry32(7)).status === 'FAIL' },
    { check: 'extractNumbers', detected: checkExtractNumbers(faulty).status === 'FAIL' },
  ];
  return { cases, allFaultsDetected: cases.every((c) => c.detected) };
}

async function main() {
  const receipt = {
    schema: 'atlas.simdjson-parity-harness.v1',
    generatedAt: new Date().toISOString(),
    addonPath: ADDON,
    seed: SEED,
    canonicalAuthority: false,
    databaseWritesPerformed: false,
    localArtifactsWritten: true,
    purpose: 'behavioral parity of simdJson* exports vs JSON.parse / RFC 6901 references; not a performance claim',
    notCovered: ['simdJsonToCSR', 'simdJsonValidateAstSpans', 'simdjson version identity', 'documents above 5 MB', 'latency'],
    results: [],
  };
  let addon;
  try {
    addon = createRequire(import.meta.url)(ADDON);
  } catch (err) {
    receipt.status = 'BLOCKED';
    receipt.reason = `ADDON_LOAD_FAILED: ${String(err.message).slice(0, 200)}`;
    return finish(receipt);
  }
  receipt.backend = { simdJsonBackend: addon.simdJsonBackend?.() ?? null, buildInfo: addon.getBackendInfo?.() ?? null,
    exportCount: Object.keys(addon).length };
  receipt.selfTest = selfTest(addon);
  if (!receipt.selfTest.allFaultsDetected) {
    receipt.status = 'BLOCKED';
    receipt.reason = 'SELF_TEST_FAILED: harness did not detect a deliberately faulty wrapper';
    return finish(receipt);
  }
  receipt.results.push(checkParseValidate(addon, mulberry32(SEED)));
  receipt.results.push(checkExtractNumbers(addon));
  receipt.status = receipt.results.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL';
  return finish(receipt);
}

function finish(receipt) {
  const dir = resolve(ROOT, '.tmp', 'atlas');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const out = resolve(dir, `simdjson-parity-v1.${stamp}.json`);
  receipt.receiptSha256Basis = 'sha256 of this JSON with the receiptSha256 field removed';
  receipt.receiptSha256 = createHash('sha256').update(JSON.stringify(receipt, null, 2)).digest('hex');
  writeFileSync(out, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(`${receipt.status}${receipt.reason ? ' (' + receipt.reason + ')' : ''} -> ${out}`);
  console.log(`  addon: ${receipt.addonPath}`);
  if (receipt.selfTest) console.log(`  self-test: ${receipt.selfTest.allFaultsDetected ? 'all faults detected' : 'MISSED FAULTS'}`);
  for (const r of receipt.results) {
    console.log(`  ${r.status} ${r.name} (${r.documents ?? r.cases} cases, ${r.divergences.length} unexpected divergences`
      + `${r.knownDivergences ? ', ' + r.knownDivergences.length + ' known' : ''})`);
    if (r.knownDivergencesNotObserved?.length) console.log(`     known but not observed: ${r.knownDivergencesNotObserved.length}`);
    for (const d of r.divergences.slice(0, 8)) console.log(`     - ${JSON.stringify(d)}`);
  }
  process.exitCode = receipt.status === 'PASS' ? 0 : 1;
}

main();
