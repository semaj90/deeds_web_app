#!/usr/bin/env node
/**
 * caption-screenshots-gemma4.mjs
 *
 * Run Gemma4 VLM (with mmproj vision tower) over already-indexed screenshots
 * to generate captions. UPDATEs screenshot_artifacts.caption +
 * caption_embedding (768-dim via embeddinggemma).
 *
 * Endpoint: Ollama /api/generate with images: [<base64>]. Uses the
 * gemma4-legal-vlm:latest tag which has the vision tower attached.
 *
 * Stack:
 *   - Ollama @ OLLAMA_URL (default http://127.0.0.1:11434)
 *   - gemma4-legal-vlm:latest         (VLM, ~5.3GB)
 *   - embeddinggemma:latest           (768-dim caption embedding)
 *   - sharp                           (compress full image to ~512px JPEG before send,
 *                                      cheaper for VLM inference)
 *   - pg                              (read/write screenshot_artifacts)
 *
 * Optional (auto-skip if not installed):
 *   - tesseract.js                    (OCR backup if VLM caption is empty)
 *
 * Idempotent: skips rows with non-NULL caption unless --force.
 *
 * Usage:
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --dry-run
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply --limit 10
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply --no-embed
 *   node scripts/screenshots/caption-screenshots-gemma4.mjs --apply --force
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');

const args      = process.argv.slice(2);
const APPLY     = args.includes('--apply');
const DRY_RUN   = !APPLY;
const FORCE     = args.includes('--force');
const NO_EMBED  = args.includes('--no-embed');
const LIMIT     = parseInt(
  args.find(a => a.startsWith('--limit='))?.split('=')[1] ??
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '10')
) || 10;

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const VLM_MODEL  = process.env.VLM_MODEL   ?? 'gemma4-legal-vlm:latest';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const DB_URL    = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.log(`\n🖼️  Gemma4 VLM caption pass${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log(`   model:  ${VLM_MODEL}`);
console.log(`   limit:  ${LIMIT}  force: ${FORCE}  embed: ${!NO_EMBED}\n`);

const PROMPT = [
  'You are an expert UI engineer captioning a screenshot of a SvelteKit legal-AI app.',
  'Describe in 2-3 sentences:',
  '1. What page/component this shows (route, layout, primary widget)',
  '2. The state visible (loading, error, empty, populated, modal-open)',
  '3. Any visible problems (broken styling, missing data, error toast)',
  '',
  'Be concrete. Reference visible text and UI affordances. No preamble.',
].join('\n');

function fileFromUri(uri) {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace(/^file:\/\/\/?/, ''));
  }
  return uri;
}

async function compressForVlm(absPath) {
  // Cap at 512px longest edge to make inference cheap; preserves aspect ratio.
  const buf = readFileSync(absPath);
  const meta = await sharp(buf).metadata();
  const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longestEdge <= 512) return buf;
  const scale = 512 / longestEdge;
  return sharp(buf)
    .resize({
      width:  Math.round((meta.width  ?? 0) * scale),
      height: Math.round((meta.height ?? 0) * scale),
      fit: 'inside',
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function captionWithGemma4(imageB64) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   VLM_MODEL,
      prompt:  PROMPT,
      images:  [imageB64],
      stream:  false,
      options: { temperature: 0.2, num_predict: 220 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama VLM ${res.status}: ${await res.text().catch(() => '')}`);
  const j = await res.json();
  return (j.response ?? '').trim();
}

async function embedCaption(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json();
  return Array.isArray(j.embedding) ? j.embedding : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
let exitCode = 0;
try {
  await client.connect();

  const reg = await client.query(`SELECT to_regclass('public.screenshot_artifacts') AS r`);
  if (reg.rows[0]?.r == null) {
    console.error('❌ screenshot_artifacts missing — apply migration first');
    process.exit(1);
  }

  // Verify VLM is reachable
  try {
    const tags = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const j = await tags.json();
    const has = (j.models ?? []).some(m => m.name === VLM_MODEL);
    if (!has) {
      console.warn(`   ⚠ ${VLM_MODEL} not in Ollama models list — caption calls may fail`);
    } else {
      console.log(`   ✓ ${VLM_MODEL} available`);
    }
  } catch (e) {
    console.warn(`   ⚠ Ollama unreachable: ${e.message}`);
  }

  const where = FORCE ? 'TRUE' : 'caption IS NULL';
  const todo = await client.query(
    `SELECT id, image_uri FROM screenshot_artifacts
     WHERE ${where}
     ORDER BY created_at ASC
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`   found:  ${todo.rows.length} rows needing caption\n`);
  if (todo.rows.length === 0) {
    console.log(`✓ All rows already captioned (use --force to re-caption).`);
    process.exit(0);
  }

  let captioned = 0, embedded = 0, failed = 0;
  for (const row of todo.rows) {
    const imgPath = fileFromUri(row.image_uri);
    try {
      if (DRY_RUN) {
        console.log(`   [dry] would caption ${imgPath.slice(-60)}`);
        captioned++;
        continue;
      }

      const buf = await compressForVlm(imgPath);
      const b64 = buf.toString('base64');
      const caption = await captionWithGemma4(b64);
      if (!caption) {
        console.warn(`   ⚠ empty caption for ${imgPath}`);
        failed++;
        continue;
      }

      let captionEmbedding = null;
      if (!NO_EMBED) {
        captionEmbedding = await embedCaption(caption).catch(() => null);
        if (captionEmbedding) embedded++;
      }

      await client.query(
        captionEmbedding
          ? `UPDATE screenshot_artifacts SET
               caption           = $2,
               caption_embedding = $3::vector(768),
               updated_at        = now()
             WHERE id = $1`
          : `UPDATE screenshot_artifacts SET
               caption    = $2,
               updated_at = now()
             WHERE id = $1`,
        captionEmbedding
          ? [row.id, caption, '[' + captionEmbedding.join(',') + ']']
          : [row.id, caption]
      );

      captioned++;
      console.log(`   ✓ ${captioned}/${todo.rows.length}  ${caption.slice(0, 80).replace(/\n/g, ' ')}…`);
    } catch (err) {
      console.warn(`   ⚠ ${imgPath}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${DRY_RUN ? '✓ Dry-run complete' : '✅ Captioned'} — ${captioned} captioned, ${embedded} embedded, ${failed} failed`);
} catch (err) {
  console.error(`❌ Caption pass failed: ${err.message}`);
  exitCode = 1;
} finally {
  await client.end().catch(() => {});
  process.exit(exitCode);
}
