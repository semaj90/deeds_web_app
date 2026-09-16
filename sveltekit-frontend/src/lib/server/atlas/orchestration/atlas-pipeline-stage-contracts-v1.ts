import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  materializeRevisionQualifiedSourceChunkOrdinalMapV1,
  type CandidateOrdinalMapV1,
  type RevisionQualifiedSourceChunkCohortV1,
} from '../features/canonical-candidate-v1.js';
import {
  buildAceResidencyAdmissionV1,
  type AceBitfrostCacheIdentityV1,
  type AceResidencyAdmissionV1,
} from '../cache/ace-bitfrost-cache-identity-v1.js';
import {
  semanticCohortAdmissionV1Schema,
  type SemanticCohortAdmissionV1,
} from '../embedding/semantic-representation-v1.js';
import {
  structuralGraphSnapshotV1Schema,
  graphOrdinalManifestV1Schema,
  type StructuralGraphSnapshotV1,
  type GraphOrdinalManifestV1,
} from '../graph/structural-graph-snapshot-v1.js';

export { semanticCohortAdmissionV1Schema } from '../embedding/semantic-representation-v1.js';
export { graphOrdinalManifestV1Schema } from '../graph/structural-graph-snapshot-v1.js';

const revision = z.string().min(1);
const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const candidateOrdinalAdmissionV1Schema = z.object({
  schema: z.literal('atlas.candidate-ordinal-admission.v1'),
  ordinalMap: z.unknown(),
  sourceRevisionSetChecksum: checksum.nullable(),
  candidateSetChecksum: checksum.nullable(),
  status: z.enum(['ADMITTED', 'BLOCKED_LINEAGE', 'UNAVAILABLE']),
  reason: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ADMITTED' && value.reason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'ADMITTED_ORDINAL_MAP_REASON_FORBIDDEN' });
  }
  if (value.status !== 'ADMITTED' && value.reason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'BLOCKED_ORDINAL_MAP_REASON_REQUIRED' });
  }
});
export type CandidateOrdinalAdmissionV1 = z.infer<typeof candidateOrdinalAdmissionV1Schema>;

export const candidateOrdinalBindingV1Schema = z.object({
  ordinal: z.number().int().nonnegative(), canonicalId: z.string().min(1),
  packetKey: z.string().min(1), symbolVersionId: z.string().min(1).nullable(),
  sourceRef: z.string().min(1), sourceRevision: revision, workspaceRevision: revision,
}).strict();
export type CandidateOrdinalBindingV1 = z.infer<typeof candidateOrdinalBindingV1Schema>;

export const candidateOrdinalMapAdmissionV1Schema = z.object({
  schema: z.literal('atlas.candidate-ordinal-map.v1'), workspaceRevision: revision,
  sourceRevisionSetChecksum: checksum, candidateSetChecksum: checksum,
  ordinalMapChecksum: checksum, bindings: z.array(candidateOrdinalBindingV1Schema),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const ordinals = new Set<number>(); const ids = new Set<string>();
  value.bindings.forEach((binding, index) => {
    if (binding.workspaceRevision !== value.workspaceRevision) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'workspaceRevision'], message: 'WORKSPACE_REVISION_MISMATCH' });
    if (ordinals.has(binding.ordinal)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'ordinal'], message: 'DUPLICATE_ORDINAL' });
    if (ids.has(binding.canonicalId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'canonicalId'], message: 'DUPLICATE_CANONICAL_ID' });
    ordinals.add(binding.ordinal); ids.add(binding.canonicalId);
  });
});
export type CandidateOrdinalMapAdmissionV1 = z.infer<typeof candidateOrdinalMapAdmissionV1Schema>;

export function buildCandidateOrdinalAdmissionV1(input: {
  cohort: RevisionQualifiedSourceChunkCohortV1 | null | undefined;
  producerRevision: string;
}): CandidateOrdinalAdmissionV1 {
  if (!input.cohort) {
    return candidateOrdinalAdmissionV1Schema.parse({
      schema: 'atlas.candidate-ordinal-admission.v1', ordinalMap: null,
      sourceRevisionSetChecksum: null,
      candidateSetChecksum: null,
      status: 'BLOCKED_LINEAGE', reason: 'CURRENT_SOURCE_CHUNK_COHORT_UNAVAILABLE',
      canonicalAuthority: false, writesPerformed: false,
    });
  }
  const map = materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort: input.cohort, producerRevision: input.producerRevision });
  return candidateOrdinalAdmissionV1Schema.parse({
    schema: 'atlas.candidate-ordinal-admission.v1', ordinalMap: map,
    sourceRevisionSetChecksum: input.cohort.sourceRevisionSetChecksum,
    candidateSetChecksum: canonicalSha256V1(map.candidates.map((candidate) => candidate.canonicalId)),
    status: 'ADMITTED', reason: null, canonicalAuthority: false, writesPerformed: false,
  });
}

/**
 * Stage 3 adapter: converts the existing candidate owner into the explicit
 * binding contract. This is pure and requires a real checksum from the
 * admitted source cohort; it never derives one from a missing/unknown value.
 */
export function buildCandidateOrdinalMapAdmissionV1(input: {
  cohort: RevisionQualifiedSourceChunkCohortV1 | null | undefined;
  producerRevision: string;
}): CandidateOrdinalMapAdmissionV1 | null {
  if (!input.cohort) return null;
  const cohort = input.cohort;
  if (!/^(?:sha256:)?[a-f0-9]{64}$/.test(cohort.sourceRevisionSetChecksum)) {
    throw new Error('SOURCE_REVISION_SET_CHECKSUM_INVALID');
  }
  const map = materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort, producerRevision: input.producerRevision });
  const bindings = map.candidates.map((candidate) => ({
    ordinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey!,
    symbolVersionId: candidate.symbolVersionId,
    sourceRef: candidate.sourceRef!,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
  }));
  return candidateOrdinalMapAdmissionV1Schema.parse({
    schema: 'atlas.candidate-ordinal-map.v1', workspaceRevision: cohort.workspaceRevision,
    sourceRevisionSetChecksum: cohort.sourceRevisionSetChecksum,
    candidateSetChecksum: canonicalSha256V1(bindings.map((binding) => binding.canonicalId)),
    ordinalMapChecksum: canonicalSha256V1(bindings), bindings,
    canonicalAuthority: false, writesPerformed: false,
  });
}

export const semanticExecutorV1Schema = z.enum(['POSTGRES_EXACT', 'QDRANT_HNSW', 'CUVS_BRUTE_FORCE', 'CUVS_CAGRA']);
export type SemanticExecutorV1 = z.infer<typeof semanticExecutorV1Schema>;

export function buildBlockedSemanticCohortAdmissionV1(input: { status?: 'BLOCKED_LINEAGE' | 'BLOCKED_REPRESENTATION' | 'UNAVAILABLE'; rowCount?: number }): SemanticCohortAdmissionV1 {
  void input;
  throw new Error('SEMANTIC_COHORT_UNAVAILABLE');
}

export function selectSemanticExecutorV1(input: { candidateCount: number; exactCandidateLimit: number; available: readonly SemanticExecutorV1[] }): SemanticExecutorV1 | null {
  if (!Number.isInteger(input.candidateCount) || input.candidateCount < 0 || !Number.isInteger(input.exactCandidateLimit) || input.exactCandidateLimit < 1) return null;
  if (input.candidateCount <= input.exactCandidateLimit && input.available.includes('POSTGRES_EXACT')) return 'POSTGRES_EXACT';
  return input.available.find((executor) => executor !== 'POSTGRES_EXACT') ?? null;
}

export const graphSnapshotV1Schema = structuralGraphSnapshotV1Schema;
export type GraphSnapshotV1 = StructuralGraphSnapshotV1;
export type { GraphOrdinalManifestV1 };

export const structuralFeatureVectorV1Schema = z.object({
  schema: z.literal('atlas.structural-feature-vector.v1'), canonicalId: z.string().min(1),
  workspaceRevision: revision, sourceRevision: revision, graphRevision: revision,
  inDegree: z.number().nonnegative().nullable(), outDegree: z.number().nonnegative().nullable(),
  pageRank: z.number().finite().nullable(), hitsAuthority: z.number().finite().nullable(),
  hitsHub: z.number().finite().nullable(), communityId: z.number().int().nonnegative().nullable(),
  bridgeScore: z.number().finite().nullable(), persistentH1Ref: z.string().min(1).nullable(),
  topologyCoordinate4: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable(),
  evidenceRefs: z.array(z.string().min(1)), provider: z.enum(['NETWORKX', 'CUGRAPH', 'NEO4J']),
  canonicalAuthority: z.literal(false),
}).strict();
export type StructuralFeatureVectorV1 = z.infer<typeof structuralFeatureVectorV1Schema>;

export interface StructuralFeatureProviderV1 {
  readonly provider: StructuralFeatureVectorV1['provider'];
  compute(input: { canonicalIds: readonly string[]; snapshot: GraphSnapshotV1; ordinalManifest: GraphOrdinalManifestV1 }): Promise<readonly StructuralFeatureVectorV1[]>;
}

export type NetworkXStructuralFeatureProviderV1 = StructuralFeatureProviderV1 & { readonly provider: 'NETWORKX' };
export type CuGraphStructuralFeatureProviderV1 = StructuralFeatureProviderV1 & { readonly provider: 'CUGRAPH' };
export type Neo4jStructuralFeatureProviderV1 = StructuralFeatureProviderV1 & { readonly provider: 'NEO4J' };

export const derivedRepresentationPlanV1Schema = z.object({
  schema: z.literal('atlas.derived-representation-plan.v1'), inputRepresentation: z.literal('semantic_768'),
  inputRepresentationRevision: revision, transform: z.enum(['PCA', 'SVD', 'RANDOM_PROJECTION', 'LEARNED']),
  transformRevision: revision, transformChecksum: checksum,
  outputRepresentation: z.enum(['latent_256', 'latent_128', 'latent_64']), dimensions: z.number().int().positive(),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type DerivedRepresentationPlanV1 = z.infer<typeof derivedRepresentationPlanV1Schema>;

export const candidateFeatureMatrixV1Schema = z.object({
  schema: z.literal('atlas.candidate-feature-matrix.v1'), requestId: z.string().min(1),
  workspaceRevision: revision, sourceRevisionSetChecksum: checksum,
  representationRevision: revision, featureRevision: revision, graphRevision: revision,
  candidateSetChecksum: checksum, candidateOrdinalMapChecksum: checksum,
  rows: z.number().int().nonnegative(), cols: z.number().int().nonnegative(), dtype: z.enum(['float32', 'float64']),
  featureSchemaChecksum: checksum, payloadChecksum: checksum,
  availableFeatureMask: z.array(z.boolean()), missingFeatureReasons: z.record(z.string(), z.string()),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type CandidateFeatureMatrixV1 = z.infer<typeof candidateFeatureMatrixV1Schema>;

export const candidateFeatureCellV1Schema = z.object({ value: z.number().finite().nullable(), available: z.boolean(), reason: z.string().min(1).nullable() }).strict().superRefine((value, ctx) => {
  if (value.available && value.value === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'AVAILABLE_FEATURE_VALUE_REQUIRED' });
  if (!value.available && value.reason === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'UNAVAILABLE_FEATURE_REASON_REQUIRED' });
});
export type CandidateFeatureCellV1 = z.infer<typeof candidateFeatureCellV1Schema>;

export interface CandidateFeatureMatrixAdapterV1<T> {
  readonly format: 'ARROW' | 'CUDF' | 'PYTORCH' | 'XGBOOST';
  encode(matrix: CandidateFeatureMatrixV1, cells: readonly CandidateFeatureCellV1[]): T;
}

export const aceAdmissionV1Schema = z.object({
  schema: z.literal('atlas.ace-admission.v1'), identity: z.unknown(), descriptorChecksum: checksum.nullable(),
  utilityScore: z.number().finite().nullable(), decision: z.enum(['ADMIT', 'DEFER', 'REJECT']),
  policyRevision: revision, residency: z.unknown(), canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type AceAdmissionV1 = z.infer<typeof aceAdmissionV1Schema>;

export const bitFrostResidencyPlanV1Schema = z.object({
  schema: z.literal('atlas.bitfrost-residency-plan.v1'), descriptorChecksum: checksum.nullable(),
  sourceTier: z.enum(['NVME', 'MMAP', 'CPU', 'PINNED', 'GPU']), targetTier: z.enum(['NVME', 'MMAP', 'CPU', 'PINNED', 'GPU']),
  policyRevision: revision, canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type BitFrostResidencyPlanSchemaV1 = z.infer<typeof bitFrostResidencyPlanV1Schema>;

export function buildAceAdmissionV1(input: {
  identity: AceBitfrostCacheIdentityV1 | null;
  utilityScore: number | null;
  decision: 'ADMIT' | 'DEFER' | 'REJECT';
  policyRevision: string;
}): AceAdmissionV1 {
  if (!input.identity) {
    return aceAdmissionV1Schema.parse({
      schema: 'atlas.ace-admission.v1', identity: null,
      descriptorChecksum: null, utilityScore: input.utilityScore,
      decision: 'REJECT', policyRevision: input.policyRevision, residency: null,
      canonicalAuthority: false, writesPerformed: false,
    });
  }
  const residency = buildAceResidencyAdmissionV1({ identity: input.identity, status: input.decision === 'ADMIT' ? 'ADMITTED' : 'BLOCKED_IDENTITY', reason: input.decision === 'ADMIT' ? null : `ACE_DECISION_${input.decision}` });
  return aceAdmissionV1Schema.parse({
    schema: 'atlas.ace-admission.v1', identity: input.identity,
    descriptorChecksum: canonicalSha256V1(input.identity), utilityScore: input.utilityScore,
    decision: input.decision, policyRevision: input.policyRevision, residency,
    canonicalAuthority: false, writesPerformed: false,
  });
}

export type BitFrostResidencyTier = 'NVME' | 'MMAP' | 'CPU' | 'PINNED' | 'GPU';
export interface BitFrostResidencyPlanV1 { descriptorChecksum: string | null; sourceTier: BitFrostResidencyTier; targetTier: BitFrostResidencyTier; policyRevision: string; canonicalAuthority: false; writesPerformed: false; }

/** TODO PA STAGE 03-09: live current cohort, graph edge closure, semantic admission, and GPU parity remain promotion blockers. */
export function buildBlockedBitFrostResidencyPlanV1(input: { policyRevision: string; descriptorChecksum?: string }): BitFrostResidencyPlanV1 {
  return { descriptorChecksum: input.descriptorChecksum ?? null, sourceTier: 'CPU', targetTier: 'CPU', policyRevision: input.policyRevision, canonicalAuthority: false, writesPerformed: false };
}

/** Stage 10: classifier output and lookup policy are evidence, never identity. */
export const domainClassificationEvidenceV1Schema = z.object({
  schema: z.literal('atlas.domain-classification-evidence.v1'), packetKey: z.string().min(1),
  sourceRef: z.string().min(1), workspaceRevision: revision, sourceRevision: revision,
  contentDigest: checksum, predictedDomain: z.string().min(1), confidence: z.number().min(0).max(1),
  classifierFamily: z.enum(['NAIVE_BAYES', 'LOGISTIC_REGRESSION', 'PYTORCH']), classifierRevision: revision,
  featureRevision: revision, checkpointChecksum: checksum, evidenceChecksum: checksum,
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type DomainClassificationEvidenceV1 = z.infer<typeof domainClassificationEvidenceV1Schema>;

export const featurePolicyLutEntryV1Schema = z.object({
  domain: z.string().min(1), policyRevision: revision, tokenBudget: z.number().int().positive(),
  featureMask: z.array(z.string().min(1)).min(1), tileWidth: z.number().int().positive(),
  contextWindow: z.number().int().positive(), residencyPriority: z.number().int().nonnegative(),
}).strict();
export type FeaturePolicyLutEntryV1 = z.infer<typeof featurePolicyLutEntryV1Schema>;

export function resolveFeaturePolicyLutEntryV1(input: { entries: readonly FeaturePolicyLutEntryV1[]; domain: string; expectedRevision: string }): FeaturePolicyLutEntryV1 | null {
  const matches = input.entries.filter((entry) => entry.domain === input.domain && entry.policyRevision === input.expectedRevision);
  return matches.length === 1 ? featurePolicyLutEntryV1Schema.parse(matches[0]) : null;
}

export const qloraTrainingSnapshotV1Schema = z.object({
  schema: z.literal('atlas.qlora-training-snapshot.v1'), cohortChecksum: checksum,
  workspaceRevision: revision, packetCount: z.number().int().nonnegative(), featureRevision: revision,
  labelRevision: revision, trainingManifestChecksum: checksum, adapterRevision: revision.nullable(),
  status: z.enum(['BLOCKED_COHORT', 'READY_FOR_OFFLINE_EVALUATION']), canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type QloraTrainingSnapshotV1 = z.infer<typeof qloraTrainingSnapshotV1Schema>;

/** Stage 11: topology is a derived traversal coordinate, not a packet identity. */
export const topologyCoordinate4V1Schema = z.object({
  schema: z.literal('atlas.topology-coordinate4.v1'), canonicalId: z.string().min(1),
  workspaceRevision: revision, graphRevision: revision,
  coordinate: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  routeSignature: z.string().min(1).nullable(), communityId: z.number().int().nonnegative().nullable(),
  evidenceRefs: z.array(z.string().min(1)), canonicalAuthority: z.literal(false),
}).strict();
export type TopologyCoordinate4V1 = z.infer<typeof topologyCoordinate4V1Schema>;

/** Stage 12: transport formats are subordinate read/analysis projections. */
export const offlineTransportArtifactV1Schema = z.object({
  schema: z.literal('atlas.offline-transport-artifact.v1'), format: z.enum(['ARROW', 'PARQUET', 'JSONL', 'MSGPACK', 'COUCHDB_READ_MODEL']),
  sourceRevision: revision, artifactChecksum: checksum, rowCount: z.number().int().nonnegative(),
  authority: z.literal('POSTGRES'), purpose: z.enum(['ANALYTICAL_JOIN', 'COMPACT_TRANSPORT', 'READ_MODEL']),
  writesPerformed: z.literal(false),
}).strict();
export type OfflineTransportArtifactV1 = z.infer<typeof offlineTransportArtifactV1Schema>;

/** Stage 13: canary planning is a receipt-shaped contract; it never performs fanout. */
export const packetFabricCanaryV1Schema = z.object({
  schema: z.literal('atlas.packet-fabric-canary.v1'), corpus: z.literal('NES_CHROM97'),
  inputChecksum: checksum, requestedRows: z.number().int().positive(),
  status: z.enum(['BLOCKED_LINEAGE', 'READY_FOR_BOUNDED_APPLY', 'READBACK_REQUIRED']),
  postgresReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  semanticProjectionReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  qdrantProjectionReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  aceResidencyReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  writesPerformed: z.literal(false), canonicalAuthority: z.literal(false),
}).strict();
export type PacketFabricCanaryV1 = z.infer<typeof packetFabricCanaryV1Schema>;

export function buildBlockedPacketFabricCanaryV1(input: { inputChecksum: string; requestedRows?: number }): PacketFabricCanaryV1 {
  return packetFabricCanaryV1Schema.parse({
    schema: 'atlas.packet-fabric-canary.v1', corpus: 'NES_CHROM97', inputChecksum: input.inputChecksum,
    requestedRows: input.requestedRows ?? 45, status: 'BLOCKED_LINEAGE', postgresReadback: 'REQUIRED',
    semanticProjectionReadback: 'NOT_RUN', qdrantProjectionReadback: 'NOT_RUN', aceResidencyReadback: 'NOT_RUN',
    writesPerformed: false, canonicalAuthority: false,
  });
}

/**
 * NES/CHROM97 packet admission evidence. This is deliberately a candidate
 * envelope: PostgreSQL remains the canonical packet owner and no candidate
 * becomes canonical until an independent transaction/readback gate admits it.
 */
export const packetAdmissionCandidateV1Schema = z.object({
  schema: z.literal('atlas.packet-admission-candidate.v1'),
  canonicalId: z.string().min(1), packetKey: z.string().min(1),
  workspaceRevision: revision, sourceRef: z.string().min(1), sourceRevision: revision,
  sourcePayloadChecksum: checksum, producer: z.string().min(1), producerRevision: revision,
  admissionStatus: z.enum(['PENDING_LINEAGE', 'READY_FOR_READBACK']),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type PacketAdmissionCandidateV1 = z.infer<typeof packetAdmissionCandidateV1Schema>;

/**
 * Compact, reproducible packet summary for later PostgreSQL readback/fanout.
 * Query hashes, JSON order, transport offsets, and projection IDs are not
 * accepted as identity here; callers must supply the canonical packet fields.
 */
export const packetSummaryV1Schema = z.object({
  schema: z.literal('atlas.packet-summary.v1'), canonicalId: z.string().min(1),
  packetKey: z.string().min(1), workspaceRevision: revision, sourceRef: z.string().min(1),
  sourceRevision: revision, packetRevision: revision, representationRevision: revision.nullable(),
  domain: z.string().min(1), kind: z.string().min(1), title: z.string().min(1),
  summary: z.string().min(1), lexicalText: z.string().min(1), semanticText: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1), sourcePayloadChecksum: checksum,
  summaryChecksum: checksum, producer: z.string().min(1), producerRevision: revision,
  admissionStatus: z.enum(['PENDING_LINEAGE', 'READY_FOR_READBACK']),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type PacketSummaryV1 = z.infer<typeof packetSummaryV1Schema>;

type PacketSummaryChecksumInputV1 = Omit<PacketSummaryV1, 'summaryChecksum' | 'canonicalAuthority' | 'writesPerformed'>;

function packetSummaryChecksumPayloadV1(summary: PacketSummaryChecksumInputV1) {
  return {
    schema: 'atlas.packet-summary-payload.v1',
    canonicalId: summary.canonicalId, packetKey: summary.packetKey,
    workspaceRevision: summary.workspaceRevision, sourceRef: summary.sourceRef,
    sourceRevision: summary.sourceRevision, packetRevision: summary.packetRevision,
    representationRevision: summary.representationRevision, domain: summary.domain,
    kind: summary.kind, title: summary.title, summary: summary.summary,
    lexicalText: summary.lexicalText, semanticText: summary.semanticText,
    evidenceRefs: summary.evidenceRefs, sourcePayloadChecksum: summary.sourcePayloadChecksum,
    producer: summary.producer, producerRevision: summary.producerRevision,
    admissionStatus: summary.admissionStatus,
  };
}

export function buildPacketSummaryV1(input: PacketSummaryChecksumInputV1): PacketSummaryV1 {
  const summaryChecksum = `sha256:${canonicalSha256V1(packetSummaryChecksumPayloadV1(input))}`;
  return packetSummaryV1Schema.parse({ ...input, summaryChecksum, canonicalAuthority: false, writesPerformed: false });
}

export function parsePacketSummaryV1(value: unknown): PacketSummaryV1 {
  const summary = packetSummaryV1Schema.parse(value);
  const expected = `sha256:${canonicalSha256V1(packetSummaryChecksumPayloadV1(summary))}`;
  if (summary.summaryChecksum !== expected) throw new Error('PACKET_SUMMARY_CHECKSUM_MISMATCH');
  return summary;
}

/**
 * Read-only canary preflight. It validates a complete candidate cohort but
 * deliberately stops before PostgreSQL admission, projection fanout, or cache
 * warming. The caller must perform the independent transaction/readback gate.
 */
export function planPacketFabricCanaryV1(input: {
  summaries: readonly unknown[];
  inputChecksum: string;
  requestedRows?: number;
}): PacketFabricCanaryV1 {
  const requestedRows = input.requestedRows ?? 45;
  if (input.summaries.length !== requestedRows) throw new Error('PACKET_FABRIC_CANARY_COHORT_COUNT_MISMATCH');
  const summaries = input.summaries.map(parsePacketSummaryV1);
  const canonicalIds = new Set(summaries.map((summary) => summary.canonicalId));
  const packetKeys = new Set(summaries.map((summary) => summary.packetKey));
  if (canonicalIds.size !== summaries.length) throw new Error('PACKET_FABRIC_CANARY_DUPLICATE_CANONICAL_ID');
  if (packetKeys.size !== summaries.length) throw new Error('PACKET_FABRIC_CANARY_DUPLICATE_PACKET_KEY');
  if (summaries.some((summary) => summary.admissionStatus !== 'READY_FOR_READBACK')) {
    throw new Error('PACKET_FABRIC_CANARY_LINEAGE_NOT_READY');
  }
  return packetFabricCanaryV1Schema.parse({
    schema: 'atlas.packet-fabric-canary.v1', corpus: 'NES_CHROM97', inputChecksum: input.inputChecksum,
    requestedRows, status: 'READY_FOR_BOUNDED_APPLY', postgresReadback: 'REQUIRED',
    semanticProjectionReadback: 'NOT_RUN', qdrantProjectionReadback: 'NOT_RUN', aceResidencyReadback: 'NOT_RUN',
    writesPerformed: false, canonicalAuthority: false,
  });
}
