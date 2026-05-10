#!/usr/bin/env node
/**
 * enrich-evidence-image-tags.mjs
 *
 * Batch-enrich Qdrant evidence_items points with VLM-generated tags.
 *
 * Pipeline per point:
 *   1. Scroll evidence_items (filter: has file_path OR minioKey, missing/empty tags)
 *   2. Resolve image bytes (local file_path → MinIO presigned URL → skip)
 *   3. analyzeEvidenceImage() → { summary, suggestedTags }  (Redis-cached by sha256)
 *   4. setPayload PATCH → { tags, vlm_summary, vlm_model, vlm_enriched_at }
 *
 * Usage:
 *   node scripts/enrich-evidence-image-tags.mjs
 *   node scripts/enrich-evidence-image-tags.mjs --limit 50
 *   node scripts/enrich-evidence-image-tags.mjs --collection evidence_items --force
 *   node scripts/enrich-evidence-image-tags.mjs --dry-run
 *
 * Flags:
 *   --limit N        Max points to process (default: 200)
 *   --batch N        Concurrent VLM calls (default: 3)
 *   --collection     Qdrant collection (default: evidence_items)
 *   --force          Re-enrich points that already have vlm_enriched_at
 *   --dry-run        Caption only; do NOT patch Qdrant
 *   --quiet          Suppress per-point logs
 *   --sk-url         SvelteKit base URL (default: http://127.0.0.1:5173)
 *   --qdrant-url     Qdrant URL (default: http://127.0.0.1:6333)
 */

import { readFile } from 'node:fs/promises';
import { resolve as resolvePath, basename } from 'node:path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const args       = process.argv.slice(2);
const getArg     = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : def; };
const hasFlag    = (flag) => args.includes(flag);

const LIMIT      = parseInt(getArg('--limit',    '200'), 10);
const BATCH      = parseInt(getArg('--batch',    '3'),   10);
const COLLECTION = getArg('--collection', 'evidence_items');
const FORCE      = hasFlag('--force');
const DRY_RUN    = hasFlag('--dry-run');
const QUIET      = hasFlag('--quiet');
const SK_URL     = getArg('--sk-url',    process.env.SVELTEKIT_URL  ?? 'http://127.0.0.1:5173');
const QDRANT_URL = getArg('--qdrant-url', process.env.QDRANT_URL    ?? 'http://127.0.0.1:6333');
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const TURBO_URL  = process.env.TURBOQUANT_URL  ?? 'http://127.0.0.1:8090';

const log  = (...a) => !QUIET && console.log(...a);
const warn = (...a) => console.warn(...a);

// ── VLM caption via Triton→TurboQuant→Ollama cascade ─────────────────────────

async function captionImage(buffer, fileName) {
  const b64 = buffer.toString('base64');

  // Try TurboQuant first (vision endpoint)
  for (const [label, url] of [['TurboQuant', TURBO_URL], ['Ollama', OLLAMA_URL]]) {
    try {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal-vlm',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
              { type: 'text', text: 'Describe this image in detail for legal evidence cataloguing. List: what is shown, key objects/text/people, location indicators, and 5-10 relevant tags as a JSON array at the end in format {"tags":["tag1","tag2"]}.' },
            ],
          }],
          max_tokens: 400,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      // Extract tags JSON block
      const tagsMatch = text.match(/\{"tags"\s*:\s*(\[[\s\S]*?\])\}/);
      const tags = tagsMatch ? JSON.parse(tagsMatch[1]) : extractTagsFromText(text);
      const summary = text.replace(/\{"tags"[\s\S]*?\}/g, '').trim().slice(0, 500);
      return { summary, suggestedTags: tags.slice(0, 15), model: `${label}/gemma4-legal-vlm`, cached: false };
    } catch { /* try next */ }
  }

  // Ollama /api/generate fallback
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-vlm',
        prompt: 'Describe this image for legal evidence cataloguing. List key objects, people, text visible, and 5-10 tags.',
        images: [b64],
        stream: false,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data?.response ?? '';
      return { summary: text.slice(0, 500), suggestedTags: extractTagsFromText(text).slice(0, 15), model: 'ollama/gemma4-legal-vlm', cached: false };
    }
  } catch { /* fall through */ }

  throw new Error('All VLM endpoints failed');
}

function extractTagsFromText(text) {
  // Heuristic: extract comma-separated or bullet items that look like tags
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && w.length < 30);
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] ?? 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
}

// ── Resolve image bytes for a point ──────────────────────────────────────────

async function resolveImageBytes(payload) {
  // Local file_path candidates
  for (const key of ['file_path', 'filePath', 'localPath']) {
    const p = payload[key];
    if (!p) continue;
    try { return { buffer: await readFile(String(p)), name: basename(String(p)) }; } catch { /* try next */ }
  }

  // MinIO via SvelteKit presigned endpoint
  const minioKey = payload.minioKey ?? payload.storageKey ?? payload.minio_key;
  if (minioKey) {
    try {
      const r = await fetch(`${SK_URL}/api/evidence/file/${encodeURIComponent(String(minioKey))}`, { signal: AbortSignal.timeout(15_000) });
      if (r.ok) return { buffer: Buffer.from(await r.arrayBuffer()), name: basename(String(minioKey)) };
    } catch { /* non-fatal */ }
  }

  return null;
}

// ── Scroll Qdrant points ──────────────────────────────────────────────────────

async function scrollPoints() {
  const mustFilter = FORCE ? [] : [
    // Skip points already enriched (unless --force)
    { key: 'vlm_enriched_at', is_empty: { key: 'vlm_enriched_at' } },
  ];

  const allPoints = [];
  let offset = null;

  while (allPoints.length < LIMIT) {
    const body = {
      limit: Math.min(100, LIMIT - allPoints.length),
      with_payload: true,
      with_vector: false,
      ...(offset ? { offset } : {}),
    };

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Qdrant scroll ${res.status}: ${await res.text().catch(() => '')}`);
    const data = await res.json();
    const points = data?.result?.points ?? [];

    for (const pt of points) {
      const payload = pt.payload ?? {};
      // Skip points with no image reference
      const hasRef = payload.file_path || payload.filePath || payload.minioKey || payload.storageKey;
      if (!hasRef) continue;
      // Skip already-enriched unless --force
      if (!FORCE && payload.vlm_enriched_at) continue;
      allPoints.push(pt);
      if (allPoints.length >= LIMIT) break;
    }

    offset = data?.result?.next_page_offset;
    if (!offset || !points.length) break;
  }

  return allPoints;
}

// ── Patch Qdrant payload ──────────────────────────────────────────────────────

async function patchPayload(pointId, tags, summary, model, existingTags) {
  const merged = [...new Set([...(existingTags ?? []).map(t => String(t).toLowerCase()), ...tags.map(t => String(t).toLowerCase())])];
  const patch = { tags: merged, vlm_summary: summary.slice(0, 500), vlm_model: model, vlm_enriched_at: new Date().toISOString() };
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: patch, points: [pointId] }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Qdrant PATCH ${res.status}: ${await res.text().catch(() => '')}`);
  return merged;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\n🏷  enrich-evidence-image-tags`);
console.log(`   collection: ${COLLECTION}  limit: ${LIMIT}  batch: ${BATCH}  force: ${FORCE}  dry-run: ${DRY_RUN}\n`);

const points = await scrollPoints().catch(e => { console.error('Scroll failed:', e.message); process.exit(1); });
console.log(`   Found ${points.length} point(s) to enrich\n`);

if (!points.length) { console.log('   Nothing to do.'); process.exit(0); }

let enriched = 0, skipped = 0, failed = 0;

// Process in batches of BATCH concurrent VLM calls
for (let i = 0; i < points.length; i += BATCH) {
  const chunk = points.slice(i, i + BATCH);
  await Promise.all(chunk.map(async (pt) => {
    const pid = String(pt.id);
    const payload = pt.payload ?? {};

    const img = await resolveImageBytes(payload);
    if (!img) {
      log(`   ⊘ ${pid}  no image bytes resolved`);
      skipped++;
      return;
    }

    try {
      const result = await captionImage(img.buffer, img.name);
      if (!DRY_RUN) {
        const merged = await patchPayload(pid, result.suggestedTags, result.summary, result.model, payload.tags);
        log(`   ✓ ${pid}  +${result.suggestedTags.length} tags → ${merged.length} total  [${result.model}]`);
      } else {
        log(`   ~ ${pid}  (dry-run) tags: ${result.suggestedTags.join(', ').slice(0, 80)}`);
      }
      enriched++;
    } catch (e) {
      warn(`   ✗ ${pid}  ${e.message?.slice(0, 100)}`);
      failed++;
    }
  }));
}

console.log(`\n   ─────────────────────────────────────────`);
console.log(`   enriched: ${enriched}  skipped: ${skipped}  failed: ${failed}  dry-run: ${DRY_RUN}`);
if (DRY_RUN) console.log('   Run without --dry-run to apply patches.');
console.log('');
process.exit(failed > 0 ? 1 : 0);
