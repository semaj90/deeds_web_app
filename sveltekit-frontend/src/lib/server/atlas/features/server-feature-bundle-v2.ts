import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';
import {
  candidateOrdinalSelectionV1Schema,
  verifyCandidateOrdinalSelectionV1,
  type CandidateOrdinalSelectionV1,
} from './candidate-ordinal-selection-v1.js';
import {
  candidateFeatureSelectionSnapshotV1Schema,
  verifyCandidateFeatureSelectionSnapshotV1,
  type CandidateFeatureSelectionSnapshotV1,
} from './candidate-feature-selection-snapshot-v1.js';
import {
  revisionAuthorityEnvelopeV1Schema,
  verifyRevisionAuthorityEnvelopeV1,
  type RevisionAuthorityEnvelopeV1,
} from '../identity/revision-authority-envelope-v1.js';

export const SERVER_FEATURE_BUNDLE_V2 = 'atlas.server-feature-bundle.v2' as const;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`)
    .join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function revisionSetChecksum(schema: string, revisions: readonly (string | null)[]): string {
  return checksum({ schema, revisions: [...new Set(revisions)].sort((a, b) => String(a).localeCompare(String(b))) });
}

export const serverFeatureBundleV2Schema = z.object({
  schema: z.literal(SERVER_FEATURE_BUNDLE_V2),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256,
  selectionChecksum: sha256,
  featureRevision: z.string().min(1),
  sourceRevisionSetChecksum: sha256,
  graphRevisionSetChecksum: sha256,
  semanticRevisionSetChecksum: sha256,
  selectedCandidateCount: z.number().int().positive(),
  ordinalMap: candidateOrdinalMapV1Schema,
  selection: candidateOrdinalSelectionV1Schema,
  snapshot: candidateFeatureSelectionSnapshotV1Schema,
  revisionAuthority: revisionAuthorityEnvelopeV1Schema,
  bundleLogicalChecksum: sha256,
  bundleEnvelopeChecksum: sha256,
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();

export type ServerFeatureBundleV2 = z.infer<typeof serverFeatureBundleV2Schema>;

function logicalIdentity(bundle: Omit<ServerFeatureBundleV2, 'bundleLogicalChecksum' | 'bundleEnvelopeChecksum'>) {
  return {
    schema: 'atlas.server-feature-bundle.logical-identity.v2',
    requestId: bundle.requestId,
    workspaceRevision: bundle.workspaceRevision,
    candidateSnapshotRevision: bundle.candidateSnapshotRevision,
    ordinalMapChecksum: bundle.ordinalMapChecksum,
    selectionChecksum: bundle.selectionChecksum,
    featureRevision: bundle.featureRevision,
    sourceRevisionSetChecksum: bundle.sourceRevisionSetChecksum,
    graphRevisionSetChecksum: bundle.graphRevisionSetChecksum,
    semanticRevisionSetChecksum: bundle.semanticRevisionSetChecksum,
    selectedCandidateCount: bundle.selectedCandidateCount,
    snapshotChecksum: bundle.snapshot.snapshotChecksum,
    revisionAuthorityChecksum: bundle.revisionAuthority.authorityChecksum,
  };
}

function verifySelectedSourceClaims(bundle: ServerFeatureBundleV2): void {
  const claims = new Map(bundle.revisionAuthority.sourceClaims.map((claim) => [claim.sourceRef, claim]));
  for (const row of bundle.snapshot.rows) {
    const candidate = bundle.ordinalMap.candidates[row.candidateOrdinal];
    if (!candidate?.sourceRef) {
      throw new Error(`SERVER_FEATURE_BUNDLE_V2_SOURCE_REF_REQUIRED:${row.candidateOrdinal}`);
    }
    const claim = claims.get(candidate.sourceRef);
    if (!claim) {
      throw new Error(`SERVER_FEATURE_BUNDLE_V2_SOURCE_NOT_AUTHORIZED:${row.candidateOrdinal}:${candidate.sourceRef}`);
    }
    if (claim.sourceRevision !== candidate.sourceRevision) {
      throw new Error(`SERVER_FEATURE_BUNDLE_V2_SOURCE_REVISION_NOT_AUTHORIZED:${row.candidateOrdinal}:${candidate.sourceRef}`);
    }
  }
}

export function buildServerFeatureBundleV2(input: {
  requestId: string;
  ordinalMap: CandidateOrdinalMapV1;
  selection: CandidateOrdinalSelectionV1;
  snapshot: CandidateFeatureSelectionSnapshotV1;
  revisionAuthority: RevisionAuthorityEnvelopeV1;
}): ServerFeatureBundleV2 {
  if (!input.requestId.trim()) throw new Error('SERVER_FEATURE_BUNDLE_V2_REQUEST_ID_REQUIRED');
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const selection = candidateOrdinalSelectionV1Schema.parse(input.selection);
  const snapshot = candidateFeatureSelectionSnapshotV1Schema.parse(input.snapshot);
  const revisionAuthority = revisionAuthorityEnvelopeV1Schema.parse(input.revisionAuthority);

  verifyCandidateOrdinalSelectionV1({ ordinalMap, selection });
  verifyCandidateFeatureSelectionSnapshotV1({ ordinalMap, selection, snapshot });
  verifyRevisionAuthorityEnvelopeV1(revisionAuthority);

  if (selection.requestId !== input.requestId || snapshot.requestId !== input.requestId) {
    throw new Error('SERVER_FEATURE_BUNDLE_V2_REQUEST_ID_MISMATCH');
  }
  if (ordinalMap.workspaceRevision !== revisionAuthority.workspaceRevision) {
    throw new Error('SERVER_FEATURE_BUNDLE_V2_AUTHORITY_WORKSPACE_MISMATCH');
  }

  const sourceRevisionSetChecksum = revisionSetChecksum(
    'atlas.server-feature-bundle.source-revision-set.v2',
    snapshot.rows.map((row) => row.sourceRevision),
  );
  const graphRevisionSetChecksum = revisionSetChecksum(
    'atlas.server-feature-bundle.graph-revision-set.v2',
    snapshot.rows.map((row) => row.graphRevision),
  );
  const semanticRevisionSetChecksum = revisionSetChecksum(
    'atlas.server-feature-bundle.semantic-revision-set.v2',
    snapshot.rows.map((row) => row.semanticRevision),
  );

  const partial = {
    schema: SERVER_FEATURE_BUNDLE_V2,
    requestId: input.requestId,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    selectionChecksum: selection.selectionChecksum,
    featureRevision: snapshot.featureRevision,
    sourceRevisionSetChecksum,
    graphRevisionSetChecksum,
    semanticRevisionSetChecksum,
    selectedCandidateCount: selection.selectedOrdinals.length,
    ordinalMap,
    selection,
    snapshot,
    revisionAuthority,
    writesPerformed: false as const,
    canonicalAuthority: false as const,
  };

  verifySelectedSourceClaims({
    ...partial,
    bundleLogicalChecksum: '0'.repeat(64),
    bundleEnvelopeChecksum: '0'.repeat(64),
  });

  const bundleLogicalChecksum = checksum(logicalIdentity(partial));
  const bundleEnvelopeChecksum = checksum({
    schema: 'atlas.server-feature-bundle.envelope.v2',
    requestId: input.requestId,
    bundleLogicalChecksum,
  });

  return serverFeatureBundleV2Schema.parse({
    ...partial,
    bundleLogicalChecksum,
    bundleEnvelopeChecksum,
  });
}

export function verifyServerFeatureBundleV2(input: ServerFeatureBundleV2): void {
  const bundle = serverFeatureBundleV2Schema.parse(input);
  const rebuilt = buildServerFeatureBundleV2({
    requestId: bundle.requestId,
    ordinalMap: bundle.ordinalMap,
    selection: bundle.selection,
    snapshot: bundle.snapshot,
    revisionAuthority: bundle.revisionAuthority,
  });
  if (rebuilt.bundleLogicalChecksum !== bundle.bundleLogicalChecksum) {
    throw new Error(`SERVER_FEATURE_BUNDLE_V2_LOGICAL_CHECKSUM_MISMATCH:${rebuilt.bundleLogicalChecksum}:${bundle.bundleLogicalChecksum}`);
  }
  if (rebuilt.bundleEnvelopeChecksum !== bundle.bundleEnvelopeChecksum) {
    throw new Error(`SERVER_FEATURE_BUNDLE_V2_ENVELOPE_CHECKSUM_MISMATCH:${rebuilt.bundleEnvelopeChecksum}:${bundle.bundleEnvelopeChecksum}`);
  }
}
