#!/usr/bin/env node
/**
 * qdrant-tag-backfill.mjs
 *
 * Backfills `tags` and `feature_key` payload fields on existing Qdrant points
 * that were indexed without tags or with incomplete tags.
 *
 * Two modes:
 *   --from-ndjson  (default) — reads an NDJSON file and patches Qdrant points
 *                              by chunk_id match
 *   --scan         — scrolls an entire collection and re-infers tags from the
 *                    `text` payload field, patching any point missing `tags`
 *
 * Usage:
 *   node scripts/atlas/qdrant-tag-backfill.mjs \
 *     --collection error_notes \
 *     --from-ndjson tmp/chunks/error-context.ndjson \
 *     --dry-run
 *
 *   node scripts/atlas/qdrant-tag-backfill.mjs \
 *     --collection docs_chunks \
 *     --scan \
 *     --tags feature:workers.kmeans,error:syntax
 *
 *   node scripts/atlas/qdrant-tag-backfill.mjs \
 *     --collection error_notes \
 *     --scan --dry-run
 *
 * Env:
 *   QDRANT_URL    default http://localhost:6333
 */

import fs      from 'node:fs';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const collI      = argv.indexOf('--collection');
const ndI        = argv.indexOf('--from-ndjson');
const tagsI      = argv.indexOf('--tags');
const DRY_RUN    = argv.includes('--dry-run');
const SCAN_MODE  = argv.includes('--scan');
const VERBOSE    = argv.includes('--verbose');

const COLLECTION  = collI  >= 0 ? argv[collI + 1]  : null;
const NDJSON_PATH = ndI    >= 0 ? argv[ndI + 1]    : null;
const EXTRA_TAGS  = tagsI  >= 0 ? argv[tagsI + 1].split(',').map(t => t.trim()).filter(Boolean) : [];

import { getQdrantUrl, qdrantScroll, qdrantUpdatePayload } from '../qdrant-client.mjs';
const QDRANT_URL = getQdrantUrl();
const BATCH_SIZE = 100;

// ── Tag inference (mirrors chunk-text-notes.mjs) ─────────────────────────────
const TAG_PATTERNS = [
  [/svelte-check|svelte\s*check/i, 'tool:svelte-check'],
  [/kmeans[\-_]worker/i, 'feature:workers.kmeans'],
  [/drizzle[\-_]kit|drizzle\.config/i, 'tool:drizzle-kit'],
  [/qdrant/i, 'store:qdrant'],
  [/pgvector/i, 'store:pgvector'],
  [/citations?[\-_]table/i, 'feature:citations-table'],
  [/neo4j/i, 'store:neo4j'],
  [/redis/i, 'store:redis'],
  [/embeddinggemma|embedding.*gemma/i, 'model:embeddinggemma'],
  [/gemma4/i, 'model:gemma4'],
  [/error\s+TS\d{4}|TS\d{4}/, 'error:typescript'],
  [/error.*\.svelte|\.svelte.*error/i, 'error:svelte'],
  [/parse\s+error|syntax\s+error/i, 'error:syntax'],
  [/import\s+error|cannot\s+find\s+module/i, 'error:import'],
  [/\bhypergraph\b/i, 'feature:hypergraph'],
  [/\bkag\b|\bkarpathy\b/i, 'feature:kag'],
  [/\brag\b|\bretrieval\b/i, 'feature:rag'],
  [/\bgpu\b|\bcuda\b|\blibtorch\b/i, 'feature:gpu'],
  [/\bsom\b/i, 'feature:som'],
  [/\bace\b/, 'feature:ace'],
  [/chunk/i, 'feature:chunking'],
  [/\bworker[s]?\b/i, 'feature:workers'],
];

function inferTags(text) {
  const tags = new Set();
  for (const [re, tag] of TAG_PATTERNS) {
    if (re.test(text)) tags.add(tag);
  }
  return [...tags];
}

function deriveFeatureKey(tags, sourcePath) {
  // e.g. "feature:workers.kmeans" → "workers.kmeans"
  const featureTags = tags
    .filter((t) => t.startsWith('feature:'))
    .map((t) => t.replace('feature:', ''));
  if (featureTags.length > 0) return featureTags[0];
  // fallback: stem of source path
  return path.basename(sourcePath ?? 'unknown').replace(/\.[^.]+$/, '');
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────
async function scrollCollection(collection, offset, limit) {
  const body = { offset: offset ?? null, limit, with_payload: true, with_vector: false };
  // Request legacy pagination shape for scripts that expect { points, next_page_offset }
  const res = await qdrantScroll(collection, body, { legacyPagination: true });
  return res;
}

async function setPayload(collection, pointId, payload) {
  const ok = await qdrantUpdatePayload(collection, { payload, points: [pointId] });
  if (!ok) throw new Error(`SetPayload ${collection}/${pointId}: failed`);
}

// ── Mode 1: patch from NDJSON ─────────────────────────────────────────────────
async function backfillFromNdjson(ndjsonPath, collection) {
  const lines   = fs.readFileSync(ndjsonPath, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));
  console.log(`[tag-backfill] Loaded ${records.length} records from ${ndjsonPath}`);

  let patched = 0;
  let skipped = 0;

  for (const rec of records) {
    const tags = [...new Set([...(rec.tags ?? []), ...EXTRA_TAGS, ...inferTags(rec.text ?? '')])];
    const featureKey = deriveFeatureKey(tags, rec.source_path);

    const newPayload = { tags, feature_key: featureKey };

    if (VERBOSE) {
      console.log(`  ${rec.chunk_id}  tags=${tags.join(',')}  feature_key=${featureKey}`);
    }

    if (DRY_RUN) { skipped++; continue; }

    // Build UUID id from chunk_id
    const padded = (rec.chunk_id ?? '').padEnd(32, '0');
    const qdrantId = `${padded.slice(0,8)}-${padded.slice(8,12)}-${padded.slice(12,16)}-${padded.slice(16,20)}-${padded.slice(20,32)}`;

    try {
      await setPayload(collection, qdrantId, newPayload);
      patched++;
    } catch (err) {
      console.warn(`  [skip] ${rec.chunk_id}: ${err.message}`);
      skipped++;
    }
    process.stdout.write(`\r[tag-backfill] patched=${patched} skipped=${skipped}  `);
  }

  console.log(`\n[tag-backfill] ✅ ndjson mode: patched=${patched} skipped=${skipped}`);
}

// ── Mode 2: scan + re-infer ───────────────────────────────────────────────────
async function backfillByScan(collection) {
  console.log(`[tag-backfill] Scanning collection: ${collection}`);
  let offset = null;
  let total  = 0;
  let patched = 0;

  do {
    const { points, next_page_offset } = await scrollCollection(collection, offset, BATCH_SIZE);
    offset = next_page_offset;

    for (const pt of points) {
      total++;
      const payload = pt.payload ?? {};
      const existingTags = payload.tags ?? [];

      if (existingTags.length > 0 && EXTRA_TAGS.length === 0) continue; // already tagged

      const text = payload.text ?? '';
      const newTags = [...new Set([...existingTags, ...inferTags(text), ...EXTRA_TAGS])];
      const featureKey = deriveFeatureKey(newTags, payload.source_path ?? '');

      if (newTags.length === existingTags.length && payload.feature_key) continue;

      if (VERBOSE) {
        console.log(`  pt=${pt.id}  +tags=${newTags.join(',')}`);
      }

      if (!DRY_RUN) {
        try {
          await setPayload(collection, pt.id, { tags: newTags, feature_key: featureKey });
          patched++;
        } catch (err) {
          console.warn(`  [skip] ${pt.id}: ${err.message}`);
        }
      } else {
        patched++;
      }
    }
    process.stdout.write(`\r[tag-backfill] scanned=${total} patched=${patched}  `);
  } while (offset !== null);

  console.log(`\n[tag-backfill] ✅ scan mode: total=${total} patched=${patched}${DRY_RUN ? ' (dry)' : ''}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!COLLECTION) {
    console.error('[tag-backfill] --collection required');
    process.exit(1);
  }

  console.log(`[tag-backfill] Collection: ${COLLECTION}  dry=${DRY_RUN}  extra_tags=${EXTRA_TAGS.join(',')}`);

  if (SCAN_MODE) {
    await backfillByScan(COLLECTION);
  } else if (NDJSON_PATH) {
    const resolved = path.isAbsolute(NDJSON_PATH) ? NDJSON_PATH : path.join(ROOT, NDJSON_PATH);
    await backfillFromNdjson(resolved, COLLECTION);
  } else {
    console.error('[tag-backfill] Provide --from-ndjson <path> or --scan');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[tag-backfill]', err.message);
  process.exit(1);
});