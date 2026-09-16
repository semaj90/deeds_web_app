import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

const revision = z.string().min(1);
const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const AtlasPipelineStageIdSchema = z.enum([
  'DECODE_STREAM',
  'PACKET_FEATURES',
  'DOMAIN_CLASSIFY',
  'CANDIDATE_SNAPSHOT',
  'GRAPH_DAG',
  'RETRIEVAL',
  'CACHE_RESIDENCY',
  'CONTEXT_ASSEMBLY',
]);
export type AtlasPipelineStageId = z.infer<typeof AtlasPipelineStageIdSchema>;

export const AtlasPipelineExecutorSchema = z.enum([
  'NODE_JSON', 'SIMDJSON',
  'FASTAPI_NB', 'FASTAPI_LR', 'FASTAPI_PYTORCH_MLP',
  'NETWORKX', 'CUGRAPH',
  'QDRANT_EXACT', 'QDRANT_HNSW', 'CUVS_EXACT', 'CAGRA', 'TURBOVEC',
  'CPU_SCALAR', 'CPU_SIMD', 'CUDA_SIMT',
  'ACE', 'BITFROST',
]);
export type AtlasPipelineExecutor = z.infer<typeof AtlasPipelineExecutorSchema>;

const streamSchema = z.object({
  format: z.enum(['JSON', 'JSONL', 'ARROW', 'NONE']),
  ordering: z.enum(['SOURCE_ORDER', 'CANONICAL_ORDINAL']),
  chunkBytes: z.number().int().positive().max(1024 * 1024).nullable(),
  maxBatchRows: z.number().int().positive().max(10000).nullable(),
  maxInFlight: z.number().int().positive().max(128),
}).strict();

export const AtlasPipelineStageV1Schema = z.object({
  stageId: AtlasPipelineStageIdSchema,
  executor: AtlasPipelineExecutorSchema,
  executorRevision: revision,
  dependsOn: z.array(AtlasPipelineStageIdSchema),
  inputSchemaRevision: revision,
  outputSchemaRevision: revision,
  inputChecksum: checksum.nullable(),
  outputChecksum: checksum.nullable(),
  stream: streamSchema,
  logicalLane: z.enum(['NONE', 'LEXICAL', 'SEMANTIC', 'GRAPH', 'AST']).default('NONE'),
  voteGroup: z.enum(['NONE', 'LEXICAL', 'SEMANTIC', 'GRAPH', 'AST']).default('NONE'),
  canonicalAuthority: z.literal(false),
}).strict();

export type AtlasPipelineStageV1 = z.infer<typeof AtlasPipelineStageV1Schema>;

export const atlasPipelineContractBindingV1Schema = z.object({
  stageId: AtlasPipelineStageIdSchema,
  contractSchema: z.string().min(1),
  status: z.enum(['SCAFFOLD_CREATED', 'IMPLEMENTED', 'BLOCKED_LINEAGE', 'LIVE_PROVEN']),
  promotionEligible: z.literal(false),
}).strict();
export type AtlasPipelineContractBindingV1 = z.infer<typeof atlasPipelineContractBindingV1Schema>;

export const ATLAS_PIPELINE_CONTRACT_BINDINGS_V1: readonly AtlasPipelineContractBindingV1[] = [
  { stageId: 'DECODE_STREAM', contractSchema: 'atlas.offline-transport-artifact.v1', status: 'SCAFFOLD_CREATED', promotionEligible: false },
  { stageId: 'PACKET_FEATURES', contractSchema: 'atlas.candidate-feature-matrix.v1', status: 'SCAFFOLD_CREATED', promotionEligible: false },
  { stageId: 'DOMAIN_CLASSIFY', contractSchema: 'atlas.domain-classification-evidence.v1', status: 'SCAFFOLD_CREATED', promotionEligible: false },
  { stageId: 'CANDIDATE_SNAPSHOT', contractSchema: 'atlas.candidate-ordinal-map.v1', status: 'BLOCKED_LINEAGE', promotionEligible: false },
  { stageId: 'GRAPH_DAG', contractSchema: 'atlas.graph-snapshot.v1', status: 'BLOCKED_LINEAGE', promotionEligible: false },
  { stageId: 'RETRIEVAL', contractSchema: 'atlas.semantic-cohort-admission.v1', status: 'BLOCKED_LINEAGE', promotionEligible: false },
  { stageId: 'CACHE_RESIDENCY', contractSchema: 'atlas.ace-admission.v1', status: 'BLOCKED_LINEAGE', promotionEligible: false },
  { stageId: 'CONTEXT_ASSEMBLY', contractSchema: 'atlas.packet-fabric-canary.v1', status: 'BLOCKED_LINEAGE', promotionEligible: false },
];

export const AtlasExecutionPipelineV1Schema = z.object({
  schema: z.literal('atlas.execution-pipeline.v1'),
  requestId: z.string().min(1),
  pipelineRevision: revision,
  identity: z.object({
    workspaceId: z.string().min(1),
    workspaceRevision: revision,
    snapshotRevision: revision,
    canonicalExecutionId: z.string().uuid(),
    packetAdmissionReceiptChecksum: checksum,
    packetChunkClosureReceiptChecksum: checksum,
    representationRevision: revision.nullable(),
    featureRevision: revision.nullable(),
  }).strict(),
  context: z.object({
    contextManifestIdentityChecksum: checksum.nullable(),
    candidateSnapshotRevision: revision.nullable(),
    candidateOrdinalMapChecksum: checksum.nullable(),
    graphRevision: revision.nullable(),
    graphOrdinalMapChecksum: checksum.nullable(),
    aceCacheIdentityChecksum: checksum.nullable(),
  }).strict(),
  event: z.object({
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().nullable(),
    eventContractRevision: revision,
    occurredAt: z.string().datetime(),
  }).strict(),
  stages: z.array(AtlasPipelineStageV1Schema).min(1),
  contractBindings: z.array(atlasPipelineContractBindingV1Schema).default([...ATLAS_PIPELINE_CONTRACT_BINDINGS_V1]),
  policy: z.object({
    projectionIdsMayBecomeCanonical: z.literal(false),
    executorMayCreatePacketIdentity: z.literal(false),
    classifierMayCreatePacketIdentity: z.literal(false),
    mutationRequiresAuthorizationReceipt: z.literal(true),
    semanticLaneMaxVotes: z.literal(1),
  }).strict(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.boolean(),
  pipelineChecksum: checksum,
}).strict();

export type AtlasExecutionPipelineV1 = z.infer<typeof AtlasExecutionPipelineV1Schema>;

export const AtlasDomainClassifierRequestV1Schema = z.object({
  packetKey: z.string().min(1),
  workspaceRevision: revision,
  sourceRevision: revision,
  contentDigest: checksum,
  featureRevision: revision,
  featureChecksum: checksum,
  classifierRevision: revision,
  features: z.array(z.number().finite()).min(1).max(100000),
}).strict();

export type AtlasDomainClassifierRequestV1 = z.infer<typeof AtlasDomainClassifierRequestV1Schema>;

export const AtlasDomainClassifierResponseV1Schema = z.object({
  packetKey: z.string().min(1),
  workspaceRevision: revision,
  sourceRevision: revision,
  contentDigest: checksum,
  featureRevision: revision,
  featureChecksum: checksum,
  classifierRevision: revision,
  checkpointChecksum: checksum,
  predictedDomain: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(['PREDICTED', 'GATED_LOW_CONFIDENCE', 'GATED_VERSION_MISMATCH', 'REJECTED']),
}).strict();

export type AtlasDomainClassifierResponseV1 = z.infer<typeof AtlasDomainClassifierResponseV1Schema>;

/** Validate a FastAPI/Python response against the exact request lineage. */
export function validateAtlasDomainClassifierResponseV1(
  request: AtlasDomainClassifierRequestV1,
  response: AtlasDomainClassifierResponseV1,
): AtlasDomainClassifierResponseV1 {
  const expected = AtlasDomainClassifierRequestV1Schema.parse(request);
  const actual = AtlasDomainClassifierResponseV1Schema.parse(response);
  const fields = ['packetKey', 'workspaceRevision', 'sourceRevision', 'contentDigest', 'featureRevision', 'featureChecksum', 'classifierRevision'] as const;
  for (const field of fields) {
    if (actual[field] !== expected[field]) throw new Error(`CLASSIFIER_PARAMETER_MISMATCH:${field}`);
  }
  return actual;
}

function validateStageDag(stages: readonly AtlasPipelineStageV1[]): void {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  if (byId.size !== stages.length) throw new Error('PIPELINE_DUPLICATE_STAGE_ID');
  for (const stage of stages) {
    if (stage.dependsOn.includes(stage.stageId)) throw new Error('PIPELINE_SELF_DEPENDENCY');
    for (const dependency of stage.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`PIPELINE_UNKNOWN_DEPENDENCY:${dependency}`);
    }
  }
  const visiting = new Set<AtlasPipelineStageId>();
  const visited = new Set<AtlasPipelineStageId>();
  const visit = (id: AtlasPipelineStageId) => {
    if (visiting.has(id)) throw new Error('PIPELINE_STAGE_CYCLE');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const stage of stages) visit(stage.stageId);
}

function validateVoteOwnership(stages: readonly AtlasPipelineStageV1[]): void {
  const semanticVotes = new Set(
    stages.filter((stage) => stage.logicalLane === 'SEMANTIC').map((stage) => stage.voteGroup),
  );
  if (semanticVotes.has('NONE') || semanticVotes.size > 1) throw new Error('PIPELINE_SEMANTIC_VOTE_GROUP_INVALID');
  if (stages.some((stage) => stage.logicalLane !== 'NONE' && stage.voteGroup !== stage.logicalLane)) {
    throw new Error('PIPELINE_LANE_VOTE_GROUP_MISMATCH');
  }
}

function validateExecutorBoundaries(stages: readonly AtlasPipelineStageV1[]): void {
  const allowed: Record<AtlasPipelineStageId, readonly AtlasPipelineExecutor[]> = {
    DECODE_STREAM: ['NODE_JSON', 'SIMDJSON'],
    PACKET_FEATURES: ['CPU_SCALAR', 'CPU_SIMD', 'CUDA_SIMT'],
    DOMAIN_CLASSIFY: ['FASTAPI_NB', 'FASTAPI_LR', 'FASTAPI_PYTORCH_MLP'],
    CANDIDATE_SNAPSHOT: ['CPU_SCALAR', 'CPU_SIMD'],
    GRAPH_DAG: ['NETWORKX', 'CUGRAPH'],
    RETRIEVAL: ['QDRANT_EXACT', 'QDRANT_HNSW', 'CUVS_EXACT', 'CAGRA', 'TURBOVEC'],
    CACHE_RESIDENCY: ['ACE', 'BITFROST'],
    CONTEXT_ASSEMBLY: ['CPU_SCALAR'],
  };
  for (const stage of stages) {
    if (!allowed[stage.stageId].includes(stage.executor)) {
      throw new Error(`PIPELINE_EXECUTOR_BOUNDARY:${stage.stageId}:${stage.executor}`);
    }
  }
}

function validateChecksumChain(stages: readonly AtlasPipelineStageV1[]): void {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  for (const stage of stages) {
    for (const dependency of stage.dependsOn) {
      const upstream = byId.get(dependency);
      if (upstream?.outputChecksum && stage.inputChecksum && upstream.outputChecksum !== stage.inputChecksum) {
        throw new Error(`PIPELINE_CHECKSUM_CHAIN_MISMATCH:${dependency}:${stage.stageId}`);
      }
    }
  }
}

function validateContractBindings(
  stages: readonly AtlasPipelineStageV1[],
  bindings: readonly AtlasPipelineContractBindingV1[],
): void {
  const stageIds = new Set(stages.map((stage) => stage.stageId));
  const boundIds = new Set<string>();
  for (const binding of bindings) {
    if (boundIds.has(binding.stageId)) throw new Error(`PIPELINE_DUPLICATE_CONTRACT_BINDING:${binding.stageId}`);
    if (!stageIds.has(binding.stageId)) throw new Error(`PIPELINE_UNKNOWN_CONTRACT_BINDING:${binding.stageId}`);
    boundIds.add(binding.stageId);
  }
  for (const stageId of stageIds) {
    if (!boundIds.has(stageId)) throw new Error(`PIPELINE_MISSING_CONTRACT_BINDING:${stageId}`);
  }
}

export function buildAtlasExecutionPipelineV1(
  input: Omit<AtlasExecutionPipelineV1, 'schema' | 'pipelineChecksum' | 'canonicalAuthority'>,
): AtlasExecutionPipelineV1 {
  const parsed = AtlasExecutionPipelineV1Schema.parse({
    ...input,
    schema: 'atlas.execution-pipeline.v1',
    canonicalAuthority: false,
    pipelineChecksum: '0'.repeat(64),
  });
  validateStageDag(parsed.stages);
  validateVoteOwnership(parsed.stages);
  validateExecutorBoundaries(parsed.stages);
  validateChecksumChain(parsed.stages);
  validateContractBindings(parsed.stages, parsed.contractBindings);
  const pipelineChecksum = canonicalSha256V1({
    schema: 'atlas.execution-pipeline-identity.v1',
    requestId: parsed.requestId,
    pipelineRevision: parsed.pipelineRevision,
    identity: parsed.identity,
    context: parsed.context,
    contractBindings: parsed.contractBindings,
    stages: parsed.stages.map(({ stageId, executor, executorRevision, dependsOn, inputSchemaRevision, outputSchemaRevision, logicalLane, voteGroup, stream }) => ({
      stageId, executor, executorRevision, dependsOn, inputSchemaRevision, outputSchemaRevision, logicalLane, voteGroup, stream,
    })),
  });
  return AtlasExecutionPipelineV1Schema.parse({ ...parsed, pipelineChecksum });
}
