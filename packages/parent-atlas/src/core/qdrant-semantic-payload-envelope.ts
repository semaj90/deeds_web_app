import { z } from 'zod';

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export const qdrantPayloadContractVersion = 'atlas-qdrant-semantic-payload-v1' as const;

export const semanticPayloadEnvelopeSchema = z.object({
  payload_contract_version: z.literal(qdrantPayloadContractVersion),
  packet_key: z.string().min(1),
  source_ref: z.string().min(1),
  document_id: z.string().min(1),
  document_version: z.string().min(1),
  content_hash: z.string().min(1),
  lod: z.string().min(1),
  packet_kind: z.string().min(1),
  authoritative_text: z.string().min(1),
  parent_packet_key: z.string().min(1).nullable().optional(),
  valid_from: z.string().min(1),
  valid_to: z.string().min(1).nullable().optional(),
  is_current: z.boolean().default(true),
  domain_class: z.string().min(1),
  domain_confidence: z.number().min(0).max(1).default(0),
  embedding_contract_version: z.string().min(1),
  graph_snapshot_version: z.string().min(1),
  page_rank_score: z.number().finite().default(0),
  community_id: z.number().finite().nullable().optional(),
  som_cluster: z.number().finite().nullable().optional(),
  feature_id: z.string().min(1).nullable().optional(),
  feature_label: z.string().min(1).nullable().optional(),
  title_id: z.string().min(1).nullable().optional(),
  tree_node_id: z.string().min(1).nullable().optional(),
  processing_pass_id: z.string().min(1).nullable().optional(),
  qdrant_point_id: z.string().min(1).nullable().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type SemanticPayloadEnvelope = z.infer<typeof semanticPayloadEnvelopeSchema>;

export function buildSemanticPayloadEnvelope(input: unknown): SemanticPayloadEnvelope {
  return semanticPayloadEnvelopeSchema.parse(input);
}

export function buildFeatureEnvelopeObject(input: unknown): SemanticPayloadEnvelope {
  return buildSemanticPayloadEnvelope(input);
}

export function describeQdrantSemanticPayloadContract(): string {
  return normalizeText(
    'Qdrant payloads carry rebuildable semantic mirrors only: packet identity, document versioning, temporal validity, domain routing, and graph/topology evidence.',
  );
}
