import { z } from 'zod';

// ── Permissions ──────────────────────────────────────────────────────────
export const PacketPermissionSchema = z.object({
  visibility: z.enum(['internal', 'admin', 'agent', 'public']).default('internal'),
  can_write: z.boolean().default(false),
  can_execute: z.boolean().default(false),
  can_export: z.boolean().default(false),
  source: z.enum(['repo_index', 'runtime_capture', 'agent_trace', 'user_upload']).default('repo_index'),
});

// ── Structured Metadata ──────────────────────────────────────────────────
export const PacketStructuredMetadataSchema = z.object({
  repo_root: z.string().default('deeds-web-app'),
  app_root: z.string().default('sveltekit-frontend'),
  file_path: z.string().min(1),
  directory_path: z.string().min(1),
  route_path: z.string().nullable().optional(),
  component_name: z.string().nullable().optional(),
  package_name: z.string().nullable().optional(),
  runtime_surface: z.string().nullable().optional(),
  cache_context: z.record(z.string(), z.any()).default({}),
});

// ── Topology ─────────────────────────────────────────────────────────────
export const PacketTopologySchema = z.object({
  community_id: z.union([z.string(), z.number()]).nullable().optional(),
  neo4j_node_id: z.string().nullable().optional(),
  pagerank: z.number().nullable().optional(),
  betweenness: z.number().nullable().optional(),
  eigenvector: z.number().nullable().optional(),
  som_cluster: z.string().nullable().optional(),
  som_x: z.number().nullable().optional(),
  som_y: z.number().nullable().optional(),
  centroid_id: z.string().nullable().optional(),
  ae_latent64: z.array(z.number()).nullable().optional(),
  ae_distance: z.number().nullable().optional(),
  topology_version: z.string().nullable().optional(),
  topology_updated_at: z.string().nullable().optional(),
});

// ── Vectors ──────────────────────────────────────────────────────────────
export const PacketVectorsSchema = z.object({
  qdrant_point_id: z.string().nullable().optional(),
  qdrant_collection: z.string().nullable().optional(),
  qdrant_vectors: z.record(z.string(), z.any()).nullable().optional(),
  vector_source: z.string().nullable().optional(),
  embedding_384: z.array(z.number()).nullable().optional(),
  latent_64: z.array(z.number()).nullable().optional(),
});

// ── Enrichment ───────────────────────────────────────────────────────────
export const PacketEnrichmentSchema = z.object({
  concepts: z.array(z.string()).default([]),
  langextract_terms: z.array(z.string()).default([]),
  top10_neighbors: z.array(z.record(z.string(), z.any())).default([]),
  summary_model: z.string().nullable().optional(),
  fusion_sources: z.array(z.string()).default([]),
});

// ── Full Addressable Packet ────────────────────────────────────────────
export const AddressablePacketSchema = z.object({
  packet_key: z.string().min(1),
  packet_type: z.string().min(1),
  source_ref: z.string().min(1),
  canonical_source_ref: z.string().nullable().optional(),
  feature_id: z.string().min(1),
  feature_label: z.string().min(1),
  summary: z.string().nullable().optional(),
  bm25_text: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  lane_ids: z.array(z.string()).default([]),
  permissions: PacketPermissionSchema.default({
    visibility: 'internal',
    can_write: false,
    can_execute: false,
    can_export: false,
    source: 'repo_index',
  }),
  metadata: PacketStructuredMetadataSchema,
  topology: PacketTopologySchema.default({}),
  vectors: PacketVectorsSchema.default({}),
  enrichment: PacketEnrichmentSchema.default({
    concepts: [],
    langextract_terms: [],
    top10_neighbors: [],
    fusion_sources: [],
  }),
});

// Inferred types
export type PacketPermission = z.infer<typeof PacketPermissionSchema>;
export type PacketStructuredMetadata = z.infer<typeof PacketStructuredMetadataSchema>;
export type PacketTopology = z.infer<typeof PacketTopologySchema>;
export type PacketVectors = z.infer<typeof PacketVectorsSchema>;
export type PacketEnrichment = z.infer<typeof PacketEnrichmentSchema>;
export type AddressablePacket = z.infer<typeof AddressablePacketSchema>;

// Helpers
export function validatePacket(raw: unknown) {
  return AddressablePacketSchema.safeParse(raw);
}

export function defaultPermissions(source: PacketPermission['source'] = 'repo_index'): PacketPermission {
  return {
    visibility: 'internal',
    can_write: false,
    can_execute: false,
    can_export: false,
    source,
  };
}
