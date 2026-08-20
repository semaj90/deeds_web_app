#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GraphifyStructuralMaterializer } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import {
  runGraphifyStructuralBatchV1,
  type GraphifyStructuralBatchFileReceiptV1,
} from '$lib/server/atlas/indexing/graphify-structural-batch-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const JSON_REPORT = path.join(REPORT_DIR, 'graphify-structural-integration-proof.json');
const MD_REPORT = path.join(REPORT_DIR, 'graphify-structural-integration-proof.md');
const PRODUCER_REVISION = 'atlas.graphify-structural-batch-proof.v1';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sourceRevision(source: string): string {
  return `content:${sha256(source)}`;
}

const sources = {
  validA: 'export function validA(value: number) { return value + 1; }',
  malformed: 'export function malformed(value: number) { if (value > 0) return value;',
  validB: 'export const validB = (value: string) => value.toUpperCase();',
  unchanged: 'export const unchanged = 1;',
  changedOld: 'export const changed = 1;',
  changedNew: 'export const changed = 2;',
  deletedOld: 'export const deleted = true;',
};

const workspaceRevision = process.env.ATLAS_WORKSPACE_REVISION?.trim() || 'proof:graphify-structural-batch-integration';
const materializer = new GraphifyStructuralMaterializer();

const receipt = await runGraphifyStructuralBatchV1({
  workspaceRevision,
  producerRevision: PRODUCER_REVISION,
  inputs: [
    {
      schema: 'atlas.graphify-structural-delta-input.v1',
      action: 'UPSERT',
      sourceRef: 'proof/valid-a.ts',
      sourceRevision: sourceRevision(sources.validA),
      language: 'typescript',
      source: sources.validA,
    },
    {
      schema: 'atlas.graphify-structural-delta-input.v1',
      action: 'UPSERT',
      sourceRef: 'proof/malformed.ts',
      sourceRevision: sourceRevision(sources.malformed),
      language: 'typescript',
      source: sources.malformed,
    },
    {
      schema: 'atlas.graphify-structural-delta-input.v1',
      action: 'UPSERT',
      sourceRef: 'proof/valid-b.ts',
      sourceRevision: sourceRevision(sources.validB),
      language: 'typescript',
      source: sources.validB,
    },
    {
      schema: 'atlas.graphify-structural-delta-input.v1',
      action: 'UPSERT',
      sourceRef: 'proof/unchanged.ts',
      sourceRevision: sourceRevision(sources.unchanged),
      previousSourceRevision: sourceRevision(sources.unchanged),
      language: 'typescript',
      source: sources.unchanged,
    },
    {
      schema: 'atlas.graphify-structural-delta-input.v1',
      action: 'UPSERT',
      sourceRef: 'proof/changed.ts',
      sourceRevision: sourceRevision(sources.changedNew),
      previousSourceRevision: sourceRevision(sources.changedOld),
      language: 'typescript',
      source: sources.changedNew,
    },
    {
      schema: 'atlas.graphify-structural-delta-input.v1',
      action: 'DELETE',
      sourceRef: 'proof/deleted.ts',
      sourceRevision: `delete-observation:${sha256('proof/deleted.ts')}`,
      previousSourceRevision: sourceRevision(sources.deletedOld),
      identity: {
        canonicalId: 'proof:canonical:deleted',
        packetKey: 'proof:packet:deleted',
        treeNodeId: 'proof:tree:deleted',
        symbolVersionId: 'proof:symbol:deleted',
      },
    },
  ],
}, materializer);

function byRef(sourceRef: string): GraphifyStructuralBatchFileReceiptV1 {
  const row = receipt.files.find((file) => file.sourceRef === sourceRef);
  if (!row) throw new Error(`PROOF_FILE_RECEIPT_MISSING:${sourceRef}`);
  return row;
}

const validA = byRef('proof/valid-a.ts');
const malformed = byRef('proof/malformed.ts');
const validB = byRef('proof/valid-b.ts');
const unchanged = byRef('proof/unchanged.ts');
const changed = byRef('proof/changed.ts');
const deleted = byRef('proof/deleted.ts');

const gph15ParseFailureIsolation = receipt.isolatedFailurePass
  && validA.status === 'PROVEN'
  && validB.status === 'PROVEN'
  && (malformed.status === 'RECOVERED_WITH_ERRORS' || malformed.status === 'FAILED')
  && receipt.files.length === 6;

const gph16ProductionDeltaOrchestration = receipt.incrementalDeltaPass
  && unchanged.status === 'SKIPPED_UNCHANGED'
  && unchanged.parserInvoked === false
  && (changed.status === 'PROVEN' || changed.status === 'RECOVERED_WITH_ERRORS')
  && changed.parserInvoked === true
  && deleted.status === 'TOMBSTONED'
  && deleted.parserInvoked === false
  && receipt.tombstoneCount === 1;

const report = {
  schema: 'atlas.graphify-structural-integration-proof.v1',
  status: gph15ParseFailureIsolation && gph16ProductionDeltaOrchestration
    ? 'DRY_RUN_PROVEN'
    : 'DRY_RUN_NOT_PROVEN',
  generatedAt: new Date().toISOString(),
  provider: 'treesitter-chunker-8095',
  gph15ParseFailureIsolation,
  gph16ProductionDeltaOrchestration,
  productionPersistenceReadback: false,
  graphifyDailyReachability: false,
  canonicalOwnerAccepted: false,
  applyAuthorized: false,
  receipt,
  notes: [
    'This proof calls the live GraphifyStructuralMaterializer/8095 provider but does not request canonical persistence.',
    'DELETE is proven only as an observed downstream tombstone fact; PostgreSQL lifecycle ownership remains unresolved.',
    'graphifyDailyReachability remains false because this script does not invoke graphify:daily.',
    'A recovered malformed parse is acceptable for GPH-15 if neighboring valid files remain proven and the batch continues.',
  ],
};

await mkdir(REPORT_DIR, { recursive: true });
await writeFile(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const rows = receipt.files.map((file) =>
  `| \`${file.sourceRef}\` | ${file.action} | ${file.status} | ${file.parserInvoked ? 'yes' : 'no'} | ${file.provenanceReadiness ?? 'n/a'} |`,
).join('\n');
const markdown = `# Graphify Structural Integration Proof\n\nStatus: **${report.status}**\n\n- GPH-15 parse failure isolation: **${gph15ParseFailureIsolation}**\n- GPH-16 production delta orchestration: **${gph16ProductionDeltaOrchestration}**\n- Production persistence readback: **false**\n- Graphify daily reachability: **false**\n- Canonical owner accepted: **false**\n- APPLY authorized: **false**\n\n| Source | Action | Status | Parser invoked | Provenance |\n| --- | --- | --- | --- | --- |\n${rows}\n\nTombstones: **${receipt.tombstoneCount}**\n\nOutput checksum: \`${receipt.outputChecksum}\`\n`;
await writeFile(MD_REPORT, markdown, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  gph15ParseFailureIsolation,
  gph16ProductionDeltaOrchestration,
  productionPersistenceReadback: false,
  graphifyDailyReachability: false,
  jsonReport: path.relative(REPO_ROOT, JSON_REPORT).replaceAll('\\', '/'),
  markdownReport: path.relative(REPO_ROOT, MD_REPORT).replaceAll('\\', '/'),
  outputChecksum: receipt.outputChecksum,
}, null, 2));

if (report.status !== 'DRY_RUN_PROVEN') process.exitCode = 2;
