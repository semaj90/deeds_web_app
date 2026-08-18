import {
  compileContext,
  type CompiledContext,
  type ContextCandidate,
  type ContextSelectionPolicy,
} from './context-compiler.parent-atlas.js';

export interface PromotedRecommendationEvidenceV1 {
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  content: string;
  tokenCount?: number;
  semanticScore: number;
  authorityScore?: number | null;
  freshnessScore?: number | null;
  graphDistance?: number | null;
  lanes: Array<'exact' | 'lexical' | 'dense' | 'graph'>;
  exactPromotionStatus: 'PROMOTED';
  evidenceRefs: string[];
}

/** Adapter into the EXISTING ContextManifest compiler. */
export function compileContextFromPromotedRecommendations(input: {
  requestId: string;
  featureId?: string;
  sourceRefs?: string[];
  promoted: PromotedRecommendationEvidenceV1[];
  policy: ContextSelectionPolicy;
  now?: Date;
}): CompiledContext {
  const candidates: ContextCandidate[] = input.promoted.map((row) => {
    if (row.exactPromotionStatus !== 'PROMOTED') throw new Error('CONTEXT_REQUIRES_PROMOTED_EVIDENCE');
    if (!row.packetKey.trim() || !row.sourceRef.trim()) throw new Error('CONTEXT_REQUIRES_CANONICAL_PACKET_AND_SOURCE_REF');
    return {
      packet_key: row.packetKey,
      source_ref: row.sourceRef,
      content: row.content,
      lanes: [...new Set(row.lanes)],
      relevance: row.semanticScore,
      authority: row.authorityScore ?? undefined,
      freshness: row.freshnessScore ?? undefined,
      graph_distance: row.graphDistance ?? undefined,
      required: true,
      token_count: row.tokenCount,
    };
  });

  return compileContext({
    request_id: input.requestId,
    feature_id: input.featureId,
    source_refs: input.sourceRefs,
    candidates,
    policy: input.policy,
    now: input.now,
  });
}
