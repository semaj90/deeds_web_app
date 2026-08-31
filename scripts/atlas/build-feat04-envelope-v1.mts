#!/usr/bin/env node
/**
 * Build a bounded FEAT-04 pack/gather envelope from an existing validated
 * CandidateFeatureSnapshotV1. This is an artifact compiler only: it does not
 * query or mutate PostgreSQL, Qdrant, Valkey, Neo4j, or GPU memory.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { materializeCandidateFeatureColumnar } from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.js';
import {
  gatherCandidateFeatureGpuRows,
  materializeCandidateFeatureGpuPack,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-pack-v1.js';
import { candidateFeatureSnapshotV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-snapshot-v1.js';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value?.startsWith('--')) args.set(value.slice(2), process.argv[index + 1] ?? '');
}

const inputPath = args.get('input');
const outputPath = args.get('output');
const limit = Number(args.get('limit') ?? '32');
if (!inputPath || !outputPath) throw new Error('FEAT04_INPUT_AND_OUTPUT_REQUIRED');
if (!Number.isInteger(limit) || limit < 1 || limit > 128) throw new Error('FEAT04_LIMIT_MUST_BE_1_TO_128');

const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as { snapshot?: unknown } | unknown;
const snapshot = candidateFeatureSnapshotV1Schema.parse(
  raw && typeof raw === 'object' && 'snapshot' in raw ? raw.snapshot : raw,
);
if (snapshot.rowCount === 0) throw new Error('FEAT04_EMPTY_SNAPSHOT');

const producerRevision = 'atlas.feat04-envelope-builder.v1';
const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision });
const pack = materializeCandidateFeatureGpuPack({ columnar, producerRevision });
const selectedOrdinals = Array.from({ length: Math.min(limit, snapshot.rowCount) }, (_, ordinal) => ordinal);
const gather = gatherCandidateFeatureGpuRows({ pack, selectedOrdinals, producerRevision });

const envelope = {
  schema: 'atlas.candidate-feature-gpu-feat04-envelope.v1',
  candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
  ordinalMapChecksum: snapshot.ordinalMapChecksum,
  featureSnapshotChecksum: snapshot.snapshotChecksum,
  selectedOrdinals,
  pack,
  gather,
  identityAuthority: false,
  canonicalOwnerChanged: false,
  writesPerformed: false,
  producerRevision,
};
writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'FEAT04_ENVELOPE_BUILT',
  output: outputPath,
  logicalRows: pack.logicalRows,
  physicalRows: pack.physicalRows,
  selectedRows: gather.selectedRowCount,
  featureCount: pack.featureCount,
  gpuPackChecksum: pack.gpuPackChecksum,
  gatherChecksum: gather.gatherChecksum,
  writesPerformed: false,
}, null, 2));
