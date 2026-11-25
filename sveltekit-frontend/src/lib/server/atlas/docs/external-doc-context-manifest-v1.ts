import {
  buildContextManifestV2,
  computeOrderedSelectionChecksumV1,
  computeSelectedOrdinalSetChecksumV1,
} from '../graph/context-manifest-v2.js';
import { chooseCandidateBucket } from '../graph/graph-runtime-contracts.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { ContextManifestTaskBindingV1Schema } from '../graph/context-manifest-v2.js';
import type { ExternalDocCitationReadbackV1 } from './external-doc-citation-readback-v1.js';
import type { z } from 'zod';

type DocumentationTaskBindingV1 = z.infer<typeof ContextManifestTaskBindingV1Schema>;

/** Bind the evidence verified within this authenticated request to the existing ACE manifest. */
export function buildExternalDocContextManifestV1(input: {
  requestId: string;
  query: string;
  tokenBudget: number;
  readback: ExternalDocCitationReadbackV1;
  taskBinding?: DocumentationTaskBindingV1;
}) {
  if (input.readback.status !== 'VERIFIED' || input.readback.blockers.length) return null;
  const citations = input.readback.citations;
  if (!citations.length) return null;
  const selectedNodeKeys = citations.map(({ chunkId }) => chunkId);
  if (new Set(selectedNodeKeys).size !== selectedNodeKeys.length) return null;

  const evidenceRefs = citations.map(({ chunkEvidenceRevision }) => chunkEvidenceRevision);
  if (new Set(evidenceRefs).size !== evidenceRefs.length) return null;
  const ordinals = citations.map((_, index) => index);
  const ordinalMapChecksum = canonicalSha256V1(citations.map(({ verifiedText: _text, ...identity }) => identity));
  const snapshotId = canonicalSha256V1({
    query: input.query,
    tokenBudget: input.tokenBudget,
    ordinalMapChecksum,
    ...(input.taskBinding ? { taskBinding: input.taskBinding } : {}),
  });
  return buildContextManifestV2({
    schema: 'atlas.context-manifest.v1',
    requestId: input.requestId,
    snapshotId,
    graphRevision: null,
    query: input.query,
    candidateBucket: chooseCandidateBucket(citations.length),
    candidateCount: citations.length,
    tokenBudget: input.tokenBudget,
    selectedNodeKeys,
    evidenceRefs,
    producerRevision: 'atlas.external-doc-citation-readback.v1',
  }, {
    ordinalMapChecksum,
    selectedOrdinalSetChecksum: computeSelectedOrdinalSetChecksumV1({
      snapshotId, ordinalMapChecksum, selectedOrdinals: ordinals,
    }),
    orderedSelectionChecksum: computeOrderedSelectionChecksumV1({ ordinals, selectedNodeKeys, evidenceRefs }),
    evidenceRevisions: {
      sourceRevision: canonicalSha256V1({
        schema: 'atlas.ace-context-source-revision-set.v1',
        revisions: [...new Set(citations.map(({ sourceRevision }) => sourceRevision))].sort(),
      }),
      representationRevision: null,
      featureRevision: null,
      ontologyRevision: null,
      modelRevision: null,
      promptTemplateRevision: null,
    },
    retrievalPolicyRevision: 'atlas.external-doc-citation-readback.v1',
    acePlaybookRevision: 'atlas.external-doc-context-manifest.v1',
    ...(input.taskBinding ? { taskBinding: input.taskBinding } : {}),
  });
}
