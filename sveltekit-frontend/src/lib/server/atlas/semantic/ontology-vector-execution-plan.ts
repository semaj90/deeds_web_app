import { z } from 'zod';

/**
 * Production-oriented plan for combining ontology reasoning, PostgreSQL 18
 * filtering/provenance, and vector-search executors without conflating them.
 *
 * This planner nominates/tournaments executors. It never adds extra logical
 * retrieval votes and never grants canonical-write authority to Owlready2,
 * ANN indexes, or reasoning output.
 */

export const OntologyQueryIntentSchema = z.enum([
  'PROVENANCE_LOOKUP',
  'PROPERTY_PATH',
  'OWL_CLASSIFICATION',
  'OWL_CONSISTENCY',
  'SEMANTIC_NEIGHBOR',
  'HYBRID_RELATIONAL_VECTOR',
]);
export type OntologyQueryIntent = z.infer<typeof OntologyQueryIntentSchema>;

export const OntologyEngineSchema = z.enum([
  'NONE',
  'RDFLIB_DATASET',
  'OWLREADY2_NATIVE_SPARQL',
  'OWLREADY2_HERMIT',
  'OWLREADY2_PELLET',
]);
export type OntologyEngine = z.infer<typeof OntologyEngineSchema>;

export const PostgresAccessPathSchema = z.enum([
  'NONE',
  'BTREE_INDEX_SCAN',
  'BITMAP_HEAP_SCAN',
  'SEQUENTIAL_SCAN',
  'PGVECTOR_EXACT_SCAN',
  'PGVECTOR_HNSW',
  'PGVECTOR_IVFFLAT',
]);
export type PostgresAccessPath = z.infer<typeof PostgresAccessPathSchema>;

export const VectorExecutorIdSchema = z.enum([
  'NONE',
  'PGVECTOR_EXACT',
  'PGVECTOR_HNSW',
  'PGVECTOR_IVFFLAT',
  'CUVS_BRUTE_FORCE',
  'CUVS_CAGRA',
  'CUVS_HNSW_FROM_CAGRA',
  'CUVS_IVF_FLAT',
  'CUVS_IVF_PQ',
  'TURBOVEC',
  'DISKANN_MEMORY',
  'DISKANN_SSD',
]);
export type VectorExecutorId = z.infer<typeof VectorExecutorIdSchema>;

export const VectorExecutorRoleSchema = z.enum([
  'REFERENCE_EXACT',
  'EXACT_EXECUTOR',
  'ANN_CHALLENGER',
  'COMPRESSED_CPU_CHALLENGER',
  'COLD_TIER_CHALLENGER',
]);

export const OntologyVectorPlanningInputV1Schema = z.object({
  schema: z.literal('atlas.ontology-vector-planning-input.v1'),
  intent: OntologyQueryIntentSchema,
  corpusRows: z.number().int().nonnegative(),
  candidateRowsAfterRelationalFilter: z.number().int().nonnegative(),
  dimensions: z.number().int().positive(),
  filterSelectivity: z.number().finite().min(0).max(1),
  exactResultRequired: z.boolean(),
  mutationSensitive: z.boolean(),
  highUpdateRate: z.boolean(),
  gpuAvailable: z.boolean(),
  freeVramBytes: z.number().int().nonnegative(),
  coldTierAvailable: z.boolean(),
  turbovecAvailable: z.boolean(),
  diskannAvailable: z.boolean(),
  pgvectorAvailable: z.boolean(),
  rapidsSidecarAvailable: z.boolean(),
  ontologyReasoningRequired: z.boolean(),
  ontologyProfile: z.enum(['NONE', 'RDFS', 'OWL_RL', 'OWL_DL']),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.candidateRowsAfterRelationalFilter > value.corpusRows) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateRowsAfterRelationalFilter'],
      message: 'filtered candidate count cannot exceed corpus size',
    });
  }
  if (!value.ontologyReasoningRequired && value.ontologyProfile !== 'NONE') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ontologyProfile'],
      message: 'ontologyProfile must be NONE when reasoning is not required',
    });
  }
}).transform((value) => value);
export type OntologyVectorPlanningInputV1 = z.infer<typeof OntologyVectorPlanningInputV1Schema>;

export const VectorExecutorCandidateV1Schema = z.object({
  executor: VectorExecutorIdSchema,
  role: VectorExecutorRoleSchema,
  eligible: z.boolean(),
  exact: z.boolean(),
  logicalLane: z.literal('semantic'),
  logicalLaneVoteAdded: z.literal(false),
  exactPromotionRequired: z.boolean(),
  storageTier: z.enum(['POSTGRES', 'GPU', 'CPU_RAM', 'SSD', 'NONE']),
  reasons: z.array(z.string().min(1)).min(1),
}).strict();
export type VectorExecutorCandidateV1 = z.infer<typeof VectorExecutorCandidateV1Schema>;

export const PostgresAioObservationV1Schema = z.object({
  accessPath: PostgresAccessPathSchema,
  aioPotentiallyHelpful: z.boolean(),
  reason: z.string().min(1),
}).strict();
export type PostgresAioObservationV1 = z.infer<typeof PostgresAioObservationV1Schema>;

export const OntologyVectorExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.ontology-vector-execution-plan.v1'),
  ontologyEngine: OntologyEngineSchema,
  ontologyRole: z.enum(['NONE', 'INTERCHANGE_QUERY', 'RULE_OR_DL_REASONER']),
  ontologyCanonicalWritesAllowed: z.literal(false),
  postgresRole: z.array(z.enum([
    'CANONICAL_IDENTITY',
    'REVISION_PROVENANCE',
    'RELATIONAL_FILTER',
    'VECTOR_EXECUTOR',
  ])),
  postgresAccessPath: PostgresAccessPathSchema,
  postgresAio: PostgresAioObservationV1Schema,
  vectorCandidates: z.array(VectorExecutorCandidateV1Schema),
  preferredVectorExecutor: VectorExecutorIdSchema,
  tournamentRequired: z.literal(true),
  exactPromotionPreserved: z.literal(true),
  inferredOntologyFactsRemainDerived: z.literal(true),
  sourceRefPreserved: z.literal(true),
  treeNodeIdPreservedWhenProven: z.literal(true),
  fabricateMissingTreeNodeId: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type OntologyVectorExecutionPlanV1 = z.infer<typeof OntologyVectorExecutionPlanV1Schema>;

export function postgres18AioObservation(accessPath: PostgresAccessPath): PostgresAioObservationV1 {
  switch (accessPath) {
    case 'BITMAP_HEAP_SCAN':
      return { accessPath, aioPotentiallyHelpful: true, reason: 'POSTGRES18_AIO_CAN_QUEUE_BITMAP_HEAP_READS' };
    case 'SEQUENTIAL_SCAN':
      return { accessPath, aioPotentiallyHelpful: true, reason: 'POSTGRES18_AIO_CAN_QUEUE_SEQUENTIAL_READS' };
    case 'NONE':
      return { accessPath, aioPotentiallyHelpful: false, reason: 'NO_POSTGRES_SCAN' };
    case 'BTREE_INDEX_SCAN':
      return { accessPath, aioPotentiallyHelpful: false, reason: 'AIO_NOT_THE_PRIMARY_REASON_TO_CHOOSE_BTREE_INDEX_SCAN' };
    case 'PGVECTOR_EXACT_SCAN':
      return { accessPath, aioPotentiallyHelpful: true, reason: 'EXACT_VECTOR_SCAN_MAY_BENEFIT_FROM_POSTGRES_STORAGE_IO_BUT_AIO_IS_NOT_THE_VECTOR_ALGORITHM' };
    case 'PGVECTOR_HNSW':
      return { accessPath, aioPotentiallyHelpful: false, reason: 'HNSW_IS_THE_VECTOR_INDEX_ALGORITHM;_DO_NOT_LABEL_IT_AS_AIO' };
    case 'PGVECTOR_IVFFLAT':
      return { accessPath, aioPotentiallyHelpful: false, reason: 'IVFFLAT_IS_THE_VECTOR_INDEX_ALGORITHM;DO_NOT_LABEL_IT_AS_AIO' };
  }
}

function chooseOntologyEngine(input: OntologyVectorPlanningInputV1): {
  engine: OntologyEngine;
  role: 'NONE' | 'INTERCHANGE_QUERY' | 'RULE_OR_DL_REASONER';
} {
  if (!input.ontologyReasoningRequired) {
    if (input.intent === 'PROVENANCE_LOOKUP' || input.intent === 'PROPERTY_PATH') {
      return { engine: 'RDFLIB_DATASET', role: 'INTERCHANGE_QUERY' };
    }
    return { engine: 'NONE', role: 'NONE' };
  }
  if (input.ontologyProfile === 'OWL_DL') {
    return {
      engine: input.intent === 'OWL_CONSISTENCY' ? 'OWLREADY2_PELLET' : 'OWLREADY2_HERMIT',
      role: 'RULE_OR_DL_REASONER',
    };
  }
  return { engine: 'OWLREADY2_NATIVE_SPARQL', role: 'INTERCHANGE_QUERY' };
}

function choosePostgresAccessPath(input: OntologyVectorPlanningInputV1): PostgresAccessPath {
  if (!input.pgvectorAvailable) {
    if (input.filterSelectivity <= 0.01) return 'BTREE_INDEX_SCAN';
    if (input.filterSelectivity <= 0.25) return 'BITMAP_HEAP_SCAN';
    return 'SEQUENTIAL_SCAN';
  }

  if (input.intent === 'SEMANTIC_NEIGHBOR' || input.intent === 'HYBRID_RELATIONAL_VECTOR') {
    if (input.exactResultRequired && input.candidateRowsAfterRelationalFilter <= 50_000) return 'PGVECTOR_EXACT_SCAN';
    if (input.highUpdateRate || input.corpusRows < 1_000_000) return 'PGVECTOR_HNSW';
    return 'PGVECTOR_IVFFLAT';
  }

  if (input.filterSelectivity <= 0.01) return 'BTREE_INDEX_SCAN';
  if (input.filterSelectivity <= 0.25) return 'BITMAP_HEAP_SCAN';
  return 'SEQUENTIAL_SCAN';
}

function buildVectorCandidates(input: OntologyVectorPlanningInputV1): VectorExecutorCandidateV1[] {
  const candidates: VectorExecutorCandidateV1[] = [];
  const semanticIntent = input.intent === 'SEMANTIC_NEIGHBOR' || input.intent === 'HYBRID_RELATIONAL_VECTOR';
  if (!semanticIntent) return candidates;

  if (input.pgvectorAvailable) {
    candidates.push({
      executor: 'PGVECTOR_EXACT', role: 'EXACT_EXECUTOR', eligible: true, exact: true,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: false,
      storageTier: 'POSTGRES', reasons: ['IN_DATABASE_EXACT_REFERENCE_FOR_FILTERED_CANDIDATE_SET'],
    });
    candidates.push({
      executor: 'PGVECTOR_HNSW', role: 'ANN_CHALLENGER', eligible: true, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'POSTGRES', reasons: ['DYNAMIC_IN_DATABASE_ANN_WITHOUT_IVF_TRAINING_STEP'],
    });
    candidates.push({
      executor: 'PGVECTOR_IVFFLAT', role: 'ANN_CHALLENGER', eligible: input.corpusRows > 0, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'POSTGRES', reasons: ['INVERTED_LIST_ANN_WITH_KMEANS_TRAINING_AND_PROBE_TUNING'],
    });
  }

  if (input.gpuAvailable && input.rapidsSidecarAvailable) {
    candidates.push({
      executor: 'CUVS_BRUTE_FORCE', role: 'REFERENCE_EXACT', eligible: input.candidateRowsAfterRelationalFilter <= 25_000, exact: true,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: false,
      storageTier: 'GPU', reasons: ['GPU_EXACT_ORACLE_WHEN_BOUNDED_CORPUS_FITS_SIDECAR_GUARDS'],
    });
    candidates.push({
      executor: 'CUVS_CAGRA', role: 'ANN_CHALLENGER', eligible: input.freeVramBytes > 0, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'GPU', reasons: ['GPU_NATIVE_GRAPH_ANN_CHALLENGER'],
    });
    candidates.push({
      executor: 'CUVS_IVF_FLAT', role: 'ANN_CHALLENGER', eligible: input.freeVramBytes > 0, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'GPU', reasons: ['GPU_INVERTED_FILE_CHALLENGER_WITH_FAST_BUILD_PRIORITY'],
    });
    candidates.push({
      executor: 'CUVS_IVF_PQ', role: 'ANN_CHALLENGER', eligible: input.freeVramBytes > 0 && input.corpusRows >= 1_000_000, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'GPU', reasons: ['PRODUCT_QUANTIZED_GPU_CHALLENGER_FOR_LARGE_CORPORA'],
    });
    candidates.push({
      executor: 'CUVS_HNSW_FROM_CAGRA', role: 'ANN_CHALLENGER', eligible: true, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'CPU_RAM', reasons: ['CAGRA_GRAPH_CAN_BE_CONVERTED_TO_IMMUTABLE_CPU_HNSW_FOR_GPU_BUILD_CPU_SEARCH_EXPERIMENT'],
    });
  }

  if (input.turbovecAvailable) {
    candidates.push({
      executor: 'TURBOVEC', role: 'COMPRESSED_CPU_CHALLENGER', eligible: true, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'CPU_RAM', reasons: ['COMPRESSED_SIMD_CPU_INDEX_WITH_STABLE_EXTERNAL_ID_MAP_OPTION'],
    });
  }

  if (input.diskannAvailable) {
    candidates.push({
      executor: 'DISKANN_MEMORY', role: 'ANN_CHALLENGER', eligible: true, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'CPU_RAM', reasons: ['MEMORY_RESIDENT_DISKANN3_CHALLENGER'],
    });
    candidates.push({
      executor: 'DISKANN_SSD', role: 'COLD_TIER_CHALLENGER', eligible: input.coldTierAvailable, exact: false,
      logicalLane: 'semantic', logicalLaneVoteAdded: false, exactPromotionRequired: true,
      storageTier: 'SSD', reasons: ['SSD_TIER_FOR_CORPORA_THAT_SHOULD_NOT_REMAIN_FULLY_RAM_OR_VRAM_RESIDENT'],
    });
  }

  return candidates;
}

function choosePreferredVectorExecutor(input: OntologyVectorPlanningInputV1, candidates: VectorExecutorCandidateV1[]): VectorExecutorId {
  if (candidates.length === 0) return 'NONE';
  const eligible = new Set(candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.executor));

  if (input.exactResultRequired || input.mutationSensitive) {
    if (eligible.has('CUVS_BRUTE_FORCE')) return 'CUVS_BRUTE_FORCE';
    if (eligible.has('PGVECTOR_EXACT')) return 'PGVECTOR_EXACT';
  }
  if (input.coldTierAvailable && input.corpusRows >= 1_000_000 && eligible.has('DISKANN_SSD')) return 'DISKANN_SSD';
  if (input.gpuAvailable && input.rapidsSidecarAvailable && input.corpusRows >= 100_000 && eligible.has('CUVS_CAGRA')) return 'CUVS_CAGRA';
  if (input.highUpdateRate && eligible.has('PGVECTOR_HNSW')) return 'PGVECTOR_HNSW';
  if (eligible.has('TURBOVEC')) return 'TURBOVEC';
  if (eligible.has('PGVECTOR_HNSW')) return 'PGVECTOR_HNSW';
  if (eligible.has('PGVECTOR_IVFFLAT')) return 'PGVECTOR_IVFFLAT';
  return candidates.find((candidate) => candidate.eligible)?.executor ?? 'NONE';
}

export function planOntologyVectorExecution(value: OntologyVectorPlanningInputV1): OntologyVectorExecutionPlanV1 {
  const input = OntologyVectorPlanningInputV1Schema.parse(value);
  const ontology = chooseOntologyEngine(input);
  const postgresAccessPath = choosePostgresAccessPath(input);
  const vectorCandidates = buildVectorCandidates(input);
  const preferredVectorExecutor = choosePreferredVectorExecutor(input, vectorCandidates);

  const postgresRole: Array<'CANONICAL_IDENTITY' | 'REVISION_PROVENANCE' | 'RELATIONAL_FILTER' | 'VECTOR_EXECUTOR'> = [
    'CANONICAL_IDENTITY',
    'REVISION_PROVENANCE',
    'RELATIONAL_FILTER',
  ];
  if (preferredVectorExecutor.startsWith('PGVECTOR_')) postgresRole.push('VECTOR_EXECUTOR');

  return OntologyVectorExecutionPlanV1Schema.parse({
    schema: 'atlas.ontology-vector-execution-plan.v1',
    ontologyEngine: ontology.engine,
    ontologyRole: ontology.role,
    ontologyCanonicalWritesAllowed: false,
    postgresRole,
    postgresAccessPath,
    postgresAio: postgres18AioObservation(postgresAccessPath),
    vectorCandidates,
    preferredVectorExecutor,
    tournamentRequired: true,
    exactPromotionPreserved: true,
    inferredOntologyFactsRemainDerived: true,
    sourceRefPreserved: true,
    treeNodeIdPreservedWhenProven: true,
    fabricateMissingTreeNodeId: false,
    producerRevision: input.producerRevision,
  });
}
