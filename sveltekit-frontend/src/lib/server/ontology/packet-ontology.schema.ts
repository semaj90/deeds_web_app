/**
 * Packet Ontology Schema
 * Zod-validated tuple structure for rich typed metadata on every packet
 *
 * Replaces free-form summaries with structured semantic tuples that
 * support multi-vector enrichment, HMM intent classification, and
 * topological reranking.
 */

import { z } from 'zod';

/**
 * Node type classification (19 types)
 * Determines retrieval lanes and reranking strategy
 */
export const NodeTypeSchema = z.enum([
  'ENTITY',      // Business entities, data models
  'FILE',        // Source files, modules
  'FUNCTION',    // Functions, procedures, methods
  'CLASS',       // Classes, types, interfaces
  'API',         // HTTP endpoints, RPC methods
  'ROUTE',       // SvelteKit routes, page handlers
  'TOOL',        // MCP tools, CLI commands
  'TEST',        // Test suites, test cases
  'PARAMETER',   // Function params, config options
  'FEATURE',     // High-level features, subsystems
  'DOCUMENT',    // README, docs, comments
  'SQL',         // Database queries, migrations
  'CONFIG',      // Configuration files, env vars
  'RPC',         // gRPC services, RPC contracts
  'MCP',         // MCP server definitions
  'GRAPH',       // Graph structures, Neo4j nodes
  'VECTOR',      // Vector operations, embeddings
  'CACHE',       // Cache layers, persistence
  'WORKER',      // Background workers, threads
  'QUEUE',       // Message queues, async handlers
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

/**
 * Ontology edge types
 * Describes relationships between packets
 */
export const EdgeTypeSchema = z.enum([
  'calls',           // Function A calls Function B
  'uses',            // Feature uses Parameter
  'imports',         // Module imports Module
  'returns',         // Function returns Type
  'extends',         // Class extends Base
  'implements',      // Class implements Interface
  'caches',          // Worker caches result in Cache
  'queries',         // Route queries Database
  'publishes_to',    // Worker publishes to Queue
  'subscribes_to',   // Worker listens to Queue
  'belongs_to',      // File belongs to Feature
  'validates',       // Test validates Feature
  'deprecates',      // Document marks as deprecated
  'similar_to',      // Packet is semantically similar
  'depends_on',      // Feature depends on Feature
]);

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * Core ontology tuple
 * Lightweight, deterministic, no LLM required
 */
export const PacketOntologySchema = z.object({
  packet_key: z.string().describe('atlas_packets.packet_key — stable identity'),

  node_type: NodeTypeSchema.describe('Semantic classification (19 types)'),

  symbol: z.string().describe('Code symbol: function name, class name, export name'),

  belongs_to: z.string().optional().describe('Parent feature or module'),

  /**
   * Outgoing edges: what this packet references
   */
  calls: z.array(z.string()).default([]).describe('Functions/methods called'),
  uses: z.array(z.string()).default([]).describe('Parameters, configs used'),
  imports: z.array(z.string()).default([]).describe('Modules imported'),
  publishes_to: z.array(z.string()).default([]).describe('Queues this packet publishes to'),
  queries: z.array(z.string()).default([]).describe('Databases/tables queried'),
  caches: z.array(z.string()).default([]).describe('Cache systems used'),

  /**
   * Semantic enrichment (Gemma4-generated, one-shot)
   */
  title: z.string().optional().describe('Short title (5-10 words)'),
  summary: z.string().optional().describe('Semantic summary (1-2 sentences)'),
  keywords: z.array(z.string()).default([]).describe('Domain keywords for BM25'),

  /**
   * Code signature (deterministic extraction)
   */
  parameters: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    required: z.boolean().default(true),
  })).default([]).describe('Function parameters or route params'),

  returns: z.object({
    type: z.string(),
    description: z.string().optional(),
  }).optional().describe('Return type and description'),

  /**
   * Cross-reference indices (for multi-vector retrieval)
   */
  feature_ids: z.array(z.string()).default([]).describe('Features this packet implements'),
  api_route: z.string().optional().describe('HTTP route if API'),
  rpc_method: z.string().optional().describe('gRPC method name if RPC'),

  /**
   * Provenance (where this tuple came from)
   */
  extracted_by: z.enum(['ast-grep', 'langextract', 'manual', 'test']).describe('Extraction method'),
  extracted_at: z.string().describe('ISO timestamp of extraction'),
  confidence: z.number().min(0).max(1).default(0.8).describe('Confidence score (0-1)'),
});

export type PacketOntology = z.infer<typeof PacketOntologySchema>;

/**
 * Ontology edge tuple (for Neo4j)
 * Stores relationships between packets
 */
export const OntologyEdgeSchema = z.object({
  source_packet_key: z.string(),
  target_packet_key: z.string(),
  edge_type: EdgeTypeSchema,
  confidence: z.number().min(0).max(1).default(0.9),
  extracted_at: z.string(),
});

export type OntologyEdge = z.infer<typeof OntologyEdgeSchema>;

/**
 * Multi-vector bundle
 * All 8 embeddings for a single packet (after enrichment)
 */
export const PacketVectorBundleSchema = z.object({
  packet_key: z.string(),
  content_vector: z.array(z.number()).length(384).describe('Canonical 384-dim embedding'),
  title_vector: z.array(z.number()).length(384).optional(),
  summary_vector: z.array(z.number()).length(384).optional(),
  keyword_vector: z.array(z.number()).length(384).optional(),
  api_vector: z.array(z.number()).length(384).optional(),
  topology_vector: z.array(z.number()).length(384).optional(),
  latent64_vector: z.array(z.number()).length(64).optional(),
  graph_vector: z.array(z.number()).length(384).optional(),
});

export type PacketVectorBundle = z.infer<typeof PacketVectorBundleSchema>;
