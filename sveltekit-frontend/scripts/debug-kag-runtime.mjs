#!/usr/bin/env node
/**
 * Debug KAG runtime: test the exact same queries that graph-context.ts runs
 * and verify they return data when called through the same PG connection.
 */
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });

const CASE_ID = 'c9b79f5d-5d81-40ee-9c60-4945a6b38287';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

async function main() {
  console.log('=== KAG Runtime Debug ===\n');

  // 1. Validate UUID
  console.log(`UUID valid: ${UUID_PATTERN.test(CASE_ID)}`);

  // 2. Check case exists in cases table
  const caseResult = await pool.query('SELECT id, title FROM cases WHERE id = $1', [CASE_ID]);
  console.log(`Case in cases table: ${caseResult.rows.length > 0 ? caseResult.rows[0].title : 'MISSING'}`);

  // 3. Get active nodes
  const nodeResult = await pool.query(
    'SELECT n.id AS node_id, n.title, n.evidence_type FROM yorha_evidence_nodes n WHERE n.status = $1 AND n.case_id = $2 LIMIT 50',
    ['active', CASE_ID]
  );
  console.log(`Active nodes: ${nodeResult.rows.length}`);

  if (!nodeResult.rows.length) {
    console.log('FATAL: No nodes found — KAG will return []');
    return;
  }

  // 4. Get connections
  const nodeIds = nodeResult.rows.map(r => r.node_id);
  const nodeIdStr = nodeIds.map(id => `'${id}'`).join(',');

  const connResult = await pool.query(`
    SELECT DISTINCT ON (neighbor_id)
      neighbor_id, neighbor_title, neighbor_type, neighbor_file_path,
      connection_type, strength, confidence_score
    FROM (
      SELECT tn.id AS neighbor_id, tn.title AS neighbor_title,
        tn.evidence_type AS neighbor_type, tn.file_path AS neighbor_file_path,
        c.connection_type, c.strength, c.confidence_score
      FROM yorha_evidence_connections c
      JOIN yorha_evidence_nodes tn ON tn.id = c.target_node_id
      WHERE c.source_node_id IN (${nodeIdStr})
      AND c.case_id = $1
      UNION ALL
      SELECT tn.id AS neighbor_id, tn.title AS neighbor_title,
        tn.evidence_type AS neighbor_type, tn.file_path AS neighbor_file_path,
        c.connection_type, c.strength, c.confidence_score
      FROM yorha_evidence_connections c
      JOIN yorha_evidence_nodes tn ON tn.id = c.source_node_id
      WHERE c.target_node_id IN (${nodeIdStr})
      AND c.case_id = $1
    ) sub
    ORDER BY neighbor_id, strength DESC, confidence_score DESC
    LIMIT 15
  `, [CASE_ID]);

  console.log(`Graph neighbors: ${connResult.rows.length}`);

  // 5. Build filter (same logic as buildGraphShouldFilter)
  const strong = connResult.rows.filter(n => n.strength >= 30);
  console.log(`Strong neighbors (str >= 30): ${strong.length}`);

  const allIds = new Set();
  for (const n of strong) {
    allIds.add(n.neighbor_id);
    const matches = (n.neighbor_file_path || '').match(UUID_IN_PATH);
    if (matches) matches.forEach(m => allIds.add(m));
  }
  const matchIds = [...allIds];
  console.log(`Filter IDs (node + evidence): ${matchIds.length}`);

  // 6. Check the SvelteKit DB connection (same pool)
  console.log('\n--- Connection pool test ---');
  const testResult = await pool.query('SELECT current_database(), current_user');
  console.log(`Database: ${testResult.rows[0].current_database}, User: ${testResult.rows[0].current_user}`);

  // 7. Verify the exact Drizzle-style query would work
  // The SvelteKit graph-context.ts uses sql`` template tags which produce parameterized queries
  // The key question: does the SvelteKit server connect to the SAME postgres instance?
  console.log('\n--- Drizzle connection check ---');
  // Check DATABASE_URL env
  console.log(`DATABASE_URL env: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
  console.log(`Connection used: postgresql://legal_admin:***@127.0.0.1:5434/legal_ai_db`);

  // 8. Test what happens when the function is called but error is caught
  console.log('\n--- Error swallowing test ---');
  try {
    // This simulates what happens if the DB query throws
    // The .catch(() => []) in SSE chat would swallow it
    throw new Error('Test error');
  } catch (e) {
    console.log(`Error caught: ${e.message} — if this were the KAG call, [] would be returned`);
  }

  console.log('\n=== DIAGNOSIS ===');
  if (connResult.rows.length > 0) {
    console.log('Data EXISTS in DB. If KAG returns 0, the issue is:');
    console.log('  1. SvelteKit server connects to DIFFERENT PG instance');
    console.log('  2. getCaseGraphNeighborIds throws and .catch(() => []) swallows the error');
    console.log('  3. caseUuid not extracted from conversationId');
    console.log('\nRecommendation: Add console.log BEFORE the .catch() in SSE chat to debug');
  } else {
    console.log('NO DATA — seed connections first');
  }
}

main().catch(console.error).finally(() => pool.end());
