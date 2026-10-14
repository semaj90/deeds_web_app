#!/usr/bin/env node
/**
 * compute-validation-progress-v1.mjs
 *
 * Read-only. Derives gate statuses from receipt CONTENTS (not from file
 * existence alone) and reports progress per evidence class. It never
 * produces one blended number: PROVEN_LIVE and fixture-level evidence are
 * counted separately, and gates without an owner/denominator are N/A.
 *
 * Output: docs/reports/validation-progress-v1.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = (p) => path.join(ROOT, p);
const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(rel(p), 'utf8')); } catch { return null; }
};

// Evidence classes, strongest first.
const CLASS = ['PROVEN_LIVE', 'TESTED_FIXTURE', 'GENERATED_UNVERIFIED', 'FAILING', 'BLOCKED', 'NOT_PROVEN'];

const gates = [];
const add = (id, title, evidence, klass, detail) => gates.push({ id, title, evidence, class: klass, detail });

// G-01 resident BFS: receipt must say whether a live request / GPU ran.
{
  const p = 'docs/reports/atlas-resident-bfs-proof-2026-10-13.json';
  const r = readJson(p);
  if (!r) add('G-01', 'Resident BFS vs NetworkX parity', p, 'NOT_PROVEN', 'receipt missing');
  else if (r.liveBfsRequestPerformed === true && r.gpuExecutionPerformed === true && r.status === 'PROVEN')
    add('G-01', 'Resident BFS vs NetworkX parity', p, 'PROVEN_LIVE', 'live request + GPU executed');
  else
    add('G-01', 'Resident BFS vs NetworkX parity', p, 'TESTED_FIXTURE',
      `status=${r.status}; liveBfsRequestPerformed=${r.liveBfsRequestPerformed}; firstUnprovenGate=${r.firstUnprovenGate ?? 'n/a'}`);
}

// G-02 CPU workers: parity is necessary, speedup decides promotion.
{
  const p = 'docs/reports/graph-cpu-worker-qualification-2026-10-13.json';
  const r = readJson(p);
  if (!r) add('G-02', 'CPU worker pool qualification', p, 'NOT_PROVEN', 'receipt missing');
  else if (r.verdict?.status === 'PARITY_OK_SPEEDUP_OBSERVED')
    add('G-02', 'CPU worker pool qualification', p, 'TESTED_FIXTURE', 'parity + speedup on synthetic graph only');
  else if (r.verdict?.status === 'PARITY_OK_NO_SPEEDUP')
    add('G-02', 'CPU worker pool qualification', p, 'FAILING', 'parity ok but slower than single-thread; do not promote');
  else
    add('G-02', 'CPU worker pool qualification', p, 'FAILING', `verdict=${r.verdict?.status ?? 'legacy/unknown (re-run benchmark)'}`);
}

// G-03 schema topology PageRank receipt: present and parseable only.
{
  const p = 'docs/reports/atlas-schema-topology-pagerank-receipt-2026-10-13.json';
  const r = readJson(p);
  add('G-03', 'Schema topology PageRank (NetworkX CPU reference)', p,
    r ? 'GENERATED_UNVERIFIED' : 'NOT_PROVEN',
    r ? 'receipt parses; no independent cuGraph comparison' : 'receipt missing');
}

// G-04 documentation links resolve.
{
  const p = '.tmp/atlas/docs-link-audit.json';
  const r = readJson(p);
  if (!r) add('G-04', 'Docs/OpenSpec links resolve', p, 'NOT_PROVEN', 'audit missing');
  else {
    const broken = r.summary?.broken_links_count ?? null;
    add('G-04', 'Docs/OpenSpec links resolve', p, broken === 0 ? 'TESTED_FIXTURE' : 'FAILING',
      `broken_links=${broken}; scanned=${r.summary?.total_markdown_files_scanned}; many are in vendored/raw doc crawls (not triaged)`);
  }
}

// G-05 sidecar migrations applied vs pending.
{
  const p = 'sveltekit-frontend/drizzle/sidecar-migrations.json';
  const r = readJson(p);
  if (!r) add('G-05', 'Sidecar migrations reconciled with live DB', p, 'NOT_PROVEN', 'registry missing');
  else {
    const counts = {};
    for (const s of r.sidecars ?? []) counts[s.status] = (counts[s.status] ?? 0) + 1;
    const pending = Object.entries(counts).filter(([k]) => k !== 'applied').reduce((a, [, v]) => a + v, 0);
    add('G-05', 'Sidecar migrations reconciled with live DB', p, pending === 0 ? 'TESTED_FIXTURE' : 'BLOCKED',
      `statusCounts=${JSON.stringify(counts)}; registry is bookkeeping, not live-DB proof`);
  }
}

// G-06 live graph: ACTIVE snapshot (manual, from this session's read-only census).
add('G-06', 'ACTIVE graph snapshot with revision binding in PostgreSQL',
  'session census: scripts/atlas/check-graph-snapshot-coverage.mjs', 'BLOCKED',
  'both snapshots SUPERSEDED; graph_revision/workspace_revision columns not applied; traversal + source_ref indexes not applied (manual gate)');

// Workboard denominator (not a validation gate; context only).
let workboard = null;
{
  const r = readJson('docs/reports/openspec-workboard-v1.json');
  if (r?.summary) workboard = {
    completed: r.summary.completedTasks, total: r.summary.totalTasks,
    fraction: r.summary.progressFraction,
    caveat: 'checkbox completion in tasks.md; controller evidence is stale for most tasks and completion does not imply live proof',
    controllerStaleOrMissing: r.controllerEvidence?.staleOrMissingTaskCount,
  };
}

const byClass = Object.fromEntries(CLASS.map((c) => [c, gates.filter((g) => g.class === c).length]));
const n = gates.length;
const report = {
  schema: 'atlas.validation-progress.v1',
  generatedAt: new Date().toISOString(),
  scope: 'only the gates listed here; unscoped phases are N/A, not 0%',
  gates,
  counts: byClass,
  percent: {
    provenLive: +(100 * byClass.PROVEN_LIVE / n).toFixed(1),
    fixtureOrBetter: +(100 * (byClass.PROVEN_LIVE + byClass.TESTED_FIXTURE) / n).toFixed(1),
    gateCount: n,
  },
  workboard,
  writesPerformed: false,
};
fs.writeFileSync(rel('docs/reports/validation-progress-v1.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ counts: byClass, percent: report.percent, gates: gates.map((g) => `${g.id} ${g.class}`) }, null, 2));
