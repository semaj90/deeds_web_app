import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const res = await pool.query(`
      SELECT source_ref, payload->'derived_enrichment'->'summary' as summary
      FROM parent_atlas_documents
      WHERE source_ref = 'sveltekit-frontend/src/lib/components/ai/LLMSelector.svelte'
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
main();
