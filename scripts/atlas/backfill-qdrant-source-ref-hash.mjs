#!/usr/bin/env node
/**
 * backfill-qdrant-source-ref-hash.mjs
 *
 * Adds `sourceRefHash` and `canonicalSourceRef` payload fields to every point
 * in codebase_chunks_768 that is missing them. Skips noise paths (.venv,
 * api-cleanup, node_modules). Uses batch set_payload for efficiency.
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-source-ref-hash.mjs            # dry-run
 *   node scripts/atlas/backfill-qdrant-source-ref-hash.mjs --apply
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

const { normalizeSourceRef, sourceRefHash, isGeneratedPath } =
  await import(pathToFileURL(resolve(__dirname, '../lib/canonical-source-ref.mjs')).href);

const APPLY = process.argv.includes('--apply');
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH = 50; // Qdrant set_payload batch size
const SCROLL_LIMIT = 250;

const NOISE_CONTAINS = ['.venv', 'api-cleanup', 'node_modules', 'deeds_labs', '/backup'];
function isNoise(fp) {
  if (!fp) return true;
  return NOISE_CONTAINS.some(n => fp.includes(n));
}

function getFilePath(payload) {
  return payload.file_path ?? payload.filePath ?? payload.relativePath
      ?? payload.sourceRef ?? payload.source_ref ?? null;
}

console.log(`[qdrant-backfill] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} collection=${COLLECTION}`);

let offset = null;
let total = 0, updated = 0, skipped = 0, noise = 0, alreadySet = 0;
const pending = []; // { id, canonical, hash }

async function flushPending() {
  if (!pending.length || !APPLY) return;
  // Group by canonical+hash for set_payload batches
  const points = pending.map(p => p.id);
  // Qdrant set_payload requires same payload for all points in batch.
  // Group by payload content.
  const byPayload = new Map();
  for (const p of pending) {
    const key = `${p.canonical}||${p.hash}`;
    if (!byPayload.has(key)) byPayload.set(key, { canonical: p.canonical, hash: p.hash, ids: [] });
    byPayload.get(key).ids.push(p.id);
  }
  for (const { canonical, hash, ids } of byPayload.values()) {
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { canonicalSourceRef: canonical, sourceRefHash: hash },
          points: chunk,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.warn(`[qdrant-backfill] set_payload failed: ${res.status}`);
      }
    }
  }
  updated += pending.length;
  pending.length = 0;
}

// Scroll through all points
while (true) {
  const body = {
    limit: SCROLL_LIMIT,
    with_payload: true,
    with_vector: false,
  };
  if (offset !== null) body.offset = offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) { console.error(`Scroll failed: ${res.status}`); break; }

  const data = await res.json();
  const points = data.result?.points ?? [];
  const nextOffset = data.result?.next_page_offset ?? null;

  for (const pt of points) {
    total++;
    const fp = getFilePath(pt.payload);

    if (isNoise(fp)) { noise++; continue; }
    if (isGeneratedPath(fp)) { skipped++; continue; }

    const canonical = normalizeSourceRef(fp);
    if (!canonical) { skipped++; continue; }

    // Skip if already set correctly
    if (pt.payload.sourceRefHash && pt.payload.canonicalSourceRef === canonical) {
      alreadySet++;
      continue;
    }

    const hash = sourceRefHash(fp);
    pending.push({ id: pt.id, canonical, hash });

    if (pending.length >= BATCH * 4) await flushPending();
  }

  if (total % 5000 === 0) {
    process.stdout.write(`  [${total} scanned / ${updated} updated / ${noise} noise]\r`);
  }

  if (!nextOffset) break;
  offset = nextOffset;
}

await flushPending();

console.log(`\n[qdrant-backfill] Done.`);
console.log(`  total scanned : ${total}`);
console.log(`  already set   : ${alreadySet}`);
console.log(`  updated       : ${APPLY ? updated : pending.length + ' (dry-run, not written)'}`);
console.log(`  noise skipped : ${noise}`);
console.log(`  other skipped : ${skipped}`);

const reportDir = resolve(REPO, 'memory/exports');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, 'qdrant-source-ref-hash-backfill.json'), JSON.stringify({
  ts: new Date().toISOString(), mode: APPLY ? 'apply' : 'dry-run',
  total, alreadySet, updated: APPLY ? updated : 0, noise, skipped,
}, null, 2));
