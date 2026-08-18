import { z } from 'zod';
import type { FeatureRelationshipV1 } from './feature-intelligence.js';
import { projectRelationshipToIncidence } from './hypergraph-retrieval.js';

const revision = z.string().min(1);

export const qdrantRelationshipPointPlanSchema = z.object({
  canonical_relationship_id: z.string().min(1),
  projection_point_id: z.string().min(1),
  vector_name: z.literal('semantic_768').default('semantic_768'),
  payload: z.object({
    canonical_id: z.string().min(1),
    relationship_id: z.string().min(1),
    relationship_revision: revision,
    source_revision: revision,
    projection_revision: revision,
    embedding_model_revision: revision,
    relationship_type: z.string().min(1),
    participant_entity_ids: z.array(z.string().min(1)),
  }).strict(),
}).strict();

export type QdrantRelationshipPointPlanV1 = z.infer<typeof qdrantRelationshipPointPlanSchema>;

export function buildQdrantRelationshipPointPlan(input: {
  relationship: FeatureRelationshipV1;
  projection_point_id: string;
  projection_revision: string;
  embedding_model_revision: string;
}): QdrantRelationshipPointPlanV1 {
  return qdrantRelationshipPointPlanSchema.parse({
    canonical_relationship_id: input.relationship.relationship_id,
    projection_point_id: input.projection_point_id,
    payload: {
      canonical_id: input.relationship.relationship_id,
      relationship_id: input.relationship.relationship_id,
      relationship_revision: input.relationship.relationship_revision,
      source_revision: input.relationship.source_revision,
      projection_revision: input.projection_revision,
      embedding_model_revision: input.embedding_model_revision,
      relationship_type: input.relationship.relationship_type,
      participant_entity_ids: [...new Set(input.relationship.participants.map((p) => p.entity_id))].sort(),
    },
  });
}

export const cagraBuildPlanSchema = z.object({
  schema: z.literal('atlas.cagra-build-plan.v1').default('atlas.cagra-build-plan.v1'),
  source_snapshot_revision: revision,
  projection_revision: revision,
  dimensions: z.literal(768).default(768),
  metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']).default('cosine'),
  graph_degree: z.number().int().positive().default(64),
  intermediate_graph_degree: z.number().int().positive().default(128),
  graph_build_algo: z.enum(['IVF_PQ', 'NN_DESCENT', 'ACE', 'AUTO']).default('AUTO'),
  dataset_memory_type: z.enum(['device', 'host', 'mmap']).default('mmap'),
  vector_count: z.number().int().nonnegative(),
  source_checksum: z.string().min(1),
  exact_oracle_required: z.literal(true).default(true),
}).strict();

export type CagraBuildPlanV1 = z.infer<typeof cagraBuildPlanSchema>;
export function buildCagraBuildPlan(input: z.input<typeof cagraBuildPlanSchema>): CagraBuildPlanV1 {
  return cagraBuildPlanSchema.parse(input);
}

export const incidenceOrdinalPlanSchema = z.object({
  schema: z.literal('atlas.incidence-ordinal-plan.v1').default('atlas.incidence-ordinal-plan.v1'),
  source_snapshot_revision: revision,
  node_ids: z.array(z.string().min(1)),
  ordinals: z.record(z.string(), z.number().int().nonnegative()),
  edges: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
  relationship_node_ids: z.array(z.string().min(1)),
  entity_node_ids: z.array(z.string().min(1)),
}).strict();

export type IncidenceOrdinalPlanV1 = z.infer<typeof incidenceOrdinalPlanSchema>;

/** Build dense 0..N-1 ordinals for cuGraph. Canonical IDs remain in the reverse map. */
export function buildIncidenceOrdinalPlan(input: {
  source_snapshot_revision: string;
  relationships: FeatureRelationshipV1[];
}): IncidenceOrdinalPlanV1 {
  const nodeIds = new Set<string>();
  const edgeIds: Array<[string, string]> = [];
  const relationshipNodeIds = new Set<string>();
  const entityNodeIds = new Set<string>();
  for (const relationship of input.relationships) {
    const projection = projectRelationshipToIncidence(relationship);
    for (const node of projection.nodes) {
      nodeIds.add(node.node_id);
      if (node.node_kind === 'relationship') relationshipNodeIds.add(node.node_id);
      else entityNodeIds.add(node.node_id);
    }
    for (const edge of projection.edges) edgeIds.push([edge.entity_node_id, edge.relationship_node_id]);
  }
  const sortedNodes = [...nodeIds].sort();
  const ordinals = Object.fromEntries(sortedNodes.map((nodeId, ordinal) => [nodeId, ordinal]));
  const edges = edgeIds.map(([source, target]) => [ordinals[source]!, ordinals[target]!] as [number, number]);
  return incidenceOrdinalPlanSchema.parse({
    source_snapshot_revision: input.source_snapshot_revision,
    node_ids: sortedNodes,
    ordinals,
    edges,
    relationship_node_ids: [...relationshipNodeIds].sort(),
    entity_node_ids: [...entityNodeIds].sort(),
  });
}

/** TODO: live adapters consume these plans and emit projection/parity receipts; plans themselves perform no I/O. */
