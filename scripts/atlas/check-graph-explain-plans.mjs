import pg from 'pg';

const client = new pg.Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
  statement_timeout: 5000,
});

async function main() {
  await client.connect();
  try {
    // 1. pg_settings query
    const settingsRes = await client.query(`
      SELECT name, setting, unit
      FROM pg_settings
      WHERE name IN (
        'io_method',
        'max_worker_processes',
        'max_parallel_workers',
        'max_parallel_workers_per_gather',
        'max_parallel_maintenance_workers',
        'effective_io_concurrency',
        'work_mem'
      )
      ORDER BY name;
    `);

    // 2. EXPLAIN query on node lookup by composite PK (snapshot_id, node_key)
    const testSnapshot = '382c8dc6-a115-40d9-a3a5-034fa44d2e71';
    const explainPkNode = await client.query(`
      EXPLAIN
      SELECT * FROM atlas_graph_nodes_v2
      WHERE snapshot_id = $1 AND node_key = 'test-node-key'
      LIMIT 1;
    `, [testSnapshot]);

    // 3. EXPLAIN on node lookup by source_ref (no index currently exists for source_ref!)
    const explainSourceRefNode = await client.query(`
      EXPLAIN
      SELECT * FROM atlas_graph_nodes_v2
      WHERE snapshot_id = $1 AND source_ref = 'sveltekit-frontend/src/lib/index.ts';
    `, [testSnapshot]);

    // 4. EXPLAIN on edge lookup by source_node_key
    const explainSourceEdge = await client.query(`
      EXPLAIN
      SELECT * FROM atlas_graph_edges_v2
      WHERE snapshot_id = $1 AND source_node_key = 'test-node-key';
    `, [testSnapshot]);

    // 5. EXPLAIN on forward typed edge traversal
    const explainForwardTypedEdge = await client.query(`
      EXPLAIN
      SELECT * FROM atlas_graph_edges_v2
      WHERE snapshot_id = $1 AND source_node_key = 'test-node-key' AND edge_type = 'CONTAINS';
    `, [testSnapshot]);

    // 6. EXPLAIN on reverse typed edge traversal
    const explainReverseTypedEdge = await client.query(`
      EXPLAIN
      SELECT * FROM atlas_graph_edges_v2
      WHERE snapshot_id = $1 AND target_node_key = 'test-node-key' AND edge_type = 'CONTAINS';
    `, [testSnapshot]);

    console.log(JSON.stringify({
      pgSettings: settingsRes.rows,
      plans: {
        nodeCompositePk: explainPkNode.rows.map(r => r['QUERY PLAN']),
        nodeSourceRef: explainSourceRefNode.rows.map(r => r['QUERY PLAN']),
        edgeSourceOnly: explainSourceEdge.rows.map(r => r['QUERY PLAN']),
        edgeForwardTyped: explainForwardTypedEdge.rows.map(r => r['QUERY PLAN']),
        edgeReverseTyped: explainReverseTypedEdge.rows.map(r => r['QUERY PLAN']),
      }
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("EXPLAIN_CHECK_ERROR:", err.message);
  process.exit(1);
});
