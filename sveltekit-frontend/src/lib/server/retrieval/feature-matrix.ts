/**
 * Feature Matrix Assembly — Domain 4 of the retrieval LOD taxonomy
 * (openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy).
 *
 * Reads the existing GraphV2 PageRank projection (`atlas_graph_authority_scores_v2`)
 * for an exact validated snapshot and converged authority run. Domain 5 (weighted scoring) is NOT a new module — it
 * already exists correctly as `runtime-reranker.ts::blendScores()`; this module
 * only supplies the previously-missing `graph` signal input to that function.
 *
 * Postgres is truth for this table (project hard rule) — no Redis-fronted cache
 * is added here. `gpu:karpathy:scores` (Redis) is a separate, already-live
 * authority blend used by a different retrieval path (`orchestrator.ts`); it is
 * deliberately not read here to avoid coupling two authority sources into one
 * candidate-scoring stage in a single change.
 */

import { sql } from 'drizzle-orm';

async function getDb() {
  const mod = await import('$lib/server/db/client.js');
  return mod.db;
}

export interface AuthorityLookupInput {
  identities: readonly { packetKey: string; sourceRef: string; sourceRevision: string }[];
  workspaceRevision: string;
  graphRevision: string;
}

/**
 * Batch-fetch authority_percentile for candidates from the exact GraphV2
 * snapshot and a PASSED, converged PageRank run. Neither legacy promotion
 * state nor a recent timestamp substitutes for matching snapshot identity.
 *
 * Resolve scores through the score's GraphV2 node and its packet binding.
 * A source-only fallback is returned only when it is unambiguous among the
 * requested, exact-revision packet identities.
 *
 * Graceful degradation: returns an empty Map on any failure (missing table,
 * connection error, no promoted run) rather than throwing — matches the
 * pattern used by `neo4j-graph-signal.ts`'s empty-response fallback.
 */
export async function fetchAuthorityScores(
  input: AuthorityLookupInput,
): Promise<Map<string, number>> {
  const workspaceRevision = input.workspaceRevision.trim();
  const graphRevision = input.graphRevision.trim();
  if (!/^sha256:[a-f0-9]{64}$/i.test(workspaceRevision) || !/^[a-f0-9]{64}$/i.test(graphRevision)) return new Map();

  const identities = [...new Map(input.identities
    .filter((identity) => identity.packetKey.trim() && identity.sourceRef.trim() && /^sha256:[a-f0-9]{64}$/i.test(identity.sourceRevision.trim()))
    .map((identity) => [`${identity.packetKey}\u001f${identity.sourceRef}\u001f${identity.sourceRevision}`, {
      packetKey: identity.packetKey.trim(), sourceRef: identity.sourceRef.trim(), sourceRevision: identity.sourceRevision.trim(),
    }])).values()];
  if (identities.length === 0 || identities.length > 256) return new Map();
  const packetIdentitySets = new Map<string, Set<string>>();
  for (const identity of identities) {
    const packetIdentities = packetIdentitySets.get(identity.packetKey) ?? new Set<string>();
    packetIdentities.add(`${identity.sourceRef}\u001f${identity.sourceRevision}`);
    packetIdentitySets.set(identity.packetKey, packetIdentities);
  }
  if ([...packetIdentitySets.values()].some((packetIdentities) => packetIdentities.size !== 1)) return new Map();
  const packetKeys = [...new Set(identities.map((identity) => identity.packetKey))];
  const sourceRefs = [...new Set(identities.map((identity) => identity.sourceRef))];
  const sourceRevisions = [...new Set(identities.map((identity) => identity.sourceRevision))];
  const expectedPacketIdentity = new Map(identities.map((identity) => [
    identity.packetKey,
    `${identity.sourceRef}\u001f${identity.sourceRevision}`,
  ]));
  const sourceRevisionSets = new Map<string, Set<string>>();
  for (const identity of identities) {
    const revisions = sourceRevisionSets.get(identity.sourceRef) ?? new Set<string>();
    revisions.add(identity.sourceRevision);
    sourceRevisionSets.set(identity.sourceRef, revisions);
  }
  const expectedSourceRevision = new Map([...sourceRevisionSets]
    .filter(([, revisions]) => revisions.size === 1)
    .map(([sourceRef, revisions]) => [sourceRef, [...revisions][0]]));

  try {
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT p.packet_key AS matched_packet_key, p.source_ref AS matched_source_ref,
             p.source_revision AS matched_source_revision, s.authority_percentile
      FROM atlas_graph_authority_scores_v2 s
      JOIN atlas_graph_authority_runs_v2 r
        ON r.run_id = s.run_id
       AND r.snapshot_id = s.snapshot_id
       AND r.algorithm = 'pagerank'
       AND r.status = 'PASSED'
       AND r.did_converge = true
      JOIN atlas_graph_snapshots_v2 snap
        ON snap.snapshot_id = s.snapshot_id
       AND snap.source_manifest->>'workspaceRevision' = ${workspaceRevision}
       AND snap.topology_hash = ${graphRevision}
       AND snap.status = 'VALIDATED'
       AND snap.topology_hash = r.topology_hash
       AND snap.topology_hash = s.topology_hash
      JOIN atlas_graph_nodes_v2 n
        ON n.snapshot_id = s.snapshot_id
       AND n.node_key = s.node_key
      JOIN atlas_packets p
        ON p.workspace_revision_key = snap.source_manifest->>'workspaceRevision'
       AND p.packet_key = n.packet_key
       AND p.source_ref = n.source_ref
       AND p.source_revision = n.properties->>'sourceRevision'
       AND n.properties->>'workspaceRevision' = snap.source_manifest->>'workspaceRevision'
       AND (s.packet_key IS NULL OR s.packet_key = p.packet_key)
       AND (
         p.packet_key = ANY(${packetKeys}::text[])
         OR p.source_ref = ANY(${sourceRefs}::text[])
       )
      WHERE p.source_revision = ANY(${sourceRevisions}::text[])
    `);

    type AuthorityRow = {
      matched_packet_key: string;
      matched_source_ref: string;
      matched_source_revision: string;
      authority_percentile: number | string;
    };

    const bySourceRef = new Map<string, number>();
    const packetScores = new Map<string, Set<number>>();
    const sourceScores = new Map<string, Set<number>>();

    for (const row of result.rows as AuthorityRow[]) {
      const score = typeof row.authority_percentile === 'string'
        ? Number.parseFloat(row.authority_percentile)
        : row.authority_percentile;
      if (!Number.isFinite(score) || score < 0 || score > 1) continue;
      if (expectedPacketIdentity.get(row.matched_packet_key) === `${row.matched_source_ref}\u001f${row.matched_source_revision}`) {
        const scores = packetScores.get(row.matched_packet_key) ?? new Set<number>();
        scores.add(score);
        packetScores.set(row.matched_packet_key, scores);
      }
      if (expectedSourceRevision.get(row.matched_source_ref) === row.matched_source_revision) {
        const scores = sourceScores.get(row.matched_source_ref) ?? new Set<number>();
        scores.add(score);
        sourceScores.set(row.matched_source_ref, scores);
      }
    }
    for (const [sourceRef, scores] of sourceScores) {
      if (scores.size === 1) bySourceRef.set(sourceRef, [...scores][0]!);
    }
    const byPacketKey = new Map<string, number>();
    for (const [packetKey, scores] of packetScores) {
      if (scores.size === 1) byPacketKey.set(packetKey, [...scores][0]!);
    }

    // packet_key wins where both matched — same precedence as identity-resolution.ts
    return new Map([...bySourceRef, ...byPacketKey]);
  } catch (err) {
    console.warn('[feature-matrix] authority lookup unavailable:', err);
    return new Map();
  }
}

/**
 * Resolve one candidate's authority score from the batch map, trying
 * packet_key first, then source_ref. Returns undefined (not 0) when no row
 * matched, so `blendScores()`'s `score === undefined` guard correctly excludes
 * it from the weighted blend instead of treating "no data" as "zero authority".
 */
export function resolveAuthorityScore(
  authority: Map<string, number>,
  packetKey: string | null | undefined,
  sourceRef: string | null | undefined,
): number | undefined {
  if (packetKey && authority.has(packetKey)) return authority.get(packetKey);
  if (sourceRef && authority.has(sourceRef)) return authority.get(sourceRef);
  return undefined;
}
