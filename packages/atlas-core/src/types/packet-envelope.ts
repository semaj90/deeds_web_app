import { z } from 'zod';

/**
 * Frozen Atlas packet envelope contract v1.
 *
 * Writers: packet registry, BM42 population, Qdrant backfill,
 *          SearchRuntime, MCP retrieval server, Neo4j projector, ACE materializer.
 * All writers import this schema — do NOT duplicate equivalent interfaces elsewhere.
 */
export const AtlasPacketEnvelopeSchema = z.object({
  schemaVersion: z.literal('atlas-packet-envelope-v1'),

  identity: z.object({
    titleId: z.string().min(1),
    packetKey: z.string().min(1),
    chunkId: z.string().min(1),
    repositoryId: z.string().uuid(),
  }),

  source: z.object({
    sourceRef: z.string().min(1),
    filePath: z.string().min(1),
    contentHash: z.string().min(1),
    treeNodeId: z.string().nullable(),
    qdrantPointId: z.string().nullable(),
  }),

  content: z.object({
    raw: z.string(),
    summary: z.string().nullable(),
    signature: z.string().nullable(),
  }),

  retrieval: z.object({
    keywords: z.array(z.string()).default([]),
    conceptIds: z.array(z.string()).default([]),
    usedConcepts: z.array(z.string()).default([]),
    domainClass: z.string().nullable(),
    tags: z.array(z.string()).default([]),
    symbolKind: z.string().nullable(),
    language: z.string().nullable(),
  }),

  topology: z.object({
    somCell: z.number().int().min(0).max(399).nullable(),
    kmeansCluster: z.number().int().nullable(),
    communityId: z.string().nullable(),
    pageRank: z.number().nullable(),
  }),

  projection: z.object({
    embeddingVersion: z.string(),
    sparseVersion: z.string().nullable(),
    qdrantContractVersion: z.string(),
  }),
});

export type AtlasPacketEnvelope = z.infer<typeof AtlasPacketEnvelopeSchema>;

/** Qdrant payload shape — subset of envelope fields that go into Qdrant's payload index. */
export interface QdrantPayloadShape {
  repository_id?: string;
  title_id?: string;
  packet_key?: string;
  chunk_id?: string;
  source_ref: string;
  language?: string | null;
  symbol_kind?: string | null;
  domain_class?: string | null;
  keywords?: string[];
  concept_ids?: string[];
  tags?: string[];
  som_cell?: number | null;
  kmeans_cluster?: number | null;
  community_id?: string | null;
  content_hash?: string;
  embedding_version?: string;
  sparse_version?: string | null;
  contract_version: string;
  // content stored for retrieval — not indexed
  content?: string;
  summary?: string | null;
}
