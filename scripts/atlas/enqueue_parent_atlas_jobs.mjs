#!/usr/bin/env node
// enqueue_parent_atlas_jobs.mjs
// Reads generated packets and inserts job rows into Postgres parent_atlas_jobs table.

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const PACKETS_DIR = process.env.PACKETS_DIR || './.tmp/parent_atlas_packets';
const argDb = process.argv.find(a => a.startsWith('--db='))?.split('=')[1];
const DATABASE_URL = process.env.DATABASE_URL || argDb || process.argv[2];

if (!DATABASE_URL) {
  console.error('Set DATABASE_URL and run again.');
  process.exit(1);
}

async function main(){
  const files = await fs.promises.readdir(PACKETS_DIR).catch(()=>[]);
  if (!files.length) {
    console.log('No packet files found in', PACKETS_DIR);
    return;
  }
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to Postgres, enqueuing', files.length, 'jobs');

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(PACKETS_DIR, f);
    const txt = await fs.promises.readFile(p, 'utf8');
    const payload = JSON.parse(txt);
    const recId = payload.record_id || path.basename(f, '.json');

    const insertSql = `INSERT INTO public.parent_atlas_jobs (record_id, payload, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING RETURNING id`;
    try {
      const r = await client.query(insertSql, [recId, payload]);
      if (r.rowCount) console.log('Enqueued job', r.rows[0].id, 'for', recId);
      else console.log('Job exists or skipped for', recId);
    } catch (err) {
      console.error('Failed enqueue for', recId, err.message);
    }
  }

  await client.end();
  console.log('Done enqueuing');
}

main().catch(err=>{ console.error(err); process.exit(1); });

/*
Usage:
  DATABASE_URL=... node enqueue_parent_atlas_jobs.mjs

This will insert rows into `parent_atlas_jobs` for downstream offline processing.
*/
