import { createHash } from 'node:crypto';
import { z } from 'zod';

import { candidateOrdinalMapV1Schema } from './canonical-candidate-v1.js';
import { candidateFeatureSnapshotV1Schema, candidateFeatureSnapshotChecksum } from './candidate-feature-snapshot-v1.js';
import { revisionAuthorityEnvelopeV1Schema, verifyRevisionAuthorityEnvelopeV1 } from '../identity/revision-authority-envelope-v1.js';

export const SERVER_FEATURE_BUNDLE_SCHEMA = 'atlas.server-feature-bundle.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

export function serverFeatureBundleChecksumV1(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export const serverFeatureBundleV1Schema = z.object({
  schema: z.literal(SERVER_FEATURE_BUNDLE_SCHEMA),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256,
  featureRevision: z.string().min(1),
  sourceRevisionSetChecksum: sha256,
  graphRevisionSetChecksum: sha256,
  semanticRevisionSetChecksum: sha256,
  candidateCount: z.number().int().nonnegative(),
  ordinalMap: candidateOrdinalMapV1Schema,
  snapshot: candidateFeatureSnapshotV1Schema,
  revisionAuthority: revisionAuthorityEnvelopeV1Schema,
  bundleLogicalChecksum: sha256,
  bundleEnvelopeChecksum: sha256,
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();

export type ServerFeatureBundleV1 = z.infer<typeof serverFeatureBundleV1Schema>;

export function serverFeatureBundleLogicalIdentityV1(bundle: Pick<ServerFeatureBundleV1,
  | 'workspaceRevision'
  | 'candidateSnapshotRevision'
  | 'ordinalMapChecksum'
  | 'featureRevision'
  | 'sourceRevisionSetChecksum'
  | 'graphRevisionSetChecksum'
  | 'semanticRevisionSetChecksum'
  | 'snapshot'
  | 'revisionAuthority'
>) {
  return {
    schema: 'atlas.server-feature-bundle.logical-identity.v1',
    workspaceRevision: bundle.workspaceRevision,
    candidateSnapshotRevision: bundle.candidateSnapshotRevision,
    ordinalMapChecksum: bundle.ordinalMapChecksum,
    featureRevision: bundle.featureRevision,
    sourceRevisionSetChecksum: bundle.sourceRevisionSetChecksum,
    graphRevisionSetChecksum: bundle.graphRevisionSetChecksum,
    semanticRevisionSetChecksum: bundle.semanticRevisionSetChecksum,
    snapshotChecksum: bundle.snapshot.snapshotChecksum,
    producerRevision: bundle.snapshot.producerRevision,
    revisionAuthorityChecksum: bundle.revisionAuthority.authorityChecksum,
  };
}

export function verifyServerFeatureBundleV1(input: ServerFeatureBundleV1): void {
  const bundle = serverFeatureBundleV1Schema.parse(input);
  verifyRevisionAuthorityEnvelopeV1(bundle.revisionAuthority);

  if (bundle.workspaceRevision !== bundle.ordinalMap.workspaceRevision ||
      bundle.workspaceRevision !== bundle.snapshot.workspaceRevision ||
      bundle.workspaceRevision !== bundle.revisionAuthority.workspaceRevision) {
    throw new Error('SERVER_FEATURE_BUNDLE_WORKSPACE_REVISION_MISMATCH');
  }
  if (bundle.candidateSnapshotRevision !== bundle.ordinalMap.candidateSnapshotRevision ||
      bundle.candidateSnapshotRevision !== bundle.snapshot.candidateSnapshotRevision) {
    throw new Error('SERVER_FEATURE_BUNDLE_SNAPSHOT_REVISION_MISMATCH');
  }
  if (bundle.ordinalMapChecksum !== bundle.ordinalMap.ordinalMapChecksum ||
      bundle.ordinalMapChecksum !== bundle.snapshot.ordinalMapChecksum) {
    throw new Error('SERVER_FEATURE_BUNDLE_ORDINAL_MAP_CHECKSUM_MISMATCH');
  }
  if (bundle.featureRevision !== bundle.snapshot.featureRevision) {
    throw new Error('SERVER_FEATURE_BUNDLE_FEATURE_REVISION_MISMATCH');
  }
  if (bundle.candidateCount !== bundle.ordinalMap.rowCount ||
      bundle.candidateCount !== bundle.snapshot.rowCount) {
    throw new Error('SERVER_FEATURE_BUNDLE_CANDIDATE_COUNT_MISMATCH');
  }

  const snapshotPayload = {
    candidateSnapshotRevision: bundle.snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: bundle.snapshot.ordinalMapChecksum,
    workspaceRevision: bundle.snapshot.workspaceRevision,
    featureRevision: bundle.snapshot.featureRevision,
    rows: bundle.snapshot.rows,
  };
  const snapshotChecksum = candidateFeatureSnapshotChecksum(snapshotPayload);
  if (snapshotChecksum !== bundle.snapshot.snapshotChecksum) {
    throw new Error(`SERVER_FEATURE_BUNDLE_SNAPSHOT_CHECKSUM_MISMATCH:${snapshotChecksum}:${bundle.snapshot.snapshotChecksum}`);
  }

  const logicalChecksum = serverFeatureBundleChecksumV1(serverFeatureBundleLogicalIdentityV1(bundle));
  if (logicalChecksum !== bundle.bundleLogicalChecksum) {
    throw new Error(`SERVER_FEATURE_BUNDLE_LOGICAL_CHECKSUM_MISMATCH:${logicalChecksum}:${bundle.bundleLogicalChecksum}`);
  }
  const envelopeChecksum = serverFeatureBundleChecksumV1({
    schema: 'atlas.server-feature-bundle.envelope.v1',
    requestId: bundle.requestId,
    bundleLogicalChecksum: bundle.bundleLogicalChecksum,
  });
  if (envelopeChecksum !== bundle.bundleEnvelopeChecksum) {
    throw new Error(`SERVER_FEATURE_BUNDLE_ENVELOPE_CHECKSUM_MISMATCH:${envelopeChecksum}:${bundle.bundleEnvelopeChecksum}`);
  }
}
