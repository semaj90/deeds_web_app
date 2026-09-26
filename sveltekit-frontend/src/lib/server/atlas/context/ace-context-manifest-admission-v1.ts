import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  buildContextManifestV2,
  ContextManifestV2Schema,
} from '../graph/context-manifest-v2.js';
import { chooseCandidateBucket, type ContextManifestV1 } from '../graph/graph-runtime-contracts.js';
import {
  candidateFeatureSnapshotV1Schema,
  type CandidateFeatureSnapshotV1,
} from '../features/candidate-feature-snapshot-v1.js';
import type { CurrentCandidateFeatureAdmissionV1 } from '../features/candidate-feature-snapshot-v1.js';
import type { RetrievalCacheIdentityV1 } from '$lib/server/ace/cache-keys.js';

export interface AceContextManifestAdmissionInputV1 {
  snapshot: CandidateFeatureSnapshotV1;
  requestId: string;
  selectedOrdinals?: readonly number[];
  tokenBudget: number;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  representationRevision: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
  graphRevision: string | null;
}

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const aceContextManifestAdmissionV1Schema = z.object({
  manifest: ContextManifestV2Schema,
  selectedOrdinalSetChecksum: sha256,
  sourceRevisionSetChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict();

export type AceContextManifestAdmissionV1 = z.infer<typeof aceContextManifestAdmissionV1Schema>;

export const currentAceContextManifestAdmissionV1Schema = z.object({
  schema: z.literal('atlas.current-ace-context-manifest-admission.v1'),
  status: z.enum(['ADMITTED', 'BLOCKED_FEATURE_SNAPSHOT']),
  manifest: ContextManifestV2Schema.nullable(),
  reason: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((admission, ctx) => {
  if (admission.status === 'ADMITTED' && admission.manifest === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manifest'], message: 'ADMITTED_CONTEXT_MANIFEST_REQUIRED' });
  }
  if (admission.status === 'BLOCKED_FEATURE_SNAPSHOT' && admission.manifest !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manifest'], message: 'BLOCKED_CONTEXT_MANIFEST_FORBIDDEN' });
  }
  if (admission.status === 'ADMITTED' && admission.reason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'ADMITTED_CONTEXT_REASON_FORBIDDEN' });
  }
  if (admission.status === 'BLOCKED_FEATURE_SNAPSHOT' && admission.reason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'BLOCKED_CONTEXT_REASON_REQUIRED' });
  }
});
export type CurrentAceContextManifestAdmissionV1 = z.infer<typeof currentAceContextManifestAdmissionV1Schema>;

export interface RetrievalCacheIdentityFromManifestInputV1 {
  queryHash: string;
  model: string;
  dim: number;
  workspaceRevision: string;
  contextPolicyRevision: string;
}

/**
 * Converts an already-admitted manifest into the shared retrieval-cache
 * identity. Runtime fields not owned by the manifest must be supplied
 * explicitly; incomplete input returns null instead of inferring a revision.
 */
export function retrievalCacheIdentityFromAceManifestV1(
  admission: AceContextManifestAdmissionV1 | (AceContextManifestAdmissionV1 & { snapshot?: unknown }),
  input: RetrievalCacheIdentityFromManifestInputV1,
): RetrievalCacheIdentityV1 | null {
  const { snapshot: _snapshot, ...admissionEnvelope } = admission as AceContextManifestAdmissionV1 & { snapshot?: unknown };
  const manifest = aceContextManifestAdmissionV1Schema.parse(admissionEnvelope).manifest;
  const revisions = manifest.identityInput.evidenceRevisions;
  if (!input.queryHash || !input.model || !input.workspaceRevision || !input.contextPolicyRevision) return null;
  if (!Number.isInteger(input.dim) || input.dim < 1) return null;
  if (!revisions.sourceRevision || !revisions.representationRevision || !revisions.featureRevision) return null;
  if (!manifest.identityInput.retrievalPolicyRevision || !manifest.identityInput.ordinalMapChecksum) return null;

  return {
    queryHash: input.queryHash,
    model: input.model,
    dim: input.dim,
    workspaceRevision: input.workspaceRevision,
    candidateSnapshotRevision: manifest.v1.snapshotId,
    ordinalMapChecksum: manifest.identityInput.ordinalMapChecksum,
    representationRevision: revisions.representationRevision,
    featureRevision: revisions.featureRevision,
    retrievalPolicyRevision: manifest.identityInput.retrievalPolicyRevision,
    contextPolicyRevision: input.contextPolicyRevision,
    graphRevision: manifest.v1.graphRevision,
  };
}

/**
 * Converts an already validated candidate-feature snapshot into the existing
 * ContextManifestV2 identity boundary. It performs no retrieval or writes.
 * Missing graph/revision values remain explicit nulls in the manifest and are
 * therefore ineligible for strict BitFrost cache admission downstream.
 */
export function buildAceContextManifestAdmissionV1(
  input: AceContextManifestAdmissionInputV1,
): AceContextManifestAdmissionV1 {
  const snapshot = candidateFeatureSnapshotV1Schema.parse(input.snapshot);
  const selectedOrdinals = [...new Set(input.selectedOrdinals ?? snapshot.rows.map((row) => row.candidateOrdinal))]
    .sort((a, b) => a - b);
  const rows = selectedOrdinals.map((ordinal) => {
    const row = snapshot.rows.find((candidate) => candidate.candidateOrdinal === ordinal);
    if (!row) throw new Error(`ACE_MANIFEST_ORDINAL_NOT_IN_SNAPSHOT:${ordinal}`);
    return row;
  });
  const selectedOrdinalSetChecksum = canonicalSha256V1({
    schema: 'atlas.ace-context-selected-ordinal-set.v1',
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    ordinals: selectedOrdinals,
  });
  const sourceRevisionSetChecksum = canonicalSha256V1({
    schema: 'atlas.ace-context-source-revision-set.v1',
    revisions: [...new Set(rows.map((row) => row.sourceRevision))].sort(),
  });
  const v1: ContextManifestV1 = {
    schema: 'atlas.context-manifest.v1',
    requestId: input.requestId,
    snapshotId: snapshot.candidateSnapshotRevision,
    graphRevision: input.graphRevision,
    query: `candidate-snapshot:${snapshot.candidateSnapshotRevision}`,
    candidateBucket: chooseCandidateBucket(rows.length),
    candidateCount: rows.length,
    tokenBudget: input.tokenBudget,
    selectedNodeKeys: rows.map((row) => row.canonicalId),
    evidenceRefs: [...new Set(rows.flatMap((row) => row.evidenceRefs))].sort(),
    producerRevision: snapshot.producerRevision,
  };
  const manifest = buildContextManifestV2(v1, {
    selectedOrdinalSetChecksum,
    evidenceRevisions: {
      sourceRevision: sourceRevisionSetChecksum,
      representationRevision: input.representationRevision,
      featureRevision: snapshot.featureRevision,
      ontologyRevision: input.ontologyRevision ?? null,
      modelRevision: input.modelRevision ?? null,
      promptTemplateRevision: input.promptTemplateRevision ?? null,
    },
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    retrievalPolicyRevision: input.retrievalPolicyRevision,
    acePlaybookRevision: input.acePlaybookRevision,
  });
  return aceContextManifestAdmissionV1Schema.parse({
    manifest,
    selectedOrdinalSetChecksum,
    sourceRevisionSetChecksum,
    canonicalAuthority: false,
  });
}

/** Stage 13 wrapper: current ContextManifest admission requires Stage 8 proof. */
export function admitCurrentAceContextManifestV1(input: {
  featureAdmission: CurrentCandidateFeatureAdmissionV1;
  requestId: string;
  tokenBudget: number;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  representationRevision: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
  graphRevision: string | null;
}): CurrentAceContextManifestAdmissionV1 {
  if (input.featureAdmission.status !== 'ADMITTED' || input.featureAdmission.snapshot === null) {
    return currentAceContextManifestAdmissionV1Schema.parse({
      schema: 'atlas.current-ace-context-manifest-admission.v1',
      status: 'BLOCKED_FEATURE_SNAPSHOT',
      manifest: null,
      reason: input.featureAdmission.status,
      canonicalAuthority: false,
      writesPerformed: false,
    });
  }

  const admission = buildAceContextManifestAdmissionV1({
    snapshot: input.featureAdmission.snapshot,
    requestId: input.requestId,
    tokenBudget: input.tokenBudget,
    retrievalPolicyRevision: input.retrievalPolicyRevision,
    acePlaybookRevision: input.acePlaybookRevision,
    representationRevision: input.representationRevision,
    ontologyRevision: input.ontologyRevision,
    modelRevision: input.modelRevision,
    promptTemplateRevision: input.promptTemplateRevision,
    graphRevision: input.graphRevision,
  });
  return currentAceContextManifestAdmissionV1Schema.parse({
    schema: 'atlas.current-ace-context-manifest-admission.v1',
    status: 'ADMITTED',
    manifest: admission.manifest,
    reason: null,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
