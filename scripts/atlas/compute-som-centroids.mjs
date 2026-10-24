#!/usr/bin/env node
/**
 * Compute SOM cell centroids from packet embeddings
 *
 * Purpose:
 *   Groups packets by SOM cell (som_row, som_col), computes mean embedding
 *   per cell, and stores centroids in Redis for BitFrost pre-filtering.
 *
 * Centroids enable:
 *   - L1 quick-reject: query vector vs centroid (fast approximate distance)
 *   - L2 semantic cache: centroid-keyed Bifrost cache for re-ranked results
 *   - L3 reranking: GPU cosine similarity within top cells only
 *
 * Usage:
 *   node scripts/atlas/compute-som-centroids.mjs [--apply] [--verbose] [--ttl=86400]
 */

import pg from 'pg';
import redis from 'ioredis';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPublishableCentroidV1, buildCentroidKeyV1, centroidDigestV1 } from './lib/centroid-cache-key-contract-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;
const TTL_ARG = argv.find(a => a.startsWith('--ttl='));
const TTL = TTL_ARG ? parseInt(TTL_ARG.split('=')[1]) : 86400; // 24 hours default (G61 TTL contract)

// Credentials come from the environment only; no literal fallbacks.
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL_REQUIRED');

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });
const redisClient = new redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

function embeddingToFloat32(embedding) {
  if (!embedding) return null;
  if (Buffer.isBuffer(embedding)) {
    return new Float32Array(embedding.buffer, embedding.byteOffset, embedding.byteLength / 4);
  }
  if (Array.isArray(embedding)) {
    return new Float32Array(embedding);
  }
  if (typeof embedding === 'string') {
    try {
      const trimmed = embedding.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return new Float32Array(JSON.parse(trimmed));
      }
    } catch {
      return null;
    }
  }
  return null;
}

function computeMean(embeddings) {
  if (embeddings.length === 0) return null;

  const dim = embeddings[0].length;
  const mean = new Float32Array(dim);

  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (const emb of embeddings) {
      sum += emb[i];
    }
    mean[i] = sum / embeddings.length;
  }

  return mean;
}

async function getCellEmbeddings() {
  // latent_64 producer target: codebase_chunk_index (vector(64)), with its own SOM BMU cell and validity flag.
  const result = await db.query(`
    SELECT som_bmu_row AS som_row, som_bmu_col AS som_col, latent_64 AS embedding, latent64_model AS model
    FROM codebase_chunk_index
    WHERE latent_64 IS NOT NULL
      AND latent_embedding_valid IS TRUE
      AND som_bmu_row IS NOT NULL
      AND som_bmu_col IS NOT NULL
    ORDER BY som_bmu_row, som_bmu_col
  `);

  // Group by (som_row, som_col)
  const cellMap = new Map();
  for (const row of result.rows) {
    const key = `${row.som_row}:${row.som_col}`;
    if (!cellMap.has(key)) {
      cellMap.set(key, { som_row: row.som_row, som_col: row.som_col, embeddings: [], models: new Set() });
    }

    const emb = embeddingToFloat32(row.embedding);
    if (emb && emb.length === 64) {
      cellMap.get(key).embeddings.push(emb);
      cellMap.get(key).models.add(String(row.model ?? ''));
    }
  }

  return cellMap;
}

/**
 * Dry-run accounting only. Keys come from the shared contract helper; nothing is written to Valkey.
 * Publication is refused in APPLY mode until it is separately authorized.
 */
async function storeCentroids(cellMap) {
  if (APPLY) throw new Error('LIVE_VALKEY_PUBLICATION_NOT_AUTHORIZED');

  const cohortRows = [...cellMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const cohortDigest = `sha256:${createHash('sha256').update(JSON.stringify(cohortRows.map(([k, v]) => [k, v.embeddings.map((e) => Array.from(e))]))).digest('hex')}`;
  const counters = { cellsFound: cellMap.size, centroidsComputed: 0, centroidsWouldPublish: 0, centroidsActuallyPublished: 0, rejected: {} };
  const descriptors = [];
  const reject = (code) => { counters.rejected[code] = (counters.rejected[code] ?? 0) + 1; };

  for (const [, { som_row, som_col, embeddings, models }] of cellMap.entries()) {
    try {
      if (embeddings.length === 0) throw new Error('CENTROID_MEMBERS_INSUFFICIENT');
      if (models.size !== 1) throw new Error('CENTROID_REVISION_MIXED');
      const centroid = Array.from(computeMean(embeddings));
      counters.centroidsComputed += 1;
      assertPublishableCentroidV1(centroid, 64);
      const modelDigest = `sha256:${createHash('sha256').update([...models][0]).digest('hex')}`;
      const key = buildCentroidKeyV1({ family: 'som', featureSnapshotDigest: cohortDigest, modelDigest, cell: { row: som_row, col: som_col } });
      descriptors.push({ key, members: embeddings.length, centroidDigest: centroidDigestV1(centroid) });
      counters.centroidsWouldPublish += 1;
    } catch (e) {
      reject(e.message);
    }
  }

  const body = {
    schema: 'atlas.som-centroid-dry-run.v1',
    generatedAt: new Date().toISOString(),
    mode: 'DRY_RUN',
    cohortDigest,
    featureSnapshotStatus: 'PROPOSAL_COHORT_DIGEST_NOT_ADMITTED',
    counters,
    sampleKeys: descriptors.slice(0, 3).map((d) => d.key),
    canonicalAuthority: false,
  };
  const checksum = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
  const dir = path.join(ROOT, '.tmp', 'atlas', 'som-centroid-dry-run');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `som-centroid-dry-run-${body.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
  writeFileSync(file, JSON.stringify({ ...body, receiptChecksum: checksum }, null, 2) + '\n', { flag: 'wx' });
  log(`   [Dry-run] cellsFound=${counters.cellsFound} centroidsComputed=${counters.centroidsComputed} centroidsWouldPublish=${counters.centroidsWouldPublish} centroidsActuallyPublished=${counters.centroidsActuallyPublished}`);
  log(`   [Dry-run] receipt ${path.relative(ROOT, file)}`);
  return counters.centroidsWouldPublish;
}

async function computeCentroids() {
  log(`\n═══ Compute SOM Cell Centroids ═══\n`);

  try {
    // Step 1: Group embeddings by SOM cell
    log(`1. Grouping embeddings by SOM cell...`);
    const cellMap = await getCellEmbeddings();
    log(`   ✅ Found ${cellMap.size} SOM cells with embeddings`);

    // Step 2: Compute mean per cell
    log(`\n2. Computing cell centroids...`);
    let cellsWithCentroid = 0;
    for (const cell of cellMap.values()) {
      const centroid = computeMean(cell.embeddings);
      if (centroid) {
        cell.centroid = centroid;
        cellsWithCentroid++;
      }
    }
    log(`   ✅ Computed: ${cellsWithCentroid} centroids`);

    // Step 3: Store in Redis
    log(`\n3. Storing centroids in Redis (TTL: ${TTL}s)...`);
    const stored = await storeCentroids(cellMap);
    log(`   Dry-run: ${stored} centroids would publish; 0 published.`);

    // Step 4: Verify
    log(`\n4. Verification: Valkey is read only in APPLY mode, which is refused.`);
    if (APPLY) {
      try {
        const centroidKeys = await redisClient.keys('atlas:centroid:som:*');
        log(`   Centroid keys (atlas:centroid:som:*): ${centroidKeys.length}`);
      } catch (e) {
        vlog(`   (verification skipped: ${e.message})`);
      }
    }

    log(`\n✨ Done.`);
    process.exit(0);
  } catch (e) {
    log(`❌ Fatal error: ${e.message}`);
    console.error(e);
    process.exit(1);
  } finally {
    await db.end();
  }
}

computeCentroids();
