#!/usr/bin/env node
/**
 * enrich-screenshots.mjs
 *
 * Second-pass enrichment for already-indexed screenshot_artifacts rows:
 * computes Sharp-derived metadata that index-screenshots.mjs left NULL.
 *
 *   width  / height / bytes  ← sharp.metadata()
 *   phash                     ← 8×8 grayscale aHash (16-char hex)
 *   thumb_16_uri              ← 16×16 WebP fingerprint
 *   thumb_64_uri              ← 64×64 WebP preview
 *
 * Stack: only sharp 0.32.6 + pg 8.16.3. No new deps.
 *
 * Idempotent: skips rows that already have phash + thumb_16_uri set unless
 * --force is passed.
 *
 * Usage:
 *   node scripts/screenshots/enrich-screenshots.mjs --dry-run
 *   node scripts/screenshots/enrich-screenshots.mjs --apply
 *   node scripts/screenshots/enrich-screenshots.mjs --apply --limit 50
 *   node scripts/screenshots/enrich-screenshots.mjs --apply --force
 */

import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import sharp from 'sharp';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');

const args    = process.argv.slice(2);
const APPLY   = args.includes('--apply');
const DRY_RUN = !APPLY;
const FORCE   = args.includes('--force');
const LIMIT   = parseInt(
  args.find(a => a.startsWith('--limit='))?.split('=')[1] ??
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '200')
) || 200;

const THUMBS_DIR = resolve(ROOT, 'tmp/screenshots/.thumbs');
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.log(`\n🔬 Screenshot enrichment${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log(`   limit:  ${LIMIT}  force: ${FORCE}\n`);

// ── aHash (cheap, sufficient for "did this UI change" + duplicate detection) ──
async function aHash(buf) {
  const px = await sharp(buf)
    .resize(8, 8, { fit: 'fill', kernel: 'nearest' })
    .grayscale()
    .raw()
    .toBuffer();
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += px[i];
  const avg = sum / 64;
  let hex = '';
  for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (px[byteIdx * 8 + bit] > avg) byte |= 1 << (7 - bit);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex; // 16-char hex (64 bits)
}

function fileFromUri(uri) {
  if (uri.startsWith('file://')) {
    // Windows: file:///C:/... → C:/...
    return decodeURIComponent(uri.replace(/^file:\/\/\/?/, ''));
  }
  return uri;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
let exitCode = 0;
try {
  await client.connect();

  const reg = await client.query(`SELECT to_regclass('public.screenshot_artifacts') AS r`);
  if (reg.rows[0]?.r == null) {
    console.error('❌ screenshot_artifacts missing — apply migration first:');
    console.error('   npm run db:apply-migration drizzle/manual/screenshot_artifacts.sql');
    process.exit(1);
  }

  // Pick rows needing enrichment
  const where = FORCE
    ? 'TRUE'
    : '(phash IS NULL OR thumb_16_uri IS NULL OR width IS NULL)';
  const todo = await client.query(
    `SELECT id, image_uri FROM screenshot_artifacts
     WHERE ${where}
     ORDER BY created_at ASC
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`   found:  ${todo.rows.length} rows needing enrichment\n`);
  if (todo.rows.length === 0) {
    console.log(`✓ All rows already enriched (use --force to re-compute).`);
    process.exit(0);
  }

  if (!DRY_RUN) await mkdir(THUMBS_DIR, { recursive: true });

  let processed = 0, failed = 0;
  for (const row of todo.rows) {
    const imgPath = fileFromUri(row.image_uri);
    try {
      const buf  = readFileSync(imgPath);
      const meta = await sharp(buf).metadata();
      const ph   = await aHash(buf);

      const thumb16Path = join(THUMBS_DIR, `${ph}_16.webp`);
      const thumb64Path = join(THUMBS_DIR, `${ph}_64.webp`);

      if (DRY_RUN) {
        console.log(`   [dry] ${meta.width}×${meta.height}  phash=${ph}  ${imgPath.slice(-60)}`);
      } else {
        await sharp(buf)
          .resize(16, 16, { fit: 'cover', kernel: 'lanczos3' })
          .toFormat('webp', { quality: 80 })
          .toFile(thumb16Path);
        await sharp(buf)
          .resize(64, 64, { fit: 'cover', kernel: 'lanczos3' })
          .toFormat('webp', { quality: 85 })
          .toFile(thumb64Path);

        await client.query(
          `UPDATE screenshot_artifacts SET
             width        = $2,
             height       = $3,
             bytes        = COALESCE(bytes, $4),
             phash        = $5,
             thumb_16_uri = $6,
             thumb_64_uri = $7,
             updated_at   = now()
           WHERE id = $1`,
          [
            row.id, meta.width ?? null, meta.height ?? null, buf.length,
            ph,
            'file://' + thumb16Path.replace(/\\/g, '/'),
            'file://' + thumb64Path.replace(/\\/g, '/'),
          ]
        );
      }
      processed++;
      if (processed % 25 === 0) console.log(`   processed ${processed}/${todo.rows.length}`);
    } catch (err) {
      console.warn(`   ⚠ ${imgPath}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${DRY_RUN ? '✓ Dry-run complete' : '✅ Enriched'} — ${processed} processed, ${failed} failed`);
} catch (err) {
  console.error(`❌ Enrich failed: ${err.message}`);
  exitCode = 1;
} finally {
  await client.end().catch(() => {});
  process.exit(exitCode);
}
