import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  AceBitfrostCacheIdentityV1Schema,
  type AceBitfrostCacheIdentityV1,
} from '../cache/ace-bitfrost-cache-identity-v1.js';

/**
 * Derived, read-only orchestration descriptor. It composes existing owners;
 * it is not a new identity, cache, graph, fusion, or persistence owner.
 */

const revision = z.string().min(1);
const checksum = z.string().regex(/^(sha256:)?[a-f0-9]{64}$/);

export const UnifiedContextStageSchema = z.object({
  name: z.enum([
    'QUERY',
    'DOMAIN_CLASSIFICATION',
    'LEXICAL',
    'AST_CST',
    'SEMANTIC_768',
    'GRAPH_DAG',
    'CACHE_ADMISSION',
    'CONTEXT_MANIFEST',
    'EXECUTION',
  ]),
  executor: z.enum([
    'FASTAPI',
    'SIMDJSON',
    'PYTHON',
    'NETWORKX',
    'POSTGRESQL',
    'PGVECTOR',
    'QDRANT',
    'TURBOVEC',
    'PYTORCH_SIMT',
  ]),
  producerRevision: revision,
  inputChecksum: checksum.nullable(),
  outputChecksum: checksum.nullable(),
  status: z.enum(['PLANNED', 'READY', 'DEGRADED', 'BLOCKED', 'PROVEN']),
  readOnly: z.literal(true),
  canonicalAuthority: z.literal(false),
}).strict();

export type UnifiedContextStageV1 = z.infer<typeof UnifiedContextStageSchema>;

export const UnifiedContextPipelineDescriptorV1Schema = z.object({
  schema: z.literal('atlas.unified-context-pipeline.v1'),
  requestId: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceRevision: revision.nullable(),
  executionId: z.string().uuid().nullable(),
  sourceCohortChecksum: checksum.nullable(),
  graphRevision: revision.nullable(),
  candidateOrdinalChecksum: checksum.nullable(),
  representationRevision: revision.nullable(),
  featureRevision: revision.nullable(),
  classifierRevision: revision.nullable(),
  checkpointChecksum: checksum.nullable(),
  queryHash: checksum,
  queryRepresentation: z.object({
    representationId: z.literal('semantic_768'),
    modelRevision: revision,
    dimension: z.literal(768),
    normalizationPolicy: revision,
    distanceMetric: z.enum(['cosine', 'dot', 'euclidean']),
    queryChecksum: checksum,
  }).strict(),
  classifierEvidence: z.object({
    predictedDomain: z.string().min(1).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    sourceEvidenceChecksum: checksum.nullable(),
    canonicalAuthority: z.literal(false),
  }).strict(),
  chunkStream: z.object({
    transport: z.enum(['CONTROL_JSON', 'TYPED_BINARY']),
    chunkBytes: z.number().int().positive().max(1024 * 1024),
    maxChunks: z.number().int().positive().max(10000),
    sequenceChecksum: checksum,
    bounded: z.literal(true),
  }).strict(),
  graphTransport: z.object({
    format: z.enum(['CSR', 'COO']),
    ordinalMapChecksum: checksum.nullable(),
    numericPayload: z.literal('TYPED_BINARY'),
    jsonInHotLoop: z.literal(false),
  }).strict(),
  cache: z.object({
    cacheKind: z.enum(['ACE_PACKET', 'ACE_CONTEXT', 'CENTROID', 'RESIDENCY']),
    cacheKey: z.string().min(1),
    identityChecksum: checksum,
    admission: z.enum(['ADMITTED', 'DEGRADED', 'BLOCKED']),
  }).strict(),
  stages: z.array(UnifiedContextStageSchema).min(1),
  status: z.enum(['PLANNED', 'READY', 'DEGRADED', 'BLOCKED', 'PROVEN']),
  descriptorChecksum: checksum,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type UnifiedContextPipelineDescriptorV1 = z.infer<typeof UnifiedContextPipelineDescriptorV1Schema>;

const DomainPredictionEvidenceInputSchema = z.object({
  predictedDomain: z.string().min(1),
  calibratedConfidence: z.number().min(0).max(1).nullable().optional(),
  classifierVersion: revision,
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  featureSchemaVersion: revision,
  sourceSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type DomainPredictionEvidenceInputV1 = z.infer<typeof DomainPredictionEvidenceInputSchema>;

/** Convert the existing non-canonical DomainPrediction shape into pipeline evidence. */
export function domainPredictionToUnifiedContextEvidenceV1(
  input: DomainPredictionEvidenceInputV1,
): {
  classifierRevision: string;
  checkpointChecksum: string;
  featureRevision: string;
  classifierEvidence: UnifiedContextPipelineDescriptorV1['classifierEvidence'];
} {
  const prediction = DomainPredictionEvidenceInputSchema.parse(input);
  return {
    classifierRevision: prediction.classifierVersion,
    checkpointChecksum: prediction.modelSha256,
    featureRevision: prediction.featureSchemaVersion,
    classifierEvidence: {
      predictedDomain: prediction.predictedDomain,
      confidence: prediction.calibratedConfidence ?? null,
      sourceEvidenceChecksum: prediction.sourceSnapshotSha256,
      canonicalAuthority: false,
    },
  };
}

const REQUIRED_CURRENT_FIELDS = [
  'workspaceRevision',
  'executionId',
  'sourceCohortChecksum',
  'graphRevision',
  'candidateOrdinalChecksum',
  'representationRevision',
  'featureRevision',
] as const;

function descriptorStatus(input: z.input<typeof UnifiedContextPipelineDescriptorV1Schema>) {
  const missing = REQUIRED_CURRENT_FIELDS.filter((field) => input[field] == null);
  if (missing.length > 0) return 'BLOCKED' as const;
  if (input.cache.admission === 'DEGRADED') return 'DEGRADED' as const;
  return 'READY' as const;
}

/** Build a deterministic descriptor without parsing, persistence, or cache writes. */
export function buildUnifiedContextPipelineDescriptorV1(
  input: Omit<z.input<typeof UnifiedContextPipelineDescriptorV1Schema>, 'schema' | 'status' | 'descriptorChecksum' | 'canonicalAuthority' | 'writesPerformed'>,
): UnifiedContextPipelineDescriptorV1 {
  const status = descriptorStatus(input);
  const body = {
    schema: 'atlas.unified-context-pipeline.v1' as const,
    ...input,
    cache: {
      ...input.cache,
      admission: status === 'BLOCKED' ? ('BLOCKED' as const) : input.cache.admission,
    },
    status,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const descriptorChecksum = canonicalSha256V1({
    schema: 'atlas.unified-context-pipeline-identity.v1',
    ...body,
  });
  return UnifiedContextPipelineDescriptorV1Schema.parse({ ...body, descriptorChecksum });
}

/** Cache identity deliberately excludes raw prompt text, hidden state, KV, tensors, and GPU pointers. */
export function buildUnifiedContextPipelineCacheKeyV1(
  descriptor: UnifiedContextPipelineDescriptorV1,
): string {
  const parsed = UnifiedContextPipelineDescriptorV1Schema.parse(descriptor);
  return [
    'atlas',
    'unified-context',
    'v1',
    encodeURIComponent(parsed.workspaceId),
    encodeURIComponent(parsed.workspaceRevision ?? 'unqualified'),
    encodeURIComponent(parsed.sourceCohortChecksum ?? 'unqualified'),
    parsed.queryHash,
    parsed.descriptorChecksum,
  ].join(':');
}

/**
 * Adapter into the existing ACE/BitFrost identity owner. It cannot create an
 * admitted identity until the descriptor has a current lineage frame.
 */
export function bridgeUnifiedContextPipelineToAceIdentityV1(
  descriptor: UnifiedContextPipelineDescriptorV1,
): AceBitfrostCacheIdentityV1 {
  const parsed = UnifiedContextPipelineDescriptorV1Schema.parse(descriptor);
  if (parsed.status === 'BLOCKED' || parsed.cache.admission === 'BLOCKED') {
    throw new Error('UNIFIED_CONTEXT_CACHE_IDENTITY_INCOMPLETE');
  }
  if (
    parsed.workspaceRevision === null ||
    parsed.sourceCohortChecksum === null ||
    parsed.graphRevision === null ||
    parsed.candidateOrdinalChecksum === null ||
    parsed.representationRevision === null ||
    parsed.featureRevision === null
  ) {
    throw new Error('UNIFIED_CONTEXT_CACHE_IDENTITY_INCOMPLETE');
  }
  return AceBitfrostCacheIdentityV1Schema.parse({
    cacheKind: parsed.cache.cacheKind,
    artifactKind: 'unified_context_pipeline',
    representationId: parsed.queryRepresentation.representationId,
    representationRevision: parsed.representationRevision,
    candidateSnapshotRevision: parsed.sourceCohortChecksum,
    ordinalMapChecksum: parsed.candidateOrdinalChecksum,
    graphRevision: parsed.graphRevision,
    featureRevision: parsed.featureRevision,
    producerRevision: 'unified-context-pipeline:v1',
    normalizationPolicyRevision: parsed.queryRepresentation.normalizationPolicy,
    artifactChecksum: parsed.descriptorChecksum,
  });
}
