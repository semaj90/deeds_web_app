#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const INPUT = path.join(ROOT, '.tmp', 'ingest', 'parent-atlas-hypergraph.jsonl');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply') || args.includes('--write');
const BATCH = Number(process.env.BATCH_SIZE || 500);

if (!fs.existsSync(INPUT)) {
  console.error('Input file not found:', INPUT);
  process.exit(1);
}

async function main() {
  console.log('Reading', INPUT);
  const data = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean);
  const items = [];
  for (const line of data) {
    try {
      const obj = JSON.parse(line);
      items.push(obj);
    } catch (e) {
      // skip malformed line but report
      console.warn('Skipping malformed line');
    }
  }

  console.log(`Parsed ${items.length} records`);
  if (!APPLY) {
    console.log('Dry-run mode (no DB writes). Use --apply to persist.');
    const sample = items.slice(0,5).map(it => {
      return {
        id: it.record_id ?? it.payload?.id ?? null,
        source_ref: it.source_ref ?? it.payload?.file ?? null,
        cluster: it.cluster_id ?? it.payload?.clusterId ?? null
      };
    });
    console.log('Sample records:', JSON.stringify(sample, null, 2));
    const missingId = items.filter(it => !(it.record_id || (it.payload && it.payload.id))).length;
    console.log(`Records missing canonical id: ${missingId}`);
    const clusterCount = items.reduce((acc,it)=>{ const c = it.cluster_id ?? it.payload?.clusterId; if (c !== undefined && c !== null) acc++; return acc; },0);
    console.log(`Records with clusterId present: ${clusterCount}`);
    return;
  }

  // apply -> perform batched upserts using DB pool
  let pool;
  try {
    // import DB pool dynamically to avoid top-level resolution issues
    const clientModule = await import('../../src/lib/server/db/client.js');
    pool = clientModule.pool;
  } catch (e) {
    console.error('Failed to import DB client. Ensure this script runs from the project root and TS build artifacts (or .js resolvable imports) are available.');
    console.error(e);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let processed = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const values = [];
      const placeholders = [];
      let idx = 1;
      for (const it of batch) {
        const id = it.record_id ?? it.payload?.id ?? (it.source_ref ? `${it.source_ref}::${it.payload?.id ?? ''}` : null);
        const payload = it;
        const clusterId = it.cluster_id ?? it.payload?.clusterId ?? null;
        const somRow = it.somBmuRow ?? it.payload?.somBmuRow ?? null;
        const somCol = it.somBmuCol ?? it.payload?.somBmuCol ?? null;
        values.push(id, JSON.stringify(payload), clusterId, somRow, somCol);
        placeholders.push(`($${idx++}, $${idx++}::jsonb, $${idx++}, $${idx++}, $${idx++})`);
      }

      const upsertSQL = `INSERT INTO parent_atlas_records (id, payload, cluster_id, som_row, som_col)
        VALUES ${placeholders.join(',')}
        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, cluster_id = EXCLUDED.cluster_id, som_row = EXCLUDED.som_row, som_col = EXCLUDED.som_col, updated_at = now()`;

      await client.query(upsertSQL, values);
      processed += batch.length;
      console.log(`Upserted ${processed}/${items.length}`);
    }
    await client.query('COMMIT');
    console.log(`Successfully upserted ${items.length} records into parent_atlas_records`);
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('DB upsert failed:', e.message || e);
    process.exit(1);
  } finally {
    client.release();
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
