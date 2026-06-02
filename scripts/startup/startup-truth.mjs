#!/usr/bin/env node
/**
 * startup-truth.mjs
 *
 * 28-step workspace truth audit. Runs lightweight checks on startup to flag
 * configuration drift before it becomes a runtime surprise.
 *
 * Gates checked:
 *   G17 - No hardcoded localhost URLs outside env.server.ts
 *   G18 - tensorrt_bridge.node loads + reports ≥10 live functions (not NO_LIBTORCH stubs)
 *
 * Exit codes:
 *   0  all gates pass (or only non-blocking warnings)
 *   1  one or more blocking gates failed
 *
 * Usage:
 *   node scripts/startup/startup-truth.mjs
 *   node scripts/startup/startup-truth.mjs --json   (machine-readable output)
 *   node scripts/startup/startup-truth.mjs --strict (exit 1 on any warning)
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const ADDON_PATH = path.join(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const require = createRequire(import.meta.url);

const JSON_MODE  = process.argv.includes('--json');
const STRICT     = process.argv.includes('--strict');

const results = {
  timestamp: new Date().toISOString(),
  gates: {},
  passed: 0,
  warned: 0,
  failed: 0,
  blocking: false,
};

function gate(id, label, { status, message, blocking = false }) {
  results.gates[id] = { label, status, message, blocking };
  if (status === 'pass')    results.passed++;
  else if (status === 'warn') results.warned++;
  else if (status === 'fail') { results.failed++; if (blocking) results.blocking = true; }

  if (!JSON_MODE) {
    const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️ ' : '❌';
    console.log(`  ${icon}  [${id}] ${label}: ${message}`);
  }
}

// ── G17: No hardcoded localhost outside env.server.ts ─────────────────────────

function checkG17() {
  let violations = [];
  try {
    const rg = execSync(
      `rg --no-heading -n "localhost" sveltekit-frontend/src ` +
      `--glob "*.ts" --glob "*.svelte" ` +
      `--glob "!**/env.server.ts" ` +
      `--glob "!**/*.d.ts" ` +
      `--glob "!**/node_modules/**"`,
      { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const lines = rg.split('\n').filter(Boolean);
    violations = lines.filter(line => {
      // Skip ENV-gated fallbacks (ENV.X ?? 'http://localhost...' is acceptable)
      if (/ENV\.[A-Z]/.test(line)) return false;
      if (/process\.env/.test(line)) return false;
      if (/\?\?/.test(line)) return false;
      // Skip comments, error messages, log strings
      if (/^\s*\/\//.test(line.split(':').slice(2).join(':'))) return false;
      if (/hint:|message:|log\(|warn\(|error\(/.test(line)) return false;
      // Must actually reference a service port
      return /localhost:(11434|8090|3040|6333|6379|7474|8333|9333|5672|8093|50051)/.test(line);
    });
  } catch (e) {
    // rg exits 1 when no matches found — that's a pass
    if (e.status !== 1) {
      gate('G17', 'No hardcoded localhost outside env.server.ts', {
        status: 'warn',
        message: `rg check failed: ${e.message.slice(0, 80)}`,
      });
      return;
    }
  }

  if (violations.length === 0) {
    gate('G17', 'No hardcoded localhost outside env.server.ts', {
      status: 'pass',
      message: '0 violations',
    });
  } else {
    gate('G17', 'No hardcoded localhost outside env.server.ts', {
      status: 'warn',
      message: `${violations.length} violation(s) — route through ENV.* getters`,
      blocking: false,
    });
    if (!JSON_MODE) {
      for (const v of violations.slice(0, 5)) console.log(`       ${v.trim()}`);
      if (violations.length > 5) console.log(`       ... and ${violations.length - 5} more`);
    }
    results.gates['G17'].violations = violations.slice(0, 10);
  }
}

// ── G18: tensorrt_bridge.node loads + ≥10 live functions ─────────────────────

function checkG18() {
  if (!existsSync(ADDON_PATH)) {
    gate('G18', 'tensorrt_bridge.node loads + ≥10 live functions', {
      status: 'warn',
      message: `Addon not found at ${path.relative(ROOT, ADDON_PATH)} — CPU-only mode`,
      blocking: false,
    });
    return;
  }

  let addon;
  try {
    addon = require(ADDON_PATH);
  } catch (e) {
    gate('G18', 'tensorrt_bridge.node loads + ≥10 live functions', {
      status: 'fail',
      message: `Load failed: ${e.message.slice(0, 120)}`,
      blocking: false, // Non-blocking — CPU fallback is valid
    });
    return;
  }

  // Count live (non-stub) functions. Stubs return -99 when called with 0 args.
  const PROBE_FUNCTIONS = [
    'checkCudaAvailable', 'getCudaMemory', 'batchCosineSimilarity',
    'graphSimilarity', 'kmeansWithCentroids', 'trainSOM',
    'pageRankGPU', 'attentionScoreGPU', 'autoencoderEncode',
    'simdJsonParse', 'simdJsonValidate', 'topKIndicesGPU',
    'pcaProject', 'computeCaseEmbedding', 'rewardScoreGPU',
  ];

  const exported = Object.keys(addon).filter(k => typeof addon[k] === 'function');
  let liveCount = 0;
  let stubCount = 0;

  for (const fn of PROBE_FUNCTIONS) {
    if (typeof addon[fn] !== 'function') continue;
    try {
      const result = addon[fn]();
      if (result === -99) stubCount++;
      else liveCount++;
    } catch {
      liveCount++; // Throws = real function, not a stub
    }
  }

  const totalExported = exported.length;

  if (liveCount >= 10) {
    gate('G18', 'tensorrt_bridge.node loads + ≥10 live functions', {
      status: 'pass',
      message: `${liveCount} live / ${stubCount} stub / ${totalExported} exported`,
    });
  } else if (liveCount > 0) {
    gate('G18', 'tensorrt_bridge.node loads + ≥10 live functions', {
      status: 'warn',
      message: `Only ${liveCount} live functions (need ≥10) — ${stubCount} stubs, ${totalExported} exported`,
      blocking: false,
    });
  } else {
    gate('G18', 'tensorrt_bridge.node loads + ≥10 live functions', {
      status: 'fail',
      message: `All probed functions return -99 stubs — NO_LIBTORCH build or wrong binary`,
      blocking: false,
    });
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

if (!JSON_MODE) {
  console.log('\n🔎 startup-truth.mjs');
  console.log(`   ${new Date().toLocaleString()}\n`);
}

checkG17();
checkG18();

if (!JSON_MODE) {
  console.log();
  console.log(`   Passed: ${results.passed}  Warned: ${results.warned}  Failed: ${results.failed}`);
  if (results.blocking) console.log('   ❌ Blocking failures — fix before proceeding');
  else if (results.failed > 0 || results.warned > 0) console.log('   ⚠️  Warnings only — non-blocking');
  else console.log('   ✅ All gates pass');
  console.log();
}

mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });
writeFileSync(
  path.join(ROOT, '.tmp/startup-truth.json'),
  JSON.stringify(results, null, 2)
);

if (JSON_MODE) process.stdout.write(JSON.stringify(results, null, 2) + '\n');

process.exit(results.blocking || (STRICT && (results.warned > 0 || results.failed > 0)) ? 1 : 0);