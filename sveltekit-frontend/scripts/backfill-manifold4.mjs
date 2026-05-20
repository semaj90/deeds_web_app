#!/usr/bin/env node
/**
 * scripts/backfill-manifold4.mjs
 *
 * Backfills the 'manifold_64' payload array into Qdrant codebase_chunks_768.
 * Loops through Qdrant codebase_chunks_768, batches chunks, extracts 768-dim
 * payload embeddings, runs batch encode768to64Batch() logic, and upserts
 * `manifold_64` payload array to Qdrant without overwriting other payloads.
 *
 * Usage:
 *   npm run manifold4:backfill
 *   npm run manifold4:backfill:dry
 *   npm run manifold4:backfill:limit
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { createRequire } from 'node:module';

dotenv.config();

const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://localhost:6379';
const COLLECTION   = 'codebase_chunks_768';
const PAYLOAD_KEY  = 'manifold_64';
const CONTENT_DIM  = 768;
const HIDDEN_DIM   = 256;
const ENCODED_DIM  = 64;

const args = process.argv.slice(2);
const FLAGS = {
    dryRun:    args.includes('--dry-run') || args.length === 0,
    limit:     parseArg(args, '--limit',      Infinity),
    batchSize: parseArg(args, '--batch-size', 200),
    force:     args.includes('--force'),
    quiet:     args.includes('--quiet'),
};

function parseArg(argv, flag, fallback) {
    const eq = argv.find(a => a.startsWith(`${flag}=`));
    if (eq) return Number(eq.slice(flag.length + 1));
    const idx = argv.indexOf(flag);
    if (idx >= 0 && argv[idx + 1]) return Number(argv[idx + 1]);
    return fallback;
}

const log = (...a) => { if (!FLAGS.quiet) console.log(...a); };

// ── Redis standalone connection (cold-start safe) ────────────────────────────
function makeRedis() {
    const r = new Redis(REDIS_URL, {
        lazyConnect:        true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy:      () => null,
    });
    r.on('error', () => {});
    return r;
}

// ── Load autoencoder weights from Redis ──────────────────────────────────────
async function loadWeights(redis) {
    const [w, meta] = await Promise.all([
        redis.hgetall('ace:autoencoder:weights'),
        redis.hgetall('ace:autoencoder:meta'),
    ]);
    if (!w?.W1 || !meta?.trainedAt) {
        throw new Error('Autoencoder weights or metadata missing in Redis.');
    }
    const parse = (csv) => new Float32Array(csv.split(',').map(Number));
    const weights = {
        W1: parse(w.W1),
        b1: parse(w.b1),
        W2: parse(w.W2),
        b2: parse(w.b2),
        trainedAt: meta.trainedAt,
        bestLoss:  Number(meta.bestLoss ?? 0),
    };

    if (weights.bestLoss === 0) {
        console.warn('[backfill] WARNING: bestLoss=0 — weights may be untrained.');
    }
    return weights;
}

// ── CPU encode: 2-layer tanh network ─────────────────────────────────────────
function linearLayer(data, n, inputDim, W, b, outputDim, relu) {
    const out = new Float32Array(n * outputDim);
    for (let i = 0; i < n; i++) {
        const xOff = i * inputDim;
        const yOff = i * outputDim;
        for (let h = 0; h < outputDim; h++) {
            let act = b[h];
            const wOff = h * inputDim;
            for (let d = 0; d < inputDim; d++) act += data[xOff + d] * W[wOff + d];
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

function encodeBatch(matrix, n, weights) {
    const h = linearLayer(matrix, n, CONTENT_DIM, weights.W1, weights.b1, HIDDEN_DIM, true);
    const z = linearLayer(h,      n, HIDDEN_DIM,  weights.W2, weights.b2, ENCODED_DIM, false);
    return l2NormalizeRows(z, n, ENCODED_DIM);
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────
async function qdrantPost(path, body) {
    const res = await fetch(`${QDRANT_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    log('=== Manifold4 Payload Backfill ===');
    log(`[cfg] dryRun=${FLAGS.dryRun} limit=${FLAGS.limit} batchSize=${FLAGS.batchSize} force=${FLAGS.force}`);

    // 1. Load weights
    const redis = makeRedis();
    let weights;
    try {
        await redis.connect();
        await redis.ping();
        weights = await loadWeights(redis);
        log(`[weights] trainedAt=${weights.trainedAt} bestLoss=${weights.bestLoss}`);
    } finally {
        redis.disconnect();
    }

    // 2. Scroll → encode → upsert payload
    let offset      = null;
    let totalScanned = 0;
    let totalEncoded = 0;
    let totalSkipped = 0;
    let totalMissing = 0;
    let totalFailed  = 0;
    const t0 = Date.now();

    log(`[qdrant] Scrolling ${COLLECTION}...`);

    while (totalScanned < FLAGS.limit) {
        const batchLimit = Math.min(FLAGS.batchSize, FLAGS.limit - totalScanned);
        const scrollBody = {
            limit: batchLimit,
            offset,
            with_payload: [PAYLOAD_KEY], // Check if payload exists
            with_vector: ['content'],     // Named vector in codebase_chunks_768
        };

        const scrollData = await qdrantPost(
            `/collections/${COLLECTION}/points/scroll`,
            scrollBody
        );
        const points = scrollData.result?.points ?? [];
        if (points.length === 0) break;
        offset = scrollData.result?.next_page_offset ?? null;

        const toEncode = [];
        for (const pt of points) {
            totalScanned++;

            // Skip if already has manifold_64 payload
            if (!FLAGS.force && pt.payload?.[PAYLOAD_KEY]) {
                totalSkipped++;
                continue;
            }

            const contentVec = pt.vector?.content ?? pt.vector?.default ?? pt.vector;
            if (!Array.isArray(contentVec) || contentVec.length !== CONTENT_DIM) {
                totalMissing++;
                continue;
            }

            toEncode.push({ id: pt.id, vec: contentVec });
        }

        if (toEncode.length > 0) {
            const matrix = new Float32Array(toEncode.length * CONTENT_DIM);
            toEncode.forEach(({ vec }, i) => {
                matrix.set(vec, i * CONTENT_DIM);
            });

            const encoded = encodeBatch(matrix, toEncode.length, weights);

            if (!FLAGS.dryRun) {
                // Upsert payload to Qdrant using per-point payload requests concurrently
                // or batch payload update if supported. Using per-point set_payload.
                const updatePromises = toEncode.map(async ({ id }, i) => {
                    const manifold64Array = Array.from(encoded.subarray(i * ENCODED_DIM, (i + 1) * ENCODED_DIM));
                    try {
                        await qdrantPost(
                            `/collections/${COLLECTION}/points/payload?wait=true`,
                            {
                                payload: { [PAYLOAD_KEY]: manifold64Array },
                                points: [id],
                            }
                        );
                    } catch (err) {
                        return false;
                    }
                    return true;
                });

                const results = await Promise.all(updatePromises);
                const failedCount = results.filter(r => !r).length;
                totalFailed += failedCount;
                totalEncoded += toEncode.length - failedCount;
            } else {
                totalEncoded += toEncode.length;
            }
        }

        log(
            `  scanned=${totalScanned} encoded=${totalEncoded}` +
            ` skipped=${totalSkipped} missing=${totalMissing}` +
            `${FLAGS.dryRun ? ' [DRY]' : ''}`
        );

        if (!offset) break;
    }

    const durationMs = Date.now() - t0;
    log('\nFinal Summary:');
    log(`- Scanned: ${totalScanned}`);
    log(`- Encoded: ${totalEncoded}`);
    log(`- Skipped: ${totalSkipped} (already have manifold_64 payload)`);
    log(`- Missing: ${totalMissing} (no 'content' vector)`);
    log(`- Failed:  ${totalFailed}`);
    log(`- Duration: ${(durationMs / 1000).toFixed(2)}s`);

    const machineSummary = {
        dryRun:      FLAGS.dryRun,
        limit:       FLAGS.limit === Infinity ? null : FLAGS.limit,
        processed:   totalScanned,
        encoded:     FLAGS.dryRun ? 0 : totalEncoded,
        skipped:     totalSkipped,
        missing:     totalMissing,
        failed:      totalFailed,
        durationMs,
    };
    console.log(`[manifold4:backfill] summary=${JSON.stringify(machineSummary)}`);

    if (FLAGS.dryRun && machineSummary.encoded > 0) {
        console.error('[FATAL] Dry-run violation in manifold backfill!');
        process.exit(2);
    }
}

main().catch(err => {
    console.error('[manifold4:backfill] Fatal:', err);
    process.exit(1);
});
