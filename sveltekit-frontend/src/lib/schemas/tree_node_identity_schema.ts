import { z } from 'zod';

/**
 * Tree Node Identity Schema
 *
 * Phase 1: Identity and Schema Authority
 * Foundation for all downstream clustering, routing, and recommendation phases.
 *
 * Core principle: Every tree_node_id must be stable, globally unique, and traceable
 * to its Postgres row via source_ref + directory_path.
 *
 * @version 1.0.0
 * @status Phase 1 - Identity & Schema Authority
 */

/**
 * TreeNodeIdentity — The canonical identity contract
 *
 * A tree node represents a semantic unit (file, function, module, subsystem).
 * Identity is immutable once created.
 */
export const TreeNodeIdentitySchema = z.object({
  tree_node_id: z
    .string()
    .min(1)
    .max(256)
    .describe('Globally unique, stable identifier (e.g., "node:src/lib/auth:validateSession")'),

  directory_path: z
    .string()
    .min(1)
    .describe('Relative path to containing directory (e.g., "src/lib")'),

  source_ref: z
    .string()
    .min(1)
    .describe('Canonical source reference (e.g., "src/lib/auth.ts")'),

  file_path: z
    .string()
    .min(1)
    .describe('Full path to the file containing this node'),

  function_symbol: z
    .string()
    .min(1)
    .nullable()
    .describe('Function/export name if applicable (e.g., "validateSession")'),

  node_type: z
    .enum(['file', 'function', 'module', 'subsystem', 'class', 'interface', 'enum'])
    .describe('Semantic type of this node'),

  domain_class: z
    .string()
    .min(1)
    .nullable()
    .describe('Domain classification (e.g., "auth", "database", "ui")'),

  community_id: z
    .string()
    .min(1)
    .nullable()
    .describe('Graph community ID if this node belongs to a detected community'),

  kmeans_cluster_id: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('KMeans cluster assignment (Phase 2), if applicable'),

  feature_id: z
    .string()
    .min(1)
    .nullable()
    .describe('Canonical feature ID (e.g., "feature:auth:sessions", used in Phase 1 onwards)'),

  feature_label: z
    .string()
    .min(1)
    .nullable()
    .describe('Human-readable feature label'),

  source_hash: z
    .string()
    .min(40)
    .max(64)
    .describe('SHA-256 hash of the source content (for duplicate/stale detection)'),

  created_at: z
    .string()
    .datetime()
    .describe('Timestamp when this identity was created'),

  updated_at: z
    .string()
    .datetime()
    .describe('Timestamp of last update to this identity'),

  corpus_snapshot_id: z
    .string()
    .min(1)
    .describe('Which corpus snapshot this identity belongs to'),
});

export type TreeNodeIdentity = z.infer<typeof TreeNodeIdentitySchema>;

/**
 * TreeNodeIdentitySet — A coherent set of tree nodes for cross-store verification
 */
export const TreeNodeIdentitySetSchema = z.object({
  nodes: z.array(TreeNodeIdentitySchema),
  corpus_snapshot_id: z.string().min(1),
  snapshot_timestamp: z.string().datetime(),
  total_nodes: z.number().int().positive(),
});

export type TreeNodeIdentitySet = z.infer<typeof TreeNodeIdentitySetSchema>;

/**
 * Cross-Store Identity Parity Result
 *
 * Verifies that tree_node_id values are consistent across Postgres, Qdrant, Redis, and Neo4j.
 */
export const CrossStoreIdentityParitySchema = z.object({
  // Counts from each store
  postgres_count: z.number().int().nonnegative(),
  qdrant_count: z.number().int().nonnegative(),
  redis_count: z.number().int().nonnegative(),
  neo4j_count: z.number().int().nonnegative(),

  // Intersection checks (all stores should have the same node set)
  postgres_only: z.array(z.string()).describe('Nodes in Postgres but missing elsewhere'),
  qdrant_only: z.array(z.string()).describe('Nodes in Qdrant but missing elsewhere'),
  redis_only: z.array(z.string()).describe('Nodes in Redis but missing elsewhere'),
  neo4j_only: z.array(z.string()).describe('Nodes in Neo4j but missing elsewhere'),

  // All-stores intersection
  present_everywhere: z.array(z.string()),
  missing_somewhere: z.array(z.string()),

  // Parity verdict
  fully_aligned: z.boolean(),
  alignment_percentage: z.number().min(0).max(100),

  // Canonical mismatch detection
  tree_node_id_conflicts: z.array(
    z.object({
      tree_node_id: z.string(),
      postgres_version: TreeNodeIdentitySchema.nullable(),
      qdrant_version: z.any().nullable(),
      redis_version: z.any().nullable(),
      neo4j_version: z.any().nullable(),
    })
  ),
});

export type CrossStoreIdentityParity = z.infer<typeof CrossStoreIdentityParitySchema>;

/**
 * Phase 1 Exit Gate: IDENTITY_STABLE
 *
 * Verifies that all tree_node_id values meet uniqueness and consistency criteria.
 */
export const IdentityStabilityGateSchema = z.object({
  gate_name: z.literal('IDENTITY_STABLE'),
  status: z.enum(['PASS', 'FAIL', 'PARTIAL']),

  // Postgres-level checks
  postgres_uniqueness: z.object({
    total_nodes: z.number().int().positive(),
    unique_tree_node_ids: z.number().int().positive(),
    duplicate_ids: z.number().int().nonnegative(),
    null_tree_node_ids: z.number().int().nonnegative(),
    pass: z.boolean().describe('All tree_node_ids are unique in Postgres'),
  }),

  // Field presence and validity checks
  field_validity: z.object({
    all_have_source_ref: z.boolean(),
    all_have_directory_path: z.boolean(),
    all_have_feature_id: z.boolean(),
    all_have_source_hash: z.boolean(),
    all_have_corpus_snapshot_id: z.boolean(),
    pass: z.boolean(),
  }),

  // Referential integrity
  referential_integrity: z.object({
    all_source_refs_resolve: z.boolean().describe('Every source_ref points to a real file'),
    all_directory_paths_valid: z.boolean(),
    all_corpus_snapshots_exist: z.boolean(),
    pass: z.boolean(),
  }),

  // Naming rules
  naming_compliance: z.object({
    kmeans_cluster_ids_numeric: z.boolean(),
    community_ids_prefixed: z.boolean(),
    domain_classes_normalized: z.boolean(),
    feature_ids_formatted: z.boolean().describe('feature:* format'),
    tree_node_ids_formatted: z.boolean().describe('node:* or file:* format'),
    pass: z.boolean(),
  }),

  // Final verdict
  overall_pass: z.boolean(),
  failure_reasons: z.array(z.string()),
  remediation_steps: z.array(z.string()),
});

export type IdentityStabilityGate = z.infer<typeof IdentityStabilityGateSchema>;

/**
 * Phase 1 Exit Gate: CROSS_STORE_IDENTITY_PROVEN
 *
 * Verifies that tree_node_id values are consistent across all persistent stores.
 */
export const CrossStoreIdentityGateSchema = z.object({
  gate_name: z.literal('CROSS_STORE_IDENTITY_PROVEN'),
  status: z.enum(['PASS', 'FAIL', 'PARTIAL']),

  parity_result: CrossStoreIdentityParitySchema,

  // Store-specific proofs
  postgres_proof: z.object({
    sample_size: z.number().int().min(10),
    verified_count: z.number().int(),
    all_verified: z.boolean(),
  }),

  qdrant_proof: z.object({
    collection_name: z.string(),
    sample_size: z.number().int().min(10),
    verified_count: z.number().int(),
    payload_structure_valid: z.boolean().describe('tree_node_id present in all payloads'),
  }),

  redis_proof: z.object({
    key_pattern: z.string().describe('e.g., "node:*"'),
    sample_size: z.number().int().min(10),
    verified_count: z.number().int(),
  }),

  neo4j_proof: z.object({
    node_label: z.string(),
    sample_size: z.number().int().min(10),
    verified_count: z.number().int(),
    property_exists: z.boolean().describe('tree_node_id property present'),
  }),

  // Conflict resolution
  conflicts_detected: z.number().int().nonnegative(),
  conflicts_resolved: z.number().int().nonnegative(),

  // Final verdict
  overall_pass: z.boolean(),
  failure_reasons: z.array(z.string()),
});

export type CrossStoreIdentityGate = z.infer<typeof CrossStoreIdentityGateSchema>;
