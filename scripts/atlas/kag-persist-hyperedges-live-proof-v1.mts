import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

// db/client.ts reads its connection string from SvelteKit's $env wrapper
// (ENV.DATABASE_URL), which is empty under a bare `tsx` invocation outside
// the SvelteKit runtime. Set it explicitly from the same repo-env resolution
// the other proof script already uses, BEFORE importing anything that
// transitively imports db/client.ts (hence the dynamic imports below).
process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createHyperedgeV1 } = await import('../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts');
const { persistHyperedges } = await import('../../sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts');

/**
 * KAG-05 live proof for persistHyperedges() (the new in-process persistence
 * function, as opposed to the offline JSONL CLI materializer).
 *
 * Unlike kag-hypergraph-roundtrip-proof-v1.mts (transaction+ROLLBACK), this
 * function commits per edge internally (that's the point — it's the live
 * write path), so this proof explicitly cleans up the rows it wrote via
 * DELETE on a distinctive test-only contract_hyperedge_id/predicate, and
 * verifies that cleanup succeeded before exiting.
 */

const { Pool } = pg;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const goodEdge = createHyperedgeV1({
    predicate: 'KAG_05_PERSIST_LIVE_PROOF',
    participants: [
      { canonicalId: 'symbol:live-a', role: 'caller', ordinal: 0 },
      { canonicalId: 'symbol:live-b', role: 'callee', ordinal: 1 },
    ],
    evidenceRefs: ['packet:kag-05-live-proof'],
    workspaceRevision: 'workspace:kag-05-live-proof',
    graphRevision: 'graph:kag-05-live-proof',
    sourceRevision: 'source:kag-05-live-proof',
    producerRevision: 'kag-05-live-proof:v1',
  });

  const report: Record<string, unknown> = { schema: 'atlas.kag.persist-hyperedges-live-proof.v1' };

  const persistResult = await persistHyperedges([goodEdge]);
  report.persistResult = persistResult;
  assert(persistResult.attempted === 1 && persistResult.written === 1 && persistResult.errors.length === 0, `expected clean write, got ${JSON.stringify(persistResult)}`);

  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
  try {
    const readback = await pool.query(
      `SELECT h.hyperedge_id, h.checksum, h.evidence_refs, m.member_id, m.member_role, m.ordinal
       FROM atlas_hyperedges h JOIN atlas_hyperedge_members m ON m.hyperedge_id = h.hyperedge_id
       WHERE h.contract_hyperedge_id = $1 ORDER BY m.ordinal`,
      [goodEdge.hyperedgeId],
    );
    assert(readback.rows.length === 2, `expected 2 member rows persisted, got ${readback.rows.length}`);
    assert(readback.rows[0].checksum === goodEdge.checksum, 'checksum mismatch on real (non-rollback) readback');
    assert(readback.rows[0].member_id === 'symbol:live-a' && readback.rows[1].member_id === 'symbol:live-b', 'member order not preserved');
    report.readback = readback.rows;

    // Cleanup: delete the test-only rows this proof committed (cascade
    // removes the member rows too), then verify deletion succeeded.
    const deleted = await pool.query('DELETE FROM atlas_hyperedges WHERE contract_hyperedge_id = $1 RETURNING hyperedge_id', [goodEdge.hyperedgeId]);
    assert(deleted.rows.length === 1, 'cleanup DELETE did not remove the test row');
    const verifyGone = await pool.query('SELECT count(*) FROM atlas_hyperedge_members WHERE hyperedge_id = $1', [deleted.rows[0].hyperedge_id]);
    assert(Number(verifyGone.rows[0].count) === 0, 'member rows survived cascade delete');

    report.status = 'PROVEN';
    report.cleanup = 'VERIFIED_REMOVED';
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
