import type { z } from 'zod';

import {
  materializeCandidateFeatureSnapshotFromRetrievalRowsV1,
  type CandidateFeatureLaneV1,
} from '../features/retrieval-router-to-candidate-feature-snapshot-v1.js';
import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import { buildAceContextManifestAdmissionV1 } from './ace-context-manifest-admission-v1.js';
import { RetrievalRouterFeatureRowV1Schema } from '../contracts/retrieval-router-feature-row-v1.js';

/**
 * Server-owned composition boundary for the ACE feature snapshot.
 *
 * This function deliberately accepts an already admitted ordinal map and
 * already-produced feature rows. It does not search stores, allocate ordinals,
 * infer revisions, or write cache/canonical state.
 */
export interface AceFeatureSnapshotProducerInputV1 {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly z.input<typeof RetrievalRouterFeatureRowV1Schema>[];
  laneMaskByOrdinal: Readonly<Record<string, readonly CandidateFeatureLaneV1[]>>;
  producerRevision: string;
  requestId: string;
  tokenBudget: number;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  representationRevision: string | null;
  graphRevision: string | null;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
}

export function produceAceFeatureSnapshotV1(input: AceFeatureSnapshotProducerInputV1): {
  ordinalMap: CandidateOrdinalMapV1;
  snapshot: ReturnType<typeof materializeCandidateFeatureSnapshotFromRetrievalRowsV1>;
  admission: ReturnType<typeof buildAceContextManifestAdmissionV1>;
  canonicalAuthority: false;
  writesPerformed: false;
} {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (!input.producerRevision.trim()) throw new Error('ACE_FEATURE_PRODUCER_REVISION_REQUIRED');
  if (!input.requestId.trim()) throw new Error('ACE_FEATURE_PRODUCER_REQUEST_ID_REQUIRED');
  if (!input.retrievalPolicyRevision.trim()) throw new Error('ACE_FEATURE_RETRIEVAL_POLICY_REVISION_REQUIRED');
  if (!input.acePlaybookRevision.trim()) throw new Error('ACE_FEATURE_ACE_PLAYBOOK_REVISION_REQUIRED');

  const snapshot = materializeCandidateFeatureSnapshotFromRetrievalRowsV1({
    ordinalMap,
    rows: input.rows,
    laneMaskByOrdinal: input.laneMaskByOrdinal,
    producerRevision: input.producerRevision,
  });
  const admission = buildAceContextManifestAdmissionV1({
    snapshot,
    requestId: input.requestId,
    selectedOrdinals: snapshot.rows.map((row) => row.candidateOrdinal),
    tokenBudget: input.tokenBudget,
    retrievalPolicyRevision: input.retrievalPolicyRevision,
    acePlaybookRevision: input.acePlaybookRevision,
    representationRevision: input.representationRevision,
    graphRevision: input.graphRevision,
    ontologyRevision: input.ontologyRevision,
    modelRevision: input.modelRevision,
    promptTemplateRevision: input.promptTemplateRevision,
  });

  return { ordinalMap, snapshot, admission, canonicalAuthority: false, writesPerformed: false };
}
