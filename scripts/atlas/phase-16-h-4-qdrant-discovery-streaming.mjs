#!/usr/bin/env node

/**
 * Phase 16-H.4: Qdrant Discovery (Streaming, No OOM)
 *
 * Fetches points from Qdrant codebase_chunks_768 collection in streaming batches.
 * Processes each batch immediately (no buffering) to avoid OOM on 635K+ points.
 * Populates qdrant_point_id, qdrant_collection, qdrant_score in atlas_higher_hop_index.
 *
 * Matching strategy (fallback order):
 * 1. payload.packet_key (direct, fast)
 * 2. payload.source_ref / sourceRef / canonical_source_ref (normalized)
 *
 * Env vars:
 *   H4_JSON_PROGRESS=1   emit JSON lines to stdout for PowerShell wrapper
 *   H4_DRY_RUN=1         skip DB writes (count matches only)
 *   H4_BATCH_SIZE=100    Qdrant scroll batch size
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { normalizeSourceRef } from './lib/normalize-source-ref.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL      = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'codebase_chunks_768';
const BATCH_SIZE      = parseInt(process.env.H4_BATCH_SIZE || '100', 10);
const DRY_RUN         = process.env.H4_DRY_RUN === '1';
const JSON_PROGRESS   = process.env.H4_JSON_PROGRESS === '1';

// Emit a structured line — JSON when PS1 wrapper is active, human text otherwise
function emit(type, data) {
  if (JSON_PROGRESS) {
    process.stdout.write(JSON.stringify({ type, ...data }) + '\n');
  } else {
    if (type === 'progress') {
      if (data.processed % 10000 === 0) {
        process.stderr.write(
          `⏳ ${data.processed.toLocaleString()} pts | matched=${data.matched} missing=${data.missing} notFound=${data.notFound}\n`
        );
      }
    } else if (type === 'ok')    { process.stderr.write(`✅ ${data.msg}\n`); }
    else if (type === 'error')   { process.stderr.write(`❌ ${data.msg}\n`); }
    else if (type === 'done')    { process.stdout.write(JSON.stringify({ type, ...data }) + '\n'); }
  }
}

async function* streamQdrantPoints(batchSize) {
  let offset = null;
  while (true) {
    const body = {
      limit: batchSize,
      with_payload: true,
    };
    if (offset !== null) {
      body.offset = offset;
    }

    const response = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!response.ok) {
      throw new Error(`Qdrant fetch failed: ${response.status} ${response.statusText}`);
    }
    const data  = await response.json();
    const batch = data.result?.points || [];
    if (batch.length === 0) break;
    offset = data.result?.next_page_offset ?? null;
    yield { batch, offset };
    if (offset === null) break;
  }
}

async function loadBridgeMaps(client) {
  const result = await client.query(`
    SELECT packet_key, source_ref
    FROM atlas_higher_hop_index
    WHERE packet_key IS NOT NULL
  `);

  const bySourceRef = new Map();
  for (const row of result.rows) {
    const packetKey = String(row.packet_key ?? '').trim();
    const sourceRef = normalizeSourceRef(String(row.source_ref ?? ''));
    if (!packetKey || !sourceRef) continue;
    if (!bySourceRef.has(sourceRef)) bySourceRef.set(sourceRef, []);
    bySourceRef.get(sourceRef).push(packetKey);
  }

  return { bySourceRef };
}

async function processBatch(batch, client, bridges) {
  let matched = 0, missingKey = 0, notFound = 0;

  for (const point of batch) {
    const pointId = point.id;
    const payload = point.payload || {};

    let packetKey = String(payload.packet_key || payload.packetKey || '').trim();
    let matchKey  = 'packet_key';

    if (!packetKey) {
      const sourceRef =
        payload.source_ref ||
        payload.sourceRef ||
        payload.canonical_source_ref ||
        payload.canonicalSourceRef ||
        payload.file_path ||
        payload.filePath ||
        payload.path;
      if (sourceRef) {
        const normRef = normalizeSourceRef(sourceRef);
        const candidates = bridges.bySourceRef.get(normRef) || [];
        if (candidates.length > 0) {
          packetKey = candidates[0];
          matchKey  = 'source_ref';
        } else {
          missingKey++;
          continue;
        }
      } else {
        missingKey++;
        continue;
      }
    }

    if (!DRY_RUN) {
      const updateResult = await client.query(
        `UPDATE atlas_higher_hop_index
         SET qdrant_point_id   = $1,
             qdrant_collection  = $2,
             qdrant_score       = 1.0,
             qdrant_payload_key = $3,
             updated_at         = NOW()
         WHERE packet_key = $4 AND qdrant_point_id IS NULL`,
        [String(pointId), COLLECTION_NAME, matchKey, packetKey]
      );
      if (updateResult.rowCount > 0) matched++; else notFound++; // notFound = already linked
    } else {
      matched++; // dry-run: count as if matched
    }
  }

  return { matched, missingKey, notFound };
}

async function main() {
  const startTime = Date.now();
  const client    = await pool.connect();
  const bridges = await loadBridgeMaps(client);

  let totalMatched  = 0;
  let totalMissing  = 0;
  let totalNotFound = 0;
  let batchCount    = 0;
  let processed     = 0;

  if (!JSON_PROGRESS) {
    process.stderr.write(`\n========== Phase 16-H.4: Qdrant Discovery ==========\n`);
    if (DRY_RUN) process.stderr.write(`DRY RUN — no DB writes\n`);
    process.stderr.write(`\n`);
  }

  try {
    for await (const { batch, offset } of streamQdrantPoints(BATCH_SIZE)) {
      const { matched, missingKey, notFound } = await processBatch(batch, client, bridges);

      totalMatched  += matched;
      totalMissing  += missingKey;
      totalNotFound += notFound;
      batchCount++;
      processed += batch.length;

      emit('progress', {
        processed, batchCount,
        matched:  totalMatched,
        missing:  totalMissing,
        notFound: totalNotFound,
        elapsedMs: Date.now() - startTime,
      });
    }

    // Final audit
    const auditResult = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN qdrant_point_id   IS NOT NULL THEN 1 END) AS with_qdrant,
        COUNT(CASE WHEN qdrant_payload_key IS NOT NULL THEN 1 END) AS with_key
      FROM atlas_higher_hop_index
    `);
    const row = auditResult.rows[0];

    emit('done', {
      processed, batchCount,
      matched:  totalMatched,
      missing:  totalMissing,
      notFound: totalNotFound,
      elapsedMs: Date.now() - startTime,
      dryRun: DRY_RUN,
      audit: {
        total:       parseInt(row.total),
        with_qdrant: parseInt(row.with_qdrant),
        with_key:    parseInt(row.with_key),
      },
      gatePassed: parseInt(row.with_qdrant) >= parseInt(row.total) * 0.95,
    });

  } catch (err) {
    emit('error', { msg: err.message });
    console.error(err);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
