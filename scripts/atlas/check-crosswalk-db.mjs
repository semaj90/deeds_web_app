import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });

try {
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_domain_vocabulary_crosswalk_v1'");
  console.log('Crosswalk columns:', res.rows);
  const vocabs = await pool.query("SELECT DISTINCT source_vocab FROM atlas_domain_vocabulary_crosswalk_v1");
  console.log('Distinct source_vocab:', vocabs.rows);
  const matches = await pool.query("SELECT source_vocab, source_value, taxonomy_domain_id, match_method, source_row_count FROM atlas_domain_vocabulary_crosswalk_v1 WHERE taxonomy_domain_id IS NOT NULL");
  console.log('Mapped crosswalk rows:', matches.rows);
  const viewCounts = await pool.query("SELECT match_method, count(*) as count FROM v_chunk_domain_resolved_v1 GROUP BY match_method");
  console.log('View resolution counts:', viewCounts.rows);
  const totalChunks = await pool.query("SELECT count(*) as count FROM codebase_chunk_index");
  console.log('Total chunks:', totalChunks.rows[0].count);
} finally {
  await pool.end();
}
