import { pool } from '$lib/server/db/client.js';
import { HyperedgeV1Schema, type HyperedgeV1 } from '../graph/hyperedge-contract.js';
import { toAtlasHyperedgePersistenceRowsV1 } from './integration/kag-persistence-row-v1.js';

/**
 * KAG-05 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
 *
 * Live in-process counterpart to `scripts/atlas/materialize-kag-contracts-v1.mts`.
 * Before this file, the only writer of `HyperedgeV1` into `atlas_hyperedges` /
 * `atlas_hyperedge_members` was that offline CLI script, which reads a JSONL
 * file from disk — there was no way for a server-side call site (e.g. a
 * promotion gate like `promoteTaxonomyAssignmentV1`) to persist a HyperedgeV1
 * it just built, in-process, without round-tripping through a file.
 *
 * Uses the exact same INSERT/ON CONFLICT shape as the CLI script (kept in
 * sync via the shared `toAtlasHyperedgePersistenceRowsV1` mapper) so both
 * paths write identically-shaped rows.
 *
 * Each edge (header + its members) is persisted in its own transaction —
 * atomic per edge (a header row is never left without its members or vice
 * versa), but one edge's failure does not roll back others in the same
 * batch. This mirrors `persistOntologyLinkedTuples`'s per-item error
 * isolation, extended to the multi-statement case.
 */
export async function persistHyperedges(
  edges: readonly HyperedgeV1[]
): Promise<{ attempted: number; written: number; errors: Array<{ hyperedgeId: string; message: string }> }> {
  const result = { attempted: 0, written: 0, errors: [] as Array<{ hyperedgeId: string; message: string }> };
  if (edges.length === 0) return result;

  const client = await pool.connect();
  try {
    for (const edge of edges) {
      result.attempted += 1;
      try {
        const { hyperedge: row, members } = toAtlasHyperedgePersistenceRowsV1(edge);

        await client.query('BEGIN');

        const insertResult = await client.query<{ hyperedge_id: string }>(
          `INSERT INTO atlas_hyperedges
            (contract_hyperedge_id, relation_type, schema_id, schema_version,
             source_ref_key, packet_key, workspace_revision, source_revision,
             graph_revision, producer_revision, evidence_hash, evidence_refs,
             checksum, properties, lifecycle, provenance, extractor_version, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   $13, $14::jsonb, $15, $16::jsonb, $17, $18)
           ON CONFLICT (contract_hyperedge_id) WHERE contract_hyperedge_id IS NOT NULL
           DO UPDATE SET properties = EXCLUDED.properties,
             lifecycle = EXCLUDED.lifecycle,
             provenance = EXCLUDED.provenance,
             confidence = EXCLUDED.confidence
           WHERE atlas_hyperedges.relation_type IS NOT DISTINCT FROM EXCLUDED.relation_type
             AND atlas_hyperedges.packet_key IS NOT DISTINCT FROM EXCLUDED.packet_key
             AND atlas_hyperedges.workspace_revision IS NOT DISTINCT FROM EXCLUDED.workspace_revision
             AND atlas_hyperedges.source_revision IS NOT DISTINCT FROM EXCLUDED.source_revision
             AND atlas_hyperedges.graph_revision IS NOT DISTINCT FROM EXCLUDED.graph_revision
             AND atlas_hyperedges.producer_revision IS NOT DISTINCT FROM EXCLUDED.producer_revision
             AND atlas_hyperedges.evidence_hash IS NOT DISTINCT FROM EXCLUDED.evidence_hash
             AND atlas_hyperedges.evidence_refs IS NOT DISTINCT FROM EXCLUDED.evidence_refs
             AND atlas_hyperedges.checksum IS NOT DISTINCT FROM EXCLUDED.checksum
           RETURNING hyperedge_id`,
          [row.contractHyperedgeId, row.relationType, row.schemaId, row.schemaVersion,
            row.sourceRefKey, row.packetKey, row.workspaceRevision, row.sourceRevision,
            row.graphRevision, row.producerRevision, row.evidenceHash, row.evidenceRefs,
            row.checksum, JSON.stringify(row.properties), row.lifecycle,
            JSON.stringify(row.provenance), row.extractorVersion, row.confidence],
        );

        const hyperedgeId = insertResult.rows[0]?.hyperedge_id;
        // The conflict update above only fires when every identity/revision field matches the stored
        // row, so no returned id means the same contract id arrived with a different revision, checksum
        // or evidence set. History is never overwritten in place; the edge is rolled back and reported.
        if (!hyperedgeId) throw new Error(`KAG_HYPEREDGE_REVISION_CONFLICT:${row.contractHyperedgeId}`);

        for (const member of members) {
          await client.query(
            `INSERT INTO atlas_hyperedge_members
              (hyperedge_id, member_id, member_type, member_role, ordinal)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (hyperedge_id, member_id, member_role)
             DO UPDATE SET member_type = EXCLUDED.member_type, ordinal = EXCLUDED.ordinal`,
            [hyperedgeId, member.memberId, member.memberType, member.memberRole, member.ordinal],
          );
        }

        await client.query('COMMIT');
        result.written += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        result.errors.push({ hyperedgeId: edge.hyperedgeId, message: (err as Error)?.message ?? String(err) });
      }
    }
  } finally {
    client.release();
  }

  return result;
}

/**
 * GRAPH-PROD-01: bulk read every real HyperedgeV1 currently persisted. Round
 * trips the exact checksum stored at write time (does not recompute) --
 * this is a read-back-fidelity boundary, not a re-derivation.
 *
 * N+1 query shape (one members SELECT per header) is intentional for now:
 * atlas_hyperedges has 0 real rows as of 2026-08-26, so query-count
 * optimization is premature. Revisit if/when real volume exists.
 */
export async function readAllHyperedgesFromPostgres(): Promise<HyperedgeV1[]> {
  const client = await pool.connect();
  try {
    const headers = await client.query<{
      hyperedge_id: string;
      contract_hyperedge_id: string;
      relation_type: string;
      workspace_revision: string;
      source_revision: string;
      graph_revision: string;
      producer_revision: string;
      evidence_refs: string[];
      checksum: string;
    }>(`
      SELECT hyperedge_id, contract_hyperedge_id, relation_type, workspace_revision,
        source_revision, graph_revision, producer_revision, evidence_refs, checksum
      FROM atlas_hyperedges
      WHERE contract_hyperedge_id IS NOT NULL
      ORDER BY contract_hyperedge_id
    `);

    const edges: HyperedgeV1[] = [];
    for (const header of headers.rows) {
      const members = await client.query<{ member_id: string; member_role: string; ordinal: number }>(
        `SELECT member_id, member_role, ordinal FROM atlas_hyperedge_members
         WHERE hyperedge_id = $1 ORDER BY ordinal`,
        [header.hyperedge_id],
      );
      edges.push(HyperedgeV1Schema.parse({
        schemaVersion: 'atlas.hyperedge.v1',
        hyperedgeId: header.contract_hyperedge_id,
        predicate: header.relation_type,
        participants: members.rows.map((member) => ({
          canonicalId: member.member_id,
          role: member.member_role,
          ordinal: member.ordinal,
        })),
        evidenceRefs: header.evidence_refs,
        workspaceRevision: header.workspace_revision,
        graphRevision: header.graph_revision,
        sourceRevision: header.source_revision,
        producerRevision: header.producer_revision,
        checksum: header.checksum,
      }));
    }
    return edges;
  } finally {
    client.release();
  }
}
