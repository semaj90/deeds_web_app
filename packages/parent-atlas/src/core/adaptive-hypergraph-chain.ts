import { z } from 'zod';
import type { FeatureRelationshipV1 } from './feature-intelligence.js';
import { rankRelationshipsForQuery, type HypergraphQuerySignalsV1 } from './hypergraph-query-policy.js';

const id = z.string().min(1);
const score = z.number().finite().min(0).max(1);

export const adaptiveChainCandidateSchema = z.object({
  entity_ids: z.array(id).min(1),
  relationship_ids: z.array(id).default([]),
  hop: z.number().int().nonnegative().max(4),
  score,
  evidence_refs: z.array(id).default([]),
}).strict();

export const adaptiveChainSearchReceiptSchema = z.object({
  schema: z.literal('atlas.adaptive-chain-search-receipt.v1').default('atlas.adaptive-chain-search-receipt.v1'),
  query_id: id,
  source_snapshot_revision: z.string().min(1),
  beam_width: z.number().int().positive().max(128),
  max_hops: z.number().int().positive().max(4),
  expanded_states: z.number().int().nonnegative(),
  pruned_states: z.number().int().nonnegative(),
  completed_chains: z.array(adaptiveChainCandidateSchema),
  producer_revision: z.string().min(1),
}).strict();

export type AdaptiveChainCandidateV1 = z.infer<typeof adaptiveChainCandidateSchema>;
export type AdaptiveChainSearchReceiptV1 = z.infer<typeof adaptiveChainSearchReceiptSchema>;

/**
 * Deterministic reference beam-search scaffold. It deliberately keeps scoring
 * outside canonical relationship persistence. TODO: replace/augment scoring
 * with learned chain policy only after offline evaluation receipts exist.
 */
export function searchAdaptiveHypergraphChains(input: {
  query_id: string;
  source_snapshot_revision: string;
  seed_entity_ids: string[];
  relationships: FeatureRelationshipV1[];
  signals?: HypergraphQuerySignalsV1;
  beam_width?: number;
  max_hops?: number;
  producer_revision: string;
}): AdaptiveChainSearchReceiptV1 {
  const beamWidth = Math.max(1, Math.min(input.beam_width ?? 8, 128));
  const maxHops = Math.max(1, Math.min(input.max_hops ?? 2, 4));
  const ranking = rankRelationshipsForQuery(input.relationships, input.signals ?? {});
  const rankById = new Map(ranking.map((item) => [item.relationship_id, item.score]));
  const byEntity = new Map<string, FeatureRelationshipV1[]>();
  for (const rel of input.relationships) for (const p of rel.participants) {
    const rows = byEntity.get(p.entity_id) ?? [];
    rows.push(rel); byEntity.set(p.entity_id, rows);
  }

  let beam: AdaptiveChainCandidateV1[] = [...new Set(input.seed_entity_ids)].sort().map((entityId) => ({
    entity_ids: [entityId], relationship_ids: [], hop: 0, score: 1, evidence_refs: [],
  }));
  let expanded = 0;
  let pruned = 0;
  const completed: AdaptiveChainCandidateV1[] = [];

  for (let hop = 1; hop <= maxHops && beam.length > 0; hop += 1) {
    const next: AdaptiveChainCandidateV1[] = [];
    for (const state of beam) {
      const frontierEntity = state.entity_ids[state.entity_ids.length - 1]!;
      const rels = [...(byEntity.get(frontierEntity) ?? [])]
        .filter((rel) => !state.relationship_ids.includes(rel.relationship_id))
        .sort((a, b) => (rankById.get(b.relationship_id) ?? 0) - (rankById.get(a.relationship_id) ?? 0) || a.relationship_id.localeCompare(b.relationship_id));
      for (const rel of rels) {
        for (const participant of rel.participants) {
          if (state.entity_ids.includes(participant.entity_id)) continue;
          expanded += 1;
          const relScore = rankById.get(rel.relationship_id) ?? rel.confidence;
          const newScore = Math.max(0, Math.min(1, state.score * relScore));
          next.push(adaptiveChainCandidateSchema.parse({
            entity_ids: [...state.entity_ids, participant.entity_id],
            relationship_ids: [...state.relationship_ids, rel.relationship_id],
            hop,
            score: newScore,
            evidence_refs: [...new Set([...state.evidence_refs, ...rel.evidence_refs])].sort(),
          }));
        }
      }
    }
    next.sort((a, b) => b.score - a.score || a.relationship_ids.join('|').localeCompare(b.relationship_ids.join('|')));
    if (next.length > beamWidth) pruned += next.length - beamWidth;
    beam = next.slice(0, beamWidth);
    completed.push(...beam);
  }

  return adaptiveChainSearchReceiptSchema.parse({
    query_id: input.query_id,
    source_snapshot_revision: input.source_snapshot_revision,
    beam_width: beamWidth,
    max_hops: maxHops,
    expanded_states: expanded,
    pruned_states: pruned,
    completed_chains: completed.sort((a, b) => b.score - a.score).slice(0, beamWidth),
    producer_revision: input.producer_revision,
  });
}

/** TODO: add iterative entity<->hyperedge confidence propagation and ablation tests against greedy traversal. */
