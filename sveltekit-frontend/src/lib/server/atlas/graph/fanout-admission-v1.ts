import { createHash } from 'node:crypto';
import { z } from 'zod';

import { materializeCandidateOrdinalMap, type CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import { evaluateGraphQdrantFanoutAlignment } from './graph-qdrant-fanout-alignment.js';
import { verifyGraphSnapshotRevisionV1 } from './graph-snapshot-revision-v1.js';

export const FANOUT_ADMISSION_SCHEMA = 'atlas.fanout-admission.v1' as const;
const id = z.string().min(1);
const nullableId = id.nullable();

export const fanoutGraphNodeEvidenceV1Schema = z.object({
  snapshotId: z.string().uuid(),
  graphNodeKey: id,
  canonicalId: nullableId,
  packetKey: id,
  symbolVersionId: nullableId,
  sourceRef: nullableId,
  treeNodeId: nullableId,
  sourceRevision: nullableId,
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
  ]),
  admitted: z.boolean(),
  candidateOrdinalMap: z.custom<CandidateOrdinalMapV1>().nullable(),
  strongIdentityEvidence: z.enum(['CANONICAL_ID', 'SYMBOL_VERSION_ID', 'PACKET_KEY']).nullable(),
  snapshotId: z.string().uuid(),
  repositoryRevision: id,
  graphRevision: id,
  sourceRevision: nullableId,
  representationId: z.literal('semantic_768').nullable(),
  representationRevision: nullableId,
  blockers: z.array(id),
  canonicalWritesAttempted: z.literal(false),
  qdrantWritesAttempted: z.literal(false),
  neo4jWritesAttempted: z.literal(false),
  producerRevision: id,
  receiptChecksum: z.string().regex(/^[a-f0-9]{64}$/),
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

function canonicalIdForAdmission(input: {
  node: FanoutGraphNodeEvidenceV1;
  qdrantPayload: Record<string, unknown>;
}): string | null {
  const payloadCanonical = text(input.qdrantPayload.canonical_id);
  const payloadSymbol = text(input.qdrantPayload.symbol_version_id);
  const payloadPacket = text(input.qdrantPayload.packet_key);

  if (input.node.canonicalId && payloadCanonical === input.node.canonicalId) return input.node.canonicalId;
  if (input.node.symbolVersionId && payloadSymbol === input.node.symbolVersionId) return input.node.symbolVersionId;
  if (payloadPacket === input.node.packetKey) return input.node.packetKey;
  return null;
}

/**
 * Final fail-closed admission boundary before any graph/dense executor may emit
 * CandidateOrdinal coordinates.
 *
 * This contract does not query or mutate stores. It consumes already-read
 * snapshot/node/Qdrant evidence and only materializes CandidateOrdinal after
 * snapshot binding, strong identity, repository/source/graph revisions, and
 * the semantic_768 representation revision all agree.
 */
export function evaluateFanoutAdmissionV1(input: {
  graphSnapshotRevision: unknown;
  graphNode: z.input<typeof fanoutGraphNodeEvidenceV1Schema>;
  qdrantPayload: Record<string, unknown> | null;
  candidateSnapshotRevision: string;
  expectedRepresentationRevision: string | number;
  producerRevision: string;
}): FanoutAdmissionV1 {
  const snapshot = verifyGraphSnapshotRevisionV1(input.graphSnapshotRevision);
  const node = fanoutGraphNodeEvidenceV1Schema.parse(input.graphNode);
  const blockers: string[] = [];

  let status: FanoutAdmissionV1['status'];
  let candidateOrdinalMap: CandidateOrdinalMapV1 | null = null;
  let strongIdentityEvidence: FanoutAdmissionV1['strongIdentityEvidence'] = null;
  let representationRevision: string | null = null;

  if (node.snapshotId !== snapshot.snapshotId) {
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
      if (!alignment.repositoryRevisionAligned) blockers.push('REPOSITORY_REVISION_MISMATCH');
      if (!alignment.graphRevisionAligned) blockers.push('GRAPH_REVISION_MISMATCH');
      if (!alignment.sourceRevisionAligned) blockers.push('SOURCE_REVISION_MISMATCH');
      if (!alignment.semanticRepresentationAligned) blockers.push('SEMANTIC_768_REPRESENTATION_REQUIRED');
      if (!alignment.representationRevisionAligned) blockers.push('REPRESENTATION_REVISION_MISMATCH');
    } else {
      const canonicalId = canonicalIdForAdmission({ node, qdrantPayload: input.qdrantPayload });
      if (!canonicalId) {
        status = 'CANONICAL_IDENTITY_REJECTED';
        blockers.push('CANONICAL_ID_NOT_RESOLVABLE_FROM_STRONG_IDENTITY');
      } else {
        status = 'ADMITTED_TO_CANDIDATE_ORDINAL';
        candidateOrdinalMap = materializeCandidateOrdinalMap({
          candidateSnapshotRevision: input.candidateSnapshotRevision,
          workspaceRevision: snapshot.workspaceRevision,
          producerRevision: input.producerRevision,
          candidates: [{
            canonicalId,
            packetKey: node.packetKey,
            treeNodeId: node.treeNodeId,
            symbolVersionId: node.symbolVersionId,
            workspaceRevision: snapshot.workspaceRevision,
            sourceRevision: node.sourceRevision,
            graphRevision: snapshot.graphRevision,
            semanticRevision: `semantic_768:${String(input.expectedRepresentationRevision)}`,
            degradedIdentity: false,
            evidenceRefs: [node.graphNodeKey, ...node.evidenceRefs],
          }],
        });
      }
    }
  }

  const admitted = status === 'ADMITTED_TO_CANDIDATE_ORDINAL';
  const payload = {
    schema: FANOUT_ADMISSION_SCHEMA,
    status,
    admitted,
    candidateOrdinalMap,
    strongIdentityEvidence,
    snapshotId: snapshot.snapshotId,
    repositoryRevision: snapshot.workspaceRevision,
    graphRevision: snapshot.graphRevision,
    sourceRevision: node.sourceRevision,
    representationId: input.qdrantPayload && text(input.qdrantPayload.representation_id) === 'semantic_768'
      ? 'semantic_768' as const
      : null,
    representationRevision,
    blockers,
    canonicalWritesAttempted: false as const,
    qdrantWritesAttempted: false as const,
    neo4jWritesAttempted: false as const,
    producerRevision: input.producerRevision,
  };

  return fanoutAdmissionV1Schema.parse({ ...payload, receiptChecksum: checksum(payload) });
}
