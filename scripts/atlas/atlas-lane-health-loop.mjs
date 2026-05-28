#!/usr/bin/env node
/**
 * atlas-lane-health-loop.mjs
 *
 * Reports atlas lane health including C++ CUDA build status.
 * No startup dependency — safe to run standalone or on-demand.
 * Does NOT start any services or trigger builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SIMD = path.join(ROOT, 'simd-bridge', 'cpp');

// ── C++ / CUDA build probes ────────────────────────────────────────────────
function probeCudaBuild() {
  const result = {
    cmakeConfigured: false,
    buildDirExists: false,
    nodeAddonExists: false,
    cudaArch: null,
    libtorchDetected: false,
    simdjsonVendorExists: false,
  };

  const buildDir = path.join(SIMD, 'build');
  const cmakeCache = path.join(buildDir, 'CMakeCache.txt');
  const nodeAddon = path.join(buildDir, 'Release', 'tensorrt_bridge.node');
  const altAddon = path.join(ROOT, 'simd-bridge', 'build', 'Release', 'tensorrt_bridge.node');
  const simdjsonVendor = path.join(SIMD, 'vendor', 'simdjson.cpp');

  result.buildDirExists = fs.existsSync(buildDir);
  result.nodeAddonExists = fs.existsSync(nodeAddon) || fs.existsSync(altAddon);
  result.simdjsonVendorExists = fs.existsSync(simdjsonVendor);

  if (fs.existsSync(cmakeCache)) {
    result.cmakeConfigured = true;
    const cache = fs.readFileSync(cmakeCache, 'utf8');

    // Extract CUDA arch — try multiple CMake key names
    const archMatch =
      cache.match(/TORCH_CUDA_ARCH_LIST[^=]*=([^\r\n]+)/) ||
      cache.match(/CMAKE_CUDA_ARCHITECTURES[^=]*=([^\r\n]+)/);
    if (archMatch) {
      const raw = archMatch[1].trim().replace('.', '');
      result.cudaArch = `sm_${raw}`;
    } else if (cache.includes('compute_86') || cache.includes('8.6')) {
      result.cudaArch = 'sm_86';
    }

    // Detect LibTorch
    result.libtorchDetected =
      cache.includes('TORCH_INCLUDE') || cache.includes('Torch_DIR') || cache.includes('libtorch');
  }

  return result;
}

// ── Atlas file probes ──────────────────────────────────────────────────────
function probeAtlasFiles() {
  const files = {
    codesbaseAtlas: path.join(
      ROOT,
      'sveltekit-frontend',
      'docs',
      'atlas-index',
      'codebase-atlas.json'
    ),
    featureRegistry: path.join(ROOT, 'docs', 'atlas', 'feature-registry.json'),
    featureRegistryTmp: path.join(ROOT, '.tmp', 'atlas-feature-registry.json'),
    cartridgeSeeds: path.join(ROOT, '.tmp', 'atlas-cartridge-seeds.jsonl'),
    aceContext: path.join(ROOT, '.opencode', 'ace-context.json'),
    startupStatus: path.join(ROOT, 'sveltekit-frontend', '.tmp', 'ace-startup-status.json'),
  };

  const result = {};
  for (const [key, p] of Object.entries(files)) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      result[key] = { exists: true, sizeKb: Math.round(stat.size / 1024), path: p };
    } else {
      result[key] = { exists: false, path: p };
    }
  }
  return result;
}

// ── Startup service status ─────────────────────────────────────────────────
function probeStartupStatus() {
  const p = path.join(ROOT, 'sveltekit-frontend', '.tmp', 'ace-startup-status.json');
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// ── Seed freshness ─────────────────────────────────────────────────────────
function probeSeedFreshness() {
  const p = path.join(ROOT, '.tmp', 'atlas-cartridge-seeds.jsonl');
  if (!fs.existsSync(p)) return { exists: false };
  const stat = fs.statSync(p);
  const ageMin = Math.round((Date.now() - stat.mtimeMs) / 60000);
  let lines = 0;
  try {
    lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length;
  } catch {}
  return { exists: true, ageMin, lines, stale: ageMin > 1440 };
}

// ── Report ─────────────────────────────────────────────────────────────────
const cuda = probeCudaBuild();
const atlas = probeAtlasFiles();
const startup = probeStartupStatus();
const seeds = probeSeedFreshness();

console.log('\n══ Atlas Lane Health ══════════════════════════════════════');

console.log('\n── C++ / CUDA Build (simd-bridge) ────────────────────────');
console.log(`  CMake configured  : ${cuda.cmakeConfigured ? '✅ yes' : '❌ no'}`);
console.log(`  Build dir exists  : ${cuda.buildDirExists ? '✅ yes' : '❌ no'}`);
console.log(`  .node addon built : ${cuda.nodeAddonExists ? '✅ yes' : '❌ no'}`);
console.log(`  CUDA arch         : ${cuda.cudaArch ?? '❓ not detected'}`);
console.log(`  LibTorch detected : ${cuda.libtorchDetected ? '✅ yes' : '❌ no'}`);
console.log(`  simdjson vendor   : ${cuda.simdjsonVendorExists ? '✅ yes' : '❌ no'}`);
console.log(`  Note              : build is on-demand — NOT a startup dependency`);

console.log('\n── Atlas Files ───────────────────────────────────────────');
for (const [key, v] of Object.entries(atlas)) {
  const status = v.exists ? `✅ ${v.sizeKb}KB` : '❌ missing';
  console.log(`  ${key.padEnd(22)}: ${status}`);
}

console.log('\n── Atlas → Cartridge Seeds ───────────────────────────────');
if (seeds.exists) {
  const staleFlag = seeds.stale ? ' ⚠️  stale (>24h)' : '';
  console.log(`  seeds.jsonl       : ✅ ${seeds.lines} seeds, age ${seeds.ageMin}min${staleFlag}`);
  console.log(`  regen command     : node scripts/atlas/atlas-to-cartridge-seed.mjs`);
} else {
  console.log(`  seeds.jsonl       : ❌ not generated`);
  console.log(`  run               : node scripts/atlas/atlas-to-cartridge-seed.mjs`);
}

console.log('\n── Startup Service Status ────────────────────────────────');
if (startup) {
  const colors = { green: '✅', yellow: '⚠️ ', red: '❌' };
  for (const [k, v] of Object.entries(startup)) {
    if (k === 'timestamp' || k === 'backgroundJobs') continue;
    console.log(`  ${k.padEnd(20)}: ${colors[v] ?? v} ${v}`);
  }
  if (startup.backgroundJobs) {
    for (const [k, v] of Object.entries(startup.backgroundJobs)) {
      console.log(`  bg.${k.padEnd(17)}: ${v}`);
    }
  }
  console.log(`  timestamp         : ${startup.timestamp}`);
} else {
  console.log('  ⏭️  ace-startup-status.json not found — run health check first');
}

console.log('\n══════════════════════════════════════════════════════════\n');

// Exit 0 always — health loop is informational, not a gate
process.exit(0);
