#!/usr/bin/env node
/**
 * Direct test of KAG graph functions against seeded data.
 * Simulates getCaseGraphNeighborIds() + buildGraphShouldFilter() without the SvelteKit server.
 */
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });

const CASE_ID = 'c9b79f5d-5d81-40ee-9c60-4945a6b38287';

async function main() {
  // Step 1: getCaseGraphNeighborIds() simulation
  console.log('=== Step 1: getCaseGraphNeighborIds() ===\n');

  const nodeResult = await pool.query(
    `SELECT id AS node_id, title, evidence_type FROM yorha_evidence_nodes WHERE status = $1 AND case_id = $2 LIMIT 50`,
    ['active', CASE_ID]
  );
  console.log(`Active nodes: ${nodeResult.rows.length}`);

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

  console.log(`Graph neighbors found: ${connResult.rows.length}`);
  for (const r of connResult.rows) {
    console.log(`  ${(r.neighbor_title || '').padEnd(45)} | ${r.connection_type.padEnd(22)} | str:${String(r.strength).padStart(2)} | conf:${r.confidence_score}`);
  }

  // Step 2: buildGraphShouldFilter() simulation
  console.log('\n=== Step 2: buildGraphShouldFilter() ===\n');

  const strong = connResult.rows.filter(n => n.strength >= 30);
  console.log(`Strong neighbors (strength >= 30): ${strong.length}`);

  if (strong.length > 0) {
    // Extract both node IDs and evidence IDs from file_path (mirrors updated graph-context.ts)
    const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const allIds = new Set();
    for (const n of strong) {
      allIds.add(n.neighbor_id);
      const matches = (n.neighbor_file_path || '').match(UUID_IN_PATH);
      if (matches) matches.forEach(m => allIds.add(m));
    }
    const matchIds = [...allIds];

    const idFieldNames = ['document_id', 'evidence_id', 'source_id', 'node_id'];
    const filter = {
      should: idFieldNames.map(key => ({
        key,
        match: { any: matchIds },
      })),
    };
    console.log(`Qdrant filter: ${filter.should.length} should clauses × ${matchIds.length} IDs`);
    console.log(`IDs (node + evidence): ${matchIds.map(id => id.slice(0, 8)).join(', ')}`);

    // Step 3: Test Qdrant search with the filter
    console.log('\n=== Step 3: Qdrant search with graph filter ===\n');

    // Get a query embedding
    const embedRes = await fetch('http://127.0.0.1:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: 'breach of contract factual allegations',
      }),
    });
    const embedData = await embedRes.json();
    const queryVector = embedData.embeddings?.[0] ?? embedData.embedding;
    console.log(`Query vector: ${queryVector?.length} dims`);

    // Search evidence_vectors with graph filter (case-tier)
    const searchRes = await fetch('http://127.0.0.1:6333/collections/evidence_vectors/points/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: queryVector,
        limit: 5,
        with_payload: true,
        score_threshold: 0.2,
        filter: {
          must: [{ key: 'case_id', match: { value: CASE_ID } }],
          ...filter, // merge the should clauses
        },
      }),
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      console.log(`\nWith graph filter: ${data.result?.length ?? 0} hits`);
      for (const r of data.result ?? []) {
        const boosted = matchIds.includes(r.payload?.evidence_id) || matchIds.includes(r.payload?.document_id);
        console.log(`  score=${r.score.toFixed(4)} | boosted=${boosted} | ${(r.payload?.content || '').slice(0, 80)}`);
      }
    } else {
      console.log(`Qdrant search failed: ${searchRes.status}`);
    }

    // Search WITHOUT filter for comparison
    const baseRes = await fetch('http://127.0.0.1:6333/collections/evidence_vectors/points/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: queryVector,
        limit: 5,
        with_payload: true,
        score_threshold: 0.2,
        filter: {
          must: [{ key: 'case_id', match: { value: CASE_ID } }],
        },
      }),
    });
    if (baseRes.ok) {
      const baseData = await baseRes.json();
      console.log(`\nWithout graph filter: ${baseData.result?.length ?? 0} hits`);
      for (const r of baseData.result ?? []) {
        console.log(`  score=${r.score.toFixed(4)} | ${(r.payload?.content || '').slice(0, 80)}`);
      }
    }
  } else {
    console.log('No strong neighbors — graph filter would be null');
  }

  // Step 4: getGraphContext() simulation (post-retrieval)
  console.log('\n=== Step 4: getGraphContext() (post-retrieval) ===\n');

  // Simulate with evidence IDs from the case
  const { rows: evidenceRows } = await pool.query(
    `SELECT id FROM evidence WHERE case_id = $1`,
    [CASE_ID]
  );
  const evidenceIds = evidenceRows.map(r => r.id);
  console.log(`Evidence IDs for case: ${evidenceIds.length}`);

  // These IDs might not match node IDs directly, but nodes have file_path
  // The real getGraphContext uses both file_path and id matching
  const { rows: matchingNodes } = await pool.query(`
    SELECT id, title, file_path FROM yorha_evidence_nodes
    WHERE case_id = $1 AND status = 'active'
  `, [CASE_ID]);
  console.log(`Matching nodes: ${matchingNodes.length}`);

  console.log('\n=== SUMMARY ===');
  console.log(`Nodes: ${nodeResult.rows.length}`);
  console.log(`Connections traversed: ${connResult.rows.length}`);
  console.log(`Strong neighbors (filter-eligible): ${strong.length}`);
  console.log(`Evidence docs: ${evidenceIds.length}`);
  console.log(`KAG path: ${connResult.rows.length > 0 ? 'ACTIVE' : 'DEAD'}`);
}

main().catch(console.error).finally(() => pool.end());
