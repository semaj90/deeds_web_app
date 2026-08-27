import pg from 'pg';
import { createHyperedgeV1, HyperedgeV1Schema, type HyperedgeParticipantV1 } from '../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts';
import { toAtlasHyperedgePersistenceRowsV1 } from '../../sveltekit-frontend/src/lib/server/atlas/integration/kag-persistence-row-v1.ts';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

/**
 * KAG-05C/05D live proof (non-destructive: runs inside a transaction that is
 * always ROLLBACK'd, never COMMIT'd).
 *
 * KAG-05C: HyperedgeV1 -> Postgres row -> readback -> HyperedgeV1Schema.parse
 * -> checksum must equal the original. Proves round-trip fidelity through the
 * exact INSERT shape used by scripts/atlas/materialize-kag-contracts-v1.mts.
 *
 * KAG-05D: atlas_hyperedge_members has exactly one ordinal concept (the
 * `ordinal` column, carrying HyperedgeParticipantV1.ordinal — semantic
 * argument/event order). There is no separate physical row-insertion-order
 * column, so nothing can conflate storage order with semantic order. This
 * script proves it directly: members are inserted in an order that does NOT
 * match their semantic ordinals, then readback (ORDER BY ordinal) must still
 * reconstruct the correct semantic sequence.
 */

const { Pool } = pg;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const edge = createHyperedgeV1({
    predicate: 'KAG_05C_ROUNDTRIP_PROOF',
    participants: [
      { canonicalId: 'symbol:c', role: 'third', ordinal: 2 },
      { canonicalId: 'symbol:a', role: 'first', ordinal: 0 },
      { canonicalId: 'symbol:b', role: 'second', ordinal: 1 },
    ],
    evidenceRefs: ['packet:kag-05c-proof'],
    workspaceRevision: 'workspace:kag-05c-proof',
    graphRevision: 'graph:kag-05c-proof',
    sourceRevision: 'source:kag-05c-proof',
    producerRevision: 'kag-05c-proof:v1',
  });

  const { hyperedge: row, members } = toAtlasHyperedgePersistenceRowsV1(edge);

  // KAG-05D setup: members are already sorted by ordinal by
  // toAtlasHyperedgePersistenceRowsV1. Deliberately insert them in REVERSE
  // physical order so storage order cannot be mistaken for semantic order.
  const membersInsertOrder = [...members].reverse();

  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
  const client = await pool.connect();
  const report: Record<string, unknown> = { schema: 'atlas.kag.roundtrip-proof.v1', hyperedgeId: edge.hyperedgeId };

  try {
    await client.query('BEGIN');

    const insertResult = await client.query<{ hyperedge_id: string }>(
      `INSERT INTO atlas_hyperedges
        (contract_hyperedge_id, relation_type, schema_id, schema_version,
         source_ref_key, packet_key, workspace_revision, source_revision,
         graph_revision, producer_revision, evidence_hash, evidence_refs,
         checksum, properties, lifecycle, provenance, extractor_version, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14::jsonb, $15, $16::jsonb, $17, $18)
       RETURNING hyperedge_id`,
      [row.contractHyperedgeId, row.relationType, row.schemaId, row.schemaVersion,
        row.sourceRefKey, row.packetKey, row.workspaceRevision, row.sourceRevision,
        row.graphRevision, row.producerRevision, row.evidenceHash, row.evidenceRefs,
        row.checksum, JSON.stringify(row.properties), row.lifecycle,
        JSON.stringify(row.provenance), row.extractorVersion, row.confidence],
    );
    const hyperedgeId = insertResult.rows[0]?.hyperedge_id;
    assert(hyperedgeId, 'INSERT did not return hyperedge_id');

    for (const member of membersInsertOrder) {
      await client.query(
        `INSERT INTO atlas_hyperedge_members
          (hyperedge_id, member_id, member_type, member_role, ordinal)
         VALUES ($1, $2, $3, $4, $5)`,
        [hyperedgeId, member.memberId, member.memberType, member.memberRole, member.ordinal],
      );
    }

    // Readback exactly as kag-hypergraph-reader-v1.ts does (join on
    // contract_hyperedge_id, no ORDER BY needed for correctness — the proof
    // below sorts client-side by the `ordinal` column, same as the reader).
    const readback = await client.query<{
      relation_type: string; workspace_revision: string; source_revision: string;
      graph_revision: string; producer_revision: string; evidence_refs: string[];
      checksum: string; member_id: string; member_role: string; ordinal: number | null;
    }>(
      `SELECT h.relation_type, h.workspace_revision, h.source_revision, h.graph_revision,
              h.producer_revision, h.evidence_refs, h.checksum,
              m.member_id, m.member_role, m.ordinal
       FROM atlas_hyperedges h
       JOIN atlas_hyperedge_members m ON m.hyperedge_id = h.hyperedge_id
       WHERE h.contract_hyperedge_id = $1`,
      [edge.hyperedgeId],
    );

    assert(readback.rows.length === members.length, `expected ${members.length} member rows, got ${readback.rows.length}`);

    const first = readback.rows[0];
    const participants: HyperedgeParticipantV1[] = readback.rows
      .map((r) => ({ canonicalId: r.member_id, role: r.member_role, ordinal: r.ordinal ?? undefined }))
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));

    const reconstructed = HyperedgeV1Schema.parse({
      schemaVersion: 'atlas.hyperedge.v1' as const,
      hyperedgeId: edge.hyperedgeId,
      predicate: first.relation_type,
      participants,
      evidenceRefs: first.evidence_refs,
      workspaceRevision: first.workspace_revision,
      graphRevision: first.graph_revision,
      sourceRevision: first.source_revision,
      producerRevision: first.producer_revision,
      checksum: first.checksum,
    });

    // KAG-05C: checksum must survive the round trip unchanged.
    assert(reconstructed.checksum === edge.checksum, `checksum mismatch: ${reconstructed.checksum} !== ${edge.checksum}`);

    // KAG-05D: semantic order reconstructed from the `ordinal` column must
    // match the ORIGINAL participant order, even though physical insertion
    // order was reversed.
    const expectedOrder = ['symbol:a', 'symbol:b', 'symbol:c'];
    const actualOrder = participants.map((p) => p.canonicalId);
    assert(
      JSON.stringify(actualOrder) === JSON.stringify(expectedOrder),
      `semantic order not preserved despite reversed physical insert: got ${JSON.stringify(actualOrder)}, expected ${JSON.stringify(expectedOrder)}`,
    );

    report.status = 'PROVEN';
    report.checksumRoundtrip = { original: edge.checksum, reconstructed: reconstructed.checksum, match: true };
    report.ordinalRoundtrip = { physicalInsertOrder: membersInsertOrder.map((m) => m.memberId), semanticReadbackOrder: actualOrder, match: true };
  } catch (error) {
    report.status = 'FAILED';
    report.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    // Non-destructive: never commit. The transaction (and every row it
    // touched) is discarded, whether the proof passed or failed.
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
