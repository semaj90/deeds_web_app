import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const databaseUrl = resolveDatabaseUrl(loadRepoEnv(process.env));
const client = new pg.Client({
  connectionString: databaseUrl,
  statement_timeout: 5000,
});

async function main() {
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    const readOnlyResult = await client.query('SHOW transaction_read_only');
    if (readOnlyResult.rows[0]?.transaction_read_only !== 'on') {
      throw new Error('POSTGRES_TRANSACTION_NOT_READ_ONLY');
    }

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

    // 6. Capture index definitions and readiness for graph tables
    const indexRes = await client.query(`
      SELECT table_ns.nspname AS schemaname,
             table_class.relname AS tablename,
             index_class.relname AS indexname,
             index_state.indisvalid,
             index_state.indisready,
             pg_get_indexdef(index_class.oid) AS indexdef
      FROM pg_index AS index_state
      JOIN pg_class AS index_class ON index_class.oid = index_state.indexrelid
      JOIN pg_class AS table_class ON table_class.oid = index_state.indrelid
      JOIN pg_namespace AS table_ns ON table_ns.oid = table_class.relnamespace
      WHERE table_class.relname IN ('atlas_graph_nodes_v2', 'atlas_graph_edges_v2', 'atlas_graph_snapshots_v2')
      ORDER BY table_ns.nspname, table_class.relname, index_class.relname;
    `);

    console.log(JSON.stringify({
      transactionReadOnly: true,
      databaseWrites: false,
      tableStats: tableStats.rows,
      snapshotCols,
      snapshots,
      nodeSummary,
      edgeSummary,
      indexes: indexRes.rows,
    }, null, 2));
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

main().catch(err => {
  console.error("CATALOG_CHECK_ERROR:", err.message);
  process.exit(1);
});
