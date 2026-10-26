const pg = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();
  console.log('Connected to PostgreSQL 18 on port 5434.');

  try {
    await client.query('BEGIN READ ONLY');

    // 1. Declare server-side cursor for zero-toast/streaming readback
    const cursorName = 'chunk_binary_cur';
    const batchSize = 10;

    await client.query(`
      DECLARE ${cursorName} NO SCROLL CURSOR FOR
      SELECT
        id,
        chunk_id,
        relative_path,
        source_ref,
        file_content_hash,
        content_hash,
        symbol,
        kind,
        domain,
        content_embedding_768::text AS embedding_768_txt,
        content_embedding::text AS embedding_halfvec_txt
      FROM public.codebase_chunk_index
      WHERE content_embedding_768 IS NOT NULL
      ORDER BY id
    `);

    console.log(`Server-side cursor '${cursorName}' declared.`);

    // 2. Fetch first batch
    const fetchRes = await client.query(`FETCH ${batchSize} FROM ${cursorName}`);
    console.log(`Fetched ${fetchRes.rows.length} rows from cursor.`);

    for (let i = 0; i < Math.min(3, fetchRes.rows.length); i++) {
      const row = fetchRes.rows[i];
      const emb768 = row.embedding_768_txt ? JSON.parse(row.embedding_768_txt) : null;
      console.log(`\n--- Candidate #${i + 1} ---`);
      console.log(`ID: ${row.id}`);
      console.log(`Chunk ID: ${row.chunk_id}`);
      console.log(`Relative Path: ${row.relative_path}`);
      console.log(`Source Ref: ${row.source_ref}`);
      console.log(`File Content Hash: ${row.file_content_hash}`);
      console.log(`Symbol / Kind: ${row.symbol} / ${row.kind}`);
      console.log(`768 Vector Dims: ${emb768 ? emb768.length : 'NULL'}`);
      if (emb768) {
        console.log(`First 4 floats: [${emb768.slice(0, 4).join(', ')}]`);
      }
    }

    // 3. Close cursor and commit read-only transaction
    await client.query(`CLOSE ${cursorName}`);
    await client.query('COMMIT');
    console.log(`\nCursor '${cursorName}' successfully closed.`);

    // 4. Report lineage statistics
    const lineageStats = await client.query(`
      SELECT
        count(*) AS total_chunks,
        count(*) FILTER (WHERE content_embedding_768 IS NOT NULL) AS has_768,
        count(*) FILTER (WHERE content_embedding IS NOT NULL) AS has_halfvec,
        count(*) FILTER (WHERE workspace_revision IS NOT NULL) AS has_workspace_rev,
        count(*) FILTER (WHERE source_revision IS NOT NULL) AS has_source_rev,
        count(*) FILTER (WHERE lineage_binding_checksum IS NOT NULL) AS has_lineage_checksum
      FROM public.codebase_chunk_index
    `);

    console.log('\n--- Lineage Coverage Summary ---');
    console.log(JSON.stringify(lineageStats.rows[0], null, 2));

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Readback error:', err);
  process.exit(1);
});
