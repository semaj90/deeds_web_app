import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ResourceEnvelopeV1Schema, ResolutionRevisionSetSchema } from '$lib/server/retrieval/bounded-resolution.js';

export const RouterDomainSchema = z.enum([
  'CODE_SEARCH',
  'AST_ANALYSIS',
  'GRAPH_ANALYSIS',
  'DATABASE',
  'GPU',
  'BUILD_ERROR',
  'TEST_FAILURE',
  'UI',
  'LEGAL',
  'AGENT_CONTROL',
  'UNKNOWN',
]);
export type RouterDomain = z.infer<typeof RouterDomainSchema>;

export const RouterActionSchema = z.enum([
  'SEARCH',
  'READ',
  'TRACE',
  'COMPARE',
  'EXPAND',
  'EDIT',
  'VERIFY',
  'TRAIN',
  'BENCHMARK',
  'UNKNOWN',
]);
export type RouterAction = z.infer<typeof RouterActionSchema>;

export const RuntimeIdentityV1Schema = z.object({
  schemaVersion: z.literal('atlas.runtime-identity.v1'),
  hostOs: z.string().min(1),
  executionOs: z.string().min(1),
  wslDistro: z.string().min(1).nullable(),
  gpuUuid: z.string().min(1).nullable(),
  deviceName: z.string().min(1).nullable(),
  driverVersion: z.string().min(1).nullable(),
  cudaRuntime: z.string().min(1).nullable(),
  pythonEnv: z.string().min(1).nullable(),
  backendRevision: z.string().min(1),
  telemetrySource: z.enum(['nvml', 'nvidia_smi', 'cuda_runtime', 'mixed', 'none']),
}).strict();
export type RuntimeIdentityV1 = z.infer<typeof RuntimeIdentityV1Schema>;

export const GpuAdmissionReceiptV1Schema = z.object({
  schemaVersion: z.literal('atlas.gpu-admission.v1'),
  requestId: z.string().min(1),
  runtime: RuntimeIdentityV1Schema,
  totalVramBytes: z.number().int().nonnegative().nullable(),
  usedVramBytes: z.number().int().nonnegative().nullable(),
  freeVramBytes: z.number().int().nonnegative().nullable(),
  gpuUtilization: z.number().min(0).max(100).nullable(),
  memoryUtilization: z.number().min(0).max(100).nullable(),
  activeComputeProcesses: z.number().int().nonnegative().nullable(),
  requestedVramBytes: z.number().int().nonnegative(),
  reservedHeadroomBytes: z.number().int().nonnegative(),
  status: z.enum(['ADMIT', 'CPU_FALLBACK', 'REJECT', 'DEGRADED_TELEMETRY']),
  reasonCodes: z.array(z.string().min(1)),
  checksum: z.string().length(64),
}).strict();
export type GpuAdmissionReceiptV1 = z.infer<typeof GpuAdmissionReceiptV1Schema>;

export const DeterministicQueryFeaturesV1Schema = z.object({
  tokenCount: z.number().int().nonnegative(),
  identifiers: z.array(z.string()),
  filePaths: z.array(z.string()),
  symbols: z.array(z.string()),
  errorCodes: z.array(z.string()),
  languages: z.array(z.string()),
  astKinds: z.array(z.string()),
  requestedActions: z.array(RouterActionSchema),
  negations: z.array(z.string()),
  temporalTerms: z.array(z.string()),
  capabilityMask: z.string().min(1),
  priorActionMask: z.string().min(1),
  activeFileIds: z.array(z.string()),
}).strict();
export type DeterministicQueryFeaturesV1 = z.infer<typeof DeterministicQueryFeaturesV1Schema>;

export const RetrievalSignalVectorV1Schema = z.object({
  lexicalExact: z.number().min(0).max(1),
  lexicalSparse: z.number().min(0).max(1),
  semantic: z.number().min(0).max(1),
  ast: z.number().min(0).max(1),
  graph: z.number().min(0).max(1),
  hyperedge: z.number().min(0).max(1),
}).strict();
export type RetrievalSignalVectorV1 = z.infer<typeof RetrievalSignalVectorV1Schema>;

export const ToolCandidateSignalV1Schema = z.object({
  toolId: z.string().min(1),
  eligible: z.boolean(),
  exclusionReasonCodes: z.array(z.string()),
  signals: RetrievalSignalVectorV1Schema,
  intentProbability: z.number().min(0).max(1),
  domainProbability: z.number().min(0).max(1),
  capabilityMatch: z.number().min(0).max(1),
  hammingMaskMatch: z.number().min(0).max(1),
  historicalSuccessRate: z.number().min(0).max(1),
  historicalFailureRate: z.number().min(0).max(1),
  evidenceCoverage: z.number().min(0).max(1),
  revisionFreshness: z.number().min(0).max(1),
  estimatedLatencyMs: z.number().nonnegative(),
  estimatedVramBytes: z.number().int().nonnegative(),
  requiresWrite: z.boolean(),
  requiresApproval: z.boolean(),
  evidenceRefs: z.array(z.string()),
}).strict();
export type ToolCandidateSignalV1 = z.infer<typeof ToolCandidateSignalV1Schema>;

export const ROUTING_FEATURE_NAMES = [
  'lexical_exact',
  'lexical_sparse',
  'semantic',
  'ast',
  'graph',
  'hyperedge',
  'intent_probability',
  'domain_probability',
  'capability_match',
  'hamming_mask_match',
  'historical_success_rate',
  'historical_failure_rate',
  'evidence_coverage',
  'revision_freshness',
  'latency_cost',
  'vram_cost',
  'requires_write',
  'requires_approval',
] as const;

export const CandidateFeatureRowV1Schema = z.object({
  toolId: z.string().min(1),
  eligible: z.boolean(),
  values: z.array(z.number()).length(ROUTING_FEATURE_NAMES.length),
  evidenceRefs: z.array(z.string()),
}).strict();
export type CandidateFeatureRowV1 = z.infer<typeof CandidateFeatureRowV1Schema>;

export const CandidateFeatureMatrixV1Schema = z.object({
  schemaVersion: z.literal('atlas.candidate-feature-matrix.v1'),
  featureNames: z.tuple(ROUTING_FEATURE_NAMES.map((name) => z.literal(name)) as [z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]),
  rows: z.array(CandidateFeatureRowV1Schema),
  checksum: z.string().length(64),
}).strict();
export type CandidateFeatureMatrixV1 = z.infer<typeof CandidateFeatureMatrixV1Schema>;

export const QueryRoutingSnapshotV1Schema = z.object({
  schemaVersion: z.literal('atlas.query-routing-snapshot.v1'),
  requestId: z.string().min(1),
  revisions: ResolutionRevisionSetSchema,
  toolRegistryRevision: z.string().min(1),
  queryText: z.string().min(1),
  deterministicFeatures: DeterministicQueryFeaturesV1Schema,
  retrievalSignals: RetrievalSignalVectorV1Schema,
  candidateTools: z.array(ToolCandidateSignalV1Schema),
  candidateFeatureMatrix: CandidateFeatureMatrixV1Schema,
  resourceEnvelope: ResourceEnvelopeV1Schema,
  checksum: z.string().length(64),
}).strict();
export type QueryRoutingSnapshotV1 = z.infer<typeof QueryRoutingSnapshotV1Schema>;

export const ToolRoutingScoreV1Schema = z.object({
  toolId: z.string().min(1),
  baselineScore: z.number(),
  neuralScore: z.number().min(0).max(1).nullable(),
  finalScore: z.number(),
  rank: z.number().int().positive(),
}).strict();

export const ToolRoutingReceiptV1Schema = z.object({
  schemaVersion: z.literal('atlas.tool-routing-receipt.v1'),
  requestId: z.string().min(1),
  snapshotChecksum: z.string().length(64),
  routingMode: z.enum(['deterministic', 'hybrid']),
  allowedToolIds: z.array(z.string()),
  excludedToolIds: z.array(z.string()),
  rankedTools: z.array(ToolRoutingScoreV1Schema),
  selectedToolIds: z.array(z.string()),
  topK: z.number().int().positive(),
  reasonCodes: z.array(z.string()),
  checksum: z.string().length(64),
}).strict();
export type ToolRoutingReceiptV1 = z.infer<typeof ToolRoutingReceiptV1Schema>;

export const ExecutionOutcomeV1Schema = z.object({
  selectedToolId: z.string().min(1),
  success: z.boolean(),
  verificationPassed: z.boolean(),
  evidenceGain: z.number().min(0).max(1),
  latencyMs: z.number().nonnegative(),
  peakVramBytes: z.number().int().nonnegative().nullable(),
  tokenCost: z.number().int().nonnegative(),
  humanOutcome: z.enum(['ACCEPTED', 'REJECTED', 'REVISED', 'UNREVIEWED']),
  evidenceRefs: z.array(z.string()),
}).strict();
export type ExecutionOutcomeV1 = z.infer<typeof ExecutionOutcomeV1Schema>;

export const ToolTrainingExampleV1Schema = z.object({
  schemaVersion: z.literal('atlas.tool-training-example.v1'),
  exampleId: z.string().min(1),
  requestId: z.string().min(1),
  snapshotChecksum: z.string().length(64),
  routingReceiptChecksum: z.string().length(64),
  queryText: z.string().min(1),
  toolId: z.string().min(1),
  featureValues: z.array(z.number()).length(ROUTING_FEATURE_NAMES.length),
  selected: z.boolean(),
  label: z.number().min(0).max(1),
  utility: z.number(),
  verified: z.boolean(),
  evidenceRefs: z.array(z.string()),
  checksum: z.string().length(64),
}).strict();
export type ToolTrainingExampleV1 = z.infer<typeof ToolTrainingExampleV1Schema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function stableRoutingChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
