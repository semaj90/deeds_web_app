#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

async function main() {
  const outPath = path.join(ROOT, '.tmp', 'atlas-cards-for-weights.jsonl');
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  // Try to import the project's DB pool (Drizzle). If not available (TS source),
  // fall back to a lightweight postgres client using DATABASE_URL.
  let getDb = null;
  let withRetry = null;
  let sql = null;

  try {
    const poolMod = await import(new URL('../../sveltekit-frontend/src/lib/db/pool.js', import.meta.url));
    getDb = poolMod.getDb;
    withRetry = poolMod.withRetry;
    const drizzleMod = await import('drizzle-orm');
    sql = drizzleMod.sql;
  } catch (e) {
    // Fallback: use postgres driver directly
    const pg = await import('postgres');
    const connStr = process.env.DATABASE_URL || process.env.DATABASE || 'postgres://127.0.0.1:5432/postgres';
    const client = pg.default(connStr, { max: 2 });
    getDb = () => ({ execute: (q) => client.unsafe(q) });
    withRetry = async (fn) => fn();
    sql = (s, ...vals) => s; // passthrough for simple usage
  }

  const stream = fs.createWriteStream(outPath, { flags: 'w' });

  try {
    // rag_cards
    const ragRows = await withRetry(async () =>
      getDb().execute(sql`SELECT coalesce(card_id, id::text) as card_id, source_ref, feature_label, tags FROM rag_cards LIMIT 10000`)
    );

    for (const r of ragRows) {
      const rec = {
        card_id: r.card_id ?? String(r.id ?? ''),
        sourceRef: r.source_ref ?? null,
        feature_label: r.feature_label ?? null,
        tags: r.tags ?? null,
        cosine_score: null,
        authority_score: null,
        source_table: 'rag_cards'
      };
      stream.write(JSON.stringify(rec) + '\n');
    }

    // cluster_cards
    const clusterRows = await withRetry(async () =>
      getDb().execute(sql`SELECT coalesce(cluster_id, id::text) as card_id, source_ref, feature_label, tags FROM cluster_cards LIMIT 10000`)
    );

    for (const r of clusterRows) {
      const rec = {
        card_id: r.card_id ?? String(r.id ?? ''),
        sourceRef: r.source_ref ?? null,
        feature_label: r.feature_label ?? r.title ?? null,
        tags: r.tags ?? null,
        cosine_score: null,
        authority_score: null,
        source_table: 'cluster_cards'
      };
      stream.write(JSON.stringify(rec) + '\n');
    }

    console.log('Wrote', outPath);
  } catch (e) {
    console.error('Export failed:', e?.message ?? e);
    process.exitCode = 2;
  } finally {
    stream.end();
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
