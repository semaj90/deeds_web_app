#!/usr/bin/env node

/**
 * Parent Atlas Phase 111 MCP Server
 *
 * Defines the Model Context Protocol (MCP) interface for Phase 111 operations.
 * All tools have explicit input and output schemas to prevent contract mismatches.
 *
 * Recommended tools (read-only):
 * - atlas_validate_contracts: Validate fixture contracts
 * - atlas_validate_evidence_observation: Validate evidence observation records
 * - atlas_build_control_snapshot: Build control snapshot
 * - atlas_validate_snapshot: Validate snapshot structure
 * - atlas_materialize_feature_lanes: Materialize feature extraction lanes
 * - atlas_resolve_label: Resolve domain labels from hierarchy
 * - atlas_record_feedback: Record human/system feedback on observations
 * - atlas_expand_multihop: Expand multi-hop graph relationships
 * - atlas_propose_mutation: Propose mutations on canonical truth
 *
 * Deferred tools (require authorization gates):
 * - atlas_apply_mutation: Apply authorized mutations
 * - atlas_create_qdrant_collection: Create/update Qdrant collections
 * - atlas_write_canonical_memberships: Write domain membership assignments
 */

import { z } from 'zod';

// ============================================================================
// Input/Output Schemas for Each Tool
// ============================================================================

// Tool 1: atlas_validate_contracts
export const ValidateContractsInputSchema = z.object({
  contract_type: z.enum([
    'evidence_observation',
    'mutation_proposal',
    'domain_membership',
    'packet_identity',
  ]),
  fixture_data: z.record(z.string(), z.unknown()),
  strict_mode: z.boolean().optional().default(true),
});

export const ValidateContractsOutputSchema = z.object({
  contract_type: z.string(),
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  validation_timestamp: z.string().datetime(),
  schema_version: z.string(),
});

export type ValidateContractsInput = z.infer<typeof ValidateContractsInputSchema>;
export type ValidateContractsOutput = z.infer<typeof ValidateContractsOutputSchema>;

// Tool 2: atlas_validate_evidence_observation
export const ValidateEvidenceObservationInputSchema = z.object({
  observation: z.object({
    observation_id: z.string().regex(/^obs:[a-z0-9_-]+$/),
    packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
    observation_type: z.string(),
    evidence_lane: z.string(),
    value: z.record(z.string(), z.unknown()),
    confidence: z.number().min(0).max(1),
    source: z.string(),
    observed_at: z.string().datetime(),
  }),
  check_references: z.boolean().optional().default(false),
});

export const ValidateEvidenceObservationOutputSchema = z.object({
  observation_id: z.string(),
  valid: z.boolean(),
  errors: z.array(z.string()),
  reference_valid: z.boolean().optional(),
  reference_errors: z.array(z.string()).optional(),
  confidence_score: z.number().min(0).max(1),
  validation_timestamp: z.string().datetime(),
});

export type ValidateEvidenceObservationInput = z.infer<typeof ValidateEvidenceObservationInputSchema>;
export type ValidateEvidenceObservationOutput = z.infer<typeof ValidateEvidenceObservationOutputSchema>;

// Tool 3: atlas_build_control_snapshot
export const BuildControlSnapshotInputSchema = z.object({
  packet_count: z.number().int().min(100).max(10000).optional().default(1000),
  include_observations: z.boolean().optional().default(true),
  include_queries: z.boolean().optional().default(true),
  stratification: z.record(z.string(), z.number()).optional(),
  output_format: z.enum(['ndjson', 'parquet', 'arrow']).optional().default('ndjson'),
});

export const BuildControlSnapshotOutputSchema = z.object({
  snapshot_id: z.string(),
  packet_count: z.number(),
  observation_count: z.number(),
  query_count: z.number(),
  file_paths: z.record(z.string(), z.string()),
  snapshot_hash: z.string(),
  proof_gates: z.record(z.string(), z.boolean()),
  build_timestamp: z.string().datetime(),
  duration_ms: z.number(),
});

export type BuildControlSnapshotInput = z.infer<typeof BuildControlSnapshotInputSchema>;
export type BuildControlSnapshotOutput = z.infer<typeof BuildControlSnapshotOutputSchema>;

// Tool 4: atlas_validate_snapshot
export const ValidateSnapshotInputSchema = z.object({
  snapshot_path: z.string(),
  check_gates: z.array(z.string()).optional(),
  verbose: z.boolean().optional().default(false),
});

export const ValidateSnapshotOutputSchema = z.object({
  snapshot_path: z.string(),
  valid: z.boolean(),
  packet_count: z.number(),
  observation_count: z.number(),
  gate_results: z.record(z.string(), z.boolean()),
  errors: z.array(z.string()),
  validation_timestamp: z.string().datetime(),
});

export type ValidateSnapshotInput = z.infer<typeof ValidateSnapshotInputSchema>;
export type ValidateSnapshotOutput = z.infer<typeof ValidateSnapshotOutputSchema>;

// Tool 5: atlas_materialize_feature_lanes
export const MaterializeFeatureLanesInputSchema = z.object({
  packet_keys: z.array(z.string().regex(/^ace:packet:[a-z0-9_-]+$/)),
  lanes: z.array(
    z.enum(['semantic', 'lexical', 'structural', 'domain_membership', 'identity_resolution'])
  ),
  batch_size: z.number().int().min(10).max(1000).optional().default(100),
});

export const MaterializeFeatureLanesOutputSchema = z.object({
  packets_processed: z.number(),
  lanes_materialized: z.array(z.string()),
  observations_created: z.number(),
  errors: z.array(z.object({ packet_key: z.string(), error: z.string() })),
  materialization_timestamp: z.string().datetime(),
  duration_ms: z.number(),
});

export type MaterializeFeatureLanesInput = z.infer<typeof MaterializeFeatureLanesInputSchema>;
export type MaterializeFeatureLanesOutput = z.infer<typeof MaterializeFeatureLanesOutputSchema>;

// Tool 6: atlas_resolve_label
export const ResolveLabelInputSchema = z.object({
  label: z.string(),
  hierarchy_version: z.string().optional().default('v1'),
  include_metadata: z.boolean().optional().default(true),
});

export const ResolveLabelOutputSchema = z.object({
  input_label: z.string(),
  canonical_label: z.string().optional(),
  category: z.string().optional(),
  tier_2_labels: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  valid: z.boolean(),
  resolution_timestamp: z.string().datetime(),
});

export type ResolveLabelInput = z.infer<typeof ResolveLabelInputSchema>;
export type ResolveLabelOutput = z.infer<typeof ResolveLabelOutputSchema>;

// Tool 7: atlas_record_feedback
export const RecordFeedbackInputSchema = z.object({
  feedback_type: z.enum([
    'domain_correction',
    'observation_validation',
    'mutation_approval',
    'quality_flag',
  ]),
  target_id: z.string(),
  target_type: z.enum(['packet', 'observation', 'mutation', 'domain_membership']),
  feedback_text: z.string(),
  reviewer_id: z.string(),
  approved: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const RecordFeedbackOutputSchema = z.object({
  feedback_id: z.string(),
  target_id: z.string(),
  feedback_type: z.string(),
  recorded: z.boolean(),
  feedback_timestamp: z.string().datetime(),
  errors: z.array(z.string()),
});

export type RecordFeedbackInput = z.infer<typeof RecordFeedbackInputSchema>;
export type RecordFeedbackOutput = z.infer<typeof RecordFeedbackOutputSchema>;

// Tool 8: atlas_expand_multihop
export const ExpandMultihopInputSchema = z.object({
  start_node: z.string(),
  relationship_types: z.array(z.string()).optional(),
  max_hops: z.number().int().min(1).max(5).optional().default(2),
  include_attributes: z.boolean().optional().default(true),
});

export const ExpandMultihopOutputSchema = z.object({
  start_node: z.string(),
  nodes_found: z.number(),
  edges_found: z.number(),
  hops_depth: z.number(),
  neighbors: z.array(
    z.object({
      node_id: z.string(),
      relationship_type: z.string(),
      hops: z.number(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    })
  ),
  expansion_timestamp: z.string().datetime(),
});

export type ExpandMultihopInput = z.infer<typeof ExpandMultihopInputSchema>;
export type ExpandMultihopOutput = z.infer<typeof ExpandMultihopOutputSchema>;

// Tool 9: atlas_propose_mutation
export const ProposeMutationInputSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  mutation_type: z.enum([
    'domain_membership_update',
    'label_correction',
    'identity_refinement',
    'confidence_adjustment',
    'observation_addition',
  ]),
  changes: z.record(z.string(), z.unknown()),
  justification: z.string(),
  supporting_observations: z.array(z.string()).optional(),
  creator_id: z.string(),
});

export const ProposeMutationOutputSchema = z.object({
  proposal_id: z.string(),
  packet_key: z.string(),
  mutation_type: z.string(),
  status: z.enum(['proposed', 'under_review', 'approved', 'rejected']),
  changes_summary: z.record(z.string(), z.unknown()),
  created_timestamp: z.string().datetime(),
  requires_authorization: z.boolean(),
  authorization_rules: z.array(z.string()).optional(),
});

export type ProposeMutationInput = z.infer<typeof ProposeMutationInputSchema>;
export type ProposeMutationOutput = z.infer<typeof ProposeMutationOutputSchema>;

// ============================================================================
// Deferred Tools (Require Authorization)
// ============================================================================

// Deferred Tool 1: atlas_apply_mutation
export const ApplyMutationInputSchema = z.object({
  proposal_id: z.string().regex(/^mut:[a-z0-9_-]+$/),
  authorization_token: z.string(),
  executor_id: z.string(),
  force: z.boolean().optional().default(false),
});

export const ApplyMutationOutputSchema = z.object({
  proposal_id: z.string(),
  applied: z.boolean(),
  authorization_valid: z.boolean(),
  errors: z.array(z.string()),
  applied_timestamp: z.string().datetime().optional(),
  rollback_id: z.string().optional(),
});

export type ApplyMutationInput = z.infer<typeof ApplyMutationInputSchema>;
export type ApplyMutationOutput = z.infer<typeof ApplyMutationOutputSchema>;

// Deferred Tool 2: atlas_create_qdrant_collection
export const CreateQdrantCollectionInputSchema = z.object({
  collection_name: z.string(),
  vector_size: z.number().int().min(64).max(4096),
  distance_metric: z.enum(['cosine', 'euclidean', 'manhattan']).optional().default('cosine'),
  payload_schema: z.record(z.string(), z.string()).optional(),
  authorization_token: z.string(),
});

export const CreateQdrantCollectionOutputSchema = z.object({
  collection_name: z.string(),
  created: z.boolean(),
  vector_size: z.number(),
  status: z.string(),
  errors: z.array(z.string()),
  creation_timestamp: z.string().datetime().optional(),
});

export type CreateQdrantCollectionInput = z.infer<typeof CreateQdrantCollectionInputSchema>;
export type CreateQdrantCollectionOutput = z.infer<typeof CreateQdrantCollectionOutputSchema>;

// Deferred Tool 3: atlas_write_canonical_memberships
export const WriteCanonicalMembershipsInputSchema = z.object({
  packet_key: z.string().regex(/^ace:packet:[a-z0-9_-]+$/),
  memberships: z.record(z.string(), z.number().min(0).max(1)),
  authorization_token: z.string(),
  primary_domain: z.string().optional(),
});

export const WriteCanonicalMembershipsOutputSchema = z.object({
  packet_key: z.string(),
  written: z.boolean(),
  memberships_count: z.number(),
  authorization_valid: z.boolean(),
  errors: z.array(z.string()),
  write_timestamp: z.string().datetime().optional(),
});

export type WriteCanonicalMembershipsInput = z.infer<typeof WriteCanonicalMembershipsInputSchema>;
export type WriteCanonicalMembershipsOutput = z.infer<typeof WriteCanonicalMembershipsOutputSchema>;

// ============================================================================
// Tool Registry with Schemas
// ============================================================================

export const ToolRegistry = {
  atlas_validate_contracts: {
    description: 'Validate fixture contracts against Zod schemas',
    inputSchema: ValidateContractsInputSchema,
    outputSchema: ValidateContractsOutputSchema,
  },
  atlas_validate_evidence_observation: {
    description: 'Validate evidence observation records',
    inputSchema: ValidateEvidenceObservationInputSchema,
    outputSchema: ValidateEvidenceObservationOutputSchema,
  },
  atlas_build_control_snapshot: {
    description: 'Build control snapshot from atlas_packets',
    inputSchema: BuildControlSnapshotInputSchema,
    outputSchema: BuildControlSnapshotOutputSchema,
  },
  atlas_validate_snapshot: {
    description: 'Validate snapshot structure and proof gates',
    inputSchema: ValidateSnapshotInputSchema,
    outputSchema: ValidateSnapshotOutputSchema,
  },
  atlas_materialize_feature_lanes: {
    description: 'Materialize evidence observation lanes',
    inputSchema: MaterializeFeatureLanesInputSchema,
    outputSchema: MaterializeFeatureLanesOutputSchema,
  },
  atlas_resolve_label: {
    description: 'Resolve domain labels from hierarchy',
    inputSchema: ResolveLabelInputSchema,
    outputSchema: ResolveLabelOutputSchema,
  },
  atlas_record_feedback: {
    description: 'Record human/system feedback on observations',
    inputSchema: RecordFeedbackInputSchema,
    outputSchema: RecordFeedbackOutputSchema,
  },
  atlas_expand_multihop: {
    description: 'Expand multi-hop graph relationships',
    inputSchema: ExpandMultihopInputSchema,
    outputSchema: ExpandMultihopOutputSchema,
  },
  atlas_propose_mutation: {
    description: 'Propose mutations on canonical truth',
    inputSchema: ProposeMutationInputSchema,
    outputSchema: ProposeMutationOutputSchema,
  },
  atlas_apply_mutation: {
    description: '[DEFERRED] Apply authorized mutations',
    inputSchema: ApplyMutationInputSchema,
    outputSchema: ApplyMutationOutputSchema,
  },
  atlas_create_qdrant_collection: {
    description: '[DEFERRED] Create/update Qdrant collections',
    inputSchema: CreateQdrantCollectionInputSchema,
    outputSchema: CreateQdrantCollectionOutputSchema,
  },
  atlas_write_canonical_memberships: {
    description: '[DEFERRED] Write domain membership assignments',
    inputSchema: WriteCanonicalMembershipsInputSchema,
    outputSchema: WriteCanonicalMembershipsOutputSchema,
  },
} as const;

export default ToolRegistry;
