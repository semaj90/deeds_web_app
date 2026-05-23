#!/usr/bin/env node
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const required = [
  'docs/graph/batch-gpu-analysis-report.json',
  'docs/graph/codebase-map.md',
  'memory/atlas/codebase-atlas.latest.md',
  'next_steps/active/karpathy-gpu-recommendations.md',
  'memory/cards/top-100-codebase-summary-cards.json',
  'memory/cards/top-100-codebase-summary-cards.toon',
  'docs/reports/top-100-codebase-summary-cards.md',
  'docs/reports/summary-card-lane-report.json',
  'docs/reports/neo4j-summary-card-report.json',
  'docs/reports/couchdb-summary-card-snapshot.json',
  'docs/reports/duckdb-summary-card-report.json',
];

const missing = [];
for (const rel of required) {
  try {
    await access(path.join(ROOT, rel));
  } catch {
    missing.push(rel);
  }
}

if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, requiredCount: required.length }, null, 2));
