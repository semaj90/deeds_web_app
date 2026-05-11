#!/usr/bin/env node
/**
 * scripts/autoencoder-backfill-qdrant.mjs
 *
 * Backfills the 'encoded_64' named vector into Qdrant codebase_chunks_768.
 * Loads trained autoencoder weights from Redis (ace:autoencoder:weights),
 * scrolls all points that have a 'content' vector, encodes 768→256→64 via
 * two-layer tanh network, and upserts ONLY the encoded_64 named vector.
 *
 * The 'content' vector is NOT re-sent — uses PUT /points/vectors to update
 * only the encoded_64 slot without touching existing vectors.
 *
 * Usage:
 *   npm run autoencoder:backfill           (defaults to --dry-run)
 *   npm run autoencoder:backfill -- --dry-run --limit 200
 *   npm run autoencoder:backfill -- --limit 5000
 *   npm run autoencoder:backfill -- --force   (re-encode even if encoded_at set)
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL   = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const REDIS_URL    = process.env.REDIS_URL    ?? 'redis://localhost:6379';
const COLLECTION   = 'codebase_chunks_768';
const ENCODED_NAME = 'encoded_64';
const CONTENT_DIM  = 768;
const HIDDEN_DIM   = 256;
const ENCODED_DIM  = 64;

const args = process.argv.slice(2);
const FLAGS = {
    dryRun:    args.includes('--dry-run') || args.length === 0,
    limit:     parseArg(args, '--limit',      Infinity),
    batchSize: parseArg(args, '--batch-size', 32),
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
        throw new Error(
            'Autoencoder weights or metadata missing in Redis.\n' +
            'Keys expected: ace:autoencoder:weights (W1,b1,W2,b2) + ace:autoencoder:meta (trainedAt,bestLoss).'
        );
    }
    const parse = (csv) => new Float32Array(csv.split(',').map(Number));
    const weights = {
        W1: parse(w.W1),  // 256 × 768 = 196 608
        b1: parse(w.b1),  // 256
        W2: parse(w.W2),  // 64  × 256 = 16 384
        b2: parse(w.b2),  // 64
        trainedAt: meta.trainedAt,
        bestLoss:  Number(meta.bestLoss ?? 0),
    };

    // Shape validation
    const ok =
        weights.W1.length === HIDDEN_DIM * CONTENT_DIM &&
        weights.b1.length === HIDDEN_DIM &&
        weights.W2.length === ENCODED_DIM * HIDDEN_DIM &&
        weights.b2.length === ENCODED_DIM;
    if (!ok) throw new Error(`Autoencoder weight shapes invalid — check Redis keys.`);

    if (weights.bestLoss === 0) {
        console.warn('[backfill] WARNING: bestLoss=0 — weights may be untrained Xavier init.');
        console.warn('[backfill] encoded_64 vectors will be produced but have no semantic meaning yet.');
    }
    return weights;
}

// ── CPU encode: tanh(data @ W^T + b) row by row ──────────────────────────────
// Matches cpuAutoencoderEncode in topology-projection.ts:
//   out[i*hidden + h] = tanh( sum_d(data[i*inputDim+d] * W[h*inputDim+d]) + b[h] )
function encodeLayer(data, n, inputDim, W, b, outputDim) {
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
            out[yOff + h] = Math.tanh(act);
        }
    }
    return out;
}

function encodeBatch(matrix, n, weights) {
    const h = encodeLayer(matrix, n, CONTENT_DIM, weights.W1, weights.b1, HIDDEN_DIM);
    return encodeLayer(h, n, HIDDEN_DIM, weights.W2, weights.b2, ENCODED_DIM);
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────
async function qdrantGet(path) {
    const res = await fetch(`${QDRANT_URL}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function qdrantPost(path, body) {
    const res = await fetch(`${QDRANT_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function qdrantPut(path, body) {
    const res = await fetch(`${QDRANT_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function qdrantPatch(path, body) {
    const res = await fetch(`${QDRANT_URL}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

// ── Ensure encoded_64 vector slot exists in the collection schema ─────────────
async function ensureVectorSlot() {
    const info = await qdrantGet(`/collections/${COLLECTION}`);
    const vectors = info.result?.config?.params?.vectors ?? {};
    if (vectors[ENCODED_NAME]) {
        log(`[qdrant] '${ENCODED_NAME}' slot already configured (dim=${vectors[ENCODED_NAME].size}).`);
        return;
    }
    log(`[qdrant] '${ENCODED_NAME}' slot not found — adding (dim=${ENCODED_DIM}, Cosine)...`);
    if (FLAGS.dryRun) {
        log(`[dry-run] Would PATCH /collections/${COLLECTION} to add '${ENCODED_NAME}'.`);
        return;
    }
    await qdrantPatch(`/collections/${COLLECTION}`, {
        params: {
            vectors: {
                [ENCODED_NAME]: { size: ENCODED_DIM, distance: 'Cosine' },
            },
        },
    });
    log(`[qdrant] '${ENCODED_NAME}' slot added.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    log('=== Autoencoder encoded_64 Backfill ===');
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

    // 2. Ensure vector slot
    await ensureVectorSlot();

    // 3. Scroll → encode → upsert
    let offset      = null;
    let totalScanned = 0;
    let totalEncoded = 0;
    let totalSkipped = 0;
    let totalMissing = 0; // points with no 'content' vector
    let totalFailed  = 0;
    const t0 = Date.now();

    log(`[qdrant] Scrolling ${COLLECTION}...`);

    while (totalScanned < FLAGS.limit) {
        const batchLimit = Math.min(FLAGS.batchSize, FLAGS.limit - totalScanned);
        const scrollBody = {
            limit: batchLimit,
            offset,
            with_payload: ['encoded_at'],
            with_vector: ['content'],
        };

        const scrollData = await qdrantPost(
            `/collections/${COLLECTION}/points/scroll`,
            scrollBody
        );
        const points = scrollData.result?.points ?? [];
        if (points.length === 0) break;
        offset = scrollData.result?.next_page_offset ?? null;

        // Collect points that need encoding
        const toEncode = [];
        for (const pt of points) {
            totalScanned++;

            // Skip if already encoded (unless --force)
            if (!FLAGS.force && pt.payload?.encoded_at) {
                totalSkipped++;
                continue;
            }

            // Resolve 'content' vector from named-vector response shape
            const contentVec = pt.vector?.content ?? pt.vector;
            if (!Array.isArray(contentVec) || contentVec.length !== CONTENT_DIM) {
                totalMissing++;
                continue;
            }

            toEncode.push({ id: pt.id, vec: contentVec });
        }

        // Encode and upsert
        if (toEncode.length > 0) {
            // Pack into flat Float32Array
            const matrix = new Float32Array(toEncode.length * CONTENT_DIM);
            toEncode.forEach(({ vec }, i) => {
                matrix.set(vec, i * CONTENT_DIM);
            });

            // Two-layer tanh encode (CPU)
            const encoded = encodeBatch(matrix, toEncode.length, weights);

            // Build per-point upsert payloads
            const vectorPoints = toEncode.map(({ id }, i) => ({
                id,
                vector: {
                    [ENCODED_NAME]: Array.from(encoded.subarray(i * ENCODED_DIM, (i + 1) * ENCODED_DIM)),
                },
            }));
            const payloadPoints = toEncode.map(({ id }) => ({ id }));
            const encodedAtPayload = { encoded_at: weights.trainedAt };

            if (!FLAGS.dryRun) {
                // Update just the encoded_64 named vector (leaves content/signature intact)
                const upsertRes = await qdrantPut(
                    `/collections/${COLLECTION}/points/vectors?wait=true`,
                    { points: vectorPoints }
                );
                if (upsertRes.status !== 'ok' && upsertRes.result?.status !== 'completed') {
                    totalFailed += toEncode.length;
                    console.error(`[warn] Vector upsert failed: ${JSON.stringify(upsertRes)}`);
                } else {
                    // Also stamp the payload with encoded_at
                    await qdrantPost(
                        `/collections/${COLLECTION}/points/payload?wait=true`,
                        {
                            payload: encodedAtPayload,
                            points: payloadPoints.map(p => p.id),
                        }
                    );
                    totalEncoded += toEncode.length;
                }
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
    log(`- Skipped: ${totalSkipped} (already have encoded_at)`);
    log(`- Missing: ${totalMissing} (no 'content' vector — skipped)`);
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
    console.log(`[autoencoder:backfill] summary=${JSON.stringify(machineSummary)}`);

    if (FLAGS.dryRun && machineSummary.encoded > 0) {
        console.error('[FATAL] Dry-run violation in autoencoder backfill!');
        process.exit(2);
    }
}

main().catch(err => {
    console.error('[autoencoder:backfill] Fatal:', err);
    process.exit(1);
});
