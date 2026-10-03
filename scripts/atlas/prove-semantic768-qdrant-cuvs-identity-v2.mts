#!/usr/bin/env tsx

/**
 * ANN-03 fixture proof.
 *
 * This proves that the Qdrant and cuVS envelopes can be bound to one
 * semantic_768 identity/matrix manifest. It deliberately does not contact
 * either service and cannot authorize live parity or projection writes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSemantic768IdentityManifestV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/semantic768-identity-manifest-v1.js';
import { assertSemantic768ExecutorParityV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/semantic768-executor-parity-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(
  process.env.ATLAS_SEMANTIC768_IDENTITY_PROOF_REPORT ??
    path.join(root, 'docs/reports/semantic768-qdrant-cuvs-identity-v2.json'),
);
const freezePath = path.resolve(
  process.env.ATLAS_CANDIDATE_FREEZE_REPORT ??
    path.join(root, 'docs/reports/candidate-population-freeze-v1.json'),
);

const unitVector = (axis: number): number[] =>
  Array.from({ length: 768 }, (_, index) => (index === axis ? 1 : 0));

const rows = [
  { packetKey: 'fixture:packet:a', sourceRevision: 'sha256:fixture-source-a', vector: unitVector(0) },
  { packetKey: 'fixture:packet:b', sourceRevision: 'sha256:fixture-source-b', vector: unitVector(1) },
];

const manifest = buildSemantic768IdentityManifestV1({
  representationRevision: 'semantic_768:fixture-v1',
  rows,
});

const qdrantEnvelope = {
  executor: 'qdrant',
  representationId: manifest.representationId,
  representationRevision: manifest.representationRevision,
  dimension: manifest.dimension,
  rowCount: manifest.rowCount,
  identityManifestChecksum: manifest.identityManifestChecksum,
  matrixChecksum: manifest.matrixChecksum,
  canonicalAuthority: false,
  writesPerformed: false,
};

const cuvsEnvelope = {
  executor: 'cuvs_exact_fixture',
  representationId: manifest.representationId,
  representationRevision: manifest.representationRevision,
  dimension: manifest.dimension,
  rowCount: manifest.rowCount,
  identityManifestChecksum: manifest.identityManifestChecksum,
  matrixChecksum: manifest.matrixChecksum,
  canonicalAuthority: false,
  writesPerformed: false,
};

const parity = assertSemantic768ExecutorParityV1(qdrantEnvelope, cuvsEnvelope);

let freeze: { status?: string; workspaceRevision?: string; downstreamAllowed?: boolean } = {};
try {
  freeze = JSON.parse(await fs.readFile(freezePath, 'utf8')) as typeof freeze;
} catch {
  freeze = {};
}

const report = {
  schema: 'atlas.semantic768-qdrant-cuvs-identity-proof.v2',
  status: parity.sameIdentityManifest && parity.sameMatrix
    ? 'SEMANTIC768_IDENTITY_FIXTURE_PARITY_PROVEN'
    : 'SEMANTIC768_IDENTITY_FIXTURE_PARITY_FAILED',
  liveStatus: freeze.status === 'CANDIDATE_POPULATION_FREEZE_PROVEN'
    ? 'LIVE_ELIGIBILITY_REQUIRES_CURRENT_LINEAGE_READBACK'
    : 'BLOCKED_CANDIDATE_POPULATION_FREEZE',
  source: 'deterministic two-row fixture; no Qdrant/cuVS service calls',
  rowCount: manifest.rowCount,
  representationId: manifest.representationId,
  representationRevision: manifest.representationRevision,
  dimension: manifest.dimension,
  identityManifestChecksum: manifest.identityManifestChecksum,
  matrixChecksum: manifest.matrixChecksum,
  sameIdentityManifest: parity.sameIdentityManifest,
  sameMatrix: parity.sameMatrix,
  parityReceipt: parity,
  qdrantEnvelope,
  cuvsEnvelope,
  candidateFreeze: {
    status: freeze.status ?? null,
    workspaceRevision: freeze.workspaceRevision ?? null,
    downstreamAllowed: freeze.downstreamAllowed ?? false,
  },
  canonicalAuthority: false,
  downstreamAllowed: false,
  writesPerformed: false,
  databaseWrites: false,
  qdrantWrites: false,
  cuvsWrites: false,
  nextGate: 'CURRENT_LINEAGE_AND_LIVE_QDRANT_CUVS_READBACK',
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
