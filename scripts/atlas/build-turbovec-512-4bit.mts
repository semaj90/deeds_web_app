#!/usr/bin/env node
/**
 * Phase 1, Step 7: Build TurboVec 4-bit Quantized Index (512-dim)
 *
 * 512-dim variant of build-turbovec-384-4bit.mts, deliberately targeting
 * 512 rather than 768. TurboVec's whole design point is a smaller/faster
 * routing dimension ahead of the canonical 768-dim Qdrant re-retrieval —
 * porting it straight to 768 would defeat that purpose. Unlike 384, 512
 * IS a valid embeddinggemma Matryoshka truncation boundary (768/512/256/128)
 * — see src/lib/server/vector/lane-registry.ts and
 * src/lib/server/vector/embeddinggemma-prefix384.ts for the contract this
 * mirrors. The quantization logic itself (quantize4bit) is dimension-
 * agnostic — it operates on whatever vector.length it's given — so only
 * the snapshot path and printed dimension labels changed from the 384
 * original.
 *
 * - Load 5K 512-dim vectors from snapshot (valid MRL truncation of the
 *   canonical 768-dim embeddinggemma output — slice(0,512) + L2-renormalize,
 *   NOT the invalid raw slice(0,384) the 384 lane used)
 * - Quantize to 4-bit (512-dim → no further dimension reduction at this stage)
 * - Upload to TurboVec service
 * - Configuration: prefilter enabled, latency target <50ms
 *
 * ⚠️ The snapshot file this reads (snapshot_5k_512dim.parquet) does not
 * exist yet as of this port — it needs a generator analogous to
 * scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts, but producing a
 * valid 512-dim MRL truncation (slice + L2-renormalize) rather than a raw
 * 768-dim passthrough. Not written yet — this script will fail at the
 * "Loading points from snapshot" step until that generator exists.
 *
 * Usage:
 *   npx tsx build-turbovec-512-4bit.mts [--dry-run] [--verbose]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'duckdb-async';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, '../../data/atlas-ml/snapshot_5k_512dim.parquet');
const EXPECTED_DIMENSION = 512;

interface TurboVecPoint {
  id: number;
  vector: Uint8Array; // 4-bit quantized
  metadata: {
    packet_key: string;
    source_ref: string;
    domain_class: string;
  };
}

/**
 * Simple 4-bit quantization: scale to [0,15] and pack into nibbles.
 * Dimension-agnostic — operates on whatever vector.length is given.
 */
function quantize4bit(vector: number[]): Uint8Array {
  const min = Math.min(...vector);
  const max = Math.max(...vector);
  const range = max - min || 1;

  // Scale to [0, 15]
  const scaled = vector.map((v) => Math.round(((v - min) / range) * 15));

  // Pack into bytes (2 values per byte as nibbles)
  const packed = new Uint8Array(Math.ceil(vector.length / 2));
  for (let i = 0; i < scaled.length; i += 2) {
    const high = scaled[i];
    const low = i + 1 < scaled.length ? scaled[i + 1] : 0;
    packed[i / 2] = (high << 4) | low;
  }

  return packed;
}

async function buildTurboVecIndex(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  const turboVecHost = process.env.TURBOVEC_HOST || '127.0.0.1';
  const turboVecPort = parseInt(process.env.TURBOVEC_PORT || '8791');
  const turboVecUrl = `http://${turboVecHost}:${turboVecPort}`;

  try {
    if (verbose) {
      console.log(`[TurboVec Build] Host: ${turboVecUrl}`);
      console.log(`[TurboVec Build] Quantization: 4-bit`);
      console.log(`[TurboVec Build] Snapshot: ${SNAPSHOT_PATH}`);
    }

    // Health check
    if (verbose) console.log('[TurboVec Build] Checking TurboVec health...');
    const healthRes = await fetch(`${turboVecUrl}/health`);
    if (!healthRes.ok) {
      throw new Error(`TurboVec health check failed: ${healthRes.status}`);
    }

    // Load points from snapshot
    if (verbose) console.log('[TurboVec Build] Loading points from snapshot...');

    const db = new Database(':memory:');

    const pointsQuery = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY packet_key) as id,
        packet_key,
        source_ref,
        feature_id,
        domain_class,
        embedding
      FROM read_parquet('${SNAPSHOT_PATH}')
      GROUP BY packet_key, source_ref, feature_id, domain_class, embedding
      ORDER BY packet_key
    `;

    const rows = (await db.all(pointsQuery)) as any[];

    if (rows.length === 0) {
      throw new Error('No points found in snapshot');
    }

    if (verbose) console.log(`[TurboVec Build] Loaded ${rows.length} points`);

    const dimensionMismatch = rows.find((row) => (row.embedding as number[]).length !== EXPECTED_DIMENSION);
    if (dimensionMismatch) {
      throw new Error(
        `Snapshot vector dimension mismatch: expected ${EXPECTED_DIMENSION}, got ${(dimensionMismatch.embedding as number[]).length}. ` +
        `Snapshot must be a valid MRL truncation (slice + L2-renormalize), not a raw slice or the native 768-dim vector.`
      );
    }

    // Quantize points
    if (verbose) console.log('[TurboVec Build] Quantizing vectors to 4-bit...');

    const quantizedPoints: TurboVecPoint[] = rows.map((row) => ({
      id: row.id,
      vector: quantize4bit(row.embedding as number[]),
      metadata: {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        domain_class: row.domain_class,
      },
    }));

    if (verbose) console.log(`[TurboVec Build] Quantized ${quantizedPoints.length} points`);

    // Upload to TurboVec in batches
    const batchSize = 100;
    if (!dryRun) {
      if (verbose) {
        console.log(`[TurboVec Build] Uploading ${quantizedPoints.length} points in batches of ${batchSize}...`);
      }

      for (let i = 0; i < quantizedPoints.length; i += batchSize) {
        const batch = quantizedPoints.slice(i, i + batchSize);

        const uploadRes = await fetch(`${turboVecUrl}/bulk_insert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: batch.map((p) => ({
              id: p.id,
              vector: Array.from(p.vector),
              metadata: p.metadata,
            })),
          }),
        });

        if (!uploadRes.ok) {
          throw new Error(
            `TurboVec upload failed: ${uploadRes.status} ${await uploadRes.text()}`
          );
        }

        if (verbose && (i + batchSize) % 500 === 0) {
          console.log(`  - Uploaded ${Math.min(i + batchSize, quantizedPoints.length)} / ${quantizedPoints.length}`);
        }
      }

      if (verbose) console.log('[TurboVec Build] Upload complete');
    }

    // Verify index
    if (!dryRun) {
      if (verbose) console.log('[TurboVec Build] Verifying index...');

      const statusRes = await fetch(`${turboVecUrl}/status`);
      if (!statusRes.ok) {
        throw new Error(`TurboVec status check failed: ${statusRes.status}`);
      }

      const status = (await statusRes.json()) as any;

      console.log('\n=== TurboVec 4-bit Index Build Complete ===');
      console.log(`Points indexed: ${quantizedPoints.length}`);
      console.log(`Quantization: 4-bit (per-vector normalization)`);
      console.log(`Original dimension: ${EXPECTED_DIMENSION}`);
      console.log(`Packed size: ${Math.ceil(EXPECTED_DIMENSION / 2)} bytes per vector`);
      console.log(`Prefilter: enabled`);
      console.log(`Status: ${status.status || 'ready'}`);
      console.log(`✅ Step 7 complete`);
    } else {
      console.log('\n=== TurboVec 4-bit Index Build (Dry-run) ===');
      console.log(`Points to upload: ${quantizedPoints.length}`);
      console.log(`Quantization: 4-bit (per-vector normalization)`);
      console.log(`Original dimension: ${EXPECTED_DIMENSION}`);
      console.log(`(Dry-run mode. Use without --dry-run to apply.)`);
    }

    await db.close();
  } catch (err) {
    console.error('❌ Step 7 failed:', err);
    process.exit(1);
  }
}

buildTurboVecIndex();
