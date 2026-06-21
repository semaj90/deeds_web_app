#!/usr/bin/env node
/**
 * scripts/atlas/reindex-qdrant-encoded64.mjs
 *
 * 1. Creates `codebase_chunks_encoded64` collection (64-dim, Cosine) in Qdrant if not exists.
 * 2. Scrolls `codebase_chunks_768`, extracts `encoded_64` vector (or encodes content on-the-fly via Redis weights).
 * 3. Upserts them as 64d flat vectors with payload to `codebase_chunks_encoded64`.
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../sveltekit-frontend/.env') });

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL  = process.env.REDIS_URL  ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? 'redis';

const SRC_COLLECTION = 'codebase_chunks_768';
const DST_COLLECTION = 'codebase_chunks_encoded64';
const SCROLL_BATCH   = 500;
const UPSERT_BATCH   = 200;

// Dimensions
const CONTENT_DIM = 768;
const HIDDEN_DIM  = 256;
const ENCODED_DIM = 64;

const WEIGHTS_KEY = 'ace:autoencoder:weights';
const META_KEY    = 'ace:autoencoder:meta';

// Helper: Linear Layer mapping
function linearLayer(data, n, inputDim, W, b, outputDim, relu) {
  const out = new Float32Array(n * outputDim);
  for (let i = 0; i < n; i++) {
    const xOff = i * inputDim;
    const yOff = i * outputDim;
    for (let h = 0; h < outputDim; h++) {
      let act = b[h];
      const wOff = h * inputDim;
      for (let d = 0; d < inputDim; d++) {
        act += data[xOff + d] * W[wOff + d];
      }
      out[yOff + h] = relu ? Math.max(0, act) : act;
    }
  }
  return out;
}

function l2NormalizeRows(data, n, dim) {
  for (let i = 0; i < n; i++) {
    const off = i * dim;
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += data[off + d] * data[off + d];
    norm = Math.sqrt(norm) || 1e-12;
    for (let d = 0; d < dim; d++) data[off + d] /= norm;
  }
  return data;
}

function encode768to64(vec768, weights) {
  const h = linearLayer(vec768, 1, CONTENT_DIM, weights.W1, weights.b1, HIDDEN_DIM, true);
  const z = linearLayer(h,      1, HIDDEN_DIM,  weights.W2, weights.b2, ENCODED_DIM, false);
  return l2NormalizeRows(z, 1, ENCODED_DIM);
}

async function qdrantCall(url, method = 'GET', body = null) {
  const opts = { method };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`Qdrant ${method} ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log(`\n═══ Reindexing Qdrant codebase_chunks_768 -> codebase_chunks_encoded64 ═══`);
  console.log(`Qdrant: ${QDRANT_URL}`);

  // Connect to Redis to get weights
  console.log(`Redis:  ${REDIS_URL}`);
  const redis = new Redis(REDIS_URL, { password: REDIS_PASS || undefined });
  let weights = null;
  try {
    const [rawW, rawMeta] = await Promise.all([
      redis.hgetall(WEIGHTS_KEY),
      redis.hgetall(META_KEY)
    ]);
    if (rawW && rawW.W1) {
      const parse = csv => new Float32Array(csv.split(',').map(Number));
      weights = {
        W1: parse(rawW.W1),
        b1: parse(rawW.b1),
        W2: parse(rawW.W2),
        b2: parse(rawW.b2),
        trainedAt: rawMeta.trainedAt ?? 'unknown'
      };
      console.log(`✓ Loaded autoencoder weights from Redis (trainedAt: ${weights.trainedAt})`);
    } else {
      console.warn(`⚠️ Autoencoder weights not found in Redis. On-the-fly encoding will be disabled.`);
    }
  } catch (err) {
    console.error(`⚠️ Failed to load weights from Redis:`, err.message);
  } finally {
    redis.disconnect();
  }

  // 1. Create codebase_chunks_encoded64 if it does not exist
  const collectionsList = await qdrantCall(`${QDRANT_URL}/collections`);
  const collections = collectionsList.result?.collections?.map(c => c.name) ?? [];
  if (!collections.includes(DST_COLLECTION)) {
    console.log(`⚙️ Creating collection "${DST_COLLECTION}" (size: 64, Cosine)...`);
    await qdrantCall(`${QDRANT_URL}/collections/${DST_COLLECTION}`, 'PUT', {
      vectors: {
        size: 64,
        distance: 'Cosine'
      }
    });
    console.log(`✓ Collection "${DST_COLLECTION}" created successfully.`);
  } else {
    console.log(`✓ Collection "${DST_COLLECTION}" already exists.`);
  }

  // 2. Scroll and copy points
  console.log(`\nScrolling points from "${SRC_COLLECTION}"...`);
  let offset = null;
  let scanned = 0;
  let copied = 0;
  let upsertBatch = [];

  while (true) {
    const scrollRes = await qdrantCall(`${QDRANT_URL}/collections/${SRC_COLLECTION}/points/scroll`, 'POST', {
      limit: SCROLL_BATCH,
      offset,
      with_payload: true,
      with_vector: ['encoded_64', 'content']
    });

    const points = scrollRes.result?.points ?? [];
    if (points.length === 0) break;
    offset = scrollRes.result?.next_page_offset ?? null;

    scanned += points.length;

    for (const pt of points) {
      let vec64 = pt.vector?.encoded_64;
      if (!Array.isArray(vec64) || vec64.length !== ENCODED_DIM) {
        // Fallback: encode from content on-the-fly
        const content = pt.vector?.content;
        if (Array.isArray(content) && content.length === CONTENT_DIM && weights) {
          const z = encode768to64(new Float32Array(content), weights);
          vec64 = Array.from(z);
        }
      }

      if (Array.isArray(vec64) && vec64.length === ENCODED_DIM) {
        upsertBatch.push({
          id: pt.id,
          vector: vec64,
          payload: pt.payload
        });
        copied++;
      }

      if (upsertBatch.length >= UPSERT_BATCH) {
        await qdrantCall(`${QDRANT_URL}/collections/${DST_COLLECTION}/points`, 'PUT', {
          points: upsertBatch
        });
        upsertBatch = [];
        console.log(`  Scanned ${scanned} | Copied ${copied} points...`);
      }
    }

    if (!offset) break;
  }

  if (upsertBatch.length > 0) {
    await qdrantCall(`${QDRANT_URL}/collections/${DST_COLLECTION}/points`, 'PUT', {
      points: upsertBatch
    });
    console.log(`  Scanned ${scanned} | Copied ${copied} points...`);
  }

  console.log(`\n═══ Done Reindexing ═══`);
  console.log(`Total Scanned: ${scanned}`);
  console.log(`Total Copied:  ${copied}`);
}

main().catch(err => {
  console.error(`Fatal:`, err);
  process.exit(1);
});
