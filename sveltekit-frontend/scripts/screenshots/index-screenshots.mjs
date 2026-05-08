#!/usr/bin/env node
/**
 * index-screenshots.mjs
 *
 * Scans tests/e2e/screenshots/ + static/screenshots/ + tmp/screenshots/ for PNG/WebP/JPG
 * artifacts and upserts metadata rows into the `screenshot_artifacts` table.
 *
 * Read-side defaults (DRY-RUN). No image content is opened — we only stat the
 * file and record file://<absolute path> so blobs stay where they are.
 * Width/height/phash/caption are left NULL on the first pass; downstream
 * scripts can backfill them (see caption-screenshots-gemma4.mjs).
 *
 * Usage:
 *   node scripts/screenshots/index-screenshots.mjs               # dry-run
 *   node scripts/screenshots/index-screenshots.mjs --apply       # write rows
 *   node scripts/screenshots/index-screenshots.mjs --apply --root ../static/screenshots
 *
 * Idempotency: keyed on (image_uri); rows reused via ON CONFLICT.
 */

import { readdir, stat } from 'node:fs/promises';
import { resolve, join, extname, basename, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg     from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '../..');
const args       = process.argv.slice(2);
const APPLY      = args.includes('--apply');
const ROOT_FLAG  = args.findIndex(a => a === '--root');
const ROOTS      = ROOT_FLAG !== -1
  ? [resolve(REPO_ROOT, args[ROOT_FLAG + 1])]
  : [
      resolve(REPO_ROOT, 'tests/e2e/screenshots'),
      resolve(REPO_ROOT, 'static/screenshots'),
      resolve(REPO_ROOT, 'tmp/screenshots'),
    ];

const IMG_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const DB_URL   = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && IMG_EXTS.has(extname(e.name).toLowerCase())) yield full;
  }
}

function inferSourceKind(absPath) {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (rel.startsWith('tests/e2e/screenshots/')) return 'visual-regression';
  if (rel.startsWith('static/screenshots/'))    return 'route';
  if (rel.startsWith('tmp/screenshots/'))       return 'manual';
  return 'manual';
}

function inferRoutePath(absPath) {
  const name = basename(absPath, extname(absPath));
  // Naming convention used by Playwright tests: "route_app_dashboard.png" → "/app/dashboard"
  const m = name.match(/^route[_-](.+)$/);
  return m ? '/' + m[1].replace(/[_-]/g, '/') : null;
}

async function main() {
  console.log(`\n[index-screenshots] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} roots=${ROOTS.length}`);
  const files = [];
  for (const r of ROOTS) {
    let count = 0;
    for await (const f of walk(r)) { files.push(f); count++; }
    console.log(`  ${count.toString().padStart(5)}  ${relative(REPO_ROOT, r).replace(/\\/g, '/')}`);
  }
  console.log(`  ${files.length.toString().padStart(5)}  total`);

  if (files.length === 0) {
    console.log(`\n  ⓘ no screenshots found — table provisioned but empty. Add files to:`);
    for (const r of ROOTS) console.log(`     ${relative(REPO_ROOT, r).replace(/\\/g, '/')}`);
    return;
  }

  const rows = [];
  for (const f of files) {
    const s = await stat(f).catch(() => null);
    if (!s) continue;
    rows.push({
      image_uri:    pathToFileURL(f).href,
      source_kind:  inferSourceKind(f),
      file_path:    relative(REPO_ROOT, f).replace(/\\/g, '/'),
      route_path:   inferRoutePath(f),
      bytes:        s.size,
      metadata:     JSON.stringify({ mtime: s.mtime.toISOString() }),
    });
  }

  if (!APPLY) {
    console.log(`\n  [dry-run] would upsert ${rows.length} rows. Sample:`);
    for (const r of rows.slice(0, 3)) console.log(`     ${r.source_kind.padEnd(18)}  ${r.file_path}`);
    console.log(`\n  Re-run with --apply to write.`);
    return;
  }

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  // Add a UNIQUE on image_uri so ON CONFLICT works (idempotent runs)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS screenshot_artifacts_image_uri_uniq
    ON screenshot_artifacts (image_uri)
  `).catch(() => {});

  let upserted = 0;
  for (const r of rows) {
    await client.query(
      `INSERT INTO screenshot_artifacts (image_uri, source_kind, file_path, route_path, bytes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (image_uri) DO UPDATE SET
         source_kind = EXCLUDED.source_kind,
         file_path   = EXCLUDED.file_path,
         route_path  = EXCLUDED.route_path,
         bytes       = EXCLUDED.bytes,
         metadata    = screenshot_artifacts.metadata || EXCLUDED.metadata,
         updated_at  = now()`,
      [r.image_uri, r.source_kind, r.file_path, r.route_path, r.bytes, r.metadata],
    );
    upserted++;
  }
  console.log(`\n  ✓ upserted ${upserted} screenshot_artifacts rows`);

  const { rows: counts } = await client.query(
    `SELECT source_kind, count(*) FROM screenshot_artifacts GROUP BY source_kind ORDER BY 2 DESC`,
  );
  for (const c of counts) console.log(`     ${c.source_kind.padEnd(18)}  ${c.count}`);
  await client.end();
}

main().catch(err => {
  console.error('✗ index-screenshots failed:', err.message);
  process.exit(1);
});
