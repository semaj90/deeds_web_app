import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Client } = pg;

test('LATENT-SCHEMA-LIVE-01: codebase_chunk_index latent columns exist and verify lineage unproven', async () => {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5434'),
    database: process.env.PGDATABASE || 'legal_ai_db',
    user: process.env.PGUSER || 'legal_admin',
    password: process.env.PGPASSWORD || '123456',
  });

  await client.connect();

  try {
    // 1. Column existence and types
    const cols = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'codebase_chunk_index'
        AND column_name IN ('latent_128', 'latent_256', 'latent_64', 'content_embedding_768', 'content_embedding')
      ORDER BY column_name;
    `);

    const colMap = Object.fromEntries(cols.rows.map(r => [r.column_name, r.udt_name]));
    assert.equal(colMap.latent_128, 'halfvec', 'latent_128 must be halfvec');
    assert.equal(colMap.latent_256, 'halfvec', 'latent_256 must be halfvec');
    assert.equal(colMap.latent_64, 'vector', 'latent_64 must be vector');
    assert.equal(colMap.content_embedding_768, 'vector', 'canonical content_embedding_768 must be vector');
    assert.equal(colMap.content_embedding, 'halfvec', 'historical content_embedding must be halfvec');

    // 2. Population counts
    const counts = await client.query(`
      SELECT 
        count(latent_128) as count_latent_128,
        count(latent_256) as count_latent_256,
        count(latent_64) as count_latent_64,
        count(content_embedding_768) as count_768
      FROM codebase_chunk_index;
    `);

    const row = counts.rows[0];
    assert.equal(parseInt(row.count_latent_128), 55169, 'latent_128 has exactly 55,169 populated rows');
    assert.equal(parseInt(row.count_latent_256), 55169, 'latent_256 has exactly 55,169 populated rows');
    assert.ok(parseInt(row.count_768) >= 200000, 'canonical 768 vector rows populated');

    // 3. Lineage validation: all 55,169 rows share checkpoint revision but lack source_revision
    const lineage = await client.query(`
      SELECT 
        count(*) as total_with_latent128,
        count(latent_256_checkpoint_revision) as has_checkpoint,
        count(source_revision) as has_source_rev,
        count(workspace_revision) as has_ws_rev
      FROM codebase_chunk_index
      WHERE latent_128 IS NOT NULL;
    `);

    const lRow = lineage.rows[0];
    assert.equal(parseInt(lRow.has_checkpoint), 55169, 'All 55,169 rows bind to historical v3 checkpoint');
    assert.equal(parseInt(lRow.has_source_rev), 0, 'source_revision is empty on all latent_128 rows');
    assert.equal(parseInt(lRow.has_ws_rev), 0, 'workspace_revision is empty on all latent_128 rows');

  } finally {
    await client.end();
  }
});
