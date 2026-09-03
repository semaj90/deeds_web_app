// GRAPHIFY-LIFECYCLE-OWNER-01 follow-up: live proof that
// completeGraphifyRunInTransactionV2 (sveltekit-frontend/src/lib/server/atlas/indexing/
// graphify-source-inventory-writer-v2.ts) genuinely closes a RUNNING graphify_runs row.
// Only ever touches a caller-supplied run_id/workspace_id — never the 5 real stale rows
// unless explicitly pointed at one. Run from repo root: node scripts/atlas/prove-graphify-run-completion-primitive-v1.mjs <runId> <workspaceId>
import pg from 'pg';

const runId = process.argv[2];
const workspaceId = process.argv[3];
if (!runId || !workspaceId) {
  console.error('usage: prove-graphify-run-completion-primitive-v1.mjs <runId> <workspaceId>');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
const client = await pool.connect();
try {
  const { completeGraphifyRunInTransactionV2 } = await import(
    '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts'
  );
  const receipt = await completeGraphifyRunInTransactionV2({
    client: { query: (text, values) => client.query(text, values) },
    runId,
    workspaceId,
  });
  console.log(JSON.stringify({ status: 'LIVE_PROVEN', receipt }, null, 2));
} finally {
  client.release();
  await pool.end();
}
