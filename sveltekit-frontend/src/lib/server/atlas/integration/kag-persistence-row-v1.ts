import type { HyperedgeV1 } from '../../graph/hyperedge-contract.js';
import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';

export interface AtlasHyperedgePersistenceRowV1 {
  contractHyperedgeId: string;
  relationType: string;
  schemaId: 'atlas.hyperedge';
  schemaVersion: 1;
  sourceRefKey: string;
  packetKey: string | null;
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision: string;
  producerRevision: string;
  evidenceHash: string;
  evidenceRefs: string[];
  checksum: string;
  properties: Record<string, unknown>;
  lifecycle: 'OBSERVED';
  provenance: Record<string, unknown>;
  extractorVersion: string;
  confidence: number;
}

export interface AtlasHyperedgeMemberPersistenceRowV1 {
  hyperedgeContractId: string;
  memberId: string;
  memberType: 'canonical_id';
  memberRole: string;
  ordinal: number;
}

export interface AtlasOntologyTuplePersistenceRowV1 {
  tupleId: string;
  schemaVersion: 'ontology-linked-tuple.v1';
  packetKey: string | null;
  sourceRef: string;
  treeNodeId: string | undefined;
  documentId: string | undefined;
  titleId: string | undefined;
  surfaceText: string;
  tokenIndex: number | null | undefined;
  partOfSpeech: string | null | undefined;
  label: string;
  labelKind: string;
  labelSource: string;
  ontologyIds: string[];
  conceptIds: string[];
  participants: OntologyLinkedTupleV1['participants'];
  evidenceRefs: string[];
  relationRevision: string | undefined;
  evidenceSpan: OntologyLinkedTupleV1['evidenceSpan'];
  confidence: number;
  evidenceState: OntologyLinkedTupleV1['evidenceState'];
  lifecycle: OntologyLinkedTupleV1['lifecycle'];
  provenance: OntologyLinkedTupleV1['provenance'];
  producerRevision: string | null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function toAtlasHyperedgePersistenceRowsV1(edge: HyperedgeV1): {
  hyperedge: AtlasHyperedgePersistenceRowV1;
  members: AtlasHyperedgeMemberPersistenceRowV1[];
} {
  const evidenceRefs = uniqueSorted(edge.evidenceRefs);
  const packetKey = evidenceRefs.find((ref) => ref.startsWith('packet:')) ?? null;
  const members = [...edge.participants]
    .map((participant, index) => ({
      hyperedgeContractId: edge.hyperedgeId,
      memberId: participant.canonicalId,
      memberType: 'canonical_id' as const,
      memberRole: participant.role,
      ordinal: participant.ordinal ?? index,
    }))
    .sort((left, right) => left.ordinal - right.ordinal || left.memberId.localeCompare(right.memberId));

  return {
    hyperedge: {
      contractHyperedgeId: edge.hyperedgeId,
      relationType: edge.predicate,
      schemaId: 'atlas.hyperedge',
      schemaVersion: 1,
      sourceRefKey: evidenceRefs[0] ?? edge.hyperedgeId,
      packetKey,
      workspaceRevision: edge.workspaceRevision,
      sourceRevision: edge.sourceRevision,
      graphRevision: edge.graphRevision,
      producerRevision: edge.producerRevision,
      evidenceHash: edge.checksum,
      evidenceRefs,
      checksum: edge.checksum,
      properties: {
        contractSchemaVersion: edge.schemaVersion,
        participantCount: members.length,
      },
      lifecycle: 'OBSERVED',
      provenance: {
        contract: edge.schemaVersion,
        canonicalAuthority: true,
        graphRevision: edge.graphRevision,
      },
      extractorVersion: edge.producerRevision,
      confidence: 1,
    },
    members,
  };
}

export function toAtlasOntologyTuplePersistenceRowV1(tuple: OntologyLinkedTupleV1): AtlasOntologyTuplePersistenceRowV1 {
  const provenance = tuple.provenance;
  return {
    tupleId: tuple.tupleId,
    schemaVersion: tuple.schemaVersion,
    packetKey: tuple.packetKey ?? null,
    sourceRef: tuple.sourceRef,
    treeNodeId: tuple.treeNodeId,
    documentId: tuple.documentId,
    titleId: tuple.titleId,
    surfaceText: tuple.surfaceText,
    tokenIndex: tuple.tokenIndex,
    partOfSpeech: tuple.partOfSpeech,
    label: tuple.label,
    labelKind: tuple.labelKind,
    labelSource: tuple.labelSource,
    confidence: tuple.confidence,
    ontologyIds: uniqueSorted(tuple.ontologyIds),
    conceptIds: uniqueSorted(tuple.conceptIds),
    participants: tuple.participants,
    evidenceRefs: uniqueSorted(tuple.evidenceRefs),
    relationRevision: tuple.relationRevision,
    evidenceSpan: tuple.evidenceSpan,
    evidenceState: tuple.evidenceState,
    lifecycle: tuple.lifecycle,
    provenance,
    producerRevision: provenance.producerRevision ?? null,
  };
}
