import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GraphifyStructuralMaterializer } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-materializer.js';
import {
  runGraphifyStructuralBatchV1,
  type GraphifyStructuralDeltaInputV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const workspaceRevision = process.env.ATLAS_WORKSPACE_REVISION?.trim() || 'proof:workspace-current';
const producerRevision = 'atlas.gph15-gph16-live-proof.v1';

const unchangedSource = 'export function unchanged(){ return 1; }';
const changedSource = 'export function changed(){ return 2; }';

const entries: GraphifyStructuralDeltaInputV1[] = [
  {
    sourceRef: 'proof-fixtures/gph/valid-a.ts',
    action: 'UPSERT',
    source: 'export function alpha(){ return 1; }',
    priorContentHash: 'prior-alpha',
  },
  {
    sourceRef: 'proof-fixtures/gph/malformed.ts',
    action: 'UPSERT',
    source: 'export function broken( { return 1; ',
    priorContentHash: 'prior-broken',
  },
  {
    sourceRef: 'proof-fixtures/gph/valid-b.ts',
    action: 'UPSERT',
    source: 'export function beta(){ return 2; }',
    priorContentHash: 'prior-beta',
  },
  {
    sourceRef: 'proof-fixtures/gph/unchanged.ts',
    action: 'UPSERT',
    source: unchangedSource,
    priorContentHash: sha256(unchangedSource),
  },
  {
    sourceRef: 'proof-fixtures/gph/changed.ts',
    action: 'UPSERT',
    source: changedSource,
    priorContentHash: 'stale-hash',
    currentContentHash: sha256(changedSource),
  },
  {
    sourceRef: 'proof-fixtures/gph/deleted.ts',
    action: 'DELETE',
    priorContentHash: 'deleted-file-hash',
  },
];

const materializer = new GraphifyStructuralMaterializer();
const receipt = await runGraphifyStructuralBatchV1(
  {
    workspaceRevision,
    producerRevision,
    inputMode: 'DELTA_MANIFEST',
    entries,
  },
  materializer,
);

const validA = receipt.files.find((item) => item.sourceRef.endsWith('/valid-a.ts'));
const malformed = receipt.files.find((item) => item.sourceRef.endsWith('/malformed.ts'));
const validB = receipt.files.find((item) => item.sourceRef.endsWith('/valid-b.ts'));
const unchanged = receipt.files.find((item) => item.sourceRef.endsWith('/unchanged.ts'));
const changed = receipt.files.find((item) => item.sourceRef.endsWith('/changed.ts'));
const deleted = receipt.files.find((item) => item.sourceRef.endsWith('/deleted.ts'));

const malformedIsolated = Boolean(
  malformed
  && (malformed.status === 'RECOVERED_WITH_ERRORS' || malformed.status === 'FAILED')
  && malformed.diagnosticCount > 0
  && validA?.status === 'PROVEN'
  && validB?.status === 'PROVEN',
);
const incrementalOrchestration = Boolean(
  unchanged?.status === 'SKIPPED_UNCHANGED'
  && (changed?.status === 'PROVEN' || changed?.status === 'RECOVERED_WITH_ERRORS')
  && deleted?.status === 'TOMBSTONED'
  && receipt.tombstoneCount === 1,
);

const report = {
  schema: 'atlas.graphify-structural-integration-proof.v1',
  generatedAt: new Date().toISOString(),
  producerRevision,
  workspaceRevision,
  mode: 'READ_ONLY_NO_PERSISTENCE',
  gates: {
    gph15ParseFailureIsolation: malformedIsolated,
    gph16ProductionDeltaOrchestration: incrementalOrchestration,
    productionPersistenceReadback: false,
    graphifyDailyReachability: false,
  },
  status: malformedIsolated && incrementalOrchestration ? 'DRY_RUN_PROVEN' : 'FAIL',
  receipt,
};

const outputJson = resolve(repoRoot, 'docs/reports/graphify-structural-integration-proof.json');
const outputMd = resolve(repoRoot, 'docs/reports/graphify-structural-integration-proof.md');
await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(outputMd, [
  '# Graphify structural production-integration proof',
  '',
  `- status: **${report.status}**`,
  `- mode: ${report.mode}`,
  `- GPH-15 parse-failure isolation: ${malformedIsolated ? 'PASS' : 'FAIL'}`,
  `- GPH-16 delta orchestration: ${incrementalOrchestration ? 'PASS' : 'FAIL'}`,
  '- production persistence/readback: PENDING',
  '- graphify:daily reachability: PENDING',
  `- batch checksum: ${receipt.outputChecksum}`,
  '',
  '## File receipts',
  '',
  ...receipt.files.map((item) =>
    `- ${item.sourceRef}: ${item.status}; diagnostics=${item.diagnosticCount}; promotion=${item.canonicalPromotionAllowed}`,
  ),
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({
  status: report.status,
  gph15: malformedIsolated,
  gph16: incrementalOrchestration,
  outputJson,
  outputMd,
  checksum: receipt.outputChecksum,
}, null, 2));

if (report.status !== 'DRY_RUN_PROVEN') process.exitCode = 1;
