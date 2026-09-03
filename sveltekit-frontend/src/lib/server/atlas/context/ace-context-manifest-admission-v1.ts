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
