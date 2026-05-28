#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

async function main() {
  const outPath = path.join(ROOT, '.tmp', 'atlas-cards-for-weights.jsonl');
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  // Try to import the project's DB pool (Drizzle). If not available, fall back.
  let getDb = null;
  let withRetry = null;
  let sql = null;

  // Require DATABASE_URL to avoid accidental local defaults using Windows username
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error('DATABASE_URL is required to run this export script.');
    process.exitCode = 2;
    return;
  }

  try {
    const poolMod = await import(new URL('../../sveltekit-frontend/src/lib/db/pool.js', import.meta.url));
    getDb = poolMod.getDb;
    withRetry = poolMod.withRetry;
    const drizzle = await import('drizzle-orm');
    sql = drizzle.sql;
  } catch (e) {
    // Fallback to direct postgres client using explicit DATABASE_URL
    const pg = await import('postgres');
    const client = pg.default(connStr, { max: 2 });
    getDb = () => ({
      execute: async (q) => {
        // simple mapping: convert tagged template-like input to raw SQL string
        const txt = typeof q === 'string' ? q : String(q);
        return client.unsafe(txt);
      },
      query: async (txt, params) => client.unsafe(txt, params),
    });
    withRetry = async (fn) => fn();
    sql = (s, ...vals) => s;
  }

  const stream = fs.createWriteStream(outPath, { flags: 'w' });

  try {
    // rag_cards
    const ragRows = await withRetry(async () =>
      getDb().execute(sql`SELECT coalesce(card_id, id::text) as card_id, source_ref, feature_label, tags, summary FROM rag_cards LIMIT 20000`)
    );

    for (const r of ragRows) {
      const rec = {
        card_id: r.card_id ?? String(r.id ?? ''),
        sourceRef: r.source_ref ?? null,
        feature_label: r.feature_label ?? null,
        tags: r.tags ?? [],
        summary: r.summary ?? '',
        kind: 'rag'
      };
      stream.write(JSON.stringify(rec) + '\n');
    }

    // cluster_cards
    const clusterRows = await withRetry(async () =>
      getDb().execute(sql`SELECT coalesce(cluster_id, id::text) as card_id, source_ref, feature_label, tags, description as summary FROM cluster_cards LIMIT 20000`)
    );

    for (const r of clusterRows) {
      const rec = {
        card_id: r.card_id ?? String(r.id ?? ''),
        sourceRef: r.source_ref ?? null,
        feature_label: r.feature_label ?? r.title ?? null,
        tags: r.tags ?? [],
        summary: r.summary ?? r.description ?? '',
        kind: 'cluster'
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
