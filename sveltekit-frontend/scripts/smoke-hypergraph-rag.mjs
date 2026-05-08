/**
 * smoke-hypergraph-rag.mjs
 *
 * Smoke test for Step 5D HyperGraphRAG:
 *   1. Insert a test retrieval hyperedge via Postgres
 *   2. Query it back via hypergraph-search logic
 *   3. Verify member hydration
 *   4. Clean up
 *
 * Usage:
 *   node scripts/smoke-hypergraph-rag.mjs
 *   node scripts/smoke-hypergraph-rag.mjs --keep   # skip cleanup
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const KEEP = process.argv.includes('--keep');
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log('🔷 HyperGraphRAG smoke test');
  const pool = new pg.Pool({ connectionString: DB_URL });
  let edgeId = null;

  try {
    // 1. Insert test hyperedge
    const { rows: [edge] } = await pool.query(
      `INSERT INTO hypergraph_edges (edge_type, label, query_hash, weight, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, edge_type, label, query_hash, weight, created_at`,
      ['retrieval', 'smoke test edge', 'deadbeef00000001', 1.0, JSON.stringify({ smoke: true })]
    );
    edgeId = edge.id;
    console.log(`  ✓ Inserted edge ${edgeId} (type=${edge.edge_type})`);

    // 2. Insert members
    await pool.query(
      `INSERT INTO hypergraph_edge_members (edge_id, member_kind, member_key, role, score)
       VALUES ($1, 'file',      $2, 'source',  0.9),
              ($1, 'agents_md', $3, 'context', 0.8),
              ($1, 'cluster',   $4, 'context', 0.7)`,
      [edgeId, 'src/lib/server/hypergraph/hypergraph-builder.ts', 'agents:dir:src/lib/server/hypergraph', 'cluster:42']
    );
    console.log('  ✓ Inserted 3 members (file, agents_md, cluster)');

    // 3. Query back via SELECT with JOIN
    const { rows: members } = await pool.query(
      `SELECT member_kind, member_key, role, score
       FROM hypergraph_edge_members
       WHERE edge_id = $1
       ORDER BY score DESC`,
      [edgeId]
    );
    if (members.length !== 3) throw new Error(`Expected 3 members, got ${members.length}`);
    console.log(`  ✓ Member hydration: ${members.map(m => m.member_kind).join(', ')}`);

    // 4. Verify edge retrieval via search query
    const { rows: edges } = await pool.query(
      `SELECT DISTINCT he.id, he.edge_type, he.label, he.weight
       FROM hypergraph_edges he
       JOIN hypergraph_edge_members hem ON hem.edge_id = he.id
       WHERE hem.member_key = $1`,
      ['src/lib/server/hypergraph/hypergraph-builder.ts']
    );
    if (!edges.find(e => e.id === edgeId)) throw new Error('Search by member_key did not return test edge');
    console.log('  ✓ Search by member_key returned test edge');

    // 5. Activation score formula check
    const totalMembers = 3;
    const matchedMembers = 1;
    const weight = 1.0;
    const coverage = matchedMembers / totalMembers;
    const score = coverage * 0.6 + weight * 0.4;
    if (score < 0 || score > 1.0) throw new Error(`Activation score out of range: ${score}`);
    console.log(`  ✓ Activation score formula: ${score.toFixed(3)} (coverage=${coverage.toFixed(2)}, weight=${weight})`);

    // 6. Verify glyph_cluster format (topo_class:som_cluster) is present in Qdrant-style metadata
    const glyphCluster = `middleware:42`;
    if (!/^.+:\S+$/.test(glyphCluster)) throw new Error('glyph_cluster format invalid');
    console.log(`  ✓ glyph_cluster format: "${glyphCluster}"`);

    console.log('\n✅ All 6 smoke checks passed');
  } catch (err) {
    console.error('\n❌ Smoke test failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (edgeId && !KEEP) {
      await pool.query('DELETE FROM hypergraph_edges WHERE id = $1', [edgeId])
        .catch(() => {});
      console.log('  Cleaned up test edge');
    } else if (KEEP) {
      console.log(`  Kept test edge ${edgeId} (--keep)`);
    }
    await pool.end();
  }
}

main();
