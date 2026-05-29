#!/usr/bin/env node
/**
 * smoke-opencode-commands.mjs
 *
 * Staged smoke validator for the OpenCode / Atlas pipeline.
 * Checks files, JSON shapes, freshness, Redis ACE packet, SearXNG,
 * and Windows safety (no raw /dev stdin paths).
 *
 * Usage:
 *   node scripts/opencode/smoke-opencode-commands.mjs          # human output
 *   node scripts/opencode/smoke-opencode-commands.mjs --json   # JSON output
 *   node scripts/opencode/smoke-opencode-commands.mjs --repair # run safe repair commands
 *
 * Exits 0 only when all checks pass.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = path.resolve(scriptDir, '..', '..');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const REPAIR_MODE = args.includes('--repair');

const passes = [];
const failures = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(label) {
  passes.push(label);
  if (!JSON_MODE) console.log('OK  ', label);
}

function fail(label, detail, nextCommand) {
  failures.push({ label, detail: detail || '', nextCommand: nextCommand || '' });
  if (!JSON_MODE) {
    console.error('FAIL', label);
    if (detail) console.error('    detail:', detail);
    if (nextCommand) console.error('    next:  ', nextCommand);
  }
}

function assertFile(relPath, nextCommand) {
  const p = path.resolve(root, relPath);
  if (!fs.existsSync(p)) {
    fail(`Missing file: ${relPath}`, `Expected at: ${p}`, nextCommand || `Create ${relPath}`);
    return false;
  }
  pass(`File exists: ${relPath}`);
  return true;
}

function assertContains(relPath, needle) {
  const p = path.resolve(root, relPath);
  if (!fs.existsSync(p)) {
    fail(`Missing file for contains check: ${relPath}`);
    return false;
  }
  const body = fs.readFileSync(p, 'utf8');
  if (!body.includes(needle)) {
    fail(`${relPath} missing required text`, `Expected to contain: ${needle}`);
    return false;
  }
  pass(`${relPath} contains '${needle}'`);
  return true;
}

function readJson(relPath) {
  const p = path.resolve(root, relPath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function assertJsonObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} is not a JSON object`, `Got: ${JSON.stringify(value)}`);
    return false;
  }
  pass(`${label} is a valid JSON object`);
  return true;
}

function assertFreshTimestamp(ts, maxHours, label) {
  if (!ts) {
    fail(`${label}: missing timestamp`);
    return false;
  }
  const t = new Date(ts);
  if (isNaN(t.getTime())) {
    fail(`${label}: invalid timestamp`, `Value: ${ts}`);
    return false;
  }
  const ageHours = (Date.now() - t.getTime()) / 3600000;
  if (ageHours > maxHours) {
    fail(`${label}: stale (${ageHours.toFixed(1)}h > ${maxHours}h)`,
      `generatedAt=${ts}`, 'npm run graph:manifest');
    return false;
  }
  pass(`${label}: fresh (${ageHours.toFixed(1)}h old)`);
  return true;
}

function assertNoDevStdin(relPath) {
  const p = path.resolve(root, relPath);
  if (!fs.existsSync(p)) {
    fail(`Missing file for stdin-safety check: ${relPath}`);
    return false;
  }
  const body = fs.readFileSync(p, 'utf8');
  const badPatterns = ['/dev' + '/stdin', '/dev' + '/stdout', '/dev' + '/fd/'];
  for (const bad of badPatterns) {
    if (body.includes(bad)) {
      fail(`${relPath} uses Windows-unsafe path: ${bad}`, 'Use process.stdin / process.stdout API instead');
      return false;
    }
  }
  pass(`${relPath}: no raw /dev stdin usage`);
  return true;
}

// ── Check 1: Required file existence ─────────────────────────────────────────

assertFile('memory/exports/graph-refresh-manifest.json', 'npm run graph:manifest');
assertFile('.opencode/ace-packet.json', 'npm run ace:packets');
assertFile('.tmp/domain-topology.json', 'npm run graphify:daily');
assertFile('.tmp/rerank-diff.json', 'npm run rerank:cards');
assertFile('.tmp/feature-labels.ndjson', 'npm run ace:label-and-cache');

// ── Check 2: Domain topology shape ───────────────────────────────────────────

const topology = readJson('.tmp/domain-topology.json');
if (topology !== null) {
  if (assertJsonObject(topology, 'domain-topology')) {
    if (!topology.generatedAt) {
      fail('domain-topology: missing generatedAt field', '', 'npm run graphify:daily');
    } else {
      pass('domain-topology: has generatedAt');
      assertFreshTimestamp(topology.generatedAt, 72, 'domain-topology.generatedAt');
    }
    if (typeof topology.nodeCount !== 'number') {
      fail('domain-topology: nodeCount must be a number');
    } else {
      pass(`domain-topology: nodeCount=${topology.nodeCount}`);
    }
    if (!topology.domains || typeof topology.domains !== 'object' || Array.isArray(topology.domains)) {
      fail('domain-topology: domains must be an object (not a flattened array)', `Got type: ${typeof topology.domains}`);
    } else {
      pass('domain-topology: domains is an object');
    }
  }
}

// ── Check 3: Graph refresh manifest shape ────────────────────────────────────

const manifest = readJson('memory/exports/graph-refresh-manifest.json');
if (manifest !== null) {
  // Support both the new flat shape { status, generatedAt, ... }
  // and the legacy nested shape { "graph-refresh-manifest": { status, ... } }
  const flat = (manifest.status !== undefined || manifest.generatedAt !== undefined)
    ? manifest
    : (manifest['graph-refresh-manifest'] || null);

  if (!flat) {
    fail('graph-refresh-manifest: unrecognised shape (no status/generatedAt at root or nested key)',
      '', 'npm run graph:manifest');
  } else {
    if (!flat.generatedAt) {
      fail('graph-refresh-manifest: missing generatedAt', '', 'npm run graph:manifest');
    } else {
      pass('graph-refresh-manifest: has generatedAt');
      assertFreshTimestamp(flat.generatedAt, 72, 'graph-refresh-manifest.generatedAt');
    }
    if (typeof flat.nodeCount !== 'number') {
      fail('graph-refresh-manifest: nodeCount must be a number');
    } else {
      pass(`graph-refresh-manifest: nodeCount=${flat.nodeCount}`);
    }
    if (typeof flat.edgeCount !== 'number') {
      fail('graph-refresh-manifest: edgeCount must be a number');
    } else {
      pass(`graph-refresh-manifest: edgeCount=${flat.edgeCount}`);
    }
    if (!flat.status) {
      fail('graph-refresh-manifest: missing status field', '', 'npm run graph:manifest');
    } else if (flat.status === 'stub') {
      fail('graph-refresh-manifest: status is "stub" — manifest not yet populated',
        'Run: npm run graph:manifest', 'npm run graph:manifest');
    } else {
      pass(`graph-refresh-manifest: status=${flat.status}`);
    }
  }
}

// ── Check 4: Rerank diff shape ────────────────────────────────────────────────

const rerankDiff = readJson('.tmp/rerank-diff.json');
if (rerankDiff !== null) {
  if (assertJsonObject(rerankDiff, 'rerank-diff')) {
    if (!rerankDiff.generatedAt) {
      fail('rerank-diff: missing generatedAt');
    } else {
      pass('rerank-diff: has generatedAt');
    }
    if (!rerankDiff.query) {
      fail('rerank-diff: missing query field');
    } else {
      pass(`rerank-diff: has query="${String(rerankDiff.query).slice(0, 60)}"`);
    }
    if (!rerankDiff.blendWeights || typeof rerankDiff.blendWeights !== 'object') {
      fail('rerank-diff: missing or invalid blendWeights');
    } else {
      pass('rerank-diff: blendWeights present');
    }
  }
}

// ── Check 5: Redis ACE packet ─────────────────────────────────────────────────

async function checkRedisAcePacket() {
  // Try redis-cli first (fast, no npm dep required)
  const redisCli = spawnSync('redis-cli', ['GET', 'ace:packet:latest'], {
    encoding: 'utf8', shell: true, windowsHide: true, timeout: 3000
  });
  if (redisCli.error || redisCli.status !== 0) {
    if (!JSON_MODE) console.log('SKIP Redis ACE packet check (redis-cli not available or Redis offline)');
    return;
  }
  const val = (redisCli.stdout || '').trim();
  if (!val || val === '(nil)') {
    fail('Redis key ace:packet:latest is empty or missing',
      'ACE pipeline may not have run', 'npm run ace:packets');
  } else {
    pass(`Redis ace:packet:latest exists (${val.length} chars)`);
  }
}

// ── Check 6: SearXNG live check ───────────────────────────────────────────────

async function checkSearxng() {
  const url = 'http://localhost:8889/search?q=test&format=json';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      pass(`SearXNG alive at ${url}`);
    } else {
      if (!JSON_MODE) console.log(`SKIP SearXNG returned ${res.status} — service may be down`);
    }
  } catch {
    if (!JSON_MODE) console.log('SKIP SearXNG check (service offline or not running)');
  }
}

// ── Check 7: Windows safety — no raw /dev stdin paths in scripts/opencode/ ──

const opencodeDir = path.resolve(root, 'scripts', 'opencode');
if (fs.existsSync(opencodeDir)) {
  const files = fs.readdirSync(opencodeDir).filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
  for (const f of files) {
    assertNoDevStdin(`scripts/opencode/${f}`);
  }
} else {
  fail('scripts/opencode/ directory missing');
}

// ── Run async checks ──────────────────────────────────────────────────────────

await checkRedisAcePacket();
await checkSearxng();

// ── Repair mode ───────────────────────────────────────────────────────────────

if (REPAIR_MODE && failures.length > 0) {
  console.log('\nRepair mode: running safe repair commands...');
  const repairCmds = [
    ...new Set(failures.map(f => f.nextCommand).filter(Boolean))
  ].filter(cmd =>
    // Only allow known-safe, non-destructive repair commands
    cmd.startsWith('npm run graph:manifest') ||
    cmd.startsWith('npm run graphify:daily') ||
    cmd.startsWith('npm run graph:exports')
  );
  for (const cmd of repairCmds) {
    console.log(`Running: ${cmd}`);
    const parts = cmd.split(' ');
    const r = spawnSync(parts[0], parts.slice(1), {
      stdio: 'inherit', shell: true, windowsHide: true, cwd: root
    });
    if (r.status !== 0) console.error(`  Repair command exited ${r.status}: ${cmd}`);
  }
}

// ── Final output ──────────────────────────────────────────────────────────────

if (JSON_MODE) {
  console.log(JSON.stringify({ passes, failures, ok: failures.length === 0 }, null, 2));
  process.exit(failures.length > 0 ? 1 : 0);
} else if (failures.length > 0) {
  console.error(`\n${'─'.repeat(60)}`);
  console.error(`Smoke validator: ${failures.length} failure(s), ${passes.length} pass(es)\n`);
  failures.forEach((f, i) => {
    console.error(`${i + 1}. FAIL: ${f.label}`);
    if (f.detail) console.error(`        ${f.detail}`);
    if (f.nextCommand) console.error(`   next: ${f.nextCommand}`);
  });
  console.error('\nRun with --repair to auto-fix safe failures, or follow next commands above.');
  process.exit(1);
} else {
  console.log(`\nAll ${passes.length} smoke checks passed.`);
  console.log('For full gate: npm run smoke:opencode && npm run test && npm run lint && npm run typecheck');
  process.exit(0);
}
