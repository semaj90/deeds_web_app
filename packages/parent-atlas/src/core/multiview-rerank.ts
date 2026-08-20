import { z } from 'zod';

const revision = z.string().min(1);
const id = z.string().min(1);

export const multiViewRerankCandidateSchema = z.object({
  canonical_id: id,
  fde_score: z.number().finite().nullable().optional(),
  view_scores: z.record(z.string(), z.number().finite()).default({}),
  exact_score: z.number().finite().nullable().optional(),
}).strict();

export const multiViewRerankReceiptSchema = z.object({
  schema: z.literal('atlas.multi-view-rerank-receipt.v1').default('atlas.multi-view-rerank-receipt.v1'),
  query_id: id,
  candidate_projection_revision: revision,
  original_view_revision: revision,
  rerank_method: z.enum(['chamfer', 'maxsim', 'weighted_views', 'other']),
  candidate_count: z.number().int().nonnegative(),
  reranked_count: z.number().int().nonnegative(),
  results: z.array(multiViewRerankCandidateSchema),
  producer_revision: revision,
}).strict();

export type MultiViewRerankCandidateV1 = z.infer<typeof multiViewRerankCandidateSchema>;
export type MultiViewRerankReceiptV1 = z.infer<typeof multiViewRerankReceiptSchema>;

/**
 * Reference weighted-view exact reranker. A future MUVERA/FDE implementation
 * may nominate candidates, but this stage receives the original view scores.
 */
export function exactWeightedViewRerank(input: {
  query_id: string;
  candidate_projection_revision: string;
  original_view_revision: string;
  candidates: Array<{ canonical_id: string; fde_score?: number; view_scores: Record<string, number> }>;
  view_weights: Record<string, number>;
  producer_revision: string;
}): MultiViewRerankReceiptV1 {
  const totalWeight = Object.values(input.view_weights).reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) throw new RangeError('at least one positive view weight is required');

  const results = input.candidates.map((candidate) => {
    let weighted = 0;
    for (const [view, weightRaw] of Object.entries(input.view_weights)) {
      const weight = Math.max(0, weightRaw) / totalWeight;
      weighted += weight * (candidate.view_scores[view] ?? 0);
    }
    return multiViewRerankCandidateSchema.parse({
      canonical_id: candidate.canonical_id,
      fde_score: candidate.fde_score,
      view_scores: candidate.view_scores,
      exact_score: weighted,
    });
  }).sort((a, b) => (b.exact_score ?? 0) - (a.exact_score ?? 0) || a.canonical_id.localeCompare(b.canonical_id));

  return multiViewRerankReceiptSchema.parse({
    query_id: input.query_id,
    candidate_projection_revision: input.candidate_projection_revision,
    original_view_revision: input.original_view_revision,
    rerank_method: 'weighted_views',
    candidate_count: input.candidates.length,
    reranked_count: results.length,
    results,
    producer_revision: input.producer_revision,
  });
}

/** TODO(FI-21B): add token-level Chamfer/MaxSim adapter for ColBERT-style original multivectors and compare against FDE nomination recall. */
