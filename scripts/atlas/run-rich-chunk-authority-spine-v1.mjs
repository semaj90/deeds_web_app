#!/usr/bin/env node
/**
 * Read-only authority spine for the RichChunk/fanout tranche.
 *
 * Sequence:
 *   1. Anchor to the current proven Graphify snapshot workspace revision.
 *   2. Refresh promotion receipt currentness for that exact workspace.
 *   3. Build the current canonical-chunk CandidateOrdinalMapV2.
 *   4. Reconcile PROMOTION-RECEIPT-COHORT-01 v2.
 *   5. Only if 4 passes, refresh semantic writer census.
 *   6. Reconcile SEMANTIC-768-PHYSICAL-OWNER-01.
 *
 * This runner never starts Graphify, never uses --apply for the semantic
 * writer, and never mutates Postgres/Qdrant/Neo4j/Valkey. The candidate map
 * and reports are rebuildable filesystem artifacts only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPHIFY_RECEIPT = path.join(ROOT, 'docs/reports/graphify-snapshot-native-readback-v1.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function run(command, args, label) {
  console.log(`\n[rich-chunk-authority] ${label}`);
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  return Number(result.status ?? 1);
}

function requireGraphifyAnchor() {
  if (!fs.existsSync(GRAPHIFY_RECEIPT)) {
    throw new Error('GRAPHIFY_SNAPSHOT_NATIVE_READBACK_REQUIRED');
  }
  const receipt = readJson(GRAPHIFY_RECEIPT);
  if (receipt.status !== 'SNAPSHOT_NATIVE_READBACK_PROVEN') {
    throw new Error(`GRAPHIFY_SNAPSHOT_ANCHOR_NOT_PROVEN:${receipt.status ?? 'missing-status'}`);
  }
  const workspaceRevision = String(receipt.workspaceRevision ?? receipt.workspace_revision ?? '').trim();
  if (!/^sha256:[a-f0-9]{64}$/i.test(workspaceRevision)) {
    throw new Error('GRAPHIFY_SNAPSHOT_WORKSPACE_REVISION_INVALID');
  }
  return {
    workspaceRevision,
    executionId: receipt.executionId ?? receipt.execution_id ?? null,
    snapshotRevision: receipt.snapshotRevision ?? receipt.snapshot_revision ?? null,
  };
}

const anchor = requireGraphifyAnchor();
console.log(JSON.stringify({
  gate: 'RICH-CHUNK-AUTHORITY-SPINE-01',
  mode: 'READ_ONLY',
  identityGrain: 'CANONICAL_CHUNK',
  workspaceRevision: anchor.workspaceRevision,
  executionId: anchor.executionId,
  snapshotRevision: anchor.snapshotRevision,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  graphifyRunStarted: false,
}, null, 2));

let code = run(
  process.execPath,
  ['scripts/atlas/audit-promotion-gate-receipt-currentness-v1.mjs', `--workspace-revision=${anchor.workspaceRevision}`],
  'refresh promotion receipt currentness',
);
if (code !== 0) process.exit(code);

code = run(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'tsx',
    'scripts/atlas/materialize-current-chunk-ordinal-map-v2.mts',
    `--workspace-revision=${anchor.workspaceRevision}`,
    '--output=.tmp/atlas/current-chunk-ordinal-map-v2.json',
    '--report=docs/reports/current-chunk-ordinal-map-v2.json',
  ],
  'build current canonical-chunk ordinal map v2',
);
if (code !== 0) {
  console.error('\n[rich-chunk-authority] STOP: CURRENT_CHUNK_ORDINAL_MAP_BLOCKED');
  process.exit(code);
}

code = run(
  process.execPath,
  ['scripts/atlas/reconcile-promotion-receipt-cohort-v2.mjs'],
  'reconcile current-chunk promotion receipt cohort v2',
);
if (code !== 0) {
  console.error('\n[rich-chunk-authority] STOP: PROMOTION_RECEIPT_COHORT_BLOCKED');
  process.exit(code);
}

code = run(
  process.execPath,
  ['scripts/atlas/audit-semantic-768-writer-ownership-v1.mjs'],
  'refresh semantic writer census',
);
if (code !== 0) process.exit(code);

code = run(
  process.execPath,
  ['scripts/atlas/reconcile-semantic-768-physical-owner-v1.mjs'],
  'reconcile semantic physical writer owner',
);
if (code !== 0) {
  console.error('\n[rich-chunk-authority] STOP: SEMANTIC_768_PHYSICAL_OWNER_BLOCKED');
  process.exit(code);
}

console.log(JSON.stringify({
  status: 'RICH_CHUNK_AUTHORITY_SPINE_READY',
  identityGrain: 'CANONICAL_CHUNK',
  workspaceRevision: anchor.workspaceRevision,
  nextGate: 'RICH-CHUNK-CONTRACT-01',
  writesPerformed: false,
}, null, 2));
