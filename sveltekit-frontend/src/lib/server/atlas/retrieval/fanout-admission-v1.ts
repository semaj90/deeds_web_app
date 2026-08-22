import { createHash } from 'node:crypto';
import { z } from 'zod';
import { candidateOrdinalMapV1Schema, type CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';

export const FANOUT_ADMISSION_SCHEMA = 'atlas.fanout-admission.v1' as const;
export const FANOUT_ADMISSION_REVISION = 'atlas.fanout-admission.2026-08-21.v2' as const;
const id = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const workspaceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const fanoutProofGateV1Schema = z.object({
  revisionOwnerStatus: z.literal('REVISION_OWNER_PROVEN'),
  graphRevisionOwnerStatus: z.literal('GRAPH_FANOUT_REVISION_OWNER_PROVEN'),
  workspaceRevision,
  graphRevision: sha256,
  candidateSnapshotRevision: id,
  ordinalMapChecksum: sha256,
  qdrantIdentityLineageStatus: z.enum(['PROVEN', 'DEGRADED', 'NOT_APPLICABLE']),
  producerRevision: id,
}).strict();
export type FanoutProofGateV1 = z.infer<typeof fanoutProofGateV1Schema>;

export const fanoutExecutorResultV1Schema = z.object({
  executor: z.enum(['QDRANT','CUVS_EXACT','CAGRA','TURBOVEC','NEO4J','CUGRAPH_BFS','CUGRAPH_PPR']),
  logicalLane: z.enum(['SEMANTIC','GRAPH']),
  executorResultId: z.union([z.string().min(1), z.number().int().nonnegative()]),
  canonicalId: id.nullable(),
  identityStatus: z.enum(['ADMITTED','DEGRADED','UNRESOLVED']),
  workspaceRevision: workspaceRevision.nullable(),
  sourceRevision: sourceRevision.nullable(),
  graphRevision: sha256.nullable(),
  candidateSnapshotRevision: id.nullable(),
  semanticRevision: id.nullable().default(null),
  score: z.number().finite(),
  evidenceRefs: z.array(id).default([]),
}).strict();
export type FanoutExecutorResultV1 = z.infer<typeof fanoutExecutorResultV1Schema>;

const rejectionReason = z.enum([
  'QDRANT_IDENTITY_LINEAGE_NOT_PROVEN','IDENTITY_NOT_ADMITTED','CANONICAL_ID_MISSING',
  'CANONICAL_ID_NOT_IN_ORDINAL_MAP','DEGRADED_CANONICAL_CANDIDATE','WORKSPACE_REVISION_MISMATCH',
  'SOURCE_REVISION_MISMATCH','GRAPH_REVISION_MISMATCH','CANDIDATE_SNAPSHOT_REVISION_MISMATCH',
  'EXECUTOR_IDENTITY_SUBSTITUTION',
]);

export const fanoutAdmissionReceiptV1Schema = z.object({
  schema: z.literal(FANOUT_ADMISSION_SCHEMA),
  admissionRevision: z.literal(FANOUT_ADMISSION_REVISION),
  gate: fanoutProofGateV1Schema,
  ordinalMapChecksum: sha256,
  admitted: z.array(z.object({
    executor: fanoutExecutorResultV1Schema.shape.executor,
    logicalLane: fanoutExecutorResultV1Schema.shape.logicalLane,
    canonicalId: id,
    candidateOrdinal: z.number().int().nonnegative(),
    score: z.number().finite(),
    evidenceRefs: z.array(id),
  }).strict()),
  rejected: z.array(z.object({
    executor: fanoutExecutorResultV1Schema.shape.executor,
    canonicalId: id.nullable(), reason: rejectionReason, evidenceRefs: z.array(id),
  }).strict()),
  executorIdsEscapedAboveBoundary: z.literal(false),
  ordinalRemappingPerformed: z.literal(false),
  rankingMutationPerformed: z.literal(false),
  extraRrfVotesCreated: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  fanoutAdmissionProven: z.boolean(),
  receiptChecksum: sha256,
}).strict();
export type FanoutAdmissionReceiptV1 = z.infer<typeof fanoutAdmissionReceiptV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function checksum(value: unknown): string { return createHash('sha256').update(stable(value), 'utf8').digest('hex'); }

/**
 * FANOUT-01 admission boundary. Executor-local IDs terminate here. No ordinals
 * are created or repaired: admitted results receive only an existing ordinal
 * from CandidateOrdinalMapV1. Rejected degraded/unresolved hits may remain
 * retrieval evidence, but never seed graph/GPU traversal or gain another vote.
 */
export function admitFanoutExecutorResultsV1(input: {
  gate: z.input<typeof fanoutProofGateV1Schema>;
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  results: readonly z.input<typeof fanoutExecutorResultV1Schema>[];
}): FanoutAdmissionReceiptV1 {
  const gate = fanoutProofGateV1Schema.parse(input.gate);
  const ordinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (ordinalMap.ordinalMapChecksum !== gate.ordinalMapChecksum) throw new Error('FANOUT_ORDINAL_MAP_CHECKSUM_MISMATCH');
  if (ordinalMap.workspaceRevision !== gate.workspaceRevision) throw new Error('FANOUT_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH');
  if (ordinalMap.candidateSnapshotRevision !== gate.candidateSnapshotRevision) throw new Error('FANOUT_ORDINAL_MAP_SNAPSHOT_REVISION_MISMATCH');

  const byCanonical = new Map(ordinalMap.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const admitted: FanoutAdmissionReceiptV1['admitted'] = [];
  const rejected: FanoutAdmissionReceiptV1['rejected'] = [];

  for (const raw of input.results) {
    const result = fanoutExecutorResultV1Schema.parse(raw);
    const reject = (reason: z.infer<typeof rejectionReason>) => rejected.push({
      executor: result.executor, canonicalId: result.canonicalId, reason, evidenceRefs: result.evidenceRefs,
    });
    if (result.executor === 'QDRANT' && gate.qdrantIdentityLineageStatus !== 'PROVEN') { reject('QDRANT_IDENTITY_LINEAGE_NOT_PROVEN'); continue; }
    if (result.identityStatus !== 'ADMITTED') { reject('IDENTITY_NOT_ADMITTED'); continue; }
    if (result.canonicalId === null) { reject('CANONICAL_ID_MISSING'); continue; }
    const candidate = byCanonical.get(result.canonicalId);
    if (!candidate) { reject('CANONICAL_ID_NOT_IN_ORDINAL_MAP'); continue; }
    if (candidate.degradedIdentity) { reject('DEGRADED_CANONICAL_CANDIDATE'); continue; }
    if (result.workspaceRevision !== gate.workspaceRevision || candidate.workspaceRevision !== gate.workspaceRevision) { reject('WORKSPACE_REVISION_MISMATCH'); continue; }
    if (result.sourceRevision !== candidate.sourceRevision) { reject('SOURCE_REVISION_MISMATCH'); continue; }
    if (result.graphRevision !== gate.graphRevision || candidate.graphRevision !== gate.graphRevision) { reject('GRAPH_REVISION_MISMATCH'); continue; }
    if (result.candidateSnapshotRevision !== gate.candidateSnapshotRevision || candidate.candidateSnapshotRevision !== gate.candidateSnapshotRevision) { reject('CANDIDATE_SNAPSHOT_REVISION_MISMATCH'); continue; }
    if (String(result.executorResultId) === result.canonicalId) { reject('EXECUTOR_IDENTITY_SUBSTITUTION'); continue; }
    admitted.push({
      executor: result.executor, logicalLane: result.logicalLane,
      canonicalId: result.canonicalId, candidateOrdinal: candidate.candidateOrdinal,
      score: result.score, evidenceRefs: result.evidenceRefs,
    });
  }

  const payload = {
    schema: FANOUT_ADMISSION_SCHEMA,
    admissionRevision: FANOUT_ADMISSION_REVISION,
    gate, ordinalMapChecksum: ordinalMap.ordinalMapChecksum, admitted, rejected,
    executorIdsEscapedAboveBoundary: false as const,
    ordinalRemappingPerformed: false as const,
    rankingMutationPerformed: false as const,
    extraRrfVotesCreated: false as const,
    canonicalWritesAllowed: false as const,
    fanoutAdmissionProven: admitted.length > 0,
  };
  return fanoutAdmissionReceiptV1Schema.parse({ ...payload, receiptChecksum: checksum(payload) });
}
