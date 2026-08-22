import { sha256Stable } from './contracts.js';

export interface ExactEvidenceV1 { sourceRef: string; checksum: string; startByte?: number | null; endByte?: number | null; symbolVersionId?: string | null; treeNodeId?: string | null; }
export interface ExactPromotionV1 {
  schema: 'atlas.exact-promotion.v1'; requestId: string; candidateOrdinal: number; canonicalId: string;
  approximateEvidenceRefs: string[]; exactEvidence: ExactEvidenceV1[]; workspaceRevision: string;
  sourceRevision: string; graphRevision?: string | null;
  status: 'PROMOTED' | 'REJECTED_STALE' | 'REJECTED_IDENTITY' | 'REJECTED_NO_EXACT_EVIDENCE'; checksum: string;
}

export function promoteExactEvidence(input: Omit<ExactPromotionV1, 'schema' | 'status' | 'checksum'> & { expectedWorkspaceRevision: string; expectedCanonicalId: string }): ExactPromotionV1 {
  const status: ExactPromotionV1['status'] = input.workspaceRevision !== input.expectedWorkspaceRevision
    ? 'REJECTED_STALE'
    : input.canonicalId !== input.expectedCanonicalId
      ? 'REJECTED_IDENTITY'
      : input.exactEvidence.length === 0
        ? 'REJECTED_NO_EXACT_EVIDENCE'
        : 'PROMOTED';
  const body = {
    schema: 'atlas.exact-promotion.v1' as const,
    requestId: input.requestId, candidateOrdinal: input.candidateOrdinal, canonicalId: input.canonicalId,
    approximateEvidenceRefs: [...new Set(input.approximateEvidenceRefs)], exactEvidence: input.exactEvidence,
    workspaceRevision: input.workspaceRevision, sourceRevision: input.sourceRevision, graphRevision: input.graphRevision ?? null, status,
  };
  return { ...body, checksum: sha256Stable(body) };
}
