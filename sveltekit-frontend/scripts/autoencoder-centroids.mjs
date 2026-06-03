#!/usr/bin/env node
/**
 * scripts/autoencoder-centroids.mjs
 *
 * Computes mean centroids in 64d encoded space for each som_cluster,
 * then writes them to Redis at gpu:autoencoder:centroids_64.
 *
 * Primary path: reads encoded_64 from payloads or named vectors already
 * backfilled by autoencoder-backfill-qdrant.mjs (run that first).
 *
 * Fallback: if a point lacks encoded_64, encodes from 'content' on-the-fly
 * using weights loaded from Redis.
 *
 * Usage:
 *   npm run ae:centroids                                 (live — writes centroids to Redis)
 *   npm run ae:centroids:dry                             (dry-run — no Redis writes)
 *   npm run ae:centroids -- --min-cluster=3 --limit=500  (override defaults)
 */

import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const QDRANT_URL     = process.env.QDRANT_URL ?? 'http://localhost:6333';
const REDIS_URL      = process.env.REDIS_URL  ?? 'redis://localhost:6379';
const COLLECTION     = 'codebase_chunks_768';
const CENTROIDS_KEY  = 'gpu:autoencoder:centroids_64';
const META_KEY       = 'gpu:autoencoder:centroids_64_meta';
const CONTENT_DIM    = 768;
const HIDDEN_DIM     = 256;
const ENCODED_DIM    = 64;
const SCROLL_BATCH   = 200;

const args = process.argv.slice(2);
const FLAGS = {
    dryRun:     args.includes('--dry-run') || args.length === 0,
    minCluster: parseArg(args, '--min-cluster', 5),
    limit:      parseArg(args, '--limit', Infinity),
    quiet:      args.includes('--quiet'),
};

function parseArg(argv, flag, fallback) {
    const eq = argv.find(a => a.startsWith(`${flag}=`));
    if (eq) return Number(eq.slice(flag.length + 1));
    const idx = argv.indexOf(flag);
    if (idx >= 0 && argv[idx + 1]) return Number(argv[idx + 1]);
    return fallback;
}

const log = (...a) => { if (!FLAGS.quiet) console.log(...a); };

// ── Redis (cold-start safe) ───────────────────────────────────────────────────
const REDIS_PASS = process.env.REDIS_PASSWORD ?? '';
function makeRedis() {
    const r = new Redis(REDIS_URL, {
        password:             REDIS_PASS || undefined,
        lazyConnect:          true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue:   false,
        retryStrategy:        () => null,
    });
    r.on('error', () => {});
    return r;
}

// ── Load weights from Redis ───────────────────────────────────────────────────
async function loadWeights(redis) {
    const [w, meta] = await Promise.all([
        redis.hgetall('ace:autoencoder:weights'),
        redis.hgetall('ace:autoencoder:meta'),
    ]);
    if (!w?.W1 || !meta?.trainedAt) {
        throw new Error('Autoencoder weights missing in Redis. Run autoencoder training first.');
    }
    const parse = (csv) => new Float32Array(csv.split(',').map(Number));
    return {
        W1: parse(w.W1),
        b1: parse(w.b1),
        W2: parse(w.W2),
        b2: parse(w.b2),
        trainedAt: meta.trainedAt,
        bestLoss:  Number(meta.bestLoss ?? 0),
    };
}

// ── CPU encode: matches architecture from ae-encode-to-redis.mjs + train-autoencoder.py ──
// Layer 1: Linear(768→256) + ReLU
// Layer 2: Linear(256→64)  + no activation (linear)
// Output:  L2-normalize → cosine distance works in 64-dim
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

function encode768to64(vec768, weights) {
    const h = linearLayer(vec768, 1, CONTENT_DIM, weights.W1, weights.b1, HIDDEN_DIM, true);
    const z = linearLayer(h,      1, HIDDEN_DIM,  weights.W2, weights.b2, ENCODED_DIM, false);
    return l2NormalizeRows(z, 1, ENCODED_DIM);
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

async function hasVectorSlot(name) {
    const info = await qdrantGet(`/collections/${COLLECTION}`);
    const vectors = info.result?.config?.params?.vectors ?? {};
    return !!vectors[name];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    log('=== Autoencoder Centroids (64d) ===');
    log(`[cfg] dryRun=${FLAGS.dryRun} minCluster=${FLAGS.minCluster} limit=${FLAGS.limit}`);

    const redis = makeRedis();
    let weights;
    try {
        await redis.connect();
        await redis.ping();
        weights = await loadWeights(redis);
        log(`[weights] trainedAt=${weights.trainedAt} bestLoss=${weights.bestLoss}`);
        if (weights.bestLoss === 0) {
            console.warn('[centroids] WARNING: bestLoss=0 — weights may be untrained Xavier init.');
        }
    } finally {
        if (FLAGS.dryRun) redis.disconnect();
        // In live mode, keep connection open for writes at the end
    }

    // Check if encoded_64 slot exists — if so, read it directly (faster)
    const hasEncoded64 = await hasVectorSlot('encoded_64');
    const withVectors = hasEncoded64 ? ['encoded_64', 'content'] : ['content'];
    log(`[qdrant] encoded_64 slot: ${hasEncoded64 ? 'present (primary path)' : 'absent (fallback: encode from content)'}`);

    // Scroll Qdrant — request vectors + som_cluster payload
    const clusters = new Map(); // clusterId -> { sum: Float32Array(64), count: number }
    let offset       = null;
    let totalScanned = 0;
    let primary      = 0; // used encoded_64 directly
    let fallback     = 0; // encoded from content on-the-fly
    let noVector     = 0;
    let noCluster    = 0;

    log(`[qdrant] Scrolling ${COLLECTION}...`);

    while (totalScanned < FLAGS.limit) {
        const batchLimit = Math.min(SCROLL_BATCH, FLAGS.limit - totalScanned);
        const scrollData = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, {
            limit:        batchLimit,
            offset,
            with_payload: ['som_cluster'],
            with_vector:  withVectors,
        });
        const points = scrollData.result?.points ?? [];
        if (points.length === 0) break;
        offset = scrollData.result?.next_page_offset ?? null;

        for (const pt of points) {
            totalScanned++;
            const clusterId = pt.payload?.som_cluster;
            if (clusterId === undefined || clusterId === null) {
                noCluster++;
                continue;
            }

            // Try encoded_64 payload/vector first, fall back to encoding content on-the-fly
            let encoded64 = pt.payload?.encoded_64;
            if (Array.isArray(encoded64) && encoded64.length === ENCODED_DIM) {
                primary++;
            } else {
                encoded64 = pt.vector?.encoded_64;
                if (Array.isArray(encoded64) && encoded64.length === ENCODED_DIM) {
                    primary++;
                } else {
                    const contentVec = pt.vector?.content;
                    if (!Array.isArray(contentVec) || contentVec.length !== CONTENT_DIM) {
                        noVector++;
                        continue;
                    }
                    const z = encode768to64(new Float32Array(contentVec), weights);
                    encoded64 = Array.from(z);
                    fallback++;
                }
            }

            if (!clusters.has(clusterId)) {
                clusters.set(clusterId, { sum: new Float32Array(ENCODED_DIM), count: 0 });
            }
            const entry = clusters.get(clusterId);
            for (let i = 0; i < ENCODED_DIM; i++) entry.sum[i] += encoded64[i];
            entry.count++;
        }

        log(`  scanned=${totalScanned} primary=${primary} fallback=${fallback} clusters=${clusters.size}`);
        if (!offset) break;
    }

    // Compute centroids
    const hashFields = {};
    let kept = 0;
    let dropped = 0;
    for (const [id, entry] of clusters.entries()) {
        if (entry.count < FLAGS.minCluster) {
            dropped++;
            continue;
        }
        const centroid = new Float32Array(ENCODED_DIM);
        for (let i = 0; i < ENCODED_DIM; i++) centroid[i] = entry.sum[i] / entry.count;
        hashFields[`cluster_${id}`] = Array.from(centroid).join(',');
        kept++;
    }

    log(`\n[centroids] ${kept} clusters kept (≥${FLAGS.minCluster} members), ${dropped} dropped.`);

    if (!FLAGS.dryRun) {
        if (kept > 0) {
            await redis.hset(CENTROIDS_KEY, hashFields);
            await redis.hset(META_KEY, {
                trainedAt:    weights.trainedAt,
                clusterCount: String(kept),
                totalPoints:  String(totalScanned),
                computedAt:   new Date().toISOString(),
            });
            log(`[redis] Wrote ${kept} centroids to '${CENTROIDS_KEY}'.`);
        } else {
            console.warn('[centroids] No clusters met minimum size — Redis not updated.');
        }
        redis.disconnect();
    }

    log('\nFinal Summary:');
    log(`- Scanned:    ${totalScanned}`);
    log(`- Primary:    ${primary} (used encoded_64)`);
    log(`- Fallback:   ${fallback} (encoded from content)`);
    log(`- No-vector:  ${noVector}`);
    log(`- No-cluster: ${noCluster}`);
    log(`- Centroids:  ${kept} written, ${dropped} dropped`);

    const machineSummary = {
        dryRun:       FLAGS.dryRun,
        limit:        FLAGS.limit === Infinity ? null : FLAGS.limit,
        scanned:      totalScanned,
        centroidsKept: FLAGS.dryRun ? 0 : kept,
        centroidsDropped: dropped,
        primary,
        fallback,
        noVector,
        noCluster,
    };
    console.log(`[autoencoder:centroids] summary=${JSON.stringify(machineSummary)}`);

    if (FLAGS.dryRun && machineSummary.centroidsKept > 0) {
        console.error('[FATAL] Dry-run violation in centroids script!');
        process.exit(2);
    }
}

main().catch(err => {
    console.error('[autoencoder:centroids] Fatal:', err);
    process.exit(1);
});
