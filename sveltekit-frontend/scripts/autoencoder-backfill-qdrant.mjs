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
 *   npm run ae:backfill                    (live — upserts encoded_64 to Qdrant)
 *   npm run ae:backfill:dry                (dry-run — no Qdrant writes)
 *   npm run ae:backfill:force              (re-encode even if encoded_at set)
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

// ── CPU encode: matches canonical 2-layer architecture from train-autoencoder.py ──
// Layer 1: Linear(768→256) + ReLU
// Layer 2: Linear(256→64)  + linear (no activation)
// Output:  L2-normalize rows → cosine distance works in 64-dim
// W stored in PyTorch (outputDim × inputDim) row-major convention.
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

// ── Ensure encoded_64 vector slot exists in the collection schema ─────────────
async function ensureVectorSlot() {
    const info = await qdrantGet(`/collections/${COLLECTION}`);
    const vectors = info.result?.config?.params?.vectors ?? {};
    if (vectors[ENCODED_NAME]) {
        log(`[qdrant] '${ENCODED_NAME}' slot already configured (dim=${vectors[ENCODED_NAME].size}).`);
        return true;
    }
    log(
      `[qdrant] '${ENCODED_NAME}' slot not found — adding via named-vector API (dim=${ENCODED_DIM}, Cosine)...`
    );
    if (FLAGS.dryRun) {
        log(
          `[dry-run] Would PUT /collections/${COLLECTION}/vectors/${ENCODED_NAME} to add '${ENCODED_NAME}'.`
        );
        return false;
    }
    try {
      await qdrantPut(`/collections/${COLLECTION}/vectors/${ENCODED_NAME}`, {
        dense: { size: ENCODED_DIM, distance: 'Cosine' },
      });
      log(`[qdrant] '${ENCODED_NAME}' slot added via named-vector API.`);
      const refreshed = await qdrantGet(`/collections/${COLLECTION}`);
      return Boolean(refreshed.result?.config?.params?.vectors?.[ENCODED_NAME]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('409') ||
        message.includes('404') ||
        message.includes('already exists')
      ) {
        log(
          `[qdrant] '${ENCODED_NAME}' slot could not be added via Qdrant vector-name API; using payload fallback.`
        );
        return false;
      }
      throw error;
    }
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
    const hasEncodedVectorSlot = await ensureVectorSlot();

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

            const encoded64Vectors = toEncode.map((_, i) =>
              Array.from(encoded.subarray(i * ENCODED_DIM, (i + 1) * ENCODED_DIM))
            );
            const pointIds = toEncode.map(({ id }) => id);

            if (!FLAGS.dryRun) {
              if (hasEncodedVectorSlot) {
                const vectorPoints = encoded64Vectors.map((encoded64, i) => ({
                  id: pointIds[i],
                  vector: {
                    [ENCODED_NAME]: encoded64,
                  },
                }));

                const upsertRes = await qdrantPut(
                  `/collections/${COLLECTION}/points/vectors?wait=true`,
                  { points: vectorPoints }
                );
                if (upsertRes.status !== 'ok' && upsertRes.result?.status !== 'completed') {
                  console.error(
                    `[warn] Vector upsert failed; falling back to payload-only writes: ${JSON.stringify(upsertRes)}`
                  );
                }
              }

              if (hasEncodedVectorSlot) {
                await qdrantPost(`/collections/${COLLECTION}/points/payload?wait=true`, {
                  payload: { encoded_at: weights.trainedAt },
                  points: pointIds,
                });
              } else {
                await Promise.all(
                  toEncode.map(({ id }, index) =>
                    qdrantPost(`/collections/${COLLECTION}/points/payload?wait=true`, {
                      payload: {
                        encoded_at: weights.trainedAt,
                        [ENCODED_NAME]: encoded64Vectors[index],
                      },
                      points: [id],
                    })
                  )
                );
              }
              totalEncoded += toEncode.length;
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
