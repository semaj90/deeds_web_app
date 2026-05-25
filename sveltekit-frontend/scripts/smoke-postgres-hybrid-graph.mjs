import { pool } from '../src/lib/server/db/client.js';

const EXPECTED_PLANS = [
  {
    name: 'source_ref_btree',
    sql: 'EXPLAIN SELECT id FROM documents_atlas_entries ORDER BY source_ref LIMIT 1;',
    includes: ['Index Scan using documents_atlas_entries_source_ref_unique']
  },
  {
    name: 'audit_score_btree',
    sql: 'EXPLAIN SELECT id FROM documents_atlas_entries WHERE audit_score IS NOT NULL ORDER BY audit_score LIMIT 1;',
    includes: ['Index Scan using documents_atlas_audit_score_idx']
  },
  {
    name: 'metadata_gin',
    sql: "EXPLAIN SELECT id FROM documents_atlas_entries WHERE metadata ? 'feature_family' LIMIT 1;",
    includes: ['Bitmap Index Scan on documents_atlas_metadata_gin_idx']
  }
];

async function explain(client, statement) {
  const result = await client.query(statement);
  return result.rows.map((row) => Object.values(row).join(' ')).join('\n');
}

async function run() {
  console.log('🔍 Running Postgres Hybrid Graph Indexing Smoke Test...');

  const client = await pool.connect();
  try {
    await client.query('SET enable_seqscan = off');

    const extRes = await client.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'vector') ORDER BY extname"
    );
    const extNames = extRes.rows.map((row) => row.extname);
    if (!extNames.includes('pg_trgm')) {
      throw new Error('Missing pg_trgm extension');
    }
    if (!extNames.includes('vector')) {
      throw new Error('Missing vector extension');
    }

    const planResults = [];
    for (const test of EXPECTED_PLANS) {
      const planText = await explain(client, test.sql);
      const matched = test.includes.every((needle) => planText.includes(needle));
      planResults.push({
        name: test.name,
        matched,
        planText
      });
      if (!matched) {
        throw new Error(
          `Plan check failed for ${test.name}. Expected plan to include: ${test.includes.join(', ')}\n${planText}`
        );
      }
    }

    const sampleCountRes = await client.query(
      'SELECT COUNT(*)::int AS row_count FROM documents_atlas_entries'
    );
    const rowCount = sampleCountRes.rows[0]?.row_count ?? 0;
    if (rowCount <= 0) {
      throw new Error('documents_atlas_entries is empty; cannot verify live index usage');
    }

    console.log('✅ Verified extensions:', extNames.join(', '));
    console.log(`✅ documents_atlas_entries row count: ${rowCount}`);
    for (const result of planResults) {
      console.log(`✅ ${result.name}: matched expected index-backed plan`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Hybrid Graph Test Failed:', err?.message ?? err);
    process.exit(1);
  } finally {
    client.release();
  }
}

run().catch((err) => {
  console.error('❌ Hybrid Graph Test Failed:', err?.message ?? err);
  process.exit(1);
});
