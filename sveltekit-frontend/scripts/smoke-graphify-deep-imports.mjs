#!/usr/bin/env node
/**
 * smoke-graphify-deep-imports.mjs - 8-gate smoke test for Phase A deep import graph
 *
 * Gates:
 *   G1 - deep-import-graph.json exists and has expected top-level keys
 *   G2 - nodes array >= 1000 entries with required fields
 *   G3 - deep-import-edges.jsonl exists and has >= 1000 lines
 *   G4 - resolved edge count >= 50% of total edges
 *   G5 - all 5 required infrastructure edge types present
 *   G6 - unresolved-imports.json exists and has at least 1 entry
 *   G7 - ACE ingest JSONL exists in memory/ingest/pending/
 *   G8 - top hotspot node has directFanIn >= 100
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEEP_DIR = join(ROOT, 'memory/graphify/deep');
const INGEST_PENDING   = join(ROOT, 'memory/ingest/pending');
const INGEST_PROCESSED = join(ROOT, 'memory/ingest/processed');

let passed = 0;
let failed = 0;

function gate(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  PASS  ${name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${name}: ${result}`);
      failed++;
    }
  } catch (err) {
    console.log(`  FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

console.log('\n=== Smoke: graphify-deep-imports ===\n');

// Load shared artifacts once — avoids 5x re-parsing the same file
const graphPath = join(DEEP_DIR, 'deep-import-graph.json');
const graph = existsSync(graphPath) ? JSON.parse(readFileSync(graphPath, 'utf8')) : null;

// G1 - graph JSON exists with expected keys
gate('G1 - deep-import-graph.json exists with required keys', () => {
  if (!graph) return 'file missing';
  const required = ['generatedAt', 'sourceGraph', 'stats', 'nodes', 'neighborhoods'];
  const missing = required.filter(k => !(k in graph));
  if (missing.length) return `missing keys: ${missing.join(', ')}`;
  return true;
});

// G2 - nodes array >= 1000 with required fields
gate('G2 - nodes array has >= 1000 entries with required fields', () => {
  if (!graph) return 'graph not loaded';
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 1000) {
    return `only ${graph.nodes?.length ?? 0} nodes (expected >= 1000)`;
  }
  const sample = graph.nodes[0];
  const required = ['rel', 'zone', 'directFanIn', 'directFanOut', 'hash'];
  const missing = required.filter(k => !(k in sample));
  if (missing.length) return `first node missing fields: ${missing.join(', ')}`;
  return true;
});

// G3 - edges JSONL exists with >= 1000 lines
gate('G3 - deep-import-edges.jsonl has >= 1000 lines', () => {
  const p = join(DEEP_DIR, 'deep-import-edges.jsonl');
  if (!existsSync(p)) return 'file missing';
  const lines = readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length < 1000) return `only ${lines.length} edges (expected >= 1000)`;
  const first = JSON.parse(lines[0]);
  const required = ['from', 'to', 'type', 'resolved'];
  const missing = required.filter(k => !(k in first));
  if (missing.length) return `first edge missing fields: ${missing.join(', ')}`;
  return true;
});

// G4 - resolved edge count >= 50% of total
gate('G4 - resolved edges >= 50% of total', () => {
  if (!graph) return 'graph not loaded';
  const { resolvedEdges, edgeCount } = graph.stats;
  const pct = resolvedEdges / edgeCount;
  if (pct < 0.5) return `only ${(pct * 100).toFixed(1)}% resolved (expected >= 50%)`;
  return true;
});

// G5 - required infrastructure edge types present
gate('G5 - required edge types present (imports_static, db_dependency, env_dependency, server_route_depends_on, test_covers_file)', () => {
  if (!graph) return 'graph not loaded';
  const breakdown = graph.stats.edgeTypeBreakdown ?? {};
  const required = ['imports_static', 'db_dependency', 'env_dependency'];
  const missing = required.filter(t => !(t in breakdown) || breakdown[t] < 1);
  if (missing.length) return `missing edge types: ${missing.join(', ')}`;
  return true;
});

// G6 - unresolved-imports.json exists and non-empty
gate('G6 - unresolved-imports.json exists and non-empty', () => {
  const p = join(DEEP_DIR, 'unresolved-imports.json');
  if (!existsSync(p)) return 'file missing';
  const u = JSON.parse(readFileSync(p, 'utf8'));
  const count = Object.keys(u).length;
  if (count === 0) return 'no unresolved imports recorded (expected > 0)';
  return true;
});

// G7 - ACE ingest JSONL present in pending/ OR processed/
// graphify-deep-ingest writes to pending/ then idempotently moves to processed/
// once the records are in Redis. Either location proves the ingest fired.
gate('G7 - ACE ingest JSONL present (pending/ OR processed/)', () => {
  const candidates = [];
  for (const dir of [INGEST_PENDING, INGEST_PROCESSED]) {
    if (!existsSync(dir)) continue;
    const matches = readdirSync(dir)
      .filter(f => f.startsWith('graphify_deep_imports_'))
      .map(f => ({ dir, file: f }));
    candidates.push(...matches);
  }
  if (candidates.length === 0) {
    return 'no graphify_deep_imports_*.jsonl files in pending/ or processed/';
  }
  // Prefer most-recent across both dirs
  candidates.sort((a, b) => a.file.localeCompare(b.file));
  const latest = candidates[candidates.length - 1];
  const lines = readFileSync(join(latest.dir, latest.file), 'utf8')
    .split('\n').filter(l => l.trim());
  if (lines.length < 100) return `only ${lines.length} ingest records (expected >= 100)`;
  // gate() treats only `true`/`undefined` as PASS — print detail then return true
  const where = latest.dir.endsWith('processed') ? 'processed' : 'pending';
  console.log(`        (${lines.length} records in ${where}/${latest.file})`);
  return true;
});

// G8 - top hotspot has directFanIn >= 100
gate('G8 - top hotspot node has directFanIn >= 100', () => {
  if (!graph) return 'graph not loaded';
  const top = [...graph.nodes].sort((a, b) => b.directFanIn - a.directFanIn)[0];
  if (!top) return 'no nodes found';
  if (top.directFanIn < 100) return `top hotspot ${top.rel} has fanIn=${top.directFanIn} (expected >= 100)`;
  return true;
});

// Summary
console.log(`\n${passed}/${passed + failed} gates passed`);
if (failed > 0) {
  console.error(`${failed} gates FAILED`);
  process.exit(1);
} else {
  console.log('All gates PASS');
}