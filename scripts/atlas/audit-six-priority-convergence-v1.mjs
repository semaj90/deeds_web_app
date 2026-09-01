#!/usr/bin/env node

/** Read-only dependency-ordered census for the six Parent Atlas workstreams. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'docs/reports/six-priority-convergence-audit-v1.json');
const streams = [
  ['A', 'parent-atlas-retrieval-lod-algorithm-taxonomy', 'ACTIVE_EVALUATION_FIRST', 'Freeze qrels and regression baseline before new executors.'],
  ['B', 'parent-atlas-retrieval-fusion-reachability', 'ACTIVE_OWNER_CONVERGENCE', 'Finish RF5/RF6 and preserve one vote per logical lane.'],
  ['C', 'parent-atlas-semantic-768-canonical-contract', 'ACTIVE_RECONCILIATION', 'Reconcile Qdrant projection identity; semantic_768 remains canonical.'],
  ['D', 'parent-atlas-semantic-512-canonicalization', 'HISTORICAL_SUPERSEDED', 'No implementation; semantic_768 supersedes the older 512 policy.'],
  ['E', 'parent-atlas-telemetry-lowrank-recommendation-okf-integration', 'STALE_LEDGER_RECONCILIATION', 'Verify wired claims; keep HLL writer and promotion gates open.'],
  ['F', 'parent-atlas-tensor-residency-integration', 'ACTIVE_SELECTIVE', 'Proceed with artifact/residency contracts; execution_utility remains unproven.'],
];

async function main() {
  const rows = [];
  for (const [order, change, status, nextGate] of streams) {
    const taskPath = path.join(root, 'openspec/changes', change, 'tasks.md');
    let text = '';
    try { text = await readFile(taskPath, 'utf8'); } catch { rows.push({ order, change, status: 'MISSING_TASKS', nextGate, taskPath }); continue; }
    const completed = (text.match(/^\s*- \[x\]/gim) ?? []).length;
    const open = (text.match(/^\s*- \[ \]/gim) ?? []).length;
    rows.push({ order, change, status, nextGate, taskPath: path.relative(root, taskPath), completed, open, total: completed + open });
  }
  const report = {
    schema: 'atlas.six-priority-convergence-audit.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_TASK_LEDGER_CENSUS',
    dependencyOrder: rows.map((row) => `${row.order}:${row.change}`),
    rows,
    policy: {
      doNotTreatUncheckedAsNewImplementation: true,
      semantic512: 'historical_only',
      executionUtility: 'must_not_be_fabricated_or_zero_filled',
      gpuProviders: 'downstream_of_identity_and_fusion',
      canonicalWrites: false,
    },
    nextGate: 'A_LOD_EVALUATION_BASELINE_THEN_B_FUSION_OWNER_CONVERGENCE',
    writesPerformed: false,
  };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
