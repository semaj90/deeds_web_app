#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { ENV } from '$lib/server/env.server.js';

const argv = yargs(hideBin(process.argv)).option('dry-run', { type: 'boolean', default: false }).argv;
const dryRun = argv['dry-run'];

const root = path.resolve(process.cwd());
const ndjsonPath = path.join(root, '.tmp', 'jsonb_export.ndjson');
const msgpackDir = path.join(root, '.cache', 'cards');

async function readNdjson(p) {
  const txt = await fs.readFile(p, 'utf8');
  return txt.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  if (!await fileExists(ndjsonPath)) {
    console.error('NDJSON export not found:', ndjsonPath);
    process.exit(1);
  }

  const rows = await readNdjson(ndjsonPath);
  console.log(`Loaded ${rows.length} records from ${ndjsonPath}`);

  const pool = new Pool({ connectionString: ENV.DATABASE_URL });
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('DB connect failed:', err.message);
    process.exit(1);
  }

  const report = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  try {
    const isDry = process.argv.includes('--dry-run') || process.argv.includes('-n') || dryRun;
    if (!isDry) await client.query('BEGIN');

    // Check whether target table exists. If missing: in dry-run, stop with message;
    // in live run, create it.
    const existsTbl = await client.query("SELECT to_regclass('public.feature_cards') AS reg");
    const tableExists = existsTbl.rows && existsTbl.rows[0] && existsTbl.rows[0].reg !== null;
    if (!tableExists) {
      if (isDry) {
        throw new Error('Target table "feature_cards" does not exist. Run without --dry-run to create it or create the table manually.');
      }
      // Create table if missing
      const createSql = `
        CREATE TABLE IF NOT EXISTS feature_cards (
          id text PRIMARY KEY,
          source_ref text NOT NULL,
          area text,
          content_hash text,
          schema_version text,
          card_json jsonb,
          card_msgpack bytea,
          updated_at timestamptz DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS feature_cards_source_ref_content_hash_idx ON feature_cards (source_ref, content_hash);
      `;
      await client.query(createSql);
      console.log('Created table feature_cards (IF NOT EXISTS)');
    }

    for (const r of rows) {
      const source_ref = r.sourceRef || r.path;
      const content_hash = r.content_hash || r.contentHash || null;
      const area = r.area || null;
      const schema_version = r.schema_version || r.schemaVersion || null;
      const card_json = r; // store full metadata as jsonb

      const idFromMeta = r.id || null;
      const id = idFromMeta || `${source_ref || 'unknown'}::${content_hash || Date.now().toString()}`;

      const msgpackPath = r.msgpack ? path.join(root, r.msgpack) : path.join(msgpackDir, (r.id || id) + '.msgpack');
      let msgpackBuffer = null;
      if (await fileExists(msgpackPath)) {
        msgpackBuffer = await fs.readFile(msgpackPath);
      }

      // Check existing by source_ref + content_hash or id
      const whereParams = [source_ref, content_hash];
      const existsRes = await client.query('SELECT id FROM feature_cards WHERE source_ref = $1 AND content_hash = $2 LIMIT 1', whereParams);
      if (existsRes.rowCount > 0) {
        const existingId = existsRes.rows[0].id;
        if (isDry) {
          console.log(`[dry-run] would UPDATE feature_cards id=${existingId} source_ref=${source_ref}`);
          report.updated++;
        } else {
          await client.query(
            `UPDATE feature_cards SET card_json = $1::jsonb, card_msgpack = $2, area = $3, schema_version = $4, updated_at = now() WHERE id = $5`,
            [JSON.stringify(card_json), msgpackBuffer, area, schema_version, existingId]
          );
          report.updated++;
        }
      } else {
        if (isDry) {
          console.log(`[dry-run] would INSERT feature_cards source_ref=${source_ref}`);
          report.inserted++;
        } else {
          await client.query(
            `INSERT INTO feature_cards (id, source_ref, content_hash, card_json, card_msgpack, area, schema_version, updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,now())`,
            [id, source_ref, content_hash, JSON.stringify(card_json), msgpackBuffer, area, schema_version]
          );
          report.inserted++;
        }
      }
    }

    if (!isDry) await client.query('COMMIT');
  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK').catch(() => {});
    console.error('Error during upsert:', err.message);
    report.errors.push(err.message);
  } finally {
    client.release();
    await pool.end();
  }

  console.log('Upsert report:', JSON.stringify(report, null, 2));
  if (dryRun) console.log('Dry-run mode: no changes applied.');
}

main().catch(err => { console.error(err); process.exit(1); });
