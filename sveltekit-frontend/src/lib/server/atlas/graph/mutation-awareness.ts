import { pool } from '$lib/server/db/client.js';
import type { GraphViewNodeV1, SourceMutationStatusV1 } from './graph-runtime-contracts.js';

export interface SourceMutationAwarenessV1 {
  nodeKey: string;
  packetKey: string | null;
  sourceRef: string | null;
  status: SourceMutationStatusV1;
  reason:
    | 'CONTENT_HASH_MATCH'
    | 'CONTENT_HASH_MISMATCH'
    | 'TRACKED_MUTATION_AFTER_SNAPSHOT'
    | 'CURRENT_PACKET_MISSING'
    | 'SOURCE_REF_MISSING'
    | 'INSUFFICIENT_VERSION_EVIDENCE';
  snapshotContentHash: string | null;
  snapshotContentHashKind: 'packet_sha256' | 'derived_snapshot_hash' | 'none';
  currentContentHash: string | null;
  contentHashMatch: boolean | null;
  trackedMutationAfterSnapshot: boolean;
  latestMutationCommit: string | null;
  latestMutationDiffHash: string | null;
  latestMutationAt: string | null;
  currentWorkspaceRevision: number | null;
  currentRepresentationRevision: number | null;
  currentSourceRepresentationId: string | null;
  currentSourceDimension: number | null;
  currentQdrantCollection: string | null;
  currentQdrantVectorDim: number | null;
}

export interface MutationAwarenessReceiptV1 {
  schema: 'atlas.mutation-awareness-receipt.v1';
  snapshotId: string;
  snapshotCapturedAt: string;
  topologyHash: string;
  sourceRevisionColumnAvailable: false;
  proofPolicy: 'content-hash-plus-tracked-git-provenance';
  checkedNodes: number;
  freshCount: number;
  staleCount: number;
  unknownCount: number;
  missingCount: number;
  trackedMutationCount: number;
  requiresRehydration: boolean;
  entries: SourceMutationAwarenessV1[];
}

type SnapshotRow = {
  captured_at: Date | string;
  topology_hash: string;
};

type SnapshotNodeRow = {
  node_key: string;
  packet_key: string | null;
  source_ref: string | null;
  content_hash: string | null;
  properties: Record<string, unknown> | null;
};

type CurrentPacketRow = {
  packet_key: string;
  source_ref: string;
  sha256: string | null;
  workspace_revision: number | string | null;
  representation_revision: number | string | null;
  source_representation_id: string | null;
  source_dimension: number | string | null;
  qdrant_collection: string | null;
  qdrant_vector_dim: number | string | null;
};

type MutationRow = {
  diff_hash: string;
  after_commit: string;
  created_at: Date | string;
  source_refs: string[] | null;
  changed_files: string[] | null;
};

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableInt(value: number | string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/** Normalize only path syntax that Git/source_ref routinely disagree about.
 * Deliberately preserve case: repository case rules differ across filesystems. */
export function normalizeMutationSourceRef(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
}

function sourceRefAliases(value: string): string[] {
  const normalized = normalizeMutationSourceRef(value);
  return [...new Set([value.trim(), normalized].filter(Boolean))];
}

function snapshotHashKind(row: SnapshotNodeRow | undefined): SourceMutationAwarenessV1['snapshotContentHashKind'] {
  if (!row?.content_hash) return 'none';
  const recordedPacketSha = row.properties?.sha256;
  if (typeof recordedPacketSha === 'string' && recordedPacketSha.length > 0 && recordedPacketSha === row.content_hash) {
    return 'packet_sha256';
  }
  // graph-snapshot-materializer intentionally falls back to a stable hash of
  // packet metadata when sha256 is absent. That hash MUST NOT later be compared
  // to a raw source sha256 as though they used the same hash contract.
  return 'derived_snapshot_hash';
}

/**
 * Mutation awareness is deliberately independent from embedding dimensionality.
 * source_ref + snapshot content hash + tracked git mutation provenance describe
 * source freshness. semantic_512/latent_64/legacy 768 fields are representation
 * lineage only and must never be interpreted as a source revision.
 *
 * The live atlas_packets audit found no literal source_revision column, so this
 * resolver does not fabricate one. UNKNOWN is a first-class result when neither
 * content-hash parity nor a mutation event can prove freshness.
 */
export async function loadMutationAwarenessV1(
  snapshotId: string,
  graphNodes: readonly Pick<GraphViewNodeV1, 'id' | 'packetKey' | 'sourceRef'>[],
): Promise<MutationAwarenessReceiptV1> {
  if (!snapshotId?.trim()) throw new Error('ATLAS_MUTATION_SNAPSHOT_REQUIRED');

  const snapshotResult = await pool.query<SnapshotRow>(
    `SELECT COALESCE(finalized_at, created_at) AS captured_at, topology_hash
       FROM atlas_graph_snapshots_v2
      WHERE snapshot_id = $1::uuid
      LIMIT 1`,
    [snapshotId],
  );
  if (snapshotResult.rows.length !== 1) {
    throw new Error(`ATLAS_MUTATION_SNAPSHOT_NOT_FOUND:${snapshotId}`);
  }
  const snapshotCapturedAt = asIso(snapshotResult.rows[0].captured_at);
  const topologyHash = String(snapshotResult.rows[0].topology_hash);

  const nodeKeys = [...new Set(graphNodes.map((node) => node.id).filter(Boolean))];
  const packetKeys = [...new Set(graphNodes.map((node) => node.packetKey).filter((value): value is string => Boolean(value)))];
  const sourceRefs = [...new Set(graphNodes.map((node) => node.sourceRef).filter((value): value is string => Boolean(value)))];
  const sourceRefQueryAliases = [...new Set(sourceRefs.flatMap(sourceRefAliases))];

  const snapshotNodes = nodeKeys.length === 0
    ? []
    : (await pool.query<SnapshotNodeRow>(
        `SELECT node_key, packet_key, source_ref, content_hash, properties
           FROM atlas_graph_nodes_v2
          WHERE snapshot_id = $1::uuid
            AND node_key = ANY($2::text[])`,
        [snapshotId, nodeKeys],
      )).rows;

  const currentPackets = packetKeys.length === 0
    ? []
    : (await pool.query<CurrentPacketRow>(
        `SELECT packet_key, source_ref, sha256, workspace_revision, representation_revision,
                source_representation_id, source_dimension, qdrant_collection, qdrant_vector_dim
           FROM atlas_packets
          WHERE packet_key = ANY($1::text[])`,
        [packetKeys],
      )).rows;

  let mutationRows: MutationRow[] = [];
  if (sourceRefQueryAliases.length > 0) {
    const relation = await pool.query<{ relation_name: string | null }>(
      `SELECT to_regclass('public.git_mutation_provenance')::text AS relation_name`,
    );
    if (relation.rows[0]?.relation_name) {
      // Array overlap is the index-friendly first cut. We repeat path
      // normalization in TypeScript below so slash differences do not bypass
      // invalidation if an overlapping alias brought the mutation into scope.
      mutationRows = (await pool.query<MutationRow>(
        `SELECT diff_hash, after_commit, created_at, source_refs, changed_files
           FROM git_mutation_provenance
          WHERE created_at > $1::timestamptz
            AND (source_refs && $2::text[] OR changed_files && $2::text[])
          ORDER BY created_at DESC, diff_hash`,
        [snapshotCapturedAt, sourceRefQueryAliases],
      )).rows;
    }
  }

  const snapshotNodeByKey = new Map(snapshotNodes.map((row) => [row.node_key, row]));
  const currentPacketByKey = new Map(currentPackets.map((row) => [row.packet_key, row]));
  const canonicalRequestedRefs = new Set(sourceRefs.map(normalizeMutationSourceRef));
  const latestMutationBySourceRef = new Map<string, MutationRow>();
  for (const mutation of mutationRows) {
    for (const rawSourceRef of [...(mutation.source_refs ?? []), ...(mutation.changed_files ?? [])]) {
      const sourceRef = normalizeMutationSourceRef(rawSourceRef);
      if (canonicalRequestedRefs.has(sourceRef) && !latestMutationBySourceRef.has(sourceRef)) {
        latestMutationBySourceRef.set(sourceRef, mutation);
      }
    }
  }

  const entries: SourceMutationAwarenessV1[] = graphNodes.map((graphNode) => {
    const snapshotNode = snapshotNodeByKey.get(graphNode.id);
    const packet = graphNode.packetKey ? currentPacketByKey.get(graphNode.packetKey) : undefined;
    const sourceRef = graphNode.sourceRef ?? snapshotNode?.source_ref ?? packet?.source_ref ?? null;
    const mutation = sourceRef ? latestMutationBySourceRef.get(normalizeMutationSourceRef(sourceRef)) : undefined;
    const snapshotContentHash = snapshotNode?.content_hash ?? null;
    const currentContentHash = packet?.sha256 ?? null;
    const snapshotContentHashKind = snapshotHashKind(snapshotNode);
    const contentHashMatch = snapshotContentHashKind === 'packet_sha256' && snapshotContentHash && currentContentHash
      ? snapshotContentHash === currentContentHash
      : null;

    let status: SourceMutationStatusV1 = 'UNKNOWN';
    let reason: SourceMutationAwarenessV1['reason'] = 'INSUFFICIENT_VERSION_EVIDENCE';

    if (!sourceRef) {
      status = 'UNKNOWN';
      reason = 'SOURCE_REF_MISSING';
    } else if (graphNode.packetKey && !packet) {
      status = 'MISSING';
      reason = 'CURRENT_PACKET_MISSING';
    } else if (mutation) {
      status = 'STALE';
      reason = 'TRACKED_MUTATION_AFTER_SNAPSHOT';
    } else if (contentHashMatch === false) {
      status = 'STALE';
      reason = 'CONTENT_HASH_MISMATCH';
    } else if (contentHashMatch === true) {
      status = 'FRESH';
      reason = 'CONTENT_HASH_MATCH';
    }

    return {
      nodeKey: graphNode.id,
      packetKey: graphNode.packetKey,
      sourceRef,
      status,
      reason,
      snapshotContentHash,
      snapshotContentHashKind,
      currentContentHash,
      contentHashMatch,
      trackedMutationAfterSnapshot: Boolean(mutation),
      latestMutationCommit: mutation?.after_commit ?? null,
      latestMutationDiffHash: mutation?.diff_hash ?? null,
      latestMutationAt: mutation ? asIso(mutation.created_at) : null,
      currentWorkspaceRevision: nullableInt(packet?.workspace_revision ?? null),
      currentRepresentationRevision: nullableInt(packet?.representation_revision ?? null),
      currentSourceRepresentationId: packet?.source_representation_id ?? null,
      currentSourceDimension: nullableInt(packet?.source_dimension ?? null),
      currentQdrantCollection: packet?.qdrant_collection ?? null,
      currentQdrantVectorDim: nullableInt(packet?.qdrant_vector_dim ?? null),
    };
  });

  const freshCount = entries.filter((entry) => entry.status === 'FRESH').length;
  const staleCount = entries.filter((entry) => entry.status === 'STALE').length;
  const unknownCount = entries.filter((entry) => entry.status === 'UNKNOWN').length;
  const missingCount = entries.filter((entry) => entry.status === 'MISSING').length;

  return {
    schema: 'atlas.mutation-awareness-receipt.v1',
    snapshotId,
    snapshotCapturedAt,
    topologyHash,
    sourceRevisionColumnAvailable: false,
    proofPolicy: 'content-hash-plus-tracked-git-provenance',
    checkedNodes: entries.length,
    freshCount,
    staleCount,
    unknownCount,
    missingCount,
    trackedMutationCount: mutationRows.length,
    requiresRehydration: staleCount > 0 || missingCount > 0,
    entries,
  };
}
