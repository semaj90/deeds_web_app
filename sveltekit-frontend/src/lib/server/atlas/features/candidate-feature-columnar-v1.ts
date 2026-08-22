import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateFeatureSnapshotV1Schema,
  type CandidateFeatureSnapshotV1,
} from './candidate-feature-snapshot-v1.js';

export const CANDIDATE_FEATURE_COLUMNAR_SCHEMA = 'atlas.candidate-feature-columnar.v1' as const;

export const CANDIDATE_SCALAR_FEATURES = Object.freeze([
  'semanticRelevance',
  'lexicalRelevance',
  'astAffinity',
  'graphAuthority',
  'personalizedPageRank',
  'communityAffinity',
  'manifold4OrientationSimilarity',
  'crossEncoderRawScore',
  'crossEncoderCalibratedScore',
  'domainAffinity',
  'executionUtility',
  'memoryUtility',
] as const);

export const CANDIDATE_LANE_BITS = Object.freeze({
  semantic: 1 << 0,
  lexical: 1 << 1,
  ast: 1 << 2,
  graph: 1 << 3,
  manifold4: 1 << 4,
  cross_encoder: 1 << 5,
  domain: 1 << 6,
  execution: 1 << 7,
  memory: 1 << 8,
} as const);

export type CandidateScalarFeatureName = typeof CANDIDATE_SCALAR_FEATURES[number];

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const candidateFeatureColumnarV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_COLUMNAR_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  workspaceRevision: revision,
  featureRevision: revision,
  rowCount: z.number().int().nonnegative(),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  candidateOrdinals: z.array(z.number().int().nonnegative()),
  canonicalIds: z.array(z.string().min(1)),
  packetKeys: z.array(z.string().min(1).nullable()),
  treeNodeIds: z.array(z.string().min(1).nullable()),
  symbolVersionIds: z.array(z.string().min(1).nullable()),
  sourceRevisions: z.array(z.string().min(1)),
  graphRevisions: z.array(z.string().min(1).nullable()),
  semanticRevisions: z.array(z.string().min(1).nullable()),
  degradedIdentity: z.array(z.union([z.literal(0), z.literal(1)])),
  laneMaskU16: z.array(z.number().int().min(0).max(0xffff)),
  featureNames: z.tuple(CANDIDATE_SCALAR_FEATURES.map((name) => z.literal(name)) as [
    z.ZodLiteral<CandidateScalarFeatureName>,
    ...z.ZodLiteral<CandidateScalarFeatureName>[],
  ]),
  featureValues: z.array(z.number().finite()),
  featurePresence: z.array(z.union([z.literal(0), z.literal(1)])),
  candidateOrdinalsChecksum: checksum,
  featureValuesChecksum: checksum,
  featurePresenceChecksum: checksum,
  rowIdentityChecksum: checksum,
  columnarChecksum: checksum,
  byteOrder: z.literal('little-endian'),
  featureDtype: z.literal('float32'),
  presenceDtype: z.literal('uint8'),
  ordinalDtype: z.literal('uint32'),
  laneMaskDtype: z.literal('uint16'),
  logicalRowsOnly: z.literal(true),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  producerRevision: revision,
}).strict();

export type CandidateFeatureColumnarV1 = z.infer<typeof candidateFeatureColumnarV1Schema>;

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function encodeU32LE(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function encodeF32LE(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

function stableIdentityJson(snapshot: CandidateFeatureSnapshotV1): string {
  return JSON.stringify(snapshot.rows.map((row) => ({
    candidateOrdinal: row.candidateOrdinal,
    canonicalId: row.canonicalId,
    packetKey: row.packetKey,
    treeNodeId: row.treeNodeId,
    symbolVersionId: row.symbolVersionId,
    sourceRevision: row.sourceRevision,
    graphRevision: row.graphRevision,
    semanticRevision: row.semanticRevision,
    degradedIdentity: row.degradedIdentity,
  })));
}

function laneMask(row: CandidateFeatureSnapshotV1['rows'][number]): number {
  let mask = 0;
  for (const lane of row.laneMask) mask |= CANDIDATE_LANE_BITS[lane];
  return mask;
}

export function verifyCandidateFeatureSnapshotChecksum(snapshot: CandidateFeatureSnapshotV1): void {
  // The snapshot materializer already canonicalizes row ordering. Rebuild the same payload
  // rather than trusting a caller-provided checksum before producing physical bytes.
  const payload = {
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    workspaceRevision: snapshot.workspaceRevision,
    featureRevision: snapshot.featureRevision,
    rows: snapshot.rows,
  };
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]));
    }
    return value;
  };
  const actual = sha256(JSON.stringify(canonicalize(payload)));
  if (actual !== snapshot.snapshotChecksum) {
    throw new Error(`FEATURE_SNAPSHOT_CHECKSUM_MISMATCH:${actual}:${snapshot.snapshotChecksum}`);
  }
}

/**
 * FEAT-03A CPU reference materializer.
 *
 * The logical snapshot remains authoritative for candidate membership. This function
 * only compiles it into portable columnar execution buffers. Missing scalar values are
 * encoded as value=0 + presence=0; an actual numeric zero is value=0 + presence=1.
 */
export function materializeCandidateFeatureColumnar(input: {
  snapshot: z.input<typeof candidateFeatureSnapshotV1Schema>;
  producerRevision: string;
}): CandidateFeatureColumnarV1 {
  const snapshot = candidateFeatureSnapshotV1Schema.parse(input.snapshot);
  verifyCandidateFeatureSnapshotChecksum(snapshot);

  for (let ordinal = 0; ordinal < snapshot.rowCount; ordinal += 1) {
    const row = snapshot.rows[ordinal];
    if (!row || row.candidateOrdinal !== ordinal) {
      throw new Error(`FEATURE_COLUMNAR_NON_DENSE_ORDINAL:${ordinal}`);
    }
  }

  const candidateOrdinals = snapshot.rows.map((row) => row.candidateOrdinal);
  const featureValues: number[] = [];
  const featurePresence: Array<0 | 1> = [];

  for (const row of snapshot.rows) {
    for (const featureName of CANDIDATE_SCALAR_FEATURES) {
      const value = row[featureName];
      if (value === null) {
        featureValues.push(0);
        featurePresence.push(0);
      } else {
        if (!Number.isFinite(value)) throw new Error(`FEATURE_COLUMNAR_NON_FINITE:${row.candidateOrdinal}:${featureName}`);
        featureValues.push(Math.fround(value));
        featurePresence.push(1);
      }
    }
  }

  const candidateOrdinalsChecksum = sha256(encodeU32LE(candidateOrdinals));
  const featureValuesChecksum = sha256(encodeF32LE(featureValues));
  const featurePresenceChecksum = sha256(Uint8Array.from(featurePresence));
  const rowIdentityChecksum = sha256(stableIdentityJson(snapshot));
  const columnarChecksum = sha256(JSON.stringify({
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    featureSnapshotChecksum: snapshot.snapshotChecksum,
    candidateOrdinalsChecksum,
    featureValuesChecksum,
    featurePresenceChecksum,
    rowIdentityChecksum,
    featureNames: CANDIDATE_SCALAR_FEATURES,
  }));

  return candidateFeatureColumnarV1Schema.parse({
    schema: CANDIDATE_FEATURE_COLUMNAR_SCHEMA,
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    featureSnapshotChecksum: snapshot.snapshotChecksum,
    workspaceRevision: snapshot.workspaceRevision,
    featureRevision: snapshot.featureRevision,
    rowCount: snapshot.rowCount,
    featureCount: CANDIDATE_SCALAR_FEATURES.length,
    candidateOrdinals,
    canonicalIds: snapshot.rows.map((row) => row.canonicalId),
    packetKeys: snapshot.rows.map((row) => row.packetKey),
    treeNodeIds: snapshot.rows.map((row) => row.treeNodeId),
    symbolVersionIds: snapshot.rows.map((row) => row.symbolVersionId),
    sourceRevisions: snapshot.rows.map((row) => row.sourceRevision),
    graphRevisions: snapshot.rows.map((row) => row.graphRevision),
    semanticRevisions: snapshot.rows.map((row) => row.semanticRevision),
    degradedIdentity: snapshot.rows.map((row) => row.degradedIdentity ? 1 : 0),
    laneMaskU16: snapshot.rows.map(laneMask),
    featureNames: CANDIDATE_SCALAR_FEATURES,
    featureValues,
    featurePresence,
    candidateOrdinalsChecksum,
    featureValuesChecksum,
    featurePresenceChecksum,
    rowIdentityChecksum,
    columnarChecksum,
    byteOrder: 'little-endian',
    featureDtype: 'float32',
    presenceDtype: 'uint8',
    ordinalDtype: 'uint32',
    laneMaskDtype: 'uint16',
    logicalRowsOnly: true,
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: input.producerRevision,
  });
}
