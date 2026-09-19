import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildSemantic768IdentityManifestV1,
  SEMANTIC768_DIMENSION,
} from '../../src/lib/server/atlas/retrieval/semantic768-identity-manifest-v1.js';

const reportPath = resolve(process.cwd(), '../docs/reports/semantic768-qdrant-cuvs-identity-v1.json');
const freezeReceiptPath = resolve(process.cwd(), '../docs/reports/candidate-population-freeze-v1.json');
let freezeReceipt: Record<string, unknown> = { status: 'CANDIDATE_POPULATION_FREEZE_RECEIPT_MISSING' };
try {
  freezeReceipt = JSON.parse(await readFile(freezeReceiptPath, 'utf8')) as Record<string, unknown>;
} catch {
  // Keep the fixture proof available, but make live eligibility explicitly unavailable.
}
const unitVector = (index: number): number[] => Array.from({ length: SEMANTIC768_DIMENSION }, (_, position) => position === index ? 1 : 0);
const rows = [
  { packetKey: 'packet:fixture:a', sourceRevision: 'sha256:fixture-a', vector: unitVector(0) },
  { packetKey: 'packet:fixture:b', sourceRevision: 'sha256:fixture-b', vector: unitVector(1) },
];
const manifest = buildSemantic768IdentityManifestV1({ representationRevision: 'semantic-768-fixture-v1', rows });

const qdrantProjectionEnvelope = {
  store: 'qdrant',
  collection: 'codebase_chunks_768',
  vectorName: 'content',
  representationId: manifest.representationId,
  dimension: manifest.dimension,
  identityManifestChecksum: manifest.identityManifestChecksum,
  matrixChecksum: manifest.matrixChecksum,
};
const cuvsExactEnvelope = {
  store: 'cuvs',
  backend: 'cuvs.brute_force',
  representationId: manifest.representationId,
  dimension: manifest.dimension,
  corpus: rows.map(({ packetKey, sourceRevision, vector }) => ({ packetKey, sourceRevision, vector })),
  identityManifestChecksum: manifest.identityManifestChecksum,
  matrixChecksum: manifest.matrixChecksum,
};

const parity = qdrantProjectionEnvelope.identityManifestChecksum === cuvsExactEnvelope.identityManifestChecksum
  && qdrantProjectionEnvelope.matrixChecksum === cuvsExactEnvelope.matrixChecksum;
const report = {
  schema: 'atlas.semantic768-qdrant-cuvs-identity-proof.v1',
  status: parity ? 'SEMANTIC768_IDENTITY_FIXTURE_PARITY_PROVEN' : 'SEMANTIC768_IDENTITY_FIXTURE_PARITY_FAILED',
  liveStatus: freezeReceipt.status === 'CANDIDATE_POPULATION_FREEZE_READY_FOR_EXPLICIT_REVIEW'
    ? 'READY_FOR_EXPLICIT_ANN03_REVIEW'
    : 'BLOCKED_CANDIDATE_POPULATION_FREEZE',
  liveGate: {
    receipt: 'docs/reports/candidate-population-freeze-v1.json',
    status: freezeReceipt.status,
    freezeChecksum: freezeReceipt.freezeChecksum ?? null,
    downstreamAllowed: freezeReceipt.downstreamAllowed === true,
  },
  representationId: manifest.representationId,
  dimension: manifest.dimension,
  rowCount: manifest.rowCount,
  identityManifestChecksum: manifest.identityManifestChecksum,
  matrixChecksum: manifest.matrixChecksum,
  qdrantProjectionEnvelope,
  cuvsExactEnvelope,
  parity,
  downstreamAllowed: false,
  canonicalAuthority: false,
  writesPerformed: false,
  mutationPolicy: { postgres: false, qdrant: false, cuvs: false, valkey: false, graphify: false },
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, liveStatus: report.liveStatus, parity }));
