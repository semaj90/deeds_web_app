#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { Client } from 'pg';

const ROOT = process.cwd();
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');

async function main() {
  const conn = process.env.PG_CONN || process.env.DATABASE_URL;
  if (!conn) {
    console.log('No Postgres connection string in PG_CONN or DATABASE_URL — skipping Postgres store.');
    return;
  }
  const client = new Client({ connectionString: conn });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS rag_cards (
      id text PRIMARY KEY,
      metadata jsonb,
      created_at timestamptz default now()
    )
  `);
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    const j = JSON.parse(await fs.readFile(path.join(EMB_DIR, f), 'utf8'));
    const meta = { title: j.metadata.title, source: j.metadata.source };
    await client.query(`INSERT INTO rag_cards (id, metadata) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET metadata=EXCLUDED.metadata`, [j.id, meta]);
  }
  await client.end();
  console.log('Stored', files.length, 'cards metadata to Postgres');
}

main().catch(e => { console.error(e); process.exit(1); });
