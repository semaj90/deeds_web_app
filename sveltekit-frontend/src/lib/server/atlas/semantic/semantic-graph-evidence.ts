import { z } from 'zod';

/**
 * Semantic graph evidence is deliberately split into three responsibilities:
 *
 * - RDFLib/Dataset: RDF triples/quads, named-graph provenance, SPARQL, interchange.
 * - NetworkX/cuGraph: graph algorithms over a projection (PageRank, SCC, paths, etc.).
 * - Owlready2/reasoners: OWL class/property semantics and DL reasoning.
 *
 * No engine becomes canonical truth by itself. Asserted source/AST evidence remains
 * revision-qualified, inferred facts remain derived, and graph analytics remain features.
 */

export const SemanticAssertionKindSchema = z.enum(['ASSERTED', 'INFERRED']);
export type SemanticAssertionKind = z.infer<typeof SemanticAssertionKindSchema>;

export const SemanticObjectV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CANONICAL_ID'), canonicalId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('IRI'), iri: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal('LITERAL'),
    lexicalValue: z.string(),
    datatypeIri: z.string().min(1).nullable(),
    language: z.string().min(1).nullable(),
  }).strict(),
]);
export type SemanticObjectV1 = z.infer<typeof SemanticObjectV1Schema>;

export const SemanticInferenceEngineSchema = z.enum([
  'RDFLIB_OWLRL',
  'OWLREADY2_HERMIT',
  'OWLREADY2_PELLET',
]);

export const SemanticFactV1Schema = z.object({
  schema: z.literal('atlas.semantic-fact.v1'),
  factId: z.string().min(1),
  subjectCanonicalId: z.string().min(1),
  predicateIri: z.string().min(1),
  object: SemanticObjectV1Schema,

  /** Canonical evidence coordinate. Never synthesize a fake source reference. */
  sourceRef: z.string().min(1),
  /** Structural coordinate is nullable when no proven AST owner supplied it. */
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  packetKey: z.string().min(1).nullable(),

  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  ontologyRevision: z.string().min(1),
  domainClass: z.string().min(1).nullable(),

  assertionKind: SemanticAssertionKindSchema,
  inference: z.object({
    engine: SemanticInferenceEngineSchema,
    profile: z.enum(['RDFS', 'OWL_RL', 'OWL_DL']),
    premiseFactIds: z.array(z.string().min(1)).min(1),
    reasonerRevision: z.string().min(1),
  }).strict().nullable(),

  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.assertionKind === 'ASSERTED' && value.inference !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inference'], message: 'asserted facts cannot carry an inference receipt' });
  }
  if (value.assertionKind === 'INFERRED' && value.inference === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['inference'], message: 'inferred facts require premise/reasoner provenance' });
  }
});
export type SemanticFactV1 = z.infer<typeof SemanticFactV1Schema>;

export const RdfQuadProjectionV1Schema = z.object({
  schema: z.literal('atlas.rdf-quad-projection.v1'),
  factId: z.string().min(1),
  subjectIri: z.string().min(1),
  predicateIri: z.string().min(1),
  object: SemanticObjectV1Schema,
  namedGraphIri: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  assertionKind: SemanticAssertionKindSchema,
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type RdfQuadProjectionV1 = z.infer<typeof RdfQuadProjectionV1Schema>;

function urnPart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_');
}

export function projectSemanticFactToRdfQuad(fact: SemanticFactV1): RdfQuadProjectionV1 {
  const parsed = SemanticFactV1Schema.parse(fact);
  return RdfQuadProjectionV1Schema.parse({
    schema: 'atlas.rdf-quad-projection.v1',
    factId: parsed.factId,
    subjectIri: `urn:atlas:canonical:${urnPart(parsed.subjectCanonicalId)}`,
    predicateIri: parsed.predicateIri,
    object: parsed.object,
    namedGraphIri: `urn:atlas:source:${urnPart(parsed.workspaceRevision)}:${urnPart(parsed.sourceRevision)}:${urnPart(parsed.sourceRef)}`,
    sourceRef: parsed.sourceRef,
    treeNodeId: parsed.treeNodeId,
    workspaceRevision: parsed.workspaceRevision,
    sourceRevision: parsed.sourceRevision,
    assertionKind: parsed.assertionKind,
    canonicalWritesAllowed: false,
  });
}

export const NetworkXSemanticProjectionV1Schema = z.discriminatedUnion('projectionKind', [
  z.object({
    schema: z.literal('atlas.networkx-semantic-projection.v1'),
    projectionKind: z.literal('EDGE'),
    sourceNode: z.string().min(1),
    targetNode: z.string().min(1),
    predicateIri: z.string().min(1),
    attributes: z.object({
      factId: z.string().min(1),
      sourceRef: z.string().min(1),
      treeNodeId: z.string().min(1).nullable(),
      workspaceRevision: z.string().min(1),
      sourceRevision: z.string().min(1),
      graphRevision: z.string().min(1),
      assertionKind: SemanticAssertionKindSchema,
      semanticTruth: z.literal(false),
    }).strict(),
  }).strict(),
  z.object({
    schema: z.literal('atlas.networkx-semantic-projection.v1'),
    projectionKind: z.literal('NODE_ATTRIBUTE'),
    sourceNode: z.string().min(1),
    predicateIri: z.string().min(1),
    literal: SemanticObjectV1Schema,
    attributes: z.object({
      factId: z.string().min(1),
      sourceRef: z.string().min(1),
      treeNodeId: z.string().min(1).nullable(),
      workspaceRevision: z.string().min(1),
      sourceRevision: z.string().min(1),
      graphRevision: z.string().min(1),
      assertionKind: SemanticAssertionKindSchema,
      semanticTruth: z.literal(false),
    }).strict(),
  }).strict(),
]);
export type NetworkXSemanticProjectionV1 = z.infer<typeof NetworkXSemanticProjectionV1Schema>;

export function projectSemanticFactToNetworkX(fact: SemanticFactV1): NetworkXSemanticProjectionV1 {
  const parsed = SemanticFactV1Schema.parse(fact);
  const attributes = {
    factId: parsed.factId,
    sourceRef: parsed.sourceRef,
    treeNodeId: parsed.treeNodeId,
    workspaceRevision: parsed.workspaceRevision,
    sourceRevision: parsed.sourceRevision,
    graphRevision: parsed.graphRevision,
    assertionKind: parsed.assertionKind,
    semanticTruth: false as const,
  };
  if (parsed.object.kind === 'LITERAL') {
    return NetworkXSemanticProjectionV1Schema.parse({
      schema: 'atlas.networkx-semantic-projection.v1',
      projectionKind: 'NODE_ATTRIBUTE',
      sourceNode: parsed.subjectCanonicalId,
      predicateIri: parsed.predicateIri,
      literal: parsed.object,
      attributes,
    });
  }
  return NetworkXSemanticProjectionV1Schema.parse({
    schema: 'atlas.networkx-semantic-projection.v1',
    projectionKind: 'EDGE',
    sourceNode: parsed.subjectCanonicalId,
    targetNode: parsed.object.kind === 'CANONICAL_ID' ? parsed.object.canonicalId : parsed.object.iri,
    predicateIri: parsed.predicateIri,
    attributes,
  });
}

export const NarySemanticMemberV1Schema = z.object({
  canonicalId: z.string().min(1),
  role: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
}).strict();

export const NarySemanticRelationV1Schema = z.object({
  schema: z.literal('atlas.nary-semantic-relation.v1'),
  hyperedgeId: z.string().min(1),
  relationTypeIri: z.string().min(1),
  relationshipDegree: z.number().int().min(2),
  members: z.array(NarySemanticMemberV1Schema).min(2),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  rdfProjection: z.literal('RELATION_NODE_WITH_ROLE_MEMBERS'),
  pairwiseFlatteningAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.relationshipDegree !== value.members.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationshipDegree'], message: 'relationship degree must equal member count' });
  }
});
export type NarySemanticRelationV1 = z.infer<typeof NarySemanticRelationV1Schema>;

export const GraphAnalyticFeatureV1Schema = z.object({
  schema: z.literal('atlas.graph-analytic-feature.v1'),
  canonicalId: z.string().min(1),
  graphRevision: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)),
  pagerank: z.number().finite().nullable(),
  hitsHub: z.number().finite().nullable(),
  hitsAuthority: z.number().finite().nullable(),
  communityId: z.string().min(1).nullable(),
  shortestPathDistance: z.number().finite().nonnegative().nullable(),
  semanticTruth: z.literal(false),
  logicalLaneVoteAdded: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type GraphAnalyticFeatureV1 = z.infer<typeof GraphAnalyticFeatureV1Schema>;

export const SemanticKnowledgeOperationSchema = z.enum([
  'RDF_PARSE_SERIALIZE',
  'SPARQL_QUERY',
  'PROVENANCE_DATASET',
  'RDFS_CLOSURE',
  'OWL_RL_CLOSURE',
  'OWL_DL_CLASSIFICATION',
  'OWL_CONSISTENCY_CHECK',
  'GRAPH_PAGERANK',
  'GRAPH_PATHS',
  'GRAPH_SCC',
  'GRAPH_COMMUNITY',
  'HYPERGRAPH_EXPANSION',
]);
export type SemanticKnowledgeOperation = z.infer<typeof SemanticKnowledgeOperationSchema>;

export const SemanticKnowledgeEngineSchema = z.enum([
  'RDFLIB_DATASET',
  'RDFLIB_OWLRL',
  'OWLREADY2_HERMIT',
  'OWLREADY2_PELLET',
  'NETWORKX_REFERENCE',
  'CUGRAPH_GPU',
  'ATLAS_HYPERGRAPH',
]);
export type SemanticKnowledgeEngine = z.infer<typeof SemanticKnowledgeEngineSchema>;

export const SemanticKnowledgeExecutionStageV1Schema = z.object({
  operation: SemanticKnowledgeOperationSchema,
  engine: SemanticKnowledgeEngineSchema,
  role: z.enum(['SEMANTIC_INTERCHANGE', 'RULE_REASONER', 'DL_REASONER', 'GRAPH_ANALYTICS', 'NARY_RELATION_OWNER']),
  authoritativeFor: z.array(z.string().min(1)),
  canonicalFactCreationAllowed: z.literal(false),
  exactSourceEvidenceRequiredForPromotion: z.literal(true),
  reasons: z.array(z.string().min(1)).min(1),
}).strict();

export const SemanticKnowledgeExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.semantic-knowledge-execution-plan.v1'),
  operations: z.array(SemanticKnowledgeOperationSchema).min(1),
  stages: z.array(SemanticKnowledgeExecutionStageV1Schema).min(1),
  preserveSourceRef: z.literal(true),
  preserveTreeNodeIdWhenProven: z.literal(true),
  fabricateMissingTreeNodeId: z.literal(false),
  inferredFactsRemainDerived: z.literal(true),
  graphAnalyticsRemainFeatures: z.literal(true),
  hyperedgesRemainNary: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type SemanticKnowledgeExecutionPlanV1 = z.infer<typeof SemanticKnowledgeExecutionPlanV1Schema>;

const RDF_OPS = new Set<SemanticKnowledgeOperation>(['RDF_PARSE_SERIALIZE', 'SPARQL_QUERY', 'PROVENANCE_DATASET']);
const GRAPH_OPS = new Set<SemanticKnowledgeOperation>(['GRAPH_PAGERANK', 'GRAPH_PATHS', 'GRAPH_SCC', 'GRAPH_COMMUNITY']);

export function planSemanticKnowledgeExecution(input: {
  operations: readonly SemanticKnowledgeOperation[];
  gpuGraphAvailable: boolean;
  owlDlReasonerPreference?: 'HERMIT' | 'PELLET';
  producerRevision: string;
}): SemanticKnowledgeExecutionPlanV1 {
  const operations = [...new Set(input.operations.map((op) => SemanticKnowledgeOperationSchema.parse(op)))];
  if (operations.length === 0) throw new Error('at least one semantic knowledge operation is required');
  const stages: z.infer<typeof SemanticKnowledgeExecutionStageV1Schema>[] = [];

  for (const operation of operations) {
    if (RDF_OPS.has(operation)) {
      stages.push({
        operation,
        engine: 'RDFLIB_DATASET',
        role: 'SEMANTIC_INTERCHANGE',
        authoritativeFor: ['RDF_TRIPLES_QUADS', 'NAMED_GRAPH_PROVENANCE', 'SPARQL'],
        canonicalFactCreationAllowed: false,
        exactSourceEvidenceRequiredForPromotion: true,
        reasons: ['RDFLIB_OWNS_RDF_DATASET_AND_SPARQL_REPRESENTATION_NOT_GRAPH_ANALYTICS'],
      });
      continue;
    }
    if (operation === 'RDFS_CLOSURE' || operation === 'OWL_RL_CLOSURE') {
      stages.push({
        operation,
        engine: 'RDFLIB_OWLRL',
        role: 'RULE_REASONER',
        authoritativeFor: ['DERIVED_RULE_CLOSURE_ONLY'],
        canonicalFactCreationAllowed: false,
        exactSourceEvidenceRequiredForPromotion: true,
        reasons: ['OWL_RL_IS_A_SEPARATE_FORWARD_CHAINING_REASONER_ON_TOP_OF_RDFLIB', 'INFERRED_TRIPLES_STAY_DERIVED'],
      });
      continue;
    }
    if (operation === 'OWL_DL_CLASSIFICATION' || operation === 'OWL_CONSISTENCY_CHECK') {
      const engine = input.owlDlReasonerPreference === 'PELLET' ? 'OWLREADY2_PELLET' : 'OWLREADY2_HERMIT';
      stages.push({
        operation,
        engine,
        role: 'DL_REASONER',
        authoritativeFor: ['DERIVED_OWL_CLASSIFICATION_OR_CONSISTENCY_RESULT'],
        canonicalFactCreationAllowed: false,
        exactSourceEvidenceRequiredForPromotion: true,
        reasons: ['OWLREADY2_PROVIDES_OWL_OBJECT_MODEL_AND_EXTERNAL_DL_REASONER_INTEGRATION', 'REASONER_OUTPUT_REQUIRES_PREMISE_AND_REVISION_RECEIPT'],
      });
      continue;
    }
    if (GRAPH_OPS.has(operation)) {
      stages.push({
        operation,
        engine: input.gpuGraphAvailable ? 'CUGRAPH_GPU' : 'NETWORKX_REFERENCE',
        role: 'GRAPH_ANALYTICS',
        authoritativeFor: ['DERIVED_GRAPH_FEATURES_ONLY'],
        canonicalFactCreationAllowed: false,
        exactSourceEvidenceRequiredForPromotion: true,
        reasons: [
          input.gpuGraphAvailable ? 'CUGRAPH_IS_GPU_EXECUTOR_WITH_NETWORKX_REFERENCE_PARITY' : 'NETWORKX_IS_REFERENCE_ANALYTICS_EXECUTOR',
          'PAGERANK_PATHS_SCC_AND_COMMUNITIES_DO_NOT_ASSERT_OWL_TRUTH',
        ],
      });
      continue;
    }
    if (operation === 'HYPERGRAPH_EXPANSION') {
      stages.push({
        operation,
        engine: 'ATLAS_HYPERGRAPH',
        role: 'NARY_RELATION_OWNER',
        authoritativeFor: ['NARY_INCIDENCE_AND_ROLE_MEMBERSHIP'],
        canonicalFactCreationAllowed: false,
        exactSourceEvidenceRequiredForPromotion: true,
        reasons: ['NARY_RELATIONS_MUST_NOT_BE_SILENTLY_FLATTENED_TO_PAIRWISE_TRIPLES'],
      });
    }
  }

  return SemanticKnowledgeExecutionPlanV1Schema.parse({
    schema: 'atlas.semantic-knowledge-execution-plan.v1',
    operations,
    stages,
    preserveSourceRef: true,
    preserveTreeNodeIdWhenProven: true,
    fabricateMissingTreeNodeId: false,
    inferredFactsRemainDerived: true,
    graphAnalyticsRemainFeatures: true,
    hyperedgesRemainNary: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
