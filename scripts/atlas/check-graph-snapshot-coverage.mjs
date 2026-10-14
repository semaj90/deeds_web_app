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
    // 1. Catalog row estimates for graph tables
    const tableStats = await client.query(`
      SELECT relname, GREATEST(0, reltuples)::bigint AS estimated_rows
      FROM pg_class
      WHERE relname LIKE 'atlas_graph_%'
      ORDER BY relname;
    `);

    // 2. Discover actual columns of atlas_graph_snapshots_v2
    const colsRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'atlas_graph_snapshots_v2'
      ORDER BY ordinal_position;
    `);
    const snapshotCols = colsRes.rows.map(r => r.column_name);

    // 3. Check live snapshots
    let snapshots = [];
    try {
      const snapRes = await client.query(`
        SELECT *
        FROM atlas_graph_snapshots_v2
        ORDER BY created_at DESC
        LIMIT 5;
      `);
      snapshots = snapRes.rows;
    } catch (e) {
      snapshots = [{ error: e.message }];
    }

    // 4. Sample node distribution in atlas_graph_nodes_v2
    let nodeSummary = {};
    try {
      const nodeRes = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE tree_node_id IS NOT NULL) AS ast_linked_nodes,
          COUNT(*) FILTER (WHERE packet_key IS NOT NULL) AS packet_linked_nodes,
          COUNT(*) AS total_sample_nodes
        FROM (SELECT tree_node_id, packet_key FROM atlas_graph_nodes_v2 LIMIT 1000) sub;
      `);
      nodeSummary = nodeRes.rows[0];
    } catch (e) {
      nodeSummary = { error: e.message };
    }

    // 5. Sample edge types in atlas_graph_edges_v2
    let edgeSummary = [];
    try {
      const edgeRes = await client.query(`
        SELECT edge_type, COUNT(*) as count
        FROM (SELECT edge_type FROM atlas_graph_edges_v2 LIMIT 1000) sub
        GROUP BY edge_type
        ORDER BY count DESC;
      `);
      edgeSummary = edgeRes.rows;
    } catch (e) {
      edgeSummary = [{ error: e.message }];
    }

    // 3. Check indexes on atlas_graph_nodes_v2 and atlas_graph_edges_v2
    const indexRes = await client.query(`
      SELECT tablename, indexname, indisvalid, indisready
      FROM pg_indexes
      JOIN pg_class ON pg_class.relname = pg_indexes.indexname
      JOIN pg_index ON pg_index.indexrelid = pg_class.oid
      WHERE tablename IN ('atlas_graph_nodes_v2', 'atlas_graph_edges_v2', 'atlas_graph_snapshots_v2')
      ORDER BY tablename, indexname;
    `);

    console.log(JSON.stringify({
      tableStats: tableStats.rows,
      snapshotCols,
      snapshots,
      nodeSummary,
      edgeSummary,
      indexes: indexRes.rows,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("CATALOG_CHECK_ERROR:", err.message);
  process.exit(1);
});
