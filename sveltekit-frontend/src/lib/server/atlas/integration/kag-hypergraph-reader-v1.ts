import { pool } from '$lib/server/db/client.js';
import { buildKagMutualIndexV1 } from './kag-mutual-index-v1.js';
import type { HyperedgeV1, HyperedgeParticipantV1 } from '../../graph/hyperedge-contract.js';
import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import { PACKET_KEY_V2_PATTERN } from '../identity/packet-key-v2.js';
import {
  PacketIncidenceLineageV1Schema,
  type PacketIncidenceLineageV1,
} from '../lineage/packet-incidence-lineage-v1.js';
import { verifyPacketIncidenceLineagesAgainstPostgresV1 } from '../lineage/packet-incidence-postgres-readback-v1.js';

/**
 * KAG "next steps" item 1 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
 *
 * Read-side counterpart to `kag-persistence-row-v1.ts` (which maps
 * contract -> Postgres row for writes). This maps Postgres rows back to
 * `OntologyLinkedTupleV1`/`HyperedgeV1` for a bounded set of canonical ids,
 * then runs them through the existing pure `buildKagMutualIndexV1()` to
 * produce `SearchResult.provenance.hypergraphNeighbors`.
 *
 * Fail-open by design: any DB error or empty input returns the empty shape,
 * never throws. This is purely additive/informational evidence attached to
 * `provenance` after ranking is already final — it must never gate or alter
 * scoring, fusion, or reranking.
 */

const MAX_CANONICAL_IDS = 256;
export const MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1 = 4096;

export interface KagTraversalSnapshotV1 {
  workspaceRevision: string;
  graphRevision: string;
}

export interface KagHypergraphNeighborV1 {
  canonicalId: string;
  hyperedgeIds: string[];
  neighborCanonicalIds?: string[];
  neighborStoragePacketKeys?: string[];
}

export interface KagHypergraphNeighborsReceiptV1 {
  requestedCanonicalIds: number;
  matchedTuples: number;
  matchedHyperedges: number;
  neighbors: KagHypergraphNeighborV1[];
}

const EMPTY_RECEIPT: KagHypergraphNeighborsReceiptV1 = {
  requestedCanonicalIds: 0,
  matchedTuples: 0,
  matchedHyperedges: 0,
  neighbors: [],
};

interface OntologyLinkedTupleRow {
  tuple_id: string;
  schema_version: string;
  packet_key: string | null;
  source_ref: string;
  tree_node_id: string | null;
  document_id: string | null;
  title_id: string | null;
  surface_text: string;
  token_index: number | null;
  part_of_speech: string | null;
  label: string;
  label_kind: string;
  label_source: string;
  ontology_ids: string[];
  concept_ids: string[];
  participants: unknown;
  evidence_refs: string[];
  relation_revision: string | null;
  evidence_span: unknown;
  confidence: number;
  evidence_state: string;
  lifecycle: string;
  provenance: unknown;
}

interface HyperedgeMemberRow {
  hyperedge_id: string;
  contract_hyperedge_id: string;
  relation_type: string;
  workspace_revision: string;
  source_revision: string;
  graph_revision: string;
  producer_revision: string;
  evidence_refs: string[];
  checksum: string;
  packet_key: string | null;
  properties: unknown;
  member_id: string;
  member_type: string;
  member_role: string;
  ordinal: number | null;
}

function rowToOntologyLinkedTupleV1(row: OntologyLinkedTupleRow): OntologyLinkedTupleV1 {
  return {
    tupleId: row.tuple_id,
    schemaVersion: 'ontology-linked-tuple.v1',
    packetKey: row.packet_key ?? undefined,
    sourceRef: row.source_ref,
    treeNodeId: row.tree_node_id ?? undefined,
    documentId: row.document_id ?? undefined,
    titleId: row.title_id ?? undefined,
    surfaceText: row.surface_text,
    tokenIndex: row.token_index,
    partOfSpeech: row.part_of_speech,
    label: row.label,
    labelKind: row.label_kind as OntologyLinkedTupleV1['labelKind'],
    labelSource: row.label_source as OntologyLinkedTupleV1['labelSource'],
    ontologyIds: row.ontology_ids ?? [],
    conceptIds: row.concept_ids ?? [],
    participants: (row.participants ?? []) as OntologyLinkedTupleV1['participants'],
    evidenceRefs: row.evidence_refs ?? [],
    relationRevision: row.relation_revision ?? undefined,
    evidenceSpan: (row.evidence_span ?? undefined) as OntologyLinkedTupleV1['evidenceSpan'],
    confidence: Number(row.confidence),
    evidenceState: row.evidence_state as OntologyLinkedTupleV1['evidenceState'],
    lifecycle: row.lifecycle as OntologyLinkedTupleV1['lifecycle'],
    provenance: row.provenance as OntologyLinkedTupleV1['provenance'],
  };
}

function rowsToHyperedgeV1(contractHyperedgeId: string, rows: HyperedgeMemberRow[]): HyperedgeV1 | null {
  const first = rows[0];
  if (!first) return null;
  const participants: HyperedgeParticipantV1[] = rows
    .map((row) => ({
      canonicalId: row.member_id,
      role: row.member_role,
      ordinal: row.ordinal ?? undefined,
    }))
    .filter((p) => p.canonicalId && p.role);
  if (participants.length < 2) return null;
  return {
    schemaVersion: 'atlas.hyperedge.v1',
    hyperedgeId: contractHyperedgeId,
    predicate: first.relation_type,
    participants,
    evidenceRefs: first.evidence_refs ?? [],
    workspaceRevision: first.workspace_revision,
    graphRevision: first.graph_revision,
    sourceRevision: first.source_revision,
    producerRevision: first.producer_revision,
    checksum: first.checksum,
  };
}

/**
 * Read real `OntologyLinkedTupleV1`/`HyperedgeV1` rows for a bounded set of
 * canonical ids (packetKey ?? sourceRef) and resolve them into
 * `SearchResult.provenance.hypergraphNeighbors` entries via the existing
 * pure `buildKagMutualIndexV1()`.
 */
export async function readKagHypergraphNeighborsV1(
  canonicalIds: readonly string[],
  options: { strict?: boolean; snapshot?: KagTraversalSnapshotV1 } = {},
): Promise<KagHypergraphNeighborsReceiptV1> {
  const uniqueIds = [...new Set(canonicalIds.filter(Boolean))].slice(0, MAX_CANONICAL_IDS);
  if (uniqueIds.length === 0) return EMPTY_RECEIPT;

  try {
    const snapshot = options.snapshot;
    if (options.strict && (!snapshot?.workspaceRevision?.trim() || !snapshot?.graphRevision?.trim())) {
      throw new Error('KAG_TRAVERSAL_SNAPSHOT_REQUIRED');
    }
    if (options.strict && uniqueIds.some((id) => !PACKET_KEY_V2_PATTERN.test(id))) {
      throw new Error('KAG_CANONICAL_PACKET_KEY_V2_REQUIRED');
    }
    if (options.strict) return await readExactPacketIncidenceV1(uniqueIds, snapshot!);
    const hyperedgeRevisionFilter = snapshot
      ? `\n            AND h.workspace_revision = $2\n            AND h.graph_revision = $3`
      : '';
    const hyperedgeParams = snapshot
      ? [uniqueIds, snapshot.workspaceRevision, snapshot.graphRevision]
      : [uniqueIds];
    const tupleRevisionFilter = snapshot
      ? `\n            AND provenance->>'workspaceRevision' = $2\n            AND provenance->>'graphRevision' = $3`
      : '';
    const tupleParams = snapshot ? [uniqueIds, snapshot.workspaceRevision, snapshot.graphRevision] : [uniqueIds];
    const [tupleResult, memberResult] = await Promise.all([
      pool.query<OntologyLinkedTupleRow>(
        `
          SELECT tuple_id, schema_version, packet_key, source_ref, tree_node_id, document_id,
                 title_id, surface_text, token_index, part_of_speech, label, label_kind,
                 label_source, ontology_ids, concept_ids, participants, evidence_refs,
                 relation_revision, evidence_span, confidence, evidence_state, lifecycle,
                 provenance
          FROM atlas_ontology_linked_tuples
          WHERE (packet_key = ANY($1::text[]) OR source_ref = ANY($1::text[]))${tupleRevisionFilter}
        `,
        tupleParams,
      ),
      pool.query<HyperedgeMemberRow>(
        `
          SELECT h.hyperedge_id, h.contract_hyperedge_id, h.relation_type, h.packet_key,
                 h.workspace_revision, h.source_revision, h.graph_revision, h.producer_revision,
                 h.evidence_refs, h.checksum, h.properties, m.member_id, m.member_type, m.member_role, m.ordinal
          FROM atlas_hyperedges h
          JOIN atlas_hyperedge_members m ON m.hyperedge_id = h.hyperedge_id
          WHERE h.contract_hyperedge_id IS NOT NULL
            AND h.hyperedge_id IN (
              SELECT DISTINCT hyperedge_id FROM atlas_hyperedge_members WHERE member_id = ANY($1::text[])
            )${hyperedgeRevisionFilter}
        `,
        hyperedgeParams,
      ),
    ]);

    const tuples = tupleResult.rows.map(rowToOntologyLinkedTupleV1);

    const membersByContractId = new Map<string, HyperedgeMemberRow[]>();
    for (const row of memberResult.rows) {
      const existing = membersByContractId.get(row.contract_hyperedge_id);
      if (existing) existing.push(row);
      else membersByContractId.set(row.contract_hyperedge_id, [row]);
    }
    const hyperedges = [...membersByContractId.entries()]
      .map(([contractHyperedgeId, rows]) => rowsToHyperedgeV1(contractHyperedgeId, rows))
      .filter((edge): edge is HyperedgeV1 => edge !== null);

    const index = buildKagMutualIndexV1(tuples, hyperedges);
    const neighbors: KagHypergraphNeighborV1[] = [];
    for (const canonicalId of uniqueIds) {
      const hyperedgeIds = index.canonicalIdToHyperedgeIds.get(canonicalId);
      if (hyperedgeIds && hyperedgeIds.length > 0) {
        neighbors.push({ canonicalId, hyperedgeIds: [...hyperedgeIds] });
      }
    }

    return {
      requestedCanonicalIds: uniqueIds.length,
      matchedTuples: tuples.length,
      matchedHyperedges: hyperedges.length,
      neighbors,
    };
  } catch (error) {
    if (options.strict) throw error;
    console.warn('[kag-hypergraph-reader-v1] read failed, returning empty (fail-open):', error);
    return { ...EMPTY_RECEIPT, requestedCanonicalIds: uniqueIds.length };
  }
}

interface StoredPacketIncidenceRowV1 {
  lineage_checksum: string;
  input_checksum: string;
  packet_key: string;
  canonical_id: string;
  source_revision: string;
  neighbor_packet_key: string;
  neighbor_canonical_id: string;
  neighbor_source_revision: string;
  edge_type: string;
  workspace_revision: string;
  graph_revision: string;
  producer_id: string;
  producer_revision: string;
  evidence_refs: string[];
  lineage: unknown;
}

async function readExactPacketIncidenceV1(
  canonicalIds: readonly string[],
  snapshot: KagTraversalSnapshotV1,
): Promise<KagHypergraphNeighborsReceiptV1> {
  const result = await pool.query<StoredPacketIncidenceRowV1>(
    `SELECT lineage_checksum, input_checksum, packet_key, canonical_id, source_revision,
            neighbor_packet_key, neighbor_canonical_id, neighbor_source_revision, edge_type,
            workspace_revision, graph_revision, producer_id, producer_revision, evidence_refs, lineage
       FROM atlas_packet_incidence
      WHERE canonical_id = ANY($1::text[])
        AND workspace_revision = $2
        AND graph_revision = $3
      ORDER BY lineage_checksum
      LIMIT $4`,
    [canonicalIds, snapshot.workspaceRevision, snapshot.graphRevision, MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1 + 1],
  );
  if (result.rows.length > MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1) {
    throw new Error('KAG_PACKET_INCIDENCE_ROW_LIMIT_EXCEEDED');
  }
  const lineages = result.rows.map(parseStoredPacketIncidenceRowV1);
  await verifyPacketIncidenceLineagesAgainstPostgresV1(lineages, snapshot);
  const neighborsByPacket = new Map<string, { hyperedgeIds: Set<string>; canonicalIds: Set<string>; storageKeys: Set<string> }>();
  for (const lineage of lineages) {
    const current = neighborsByPacket.get(lineage.canonicalId) ?? {
      hyperedgeIds: new Set<string>(), canonicalIds: new Set<string>(), storageKeys: new Set<string>(),
    };
    current.hyperedgeIds.add(`packet-incidence:${lineage.lineageChecksum}`);
    current.canonicalIds.add(lineage.neighborCanonicalId);
    current.storageKeys.add(lineage.neighborPacketKey);
    neighborsByPacket.set(lineage.canonicalId, current);
  }
  return {
    requestedCanonicalIds: canonicalIds.length,
    matchedTuples: 0,
    matchedHyperedges: lineages.length,
    neighbors: [...neighborsByPacket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([canonicalId, value]) => ({
      canonicalId,
      hyperedgeIds: [...value.hyperedgeIds].sort(),
      neighborCanonicalIds: [...value.canonicalIds].sort(),
      neighborStoragePacketKeys: [...value.storageKeys].sort(),
    })),
  };
}

function parseStoredPacketIncidenceRowV1(row: StoredPacketIncidenceRowV1): PacketIncidenceLineageV1 {
  const value = typeof row.lineage === 'string' ? JSON.parse(row.lineage) : row.lineage;
  const lineage = PacketIncidenceLineageV1Schema.parse(value);
  if (
    lineage.lineageChecksum !== row.lineage_checksum
    || lineage.inputChecksum !== row.input_checksum
    || lineage.packetKey !== row.packet_key
    || lineage.canonicalId !== row.canonical_id
    || lineage.sourceRevision !== row.source_revision
    || lineage.neighborPacketKey !== row.neighbor_packet_key
    || lineage.neighborCanonicalId !== row.neighbor_canonical_id
    || lineage.neighborSourceRevision !== row.neighbor_source_revision
    || lineage.edgeType !== row.edge_type
    || lineage.workspaceRevision !== row.workspace_revision
    || lineage.graphRevision !== row.graph_revision
    || lineage.producerId !== row.producer_id
    || lineage.producerRevision !== row.producer_revision
    || JSON.stringify([...lineage.evidenceRefs].sort()) !== JSON.stringify([...(row.evidence_refs ?? [])].sort())
  ) {
    throw new Error(`PACKET_INCIDENCE_READBACK_COLUMN_MISMATCH:${row.lineage_checksum}`);
  }
  return lineage;
}

/** Strict read-only seam for governed DAG execution. Existing callers keep
 * the historical fail-open wrapper above; this boundary preserves typed DB
 * failures for receipts instead of converting them into empty success. */
export async function readKagHypergraphNeighborsStrictV1(
  canonicalIds: readonly string[],
  snapshot: KagTraversalSnapshotV1,
): Promise<KagHypergraphNeighborsReceiptV1> {
  return readKagHypergraphNeighborsV1(canonicalIds, { strict: true, snapshot });
}

/** Strict role-preserving read for the bounded traversal coordinator. This is
 * deliberately separate from the compact OAK neighbor receipt so traversal
 * never has to reconstruct an n-ary fact from IDs alone. */
export async function readKagHyperedgesStrictV1(
  canonicalIds: readonly string[],
  snapshot: KagTraversalSnapshotV1,
): Promise<HyperedgeV1[]> {
  const uniqueIds = [...new Set(canonicalIds.filter(Boolean))].slice(0, MAX_CANONICAL_IDS);
  if (uniqueIds.length === 0) return [];
  if (!snapshot.workspaceRevision.trim() || !snapshot.graphRevision.trim()) {
    throw new Error('KAG_TRAVERSAL_SNAPSHOT_REQUIRED');
  }
  const result = await pool.query<HyperedgeMemberRow>(
    `
      SELECT h.hyperedge_id, h.contract_hyperedge_id, h.relation_type, h.workspace_revision,
             h.source_revision, h.graph_revision, h.producer_revision, h.evidence_refs,
             h.checksum, m.member_id, m.member_role, m.ordinal
      FROM atlas_hyperedges h
      JOIN atlas_hyperedge_members m ON m.hyperedge_id = h.hyperedge_id
      WHERE h.contract_hyperedge_id IS NOT NULL
        AND h.workspace_revision = $2
        AND h.graph_revision = $3
        AND h.hyperedge_id IN (
          SELECT DISTINCT hyperedge_id FROM atlas_hyperedge_members WHERE member_id = ANY($1::text[])
        )
      ORDER BY h.contract_hyperedge_id, m.ordinal NULLS LAST, m.member_id
      LIMIT $4
    `,
    [uniqueIds, snapshot.workspaceRevision, snapshot.graphRevision, MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1 + 1],
  );
  if (result.rows.length > MAX_KAG_HYPEREDGE_MEMBER_ROWS_V1) {
    throw new Error('KAG_HYPEREDGE_MEMBER_ROW_LIMIT_EXCEEDED');
  }
  const grouped = new Map<string, HyperedgeMemberRow[]>();
  for (const row of result.rows) grouped.set(row.contract_hyperedge_id, [...(grouped.get(row.contract_hyperedge_id) ?? []), row]);
  return [...grouped.entries()]
    .map(([id, rows]) => rowsToHyperedgeV1(id, rows))
    .filter((edge): edge is HyperedgeV1 => edge !== null);
}
