#!/usr/bin/env node
import fs from 'node:fs';
import readline from 'node:readline';
import { Pool } from 'pg';

function resolveSourceRef(obj) {
  return obj.sourceRef || obj.source_ref || obj.id || obj.source || (obj.payload && (obj.payload.sourceRef || obj.payload.source_ref));
}

async function main() {
  const input = process.argv[2] || '.tmp/atlas-component-profiles.jsonl';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('MISSING DATABASE_URL. Export with: $env:DATABASE_URL = "postgresql://user:pass@host:5434/db" (PowerShell) or export DATABASE_URL=...');
    process.exit(2);
  }

  if (!fs.existsSync(input)) {
    console.error(`Input file not found: ${input}`);
    process.exit(3);
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    // Create table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS atlas_component_profiles (
        source_ref TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        inserted_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    const rl = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity });
    let count = 0;
    const batch = [];
    for await (const line of rl) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (err) {
        console.warn('Skipping invalid JSON line', err.message);
        continue;
      }

      const sourceRef = resolveSourceRef(obj);
      const payload = obj.payload || obj;
      if (!sourceRef) {
        console.warn('Skipping profile with no identifiable sourceRef:', JSON.stringify(obj).slice(0, 200));
        continue;
      }

      batch.push({ sourceRef, payload });

      if (batch.length >= 200) {
        await upsertBatch(client, batch);
        count += batch.length;
        console.log(`Inserted ${count} rows...`);
        batch.length = 0;
      }
    }

    if (batch.length) {
      await upsertBatch(client, batch);
      count += batch.length;
    }

    console.log(`Done. Total inserted/updated: ${count}`);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function upsertBatch(client, rows) {
  // Use a transaction with parameterized queries
  const text = `INSERT INTO atlas_component_profiles (source_ref, payload) VALUES `;
  const values = [];
  const parts = [];
  let idx = 1;
  for (const r of rows) {
    parts.push(`($${idx++}, $${idx++}::jsonb)`);
    values.push(r.sourceRef, JSON.stringify(r.payload));
  }
  const sql = text + parts.join(',') + ` ON CONFLICT (source_ref) DO UPDATE SET payload = EXCLUDED.payload, inserted_at = now()`;
  await client.query('BEGIN');
  try {
    await client.query(sql, values);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('load-profiles-to-postgres.mjs')) {
  main();
}
