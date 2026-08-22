import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import { evaluateGraphQdrantFanoutAlignment } from './graph-qdrant-fanout-alignment.js';
import { verifyGraphSnapshotRevisionV1 } from './graph-snapshot-revision-v1.js';

export const FANOUT_ADMISSION_SCHEMA = 'atlas.fanout-admission.v1' as const;
const id = z.string().min(1);
const nullableId = id.nullable();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const fanoutGraphNodeEvidenceV1Schema = z.object({
  snapshotId: z.string().uuid(),
  graphNodeKey: id,
  canonicalId: nullableId,
  packetKey: id,
  symbolVersionId: nullableId,
  sourceRef: nullableId,
  treeNodeId: nullableId,
  sourceRevision: contentRevision.nullable(),
  evidenceRefs: z.array(id).default([]),
}).strict();
export type FanoutGraphNodeEvidenceV1 = z.infer<typeof fanoutGraphNodeEvidenceV1Schema>;

export const fanoutAdmissionV1Schema = z.object({
  schema: z.literal(FANOUT_ADMISSION_SCHEMA),
  status: z.enum([
    'ADMITTED_TO_CANDIDATE_ORDINAL',
    'SNAPSHOT_BINDING_MISMATCH',
    'SOURCE_REVISION_MISSING',
    'QDRANT_PROJECTION_MISSING',
    'CANONICAL_IDENTITY_REJECTED',
    'REVISION_LINEAGE_REJECTED',
    'CANDIDATE_SNAPSHOT_REJECTED',
  ]),
  admitted: z.boolean(),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  candidateOrdinalMapChecksum: sha256,
  strongIdentityEvidence: z.enum(['CANONICAL_ID', 'SYMBOL_VERSION_ID', 'PACKET_KEY']).nullable(),
  snapshotId: z.string().uuid(),
  workspaceRevision: contentRevision,
  repositoryRevision: nullableId,
  graphRevision: sha256,
  sourceRevision: contentRevision.nullable(),
  representationId: z.literal('semantic_768').nullable(),
  representationRevision: nullableId,
  blockers: z.array(id),
  ordinalRemappingPerformed: z.literal(false),
  rankingMutationPerformed: z.literal(false),
  extraRrfVotesCreated: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  qdrantWritesAttempted: z.literal(false),
  neo4jWritesAttempted: z.literal(false),
  producerRevision: id,
  receiptChecksum: sha256,
}).strict();
export type FanoutAdmissionV1 = z.infer<typeof fanoutAdmissionV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}
function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function canonicalIdForAdmission(input: { node: FanoutGraphNodeEvidenceV1; qdrantPayload: Record<string, unknown> }): string | null {
  const payloadCanonical = text(input.qdrantPayload.canonical_id);
  const payloadSymbol = text(input.qdrantPayload.symbol_version_id);
  const payloadPacket = text(input.qdrantPayload.packet_key);
  if (input.node.canonicalId && payloadCanonical === input.node.canonicalId) return input.node.canonicalId;
  if (input.node.symbolVersionId && payloadSymbol === input.node.symbolVersionId) return input.node.symbolVersionId;
  if (payloadPacket === input.node.packetKey) return input.node.packetKey;
  return null;
}

/**
 * Final fail-closed admission boundary before graph/dense executors may consume
 * CandidateOrdinal coordinates. The immutable CandidateOrdinalMap is supplied
 * by its canonical owner; FANOUT never allocates, sorts, repairs, or compacts
 * ordinals and never treats Qdrant/Neo4j/GPU IDs as canonical identity.
 */
export function evaluateFanoutAdmissionV1(input: {
  graphSnapshotRevision: unknown;
  graphNode: z.input<typeof fanoutGraphNodeEvidenceV1Schema>;
  qdrantPayload: Record<string, unknown> | null;
  candidateOrdinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  expectedRepresentationRevision: string | number;
  expectedRepositoryRevision?: string | null;
  producerRevision: string;
}): FanoutAdmissionV1 {
  const snapshot = verifyGraphSnapshotRevisionV1(input.graphSnapshotRevision);
  const node = fanoutGraphNodeEvidenceV1Schema.parse(input.graphNode);
  const ordinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.candidateOrdinalMap);
  const blockers: string[] = [];

  let status: FanoutAdmissionV1['status'];
  let candidateOrdinal: number | null = null;
  let strongIdentityEvidence: FanoutAdmissionV1['strongIdentityEvidence'] = null;
  let representationRevision: string | null = null;

  if (ordinalMap.workspaceRevision !== snapshot.workspaceRevision) {
    status = 'CANDIDATE_SNAPSHOT_REJECTED';
    blockers.push('CANDIDATE_ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH');
  } else if (node.snapshotId !== snapshot.snapshotId) {
    status = 'SNAPSHOT_BINDING_MISMATCH';
    blockers.push('GRAPH_NODE_SNAPSHOT_ID_MISMATCH');
  } else if (!node.sourceRevision) {
    status = 'SOURCE_REVISION_MISSING';
    blockers.push('AUTHORITATIVE_SOURCE_REVISION_REQUIRED');
  } else if (!input.qdrantPayload) {
    status = 'QDRANT_PROJECTION_MISSING';
    blockers.push('QDRANT_SEMANTIC_768_PROJECTION_REQUIRED');
  } else {
    const alignment = evaluateGraphQdrantFanoutAlignment({
      packetKey: node.packetKey,
      canonicalId: node.canonicalId,
      symbolVersionId: node.symbolVersionId,
      sourceRef: node.sourceRef,
      treeNodeId: node.treeNodeId,
      sourceRevision: node.sourceRevision,
      workspaceRevision: snapshot.workspaceRevision,
      repositoryRevision: input.expectedRepositoryRevision,
      graphRevision: snapshot.graphRevision,
      representationRevision: input.expectedRepresentationRevision,
      qdrantPayload: input.qdrantPayload,
    });
    strongIdentityEvidence = alignment.strongIdentityEvidence;
    representationRevision = text(input.qdrantPayload.representation_revision);

    if (!alignment.canonicalIdentityMatch) {
      status = 'CANONICAL_IDENTITY_REJECTED';
      blockers.push('STRONG_CANONICAL_IDENTITY_AGREEMENT_REQUIRED');
    } else if (alignment.status !== 'ALIGNED') {
      status = 'REVISION_LINEAGE_REJECTED';
      if (!alignment.workspaceRevisionAligned) blockers.push('WORKSPACE_REVISION_MISMATCH');
      if (!alignment.repositoryRevisionAligned) blockers.push('REPOSITORY_REVISION_MISMATCH');
      if (!alignment.graphRevisionAligned) blockers.push('GRAPH_REVISION_MISMATCH');
      if (!alignment.sourceRevisionAligned) blockers.push('SOURCE_REVISION_MISMATCH');
      if (!alignment.semanticRepresentationAligned) blockers.push('SEMANTIC_768_REPRESENTATION_REQUIRED');
      if (!alignment.representationRevisionAligned) blockers.push('REPRESENTATION_REVISION_MISMATCH');
    } else {
      const canonicalId = canonicalIdForAdmission({ node, qdrantPayload: input.qdrantPayload });
      const candidate = canonicalId ? ordinalMap.candidates.find((item) => item.canonicalId === canonicalId) : undefined;
      if (!canonicalId) {
        status = 'CANONICAL_IDENTITY_REJECTED';
        blockers.push('CANONICAL_ID_NOT_RESOLVABLE_FROM_STRONG_IDENTITY');
      } else if (!candidate) {
        status = 'CANDIDATE_SNAPSHOT_REJECTED';
        blockers.push('CANONICAL_ID_NOT_IN_CANDIDATE_ORDINAL_MAP');
      } else if (candidate.degradedIdentity) {
        status = 'CANONICAL_IDENTITY_REJECTED';
        blockers.push('DEGRADED_CANDIDATE_CANNOT_SEED_FANOUT');
      } else if (candidate.sourceRevision !== node.sourceRevision
        || candidate.workspaceRevision !== snapshot.workspaceRevision
        || candidate.graphRevision !== snapshot.graphRevision) {
        status = 'CANDIDATE_SNAPSHOT_REJECTED';
        blockers.push('CANDIDATE_ORDINAL_REVISION_LINEAGE_MISMATCH');
      } else {
        status = 'ADMITTED_TO_CANDIDATE_ORDINAL';
        candidateOrdinal = candidate.candidateOrdinal;
      }
    }
  }

  const admitted = status === 'ADMITTED_TO_CANDIDATE_ORDINAL';
  const payload = {
    schema: FANOUT_ADMISSION_SCHEMA,
    status,
    admitted,
    candidateOrdinal,
    candidateOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    strongIdentityEvidence,
    snapshotId: snapshot.snapshotId,
    workspaceRevision: snapshot.workspaceRevision,
    repositoryRevision: input.expectedRepositoryRevision ?? null,
    graphRevision: snapshot.graphRevision,
    sourceRevision: node.sourceRevision,
    representationId: input.qdrantPayload && text(input.qdrantPayload.representation_id) === 'semantic_768'
      ? 'semantic_768' as const : null,
    representationRevision,
    blockers,
    ordinalRemappingPerformed: false as const,
    rankingMutationPerformed: false as const,
    extraRrfVotesCreated: false as const,
    canonicalWritesAttempted: false as const,
    qdrantWritesAttempted: false as const,
    neo4jWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };
  return fanoutAdmissionV1Schema.parse({ ...payload, receiptChecksum: checksum(payload) });
}
