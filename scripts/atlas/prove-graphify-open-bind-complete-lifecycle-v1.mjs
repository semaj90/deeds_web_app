// GRAPHIFY-OPEN-CLOSE-WIRING-01 live proof: open a bare RUNNING row (workspace_revision NULL),
// bind a real WorkspaceRevisionRecordV1 to it later, then complete it. Uses a throwaway test
// row only -- never touches the 5 historical stale rows or the real completed full-corpus run.
import pg from 'pg';

const workspaceId = process.argv[2];
if (!workspaceId) {
  console.error('usage: prove-graphify-open-bind-complete-lifecycle-v1.mjs <workspaceId>');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
const client = await pool.connect();
try {
  const {
    openGraphifyRunInTransactionV1,
    bindWorkspaceRevisionInTransactionV1,
    completeGraphifyRunInTransactionV2,
  } = await import(
    '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts'
  );
  const wrappedClient = { query: (text, values) => client.query(text, values) };

  await client.query('BEGIN');
  const opened = await openGraphifyRunInTransactionV1({
    client: wrappedClient,
    workspaceId,
    repositoryRevision: 'proof-lifecycle-test',
    parserContractVersion: 'graphify.open-close-proof.v1',
    extractionContractVersion: 'graphify.open-close-proof.v1',
    configuration: { proofOnly: true },
  });
  await client.query('COMMIT');
  console.log(JSON.stringify({ step: 'opened', opened }, null, 2));

  // Independent readback: confirm a RUNNING row with NULL workspace_revision genuinely exists.
  const midCheck = await client.query(
    'SELECT status, workspace_revision FROM graphify_runs WHERE run_id = $1',
    [opened.runId],
  );
  console.log(JSON.stringify({ step: 'independent_sql_check_after_open', row: midCheck.rows[0] }));

  const fakeRecord = {
    schema: 'atlas.workspace-revision.v1',
    workspaceRevision: 'sha256:' + '1'.repeat(64),
    repositoryId: 'proof-lifecycle-test',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'a'.repeat(40),
    baseTreeOid: 'b'.repeat(40),
    gitHeadRef: null,
    dirty: false,
    sourceCount: 1,
    sourceManifestDigest: '1'.repeat(64),
    sourceRevisionAlgorithm: 'atlas.code.source-revision.v1',
    generatedAt: new Date().toISOString(),
    readOnlyObservation: true,
    canonicalAuthority: false,
    producerRevision: 'proof-lifecycle-test',
    checksum: '2'.repeat(64),
  };

  await client.query('BEGIN');
  const bound = await bindWorkspaceRevisionInTransactionV1({
    client: wrappedClient,
    runId: opened.runId,
    workspaceId,
    record: fakeRecord,
  });
  await client.query('COMMIT');
  console.log(JSON.stringify({ step: 'bound', bound }, null, 2));

  await client.query('BEGIN');
  const completed = await completeGraphifyRunInTransactionV2({
    client: wrappedClient,
    runId: opened.runId,
    workspaceId,
  });
  await client.query('COMMIT');
  console.log(JSON.stringify({ step: 'completed', completed }, null, 2));

  const finalCheck = await client.query(
    'SELECT status, workspace_revision, completed_at FROM graphify_runs WHERE run_id = $1',
    [opened.runId],
  );
  console.log(JSON.stringify({ step: 'independent_sql_check_final', row: finalCheck.rows[0] }));

  // Cleanup: this is a throwaway test row, always removed.
  await client.query('DELETE FROM graphify_runs WHERE run_id = $1', [opened.runId]);
  console.log(JSON.stringify({ step: 'cleanup_deleted', runId: opened.runId }));
} finally {
  client.release();
  await pool.end();
}
