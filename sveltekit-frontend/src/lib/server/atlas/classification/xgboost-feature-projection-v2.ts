import { createHash } from 'node:crypto';
import { z } from 'zod';

import { candidateFeatureSnapshotV1Schema } from '../features/candidate-feature-snapshot-v1.js';
import { CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';

export const XGBOOST_FEATURE_PROJECTION_V2_SCHEMA =
  'atlas.xgboost-feature-projection.v2' as const;

const revision = z.string().trim().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);

type XgboostFeatureProjectionV2Row = {
  candidateOrdinal: number;
  canonicalId: string;
  sourceRef: string;
  sourceRevision: string;
  values: number[];
};

const mappingSchema = z.object({
  targetName: z.string().trim().min(1),
  sourceName: z.enum(CANDIDATE_SCALAR_FEATURES),
  derivationRevision: revision,
  evidenceRefs: z.array(z.string().trim().min(1)).min(1),
  nullPolicy: z.literal('REJECT'),
}).strict();

export const xgboostFeatureProjectionV2Schema = z.object({
  schema: z.literal(XGBOOST_FEATURE_PROJECTION_V2_SCHEMA),
  projectionRevision: revision,
  sourceFeatureRevision: revision,
  modelAbiRevision: revision,
  targetFeatureNames: z.array(z.string().trim().min(1)).min(1),
  mappings: z.array(mappingSchema).min(1),
  projectionChecksum: checksum,
}).strict();

export type XgboostFeatureProjectionV2 = z.infer<typeof xgboostFeatureProjectionV2Schema>;

export type XgboostFeatureProjectionV2Result =
  | {
      status: 'ADMITTED';
      candidateSnapshotRevision: string;
      ordinalMapChecksum: string;
      workspaceRevision: string;
      featureRevision: string;
      projectionRevision: string;
      modelAbiRevision: string;
      featureNames: string[];
      rows: XgboostFeatureProjectionV2Row[];
      featureValuesChecksum: string;
    }
  | { status: 'REJECTED'; reason: string };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function checksumPayload(manifest: XgboostFeatureProjectionV2): unknown {
  return {
    projectionRevision: manifest.projectionRevision,
    sourceFeatureRevision: manifest.sourceFeatureRevision,
    modelAbiRevision: manifest.modelAbiRevision,
    targetFeatureNames: manifest.targetFeatureNames,
    mappings: manifest.mappings,
  };
}

/**
 * Pure V2 projection boundary. The caller supplies the ABI explicitly; this
 * function never aliases legacy names, fills nulls, assigns candidates, or
 * persists model data.
 */
export function materializeXgboostFeatureProjectionV2(input: {
  manifest: unknown;
  snapshot: unknown;
}): XgboostFeatureProjectionV2Result {
  const parsedManifest = xgboostFeatureProjectionV2Schema.safeParse(input.manifest);
  if (!parsedManifest.success) return { status: 'REJECTED', reason: 'PROJECTION_MANIFEST_INVALID' };
  const manifest = parsedManifest.data;

  if (manifest.sourceFeatureRevision !== manifest.sourceFeatureRevision.trim()) {
    return { status: 'REJECTED', reason: 'SOURCE_FEATURE_REVISION_INVALID' };
  }
  if (manifest.targetFeatureNames.length !== manifest.mappings.length) {
    return { status: 'REJECTED', reason: 'TARGET_MAPPING_COUNT_MISMATCH' };
  }
  if (manifest.mappings.some((mapping, index) => mapping.targetName !== manifest.targetFeatureNames[index])) {
    return { status: 'REJECTED', reason: 'TARGET_MAPPING_ORDER_MISMATCH' };
  }
  if (new Set(manifest.targetFeatureNames).size !== manifest.targetFeatureNames.length) {
    return { status: 'REJECTED', reason: 'DUPLICATE_TARGET_FEATURE' };
  }
  if (sha256(checksumPayload(manifest)) !== manifest.projectionChecksum) {
    return { status: 'REJECTED', reason: 'PROJECTION_CHECKSUM_MISMATCH' };
  }

  const parsedSnapshot = candidateFeatureSnapshotV1Schema.safeParse(input.snapshot);
  if (!parsedSnapshot.success) return { status: 'REJECTED', reason: 'CANDIDATE_SNAPSHOT_INVALID' };
  const snapshot = parsedSnapshot.data;
  if (snapshot.featureRevision !== manifest.sourceFeatureRevision) {
    return { status: 'REJECTED', reason: 'SOURCE_FEATURE_REVISION_MISMATCH' };
  }

  const rows: XgboostFeatureProjectionV2Row[] = [];
  for (const row of snapshot.rows) {
    if (row.sourceRef === null) return { status: 'REJECTED', reason: `SOURCE_REF_MISSING:${row.candidateOrdinal}` };
    const values: number[] = [];
    for (const mapping of manifest.mappings) {
      const value = row[mapping.sourceName];
      if (value === null || !Number.isFinite(value)) {
        return { status: 'REJECTED', reason: `FEATURE_VALUE_MISSING:${row.candidateOrdinal}:${mapping.sourceName}` };
      }
      values.push(value);
    }
    rows.push({
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: row.canonicalId,
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision,
      values,
    });
  }

  return {
    status: 'ADMITTED',
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    workspaceRevision: snapshot.workspaceRevision,
    featureRevision: snapshot.featureRevision,
    projectionRevision: manifest.projectionRevision,
    modelAbiRevision: manifest.modelAbiRevision,
    featureNames: [...manifest.targetFeatureNames],
    rows,
    featureValuesChecksum: sha256(rows),
  };
}

export function buildXgboostFeatureProjectionV2(input: {
  projectionRevision: string;
  sourceFeatureRevision: string;
  modelAbiRevision: string;
  mappings: ReadonlyArray<z.input<typeof mappingSchema>>;
}): XgboostFeatureProjectionV2 {
  const mappings = input.mappings.map((mapping) => ({
    ...mapping,
    evidenceRefs: [...mapping.evidenceRefs],
  }));
  const manifest = {
    schema: XGBOOST_FEATURE_PROJECTION_V2_SCHEMA,
    projectionRevision: input.projectionRevision,
    sourceFeatureRevision: input.sourceFeatureRevision,
    modelAbiRevision: input.modelAbiRevision,
    targetFeatureNames: mappings.map((mapping) => mapping.targetName),
    mappings,
  };
  return xgboostFeatureProjectionV2Schema.parse({
    ...manifest,
    projectionChecksum: sha256({
      projectionRevision: manifest.projectionRevision,
      sourceFeatureRevision: manifest.sourceFeatureRevision,
      modelAbiRevision: manifest.modelAbiRevision,
      targetFeatureNames: manifest.targetFeatureNames,
      mappings: manifest.mappings,
    }),
  });
}
