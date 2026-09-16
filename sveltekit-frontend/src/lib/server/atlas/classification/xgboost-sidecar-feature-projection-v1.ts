import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  XGBOOST_SIDECAR_FEATURES,
  xgboostSidecarFeatureSchemaRevision,
} from './xgboost-sidecar-feature-admission-v1.js';

export const XGBOOST_SIDECAR_FEATURE_PROJECTION_SCHEMA =
  'atlas.xgboost-sidecar-feature-projection.v1' as const;

const revision = z.string().trim().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);

export const xgboostSidecarFeatureProjectionV1Schema = z.object({
  schema: z.literal(XGBOOST_SIDECAR_FEATURE_PROJECTION_SCHEMA),
  projectionRevision: revision,
  sourceFeatureRevision: revision,
  targetFeatureSchemaRevision: revision,
  targetFeatureNames: z.array(z.string().trim().min(1)).length(XGBOOST_SIDECAR_FEATURES.length),
  mappings: z.array(z.object({
    targetName: z.string().trim().min(1),
    sourceName: z.string().trim().min(1),
    derivationRevision: revision,
    evidenceRefs: z.array(z.string().trim().min(1)).min(1),
  }).strict()).length(XGBOOST_SIDECAR_FEATURES.length),
  projectionChecksum: checksum,
}).strict();

export type XgboostSidecarFeatureProjectionV1 = z.infer<
  typeof xgboostSidecarFeatureProjectionV1Schema
>;

export type XgboostSidecarFeatureProjectionResult =
  | { status: 'ADMITTED'; values: Record<string, number>; projectionRevision: string }
  | { status: 'REJECTED'; reason: string };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function projectionPayload(input: {
  projectionRevision: string;
  sourceFeatureRevision: string;
  targetFeatureSchemaRevision: string;
  targetFeatureNames: readonly string[];
  mappings: readonly unknown[];
}): unknown {
  return {
    projectionRevision: input.projectionRevision,
    sourceFeatureRevision: input.sourceFeatureRevision,
    targetFeatureSchemaRevision: input.targetFeatureSchemaRevision,
    targetFeatureNames: [...input.targetFeatureNames],
    mappings: input.mappings,
  };
}

export function materializeXgboostSidecarFeatureProjectionV1(input: {
  manifest: unknown;
  sourceValues: Readonly<Record<string, number | null | undefined>>;
}): XgboostSidecarFeatureProjectionResult {
  const parsed = xgboostSidecarFeatureProjectionV1Schema.safeParse(input.manifest);
  if (!parsed.success) return { status: 'REJECTED', reason: 'PROJECTION_MANIFEST_INVALID' };
  const manifest = parsed.data;

  if (JSON.stringify(manifest.targetFeatureNames) !== JSON.stringify(XGBOOST_SIDECAR_FEATURES)) {
    return { status: 'REJECTED', reason: 'TARGET_FEATURE_COLUMN_ORDER_MISMATCH' };
  }
  if (manifest.targetFeatureSchemaRevision !== xgboostSidecarFeatureSchemaRevision()) {
    return { status: 'REJECTED', reason: 'TARGET_FEATURE_SCHEMA_REVISION_MISMATCH' };
  }
  if (manifest.mappings.some((mapping, index) => mapping.targetName !== XGBOOST_SIDECAR_FEATURES[index])) {
    return { status: 'REJECTED', reason: 'MAPPING_TARGET_ORDER_MISMATCH' };
  }
  const expectedChecksum = sha256(projectionPayload(manifest));
  if (manifest.projectionChecksum !== expectedChecksum) {
    return { status: 'REJECTED', reason: 'PROJECTION_CHECKSUM_MISMATCH' };
  }

  const values: Record<string, number> = {};
  for (const mapping of manifest.mappings) {
    const value = input.sourceValues[mapping.sourceName];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return { status: 'REJECTED', reason: `SOURCE_FEATURE_MISSING:${mapping.sourceName}` };
    }
    values[mapping.targetName] = value;
  }
  return { status: 'ADMITTED', values, projectionRevision: manifest.projectionRevision };
}

export function buildXgboostSidecarFeatureProjectionV1(input: {
  projectionRevision: string;
  sourceFeatureRevision: string;
  mappings: ReadonlyArray<{
    targetName: string;
    sourceName: string;
    derivationRevision: string;
    evidenceRefs: readonly string[];
  }>;
}): XgboostSidecarFeatureProjectionV1 {
  const targetFeatureNames = [...XGBOOST_SIDECAR_FEATURES];
  const manifest = {
    schema: XGBOOST_SIDECAR_FEATURE_PROJECTION_SCHEMA,
    projectionRevision: input.projectionRevision,
    sourceFeatureRevision: input.sourceFeatureRevision,
    targetFeatureSchemaRevision: xgboostSidecarFeatureSchemaRevision(),
    targetFeatureNames,
    mappings: input.mappings.map((mapping) => ({ ...mapping, evidenceRefs: [...mapping.evidenceRefs] })),
  };
  return xgboostSidecarFeatureProjectionV1Schema.parse({
    ...manifest,
    projectionChecksum: sha256(projectionPayload(manifest)),
  });
}
