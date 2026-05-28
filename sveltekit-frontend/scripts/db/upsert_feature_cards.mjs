#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
  console.log(`Usage: node upsert_feature_cards.mjs [--ndjson <path>] [--table <table>] [--batch <n>] [--apply]

Options:
  --ndjson   Path to NDJSON export (default: ./.tmp/jsonb_export.ndjson)
  --table    Target table name (default: feature_cards)
  --batch    Batch size for reporting (default: 50)
  --apply    Perform DB writes. By default runs as dry-run.`);
}

const argv = process.argv.slice(2);
let ndjsonPath = path.resolve(process.cwd(), '.tmp/jsonb_export.ndjson');
let table = process.env.DB_TABLE || 'feature_cards';
let batch = 50;
let apply = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--ndjson' && argv[i + 1]) {
    ndjsonPath = path.resolve(process.cwd(), argv[++i]);
  } else if (a === '--table' && argv[i + 1]) {
    table = argv[++i];
  } else if (a === '--batch' && argv[i + 1]) {
    batch = Number(argv[++i]) || 50;
  } else if (a === '--apply') {
    apply = true;
  } else if (a === '--help' || a === '-h') {
    usage();
    process.exit(0);
  }
}

if (!fs.existsSync(ndjsonPath)) {
  console.error('NDJSON export not found:', ndjsonPath);
  usage();
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const noDb = !dbUrl;
let pool = null;
if (!noDb) {
  pool = new Pool({ connectionString: dbUrl });
} else {
  console.warn('WARNING: DATABASE_URL not set — running in simulated dry-run mode (no DB checks).');
}

async function tableExists(client, tname) {
  const res = await client.query(`SELECT to_regclass($1) as reg`, [tname]);
  return res.rows[0] && res.rows[0].reg !== null;
}

async function findMsgpackPath(record) {
  // Prefer explicit msgpack path in record
  if (record.msgpack) {
    const p1 = path.resolve(process.cwd(), record.msgpack);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.resolve(process.cwd(), 'sveltekit-frontend', record.msgpack);
    if (fs.existsSync(p2)) return p2;
  }
  // Try .cache/cards/<id>.msgpack
  if (record.id) {
    const p1 = path.resolve(process.cwd(), '.cache/cards', `${record.id}.msgpack`);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.resolve(process.cwd(), 'sveltekit-frontend', '.cache/cards', `${record.id}.msgpack`);
    if (fs.existsSync(p2)) return p2;
  }
  // Try by content_hash
  if (record.content_hash) {
    const p1 = path.resolve(process.cwd(), '.cache/cards', `${record.content_hash}.msgpack`);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.resolve(process.cwd(), 'sveltekit-frontend', '.cache/cards', `${record.content_hash}.msgpack`);
    if (fs.existsSync(p2)) return p2;
  }
  // Try meta file lookup
  if (record.id) {
    const metaCandidates = [
      path.resolve(process.cwd(), '.cache/cards', `${record.id}.meta.json`),
      path.resolve(process.cwd(), 'sveltekit-frontend', '.cache/cards', `${record.id}.meta.json`)
    ];
    for (const meta of metaCandidates) {
      if (fs.existsSync(meta)) {
        try {
          const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
          if (m.msgpack) {
            const pm1 = path.resolve(process.cwd(), m.msgpack);
            if (fs.existsSync(pm1)) return pm1;
            const pm2 = path.resolve(process.cwd(), 'sveltekit-frontend', m.msgpack);
            if (fs.existsSync(pm2)) return pm2;
          }
        } catch (e) {}
      }
    }
  }
  return null;
}

async function main() {
  const lines = fs.readFileSync(ndjsonPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const records = lines.map((l) => JSON.parse(l));

  const client = noDb ? null : await pool.connect();
  try {
    if (!noDb) {
      const exists = await tableExists(client, table);
      if (!exists) {
        console.error(
          `Target table '${table}' does not exist. Create it or pass a different --table.`
        );
        process.exit(1);
      }
    }

    const report = {
      total: records.length,
      processed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      missing_msgpack: 0,
      errors: [],
      simulated: noDb,
    };

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const msgpackPath = await findMsgpackPath(rec);
      if (!msgpackPath) {
        report.missing_msgpack++;
        report.errors.push({ index: i, id: rec.id ?? null, reason: 'missing_msgpack' });
        continue;
      }

      const bin = fs.readFileSync(msgpackPath);
      const sourceRef = rec.sourceRef || rec.source_ref || rec.source || null;
      const contentHash = rec.content_hash || rec.contentHash || rec.contentHashHex || null;
      const area = rec.area || null;
      const schemaVersion = rec.schema_version || rec.schemaVersion || null;
      const cardJson = rec;

      report.processed++;

      if (!apply) {
        // Dry-run: probe if record exists
        try {
          if (noDb) {
            // Simulate: assume insert (can't check DB without DATABASE_URL)
            report.inserted++;
          } else {
            const sel = await client.query(
              `SELECT id FROM ${table} WHERE (source_ref = $1 AND content_hash = $2) OR id = $3 LIMIT 1`,
              [sourceRef, contentHash, rec.id || null]
            );
            if (sel.rows.length) report.updated++;
            else report.inserted++;
          }
        } catch (err) {
          report.errors.push({ index: i, id: rec.id ?? null, reason: err.message });
        }
      } else {
        // Real apply: upsert in a transaction
        try {
          await client.query('BEGIN');
          const sel = await client.query(
            `SELECT id FROM ${table} WHERE (source_ref = $1 AND content_hash = $2) OR id = $3 LIMIT 1`,
            [sourceRef, contentHash, rec.id || null]
          );
          if (sel.rows.length) {
            const existingId = sel.rows[0].id;
            await client.query(
              `UPDATE ${table} SET card_json = $1, card_msgpack = $2, area = $3, schema_version = $4, updated_at = now() WHERE id = $5`,
              [cardJson, bin, area, schemaVersion, existingId]
            );
            report.updated++;
          } else {
            await client.query(
              `INSERT INTO ${table} (source_ref, area, content_hash, schema_version, card_json, card_msgpack, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6, now(), now())`,
              [sourceRef, area, contentHash, schemaVersion, cardJson, bin]
            );
            report.inserted++;
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          report.errors.push({ index: i, id: rec.id ?? null, reason: err.message });
        }
      }

      if ((i + 1) % batch === 0) {
        console.log(
          `Progress: ${i + 1}/${records.length} — inserted:${report.inserted} updated:${report.updated} missing:${report.missing_msgpack}`
        );
      }
    }

    // Write report next to the NDJSON file for predictable location
    const ndjsonDir = path.dirname(ndjsonPath);
    const outDir = path.resolve(ndjsonDir, '.tmp');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const reportPath = path.join(outDir, `db_upsert_report.${apply ? 'apply' : 'dryrun'}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Upsert report written to', reportPath);
    console.log('Summary:', {
      inserted: report.inserted,
      updated: report.updated,
      missing_msgpack: report.missing_msgpack,
      errors: report.errors.length,
    });
  } finally {
    if (client) {
      try {
        client.release();
      } catch (e) {}
    }
    if (pool) {
      try {
        await pool.end();
      } catch (e) {}
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
