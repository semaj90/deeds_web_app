#!/usr/bin/env node
/**
 * NLUT-07 / CPU-AVX2-01b: Production N-API runtime dispatch + parity receipt.
 * Run with: npx tsx scripts/atlas/verify-tensorrt-bridge-nlut07-receipt-v1.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const sha256File = (p) => `sha256:${createHash('sha256').update(readFileSync(p)).digest('hex')}`;

const addonCandidates = process.env.ATLAS_ADDON_PATH
  ? [resolve(ROOT, process.env.ATLAS_ADDON_PATH)]
  : [
  resolve(ROOT, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge/cpp/build-x64-fallback/Release/tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge/build/Release/tensorrt_bridge.node'),
  ];
const addonPath = addonCandidates.find((p) => existsSync(p));
if (!addonPath) throw new Error('TENSORRT_BRIDGE_NODE_NOT_FOUND');

const addon = require(addonPath);
if (typeof addon.nesLutSupportsAvx2 !== 'function' || typeof addon.matchNesLutMask !== 'function') {
  throw new Error('MISSING_NLUT07_NAPI_EXPORTS');
}

const runtimeAvx2 = addon.nesLutSupportsAvx2() === 1;
const lengths = Array.from({ length: 6528 }, (_, n) => n);
const domainBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);
const allowed = new Uint8Array([0x00, 0x03, 0x07, 0x0a]);
const boundaryLengths = new Set([0, 1, 31, 32, 33, 63, 64, 65, 127, 128, 129, 6527]);
const lengthCheckDigest = createHash('sha256');
const lengthCheckSamples = [];
let exactAutomaticCount = 0;
let exactScalarCount = 0;
let exactPreallocCount = 0;

function referenceMask(lut, allowedBytes) {
  const accepted = new Set(allowedBytes);
  const words = new Uint32Array(Math.ceil(lut.length / 32));
  for (let i = 0; i < lut.length; i++) {
    if (accepted.has(lut[i])) words[i >>> 5] |= (1 << (i & 31));
  }
  return words;
}

for (const n of lengths) {
  const lut = new Uint8Array(n);
  for (let i = 0; i < n; i++) lut[i] = domainBytes[(i * 5 + 1) % domainBytes.length];

  const reference = referenceMask(lut, allowed);
  const automaticMask = addon.matchNesLutMask(lut, allowed, 0);
  const scalarMask = addon.matchNesLutMask(lut, allowed, 1);
  const prealloc = new Uint32Array(reference.length);
  const reused = addon.matchNesLutMask(lut, allowed, 0, prealloc);

  const exactAutomatic = automaticMask.length === reference.length && automaticMask.every((v, i) => v === reference[i]);
  const exactScalar = scalarMask.length === reference.length && scalarMask.every((v, i) => v === reference[i]);
  const exactPrealloc = reused === prealloc && prealloc.every((v, i) => v === reference[i]);
  if (!exactAutomatic || !exactScalar || !exactPrealloc) {
    throw new Error(`NLUT07_PARITY_MISMATCH_AT_N_${n}`);
  }
  exactAutomaticCount += Number(exactAutomatic);
  exactScalarCount += Number(exactScalar);
  exactPreallocCount += Number(exactPrealloc);
  // Hash every checked case in a stable compact form instead of serializing 6,528 repeated objects.
  lengthCheckDigest.update(`${n}\t${reference.length}\t${Number(exactAutomatic)}\t${Number(exactScalar)}\t${Number(exactPrealloc)}\n`);
  if (boundaryLengths.has(n)) {
    lengthCheckSamples.push({ n, words: reference.length, exactAutomatic, exactScalar, exactPrealloc });
  }
}
const lengthCheckSummary = {
  count: lengths.length,
  range: { first: lengths[0], last: lengths.at(-1) },
  exactAutomatic: exactAutomaticCount,
  exactForcedScalar: exactScalarCount,
  exactCallerBuffer: exactPreallocCount,
  canonicalCaseDigest: `sha256:${lengthCheckDigest.digest('hex')}`,
  digestEncoding: 'UTF-8 lines: n<TAB>wordCount<TAB>automaticMatch<TAB>forcedScalarMatch<TAB>callerBufferMatch<LF>; booleans encoded as 0 or 1',
  boundarySamples: lengthCheckSamples,
};

let duplicateAllowlistRefused = false;
try {
  addon.matchNesLutMask(new Uint8Array([1]), new Uint8Array([1, 1]), 0);
} catch (error) {
  duplicateAllowlistRefused = String(error?.message ?? error).includes('NES_LUT_ALLOWED_DUPLICATE');
}
if (!duplicateAllowlistRefused) throw new Error('NLUT07_DUPLICATE_ALLOWLIST_NOT_REFUSED');

// Diagnostic throughput (65,536 bytes x 200 iterations, caller-owned output buffer)
const benchN = 65536;
const benchLut = new Uint8Array(benchN);
for (let i = 0; i < benchN; i++) benchLut[i] = domainBytes[i % domainBytes.length];
const benchOut = new Uint32Array(Math.ceil(benchN / 32));
const iters = 200;

const t0 = performance.now();
for (let i = 0; i < iters; i++) addon.matchNesLutMask(benchLut, allowed, 0, benchOut);
const msDispatch = Math.max(0.001, performance.now() - t0);

const t1 = performance.now();
for (let i = 0; i < iters; i++) addon.matchNesLutMask(benchLut, allowed, 1, benchOut);
const msScalar = Math.max(0.001, performance.now() - t1);

const totalMb = (benchN * iters) / (1024 * 1024);
const reportArg = process.argv.find((a) => a.startsWith('--report='))?.slice('--report='.length);
const reportPath = resolve(ROOT, reportArg ?? 'docs/reports/tensorrt-bridge-nlut07-receipt-v1.json');
mkdirSync(dirname(reportPath), { recursive: true });

const receipt = {
  schema: 'atlas.tensorrt_bridge_nlut07_receipt.v1',
  generatedAt: new Date().toISOString(),
  status: 'PARTIAL',
  proofScope: 'Loaded N-API addon fixture parity on this host; not production retrieval integration.',
  acceptance: 'PARTIAL',
  runtimeSupportsAvx2: runtimeAvx2,
  automaticDispatchInterpretation: runtimeAvx2 ? 'AVX2_SELECTED_BY_RUNTIME_GUARD' : 'SCALAR_FALLBACK_SELECTED',
  binaryBuildProfile: process.env.ATLAS_ADDON_BUILD_PROFILE ?? 'UNVERIFIED',
  binaryBuildProvenance: process.env.ATLAS_ADDON_BUILD_PROFILE
    ? 'OPERATOR_SUPPLIED_BUILD_PROFILE_AND_EXPLICIT_ADDON_PATH'
    : 'UNVERIFIED_SOURCE_TO_BINARY_BUILD_LINK',
  portability: String(process.env.ATLAS_ADDON_BUILD_PROFILE ?? '').toLowerCase().includes('scalar-safe')
    ? 'SCALAR_BASELINE_BUILD_CONFIGURED; NON_AVX2_HOST_RUNTIME_NOT_TESTED'
    : 'GLOBAL_AVX2_RELEASE_FLAGS_OR_BUILD_PROFILE_UNVERIFIED',
  adversarialChecks: { duplicateAllowlistRefused },
  addonPath: addonPath.replaceAll('\\', '/'),
  hashes: {
    'simd-bridge/cpp/binding.cc': sha256File(resolve(ROOT, 'simd-bridge/cpp/binding.cc')),
    'simd-bridge/cpp/CMakeLists.txt': sha256File(resolve(ROOT, 'simd-bridge/cpp/CMakeLists.txt')),
    'simd-bridge/cpp/nes_lut_avx2.cc': sha256File(resolve(ROOT, 'simd-bridge/cpp/nes_lut_avx2.cc')),
    'simd-bridge/cpp/CMakePresets.json': sha256File(resolve(ROOT, 'simd-bridge/cpp/CMakePresets.json')),
    'tensorrt_bridge.node': sha256File(addonPath),
  },
  lengthCheckSummary,
  throughput: {
    bytesPerIter: benchN,
    iterations: iters,
    dispatchMbPerSec: Number((totalMb / (msDispatch / 1000)).toFixed(2)),
    forcedScalarMbPerSec: Number((totalMb / (msScalar / 1000)).toFixed(2)),
  },
};

writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: receipt.status, acceptance: receipt.acceptance, runtimeSupportsAvx2: runtimeAvx2, checks: lengthCheckSummary.count, lengthCheckDigest: lengthCheckSummary.canonicalCaseDigest, adversarialChecks: receipt.adversarialChecks, throughput: receipt.throughput, reportPath }, null, 2));
