import { createHash } from 'node:crypto';
import { z } from 'zod';

export const XGBOOST_SIDECAR_FEATURE_ADMISSION_SCHEMA =
  'atlas.xgboost-sidecar-feature-admission.v1' as const;

/**
 * This list mirrors the checked-in Python sidecar ABI. It is deliberately
 * separate from CandidateFeatureSnapshotV1's semantic feature names: a
 * caller must provide an explicit projection between the two contracts.
 */
export const XGBOOST_SIDECAR_FEATURES = Object.freeze([
  'cosine_score',
  'bm25_rank_norm',
  'ann_turbovec_score',
  'concept_overlap',
  'same_feature',
  'community_conf',
  'reward_prior',
  'domain_class_match',
  'freshness_score',
  'pagerank_score',
  'som_cache_hit',
  'provenance_git_age',
  'packet_hit_count',
  'n_retrieved',
  'n_concepts',
  'trace_score',
] as const);

export type XgboostSidecarFeatureName = typeof XGBOOST_SIDECAR_FEATURES[number];

export function xgboostSidecarFeatureSchemaRevision(
  featureNames: readonly string[] = XGBOOST_SIDECAR_FEATURES,
): string {
  return createHash('sha256').update(featureNames.join('|')).digest('hex').slice(0, 16);
}

const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const revision = z.string().trim().min(1);

export const xgboostSidecarFeatureBundleV1Schema = z.object({
  schema: z.literal(XGBOOST_SIDECAR_FEATURE_ADMISSION_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  workspaceRevision: revision,
  featureRevision: revision,
  featureSchemaRevision: revision,
  featureNames: z.array(z.string().trim().min(1)).min(1),
  rowCount: z.number().int().nonnegative(),
  featureValuesChecksum: checksum,
}).strict();

export type XgboostSidecarFeatureBundleV1 = z.infer<
  typeof xgboostSidecarFeatureBundleV1Schema
>;

export const xgboostSidecarDescriptorV1Schema = z.object({
  modelRevision: revision,
  featureSchemaRevision: revision,
  featureNames: z.array(z.string().trim().min(1)).min(1),
}).strict();

export type XgboostSidecarDescriptorV1 = z.infer<typeof xgboostSidecarDescriptorV1Schema>;

export type XgboostSidecarFeatureAdmissionResult =
  | { status: 'ADMITTED'; featureSchemaRevision: string; featureNames: string[] }
  | { status: 'REJECTED'; reason: string };

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Pure boundary check. It does not call the sidecar, create vectors, or
 * persist a receipt. In particular, a static sidecar hash cannot admit a
 * candidate bundle unless the bundle carries the same ordered ABI and hash.
 */
export function admitXgboostSidecarFeatureBundleV1(input: {
  sidecar: unknown;
  bundle: unknown;
}): XgboostSidecarFeatureAdmissionResult {
  const sidecar = xgboostSidecarDescriptorV1Schema.safeParse(input.sidecar);
  if (!sidecar.success) return { status: 'REJECTED', reason: 'SIDECAR_DESCRIPTOR_INVALID' };

  const bundle = xgboostSidecarFeatureBundleV1Schema.safeParse(input.bundle);
  if (!bundle.success) return { status: 'REJECTED', reason: 'FEATURE_BUNDLE_INVALID' };

  const expectedRevision = xgboostSidecarFeatureSchemaRevision(sidecar.data.featureNames);
  if (sidecar.data.featureSchemaRevision !== expectedRevision) {
    return { status: 'REJECTED', reason: 'SIDECAR_FEATURE_SCHEMA_CHECKSUM_MISMATCH' };
  }
  if (bundle.data.featureSchemaRevision !== sidecar.data.featureSchemaRevision) {
    return { status: 'REJECTED', reason: 'FEATURE_SCHEMA_REVISION_MISMATCH' };
  }
  if (!sameOrderedStrings(bundle.data.featureNames, sidecar.data.featureNames)) {
    return { status: 'REJECTED', reason: 'FEATURE_COLUMN_ORDER_MISMATCH' };
  }

  return {
    status: 'ADMITTED',
    featureSchemaRevision: sidecar.data.featureSchemaRevision,
    featureNames: [...sidecar.data.featureNames],
  };
}
