#!/usr/bin/env node
/**
 * load-cluster-cards-postgres.mjs
 *
 * Idempotent cluster-cards.jsonl → Postgres loader.
 * Reads NDJSON from sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl,
 * upserts into Postgres cluster_cards table via pg client.
 *
 * Usage:
 *   node scripts/atlas/load-cluster-cards-postgres.mjs          # Load (apply)
 *   node scripts/atlas/load-cluster-cards-postgres.mjs --dry-run # Dry-run (preview)
 *
 * Input: sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl
 * Table: Postgres public.cluster_cards (JSONB card column)
 */

import 'dotenv/config';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const INPUT_PATH = resolve(ROOT, 'sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl');
const DRY_RUN = process.argv.includes('--dry-run');
const QUIET = process.argv.includes('--quiet');
const DIM = 768;

const log = (...a) => !QUIET && console.log(...a);
const warn = (...a) => console.warn(...a);
const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── Postgres client ────────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  database: process.env.POSTGRES_DB ?? 'legal_ai_db',
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ── Main ───────────────────────────────────────────────────────────────────

log(`${c.b('📤 Cluster Cards → Postgres Loader')}`);
log(`   DRY_RUN: ${DRY_RUN}`);
log(`   INPUT: ${INPUT_PATH}`);

try {
  // Step 1: Read NDJSON
  log(`\n${c.b('Step 1')} — Read cluster-cards.jsonl`);
  if (!fs.existsSync(INPUT_PATH)) {
    warn(`${c.r('✗')} File not found: ${INPUT_PATH}`);
    process.exit(1);
  }

  const ndjson = fs.readFileSync(INPUT_PATH, 'utf8');
  const cards = ndjson
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        warn(`  ${c.y('⚠')} Line ${i + 1} parse error: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);

  log(`  ${c.g('✓')} Read ${cards.length} cluster cards`);

  if (!DRY_RUN) {
    // Step 2: Connect to Postgres
    log(`\n${c.b('Step 2')} — Connect to Postgres`);
    const client = await pool.connect();
    log(`  ${c.g('✓')} Connected`);

    try {
      // Step 3: Upsert cards
      log(`\n${c.b('Step 3')} — Upsert cluster cards`);

      const upsertQuery = `
        INSERT INTO cluster_cards (id, card, centroid_dim, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          card = EXCLUDED.card,
          centroid_dim = EXCLUDED.centroid_dim,
          updated_at = now()
      `;

      let upserted = 0;
      for (const card of cards) {
        await client.query(upsertQuery, [
          card.id,
          JSON.stringify(card),
          card.centroid_dim || DIM,
          new Date().toISOString(),
          new Date().toISOString(),
        ]);
        upserted += 1;
      }

      log(`  ${c.g('✓')} Upserted ${upserted} cards`);

      // Step 4: Verify
      log(`\n${c.b('Step 4')} — Verify`);
      const result = await client.query('SELECT COUNT(*) as count FROM cluster_cards');
      const count = result.rows[0].count;
      log(`  ${c.g('✓')} Total cards in DB: ${count}`);
    } finally {
      client.release();
    }

    log(`\n${c.g('✓')} Complete`);
  } else {
    log(`\n${c.y('⚠')} DRY-RUN: Skipping Postgres operations`);
    if (cards.length > 0) {
      log(`  Preview: ${JSON.stringify(cards[0]).slice(0, 100)}...`);
    }
  }

  await pool.end();
  process.exit(0);
} catch (err) {
  warn(`${c.r('✗')} Error: ${err.message}`);
  process.exit(1);
}
