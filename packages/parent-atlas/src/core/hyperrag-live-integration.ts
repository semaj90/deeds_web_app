import { z } from 'zod';
import type { AceHypergraphPayloadV1 } from './ace-hypergraph-payload.js';
import { attachHypergraphPayloadToAceEnvelope, buildAceHypergraphMetadata } from './ace-runtime-adapter.js';
import type { FirstStageCanonicalCandidateV1 } from './hypergraph-fusion-facade.js';

export const hyperRagFirstStageHitSchema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  canonical_id: z.string().min(1).nullable().optional(),
  feature_id: z.string().min(1).nullable().optional(),
  relationship_id: z.string().min(1).nullable().optional(),
  evidence_id: z.string().min(1).nullable().optional(),
  score: z.number().finite().nullable().optional(),
  identity_status: z.enum(['canonical', 'degraded', 'unresolved']),
}).strict();

export type HyperRagFirstStageHitV1 = z.infer<typeof hyperRagFirstStageHitSchema>;

export type HyperRagCandidateAdaptationV1 = {
  accepted: FirstStageCanonicalCandidateV1[];
  rejected: Array<{ packet_key: string; reason: string }>;
};

/**
 * Exact-promotion boundary for current HyperRagFusionService hits. Unresolved or
 * degraded hits are rejected instead of manufacturing canonical IDs from packet,
 * Qdrant, path, cluster, or graph projection identity.
 */
export function adaptHyperRagFirstStageHits(
  hits: HyperRagFirstStageHitV1[],
): HyperRagCandidateAdaptationV1 {
  const accepted: FirstStageCanonicalCandidateV1[] = [];
  const rejected: Array<{ packet_key: string; reason: string }> = [];

  for (const raw of hits) {
    const hit = hyperRagFirstStageHitSchema.parse(raw);
    if (hit.identity_status !== 'canonical') {
      rejected.push({ packet_key: hit.packet_key, reason: `identity_status=${hit.identity_status}` });
      continue;
    }
    const family = hit.relationship_id ? 'relationship' : hit.evidence_id ? 'evidence' : 'entity';
    const canonicalId = hit.relationship_id ?? hit.evidence_id ?? hit.canonical_id ?? hit.feature_id;
    if (!canonicalId) {
      rejected.push({ packet_key: hit.packet_key, reason: 'canonical identity missing' });
      continue;
    }
    accepted.push({
      canonical_id: canonicalId,
      family,
      packet_key: hit.packet_key,
      source_ref: hit.source_ref,
      feature_id: hit.feature_id ?? null,
      score: hit.score ?? undefined,
    });
  }
  return { accepted, rejected };
}

/**
 * Build the versioned metadata patch that the existing HyperRAGPacketPipeline
 * can persist beside `canonical_envelope`. This performs no DB write itself.
 */
export function buildHyperRagAceMetadataPatch(input: {
  canonical_envelope: {
    packet_key: string;
    source_ref: string;
    canonical_source_ref: string;
    feature_id?: string | null;
    source_revision?: string | null;
  };
  hypergraph: AceHypergraphPayloadV1;
  packet_revision: string;
  producer_revision: string;
}): { ace_hypergraph: ReturnType<typeof buildAceHypergraphMetadata> } {
  const packet = attachHypergraphPayloadToAceEnvelope({
    envelope: input.canonical_envelope,
    hypergraph: input.hypergraph,
    packet_revision: input.packet_revision,
    producer_revision: input.producer_revision,
  });
  return { ace_hypergraph: buildAceHypergraphMetadata(packet) };
}

/** TODO(FI-16H/FI-16L): frontend should import this adapter after package resolution is proven and persist the returned patch in the existing packet transaction. */
