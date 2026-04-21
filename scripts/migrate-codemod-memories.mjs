#!/usr/bin/env node
/**
 * Migrate codemod_memories from JSON export into Docker PG prod (5432).
 * Run after: docker exec postgres-pgvector psql ... COPY TO STDOUT > /tmp/codemod_json.jsonl
 */
import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;
const dst = new Pool({ connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db' });

async function main() {
  // Read JSON lines exported from pgvector container
  const jsonPath = new URL('./codemod_json.jsonl', import.meta.url);
  const lines = fs.readFileSync(jsonPath, 'utf-8').trim().split('\n');
  console.log(`Loaded ${lines.length} rows from export`);

  // Ensure table exists
  await dst.query(`
    CREATE TABLE IF NOT EXISTS codemod_memories (
      id uuid PRIMARY KEY,
      error_code text,
      error_key text,
      message text,
      occurrence_count integer,
      priority text,
      framework text,
      source text,
      tags text[],
      content text,
      langextract jsonb,
      embedding vector(768),
      created_at timestamptz DEFAULT now()
    )
  `);
  console.log('Table verified in prod PG (5432)');

  let ok = 0;
  for (const line of lines) {
    const r = JSON.parse(line);
    await dst.query(
      `INSERT INTO codemod_memories (id, error_code, error_key, message, occurrence_count, priority, framework, source, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.error_code, r.error_key, r.message, r.occurrence_count, r.priority, r.framework, r.source, r.content]
    );
    ok++;
  }
  console.log(`Inserted: ${ok} rows`);

  const { rows: v } = await dst.query('SELECT COUNT(*) as cnt FROM codemod_memories');
  console.log(`Prod PG (5432) codemod_memories: ${v[0].cnt} rows`);
}

main().catch(console.error).finally(() => dst.end());
