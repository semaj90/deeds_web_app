import type { ExactPromotionHandoffV1 } from './exact-promotion-handoff.js';

export interface ExactEvidenceResolvedV1 {
  candidateOrdinal: number;
  canonicalId: string;
  sourceRef: string;
  sourceRevision: string;
  checksum: string;
  startByte?: number | null;
  endByte?: number | null;
  symbolVersionId?: string | null;
  treeNodeId?: string | null;
}

export interface ExactPromotionOwnerResultV1 {
  candidateOrdinal: number;
  canonicalId: string;
  status: 'PROMOTED' | 'REJECTED_STALE' | 'REJECTED_IDENTITY' | 'REJECTED_NO_EXACT_EVIDENCE';
  checksum: string;
}

export interface ExactPromotionOwner {
  promote(input: {
    requestId: string;
    workspaceRevision: string;
    graphRevision?: string | null;
    evidence: ExactEvidenceResolvedV1;
  }): Promise<ExactPromotionOwnerResultV1>;
}

export interface ExactEvidenceResolver {
  resolve(input: {
    requestId: string;
    workspaceRevision: string;
    candidateOrdinal: number;
    canonicalId: string;
    packetKey?: string | null;
    sourceRef?: string | null;
  }): Promise<ExactEvidenceResolvedV1 | null>;
}

/**
 * Recommendation-to-canonical exact-promotion seam.
 *
 * TODO(MERGE): bind ExactPromotionOwner to the agentic-file-compiler
 * promoteExactEvidence() implementation after that branch is merged. Identity
 * resolution remains injected; this module never treats a Qdrant/backend ID as
 * canonical identity and never fabricates a source_ref/checksum.
 */
export async function executeExactPromotionHandoff(input: {
  handoff: ExactPromotionHandoffV1;
  resolver: ExactEvidenceResolver;
  owner: ExactPromotionOwner;
}): Promise<ExactPromotionOwnerResultV1[]> {
  const out: ExactPromotionOwnerResultV1[] = [];
  for (const candidate of input.handoff.candidates) {
    if (!candidate.canonicalId?.trim()) throw new Error('EXACT_PROMOTION_CANONICAL_ID_REQUIRED');
    const evidence = await input.resolver.resolve({
      requestId: input.handoff.requestId,
      workspaceRevision: input.handoff.workspaceRevision,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey ?? null,
      sourceRef: candidate.sourceRef ?? null,
    });
    if (!evidence) {
      out.push({
        candidateOrdinal: candidate.candidateOrdinal,
        canonicalId: candidate.canonicalId,
        status: 'REJECTED_NO_EXACT_EVIDENCE',
        checksum: '',
      });
      continue;
    }
    if (evidence.canonicalId !== candidate.canonicalId) throw new Error('EXACT_PROMOTION_RESOLVER_IDENTITY_CONTRADICTION');
    if (!evidence.sourceRef.trim() || !evidence.sourceRevision.trim() || !evidence.checksum.trim()) {
      throw new Error('EXACT_PROMOTION_REVISIONED_SOURCE_EVIDENCE_REQUIRED');
    }
    out.push(await input.owner.promote({
      requestId: input.handoff.requestId,
      workspaceRevision: input.handoff.workspaceRevision,
      graphRevision: input.handoff.graphRevision ?? null,
      evidence,
    }));
  }

  if (input.handoff.required && out.every((result) => result.status !== 'PROMOTED')) {
    throw new Error('EXACT_PROMOTION_REQUIRED_BUT_NONE_PROMOTED');
  }
  return out;
}
