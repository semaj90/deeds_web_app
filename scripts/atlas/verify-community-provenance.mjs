#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? '123456'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

const pool = new pg.Pool({ connectionString: DATABASE_URL });
try {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(community_source)::int AS with_source,
      COUNT(community_confidence)::int AS with_conf,
      ROUND(AVG(community_confidence)::numeric, 3) AS avg_conf
    FROM atlas_packets
  `);
  const r = rows[0];
  console.log(r);
  if (r.total === 0) process.exit(1);
  if (r.with_source < r.total) {
    console.error(`FAIL: community_source incomplete ${r.with_source}/${r.total}`);
    process.exit(1);
  }
  if (r.with_conf < r.total) {
    console.error(`FAIL: community_confidence incomplete ${r.with_conf}/${r.total}`);
    process.exit(1);
  }
  console.log('PASS: community provenance populated');
} finally {
  await pool.end();
}
