#!/usr/bin/env node
/**
 * Migrate codemod_memories into active Qdrant instance.
 * 1. Creates the collection (768-dim, cosine)
 * 2. Reads 12 rows from prod PG (5434)
 * 3. Embeds content via Ollama embeddinggemma
 * 4. Upserts points into Qdrant
 * 5. Updates PG embedding column
 */
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db' });
const QDRANT = 'http://localhost:6333';
const OLLAMA = 'http://localhost:11434';

async function main() {
  // 1. Create collection in Qdrant
  console.log('[1/5] Creating Qdrant collection...');
  const createRes = await fetch(`${QDRANT}/collections/codemod_memories`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: 768, distance: 'Cosine' },
      quantization_config: { scalar: { type: 'int8', quantile: 0.99, always_ram: true } },
    }),
  });
  const createBody = await createRes.json();
  console.log('  Collection:', createBody.status === 'ok' ? 'created' : createBody.status?.error ?? JSON.stringify(createBody));

  // 2. Read rows from PG
  console.log('[2/5] Reading rows from prod PG...');
  const { rows } = await pool.query('SELECT id, error_code, error_key, message, occurrence_count, source, content FROM codemod_memories');
  console.log(`  Found ${rows.length} rows`);

  // 3. Embed content via Ollama
  console.log('[3/5] Generating embeddings via Ollama...');
  const points = [];
  for (const row of rows) {
    const text = `${row.error_code}: ${row.message}\n\n${(row.content || '').slice(0, 2000)}`;
    const embRes = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
    });
    const embData = await embRes.json();
    const vector = embData.embeddings[0];
    console.log(`  [${row.error_code}] ${vector.length}-dim embedded`);

    points.push({
      id: row.id,
      vector,
      payload: {
        error_code: row.error_code,
        error_key: row.error_key,
        message: row.message,
        occurrence_count: row.occurrence_count,
        source: row.source,
        content_preview: (row.content || '').slice(0, 500),
      },
    });

    // Also update PG embedding column
    const vecStr = `[${vector.join(',')}]`;
    await pool.query('UPDATE codemod_memories SET embedding = $1::vector WHERE id = $2', [vecStr, row.id]);
  }

  // 4. Upsert points into Qdrant
  console.log('[4/5] Upserting points into Qdrant...');
  const upsertRes = await fetch(`${QDRANT}/collections/codemod_memories/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  const upsertBody = await upsertRes.json();
  console.log('  Upsert:', upsertBody.status === 'ok' ? `${points.length} points` : JSON.stringify(upsertBody));

  // 5. Verify
  console.log('[5/5] Verifying...');
  const infoRes = await fetch(`${QDRANT}/collections/codemod_memories`);
  const info = await infoRes.json();
  console.log(`  Qdrant: ${info.result?.points_count ?? 0} points`);

  const { rows: pgCheck } = await pool.query('SELECT COUNT(*) as cnt FROM codemod_memories WHERE embedding IS NOT NULL');
  console.log(`  PG embeddings: ${pgCheck[0].cnt} rows with vectors`);

  console.log('\nMigration complete!');
}

main().catch(console.error).finally(() => pool.end());
