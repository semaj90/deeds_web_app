#!/usr/bin/env node
/**
 * validate-compression-quality.mjs
 *
 * Read-only compression quality report for the 768→64 autoencoder pipeline.
 *
 * Compares:
 *   - Qdrant 768d neighbor agreement  (ground truth)
 *   - Redis 64d encoded neighbor agreement  (gpu:karpathy:encoded)
 *   - Centroid assignment stability  (gpu:autoencoder:centroids_64)
 *
 * Output:
 *   docs/reports/compression-quality-report.json
 *   docs/reports/compression-quality-report.md
 *
 * Usage:
 *   node scripts/atlas/validate-compression-quality.mjs
 *   node scripts/atlas/validate-compression-quality.mjs --limit=100
 *   node scripts/atlas/validate-compression-quality.mjs --dry-run
 */

import { Redis } from 'ioredis';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '../..');
const OUT_DIR = path.join(ROOT, 'docs', 'reports');

const QDRANT_URL     = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const REDIS_URL      = process.env.REDIS_URL   ?? 'redis://localhost:6379';
const COLLECTION     = 'codebase_chunks_768';
const ENCODED_KEY    = 'gpu:karpathy:encoded';
const CENTROIDS_KEY  = 'gpu:autoencoder:centroids_64';
const CONTENT_DIM    = 768;
const ENCODED_DIM    = 64;

const LIMIT   = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 200);
const DRY_RUN = process.argv.includes('--dry-run');

function log(...a) { console.log('[compress-quality]', ...a); }

// ── Math helpers ──────────────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function pairwiseVariance(vecs, dim) {
  if (vecs.length < 2) return 0;
  const n = Math.min(vecs.length, 50);
  let sumVar = 0;
  for (let d = 0; d < dim; d++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += vecs[i][d];
    mean /= n;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (vecs[i][d] - mean) ** 2;
    sumVar += variance / n;
  }
  return sumVar / dim;
}

function nearestNeighborOverlap(query768, candidates768, query64, candidates64, topK = 5) {
  const rank768 = candidates768
    .map((v, i) => ({ i, sim: cosineSim(query768, v) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
    .map(x => x.i);

  const rank64 = candidates64
    .map((v, i) => ({ i, sim: cosineSim(query64, v) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK)
    .map(x => x.i);

  const set768 = new Set(rank768);
  const overlap = rank64.filter(i => set768.has(i)).length;
  return overlap / topK;
}

function nearestCentroid(vec, centroids) {
  let bestIdx = 0, bestSim = -Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const s = cosineSim(vec, centroids[c]);
    if (s > bestSim) { bestSim = s; bestIdx = c; }
  }
  return { centroidIdx: bestIdx, similarity: bestSim };
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function scrollQdrantSample(limit) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, with_payload: ['file_path'], with_vector: ['content'] }),
  });
  if (!res.ok) throw new Error(`Qdrant scroll ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.result?.points ?? [];
}

async function qdrantCollectionInfo() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== Compression Quality Report (limit=${LIMIT}, dryRun=${DRY_RUN}) ===`);

  const redis = new Redis(REDIS_URL, {
    lazyConnect: true, maxRetriesPerRequest: 1,
    enableOfflineQueue: false, retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();

  // ── 1. Redis inventory ────────────────────────────────────────────────────
  const encodedCount   = await redis.hlen(ENCODED_KEY);
  const centroidCount  = await redis.hlen(CENTROIDS_KEY);
  const metaHash       = await redis.hgetall('ace:autoencoder:meta');

  log(`  ${ENCODED_KEY}: ${encodedCount} entries`);
  log(`  ${CENTROIDS_KEY}: ${centroidCount} centroids`);

  // ── 2. Qdrant inventory ───────────────────────────────────────────────────
  const collectionInfo = await qdrantCollectionInfo();
  const qdrantTotal    = collectionInfo?.vectors_count ?? collectionInfo?.points_count ?? '?';
  log(`  Qdrant ${COLLECTION}: ${qdrantTotal} points`);

  // ── 3. Load Redis 64d sample ──────────────────────────────────────────────
  log(`  Loading up to ${LIMIT} Redis encoded vectors...`);
  const allKeys   = await redis.hkeys(ENCODED_KEY);
  const sampleKeys = allKeys.slice(0, LIMIT);
  const sampleVals = sampleKeys.length > 0 ? await redis.hmget(ENCODED_KEY, ...sampleKeys) : [];

  const encoded64 = [];
  let flatCount = 0;
  for (let i = 0; i < sampleKeys.length; i++) {
    const csv = sampleVals[i];
    if (!csv) continue;
    const vec = csv.split(',').map(Number);
    if (vec.length !== ENCODED_DIM) continue;
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm < 0.01) { flatCount++; continue; }
    encoded64.push({ id: sampleKeys[i], vec });
  }

  log(`  Loaded ${encoded64.length} valid 64d vectors (${flatCount} flat/zero skipped)`);

  // ── 4. Pairwise variance on 64d ───────────────────────────────────────────
  const vecs64Sample = encoded64.slice(0, 50).map(e => e.vec);
  const variance64   = pairwiseVariance(vecs64Sample, ENCODED_DIM);
  log(`  64d pairwise variance (sample n=50): ${variance64.toFixed(6)}`);

  // ── 5. Fetch Qdrant 768d vectors aligned to Redis sample ─────────────────
  const alignIds    = encoded64.slice(0, 50).map(e => e.id);
  log(`  Fetching Qdrant 768d for ${alignIds.length} Redis point IDs...`);

  const filterRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids: alignIds.map(id => Number.isInteger(Number(id)) ? Number(id) : id),
      with_payload: ['file_path'],
      with_vector: ['content'],
    }),
  });
  const filterData   = filterRes.ok ? await filterRes.json() : null;
  const qdrantPoints = filterData?.result ?? [];

  const aligned = [];
  for (const pt of qdrantPoints) {
    const fp     = pt.payload?.file_path;
    const ptId   = String(pt.id);
    const vec768 = pt.vector?.content ?? (Array.isArray(pt.vector) ? pt.vector : null);
    if (!vec768 || vec768.length !== CONTENT_DIM) continue;
    const enc = encoded64.find(e => e.id === ptId);
    if (!enc) continue;
    aligned.push({ fp: fp || `id_${ptId}`, vec768, vec64: enc.vec });
  }
  log(`  Aligned Qdrant↔Redis pairs: ${aligned.length}`);

  // ── 6. Nearest-neighbor overlap ───────────────────────────────────────────
  let nnOverlapSum = 0, nnOverlapN = 0;
  if (aligned.length >= 6) {
    const all768 = aligned.map(a => a.vec768);
    const all64  = aligned.map(a => a.vec64);
    for (let i = 0; i < Math.min(aligned.length, 20); i++) {
      const others768 = all768.filter((_, j) => j !== i);
      const others64  = all64.filter((_, j)  => j !== i);
      const overlap   = nearestNeighborOverlap(all768[i], others768, all64[i], others64, Math.min(5, others768.length));
      nnOverlapSum += overlap;
      nnOverlapN++;
    }
  }
  const nnOverlap = nnOverlapN > 0 ? nnOverlapSum / nnOverlapN : null;
  if (nnOverlap !== null) log(`  NN overlap@5 (768d vs 64d, n=${nnOverlapN}): ${(nnOverlap * 100).toFixed(1)}%`);

  // ── 7. Centroid assignment ────────────────────────────────────────────────
  let centroidAssignments = [];
  let centroidSimSum = 0;
  if (centroidCount > 0 && encoded64.length > 0) {
    const centroidKeys = await redis.hkeys(CENTROIDS_KEY);
    const centroidVals = await redis.hmget(CENTROIDS_KEY, ...centroidKeys);
    const centroids    = centroidVals.map(csv => csv ? csv.split(',').map(Number) : null).filter(Boolean);

    const centroidHits = new Array(centroids.length).fill(0);
    for (const { vec } of encoded64.slice(0, 100)) {
      const { centroidIdx, similarity } = nearestCentroid(vec, centroids);
      centroidHits[centroidIdx]++;
      centroidSimSum += similarity;
    }
    const assignedN      = Math.min(encoded64.length, 100);
    const avgCentroidSim = centroidSimSum / assignedN;
    const usedCentroids  = centroidHits.filter(h => h > 0).length;
    log(`  Centroid avg cosine sim (n=${assignedN}): ${avgCentroidSim.toFixed(4)}`);
    log(`  Centroids with ≥1 assignment: ${usedCentroids}/${centroidCount}`);

    centroidAssignments = centroidHits.map((count, i) => ({ centroidIdx: i, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  // ── 8. Missing file_path coverage ────────────────────────────────────────
  // Use a fresh unfiltered scroll so coverage reflects actual Qdrant population.
  const coveragePoints  = await scrollQdrantSample(Math.min(LIMIT, 100));
  const qdrantFilePaths = new Set(coveragePoints.map(p => p.payload?.file_path).filter(Boolean));
  const encodedFilePaths = new Set(allKeys);
  const coveredByEncoded = [...qdrantFilePaths].filter(fp => encodedFilePaths.has(fp)).length;
  const coveragePct = qdrantFilePaths.size > 0 ? (coveredByEncoded / qdrantFilePaths.size * 100) : 0;
  log(`  file_path coverage in sample: ${coveredByEncoded}/${qdrantFilePaths.size} (${coveragePct.toFixed(1)}%)`);

  // ── 9. Assemble report ────────────────────────────────────────────────────
  const report = {
    generatedAt:      new Date().toISOString(),
    autoencoder: {
      trainedAt:      metaHash?.trainedAt    ?? 'unknown',
      bestLoss:       Number(metaHash?.bestLoss ?? 0),
      epochs:         Number(metaHash?.epochs   ?? 0),
      nTrainVectors:  Number(metaHash?.n         ?? 0),
      device:         metaHash?.device    ?? 'unknown',
      gpu:            metaHash?.gpu       ?? null,
      dimIn:          Number(metaHash?.dimIn    ?? CONTENT_DIM),
      dimHidden:      Number(metaHash?.dimHidden ?? 256),
      dimLatent:      Number(metaHash?.dimLatent ?? ENCODED_DIM),
    },
    inventory: {
      qdrantTotal:           qdrantTotal,
      redisEncodedCount:     encodedCount,
      redisCentroidCount:    centroidCount,
      sampleSize:            encoded64.length,
      flatVectorsSkipped:    flatCount,
    },
    quality: {
      variance64d:           variance64,
      nnOverlapAt5:          nnOverlap,
      nnOverlapPct:          nnOverlap !== null ? (nnOverlap * 100) : null,
      alignedPairs:          aligned.length,
      centroidAvgCosineSim:  centroidCount > 0 ? (centroidSimSum / Math.min(encoded64.length, 100)) : null,
      centroidsUsed:         centroidAssignments.filter(c => c.count > 0).length,
      centroidsTotal:        centroidCount,
      filePathCoveragePct:   coveragePct,
      coveredFilePaths:      coveredByEncoded,
      qdrantSampleFilePaths: qdrantFilePaths.size,
    },
    centroidTopAssignments: centroidAssignments,
    validation: {
      isFlat:           variance64 < 0.001,
      hasGoodCoverage:  coveragePct >= 80,
      hasGoodNNOverlap: nnOverlap !== null && nnOverlap >= 0.4,
      isTrained:        Number(metaHash?.bestLoss ?? 0) > 0.001,
    },
  };

  const pass =
    !report.validation.isFlat &&
    report.validation.hasGoodCoverage &&
    report.validation.isTrained;

  report.status = pass ? 'PASS' : 'WARN';
  log(`\n  Status: ${report.status}`);
  if (report.validation.isFlat)           log('  ⚠ Vectors appear flat — re-run ae:encode:redis:force');
  if (!report.validation.isTrained)       log('  ⚠ bestLoss=0 — run ae:train first');
  if (!report.validation.hasGoodCoverage) log('  ⚠ file_path coverage <80% — run ae:encode:redis:force');
  if (nnOverlap !== null && nnOverlap < 0.4) log(`  ⚠ NN overlap ${(nnOverlap*100).toFixed(1)}% <40% — compression loses too much structure`);

  if (DRY_RUN) {
    log('\n[dry-run] Skipping file writes.');
    await redis.quit();
    return;
  }

  // ── 10. Write outputs ─────────────────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'compression-quality-report.json');
  const mdPath   = path.join(OUT_DIR, 'compression-quality-report.md');

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = `# Autoencoder Compression Quality Report

Generated: ${report.generatedAt}
Status: **${report.status}**

## Autoencoder Weights

| Field | Value |
|-------|-------|
| Trained at | ${report.autoencoder.trainedAt} |
| Best loss | ${report.autoencoder.bestLoss.toFixed(6)} |
| Epochs | ${report.autoencoder.epochs} |
| Training vectors | ${report.autoencoder.nTrainVectors.toLocaleString()} |
| Architecture | ${report.autoencoder.dimIn}→${report.autoencoder.dimHidden}→${report.autoencoder.dimLatent} |
| Device | ${report.autoencoder.gpu ?? report.autoencoder.device} |

## Inventory

| Metric | Value |
|--------|-------|
| Qdrant total points | ${report.inventory.qdrantTotal.toLocaleString()} |
| Redis encoded file vectors | ${report.inventory.redisEncodedCount.toLocaleString()} |
| Redis centroid vectors | ${report.inventory.redisCentroidCount} |
| Sample validated | ${report.inventory.sampleSize} |
| Flat vectors skipped | ${report.inventory.flatVectorsSkipped} |

## Compression Quality

| Metric | Value | Gate |
|--------|-------|------|
| 64d pairwise variance | ${report.quality.variance64d.toFixed(6)} | >0.001 = not flat |
| NN overlap@5 (768d vs 64d) | ${report.quality.nnOverlapPct !== null ? report.quality.nnOverlapPct.toFixed(1) + '%' : 'n/a'} | ≥40% = usable |
| Aligned Qdrant↔Redis pairs | ${report.quality.alignedPairs} | — |
| Centroid avg cosine sim | ${report.quality.centroidAvgCosineSim !== null ? report.quality.centroidAvgCosineSim.toFixed(4) : 'n/a'} | — |
| Centroids used | ${report.quality.centroidsUsed} / ${report.quality.centroidsTotal} | — |
| file_path coverage | ${report.quality.filePathCoveragePct.toFixed(1)}% | ≥80% = good |

## Validation Gates

| Gate | Result |
|------|--------|
| Weights trained (bestLoss > 0) | ${report.validation.isTrained ? '✅ PASS' : '❌ FAIL'} |
| Vectors not flat | ${!report.validation.isFlat ? '✅ PASS' : '❌ FAIL'} |
| file_path coverage ≥80% | ${report.validation.hasGoodCoverage ? '✅ PASS' : '❌ FAIL'} |
| NN overlap ≥40% | ${report.validation.hasGoodNNOverlap ? '✅ PASS' : report.quality.nnOverlap !== null ? '❌ FAIL' : '⚠ n/a'} |

## Top Centroid Assignments (sample n=100)

| Centroid | Hits |
|----------|------|
${report.centroidTopAssignments.slice(0, 10).map(c => `| ${c.centroidIdx} | ${c.count} |`).join('\n')}

## Next Steps

${report.status === 'PASS' ? `- Run \`npm run karpathy:gpu\` to refresh authority blend with trained centroids.
- Run pivot smoke: \`node scripts/atlas/smoke-rg-cluster-pivot.mjs --query "drizzle schema user_id mismatch"\`
- Verify \`rg-cluster-pivot.ts\` uses \`gpu:autoencoder:centroids_64\` for routing.` : `- Re-run \`npm run graphify:autoencoder:train\` to retrain and re-encode.`}
`;

  writeFileSync(mdPath, md);
  log(`\n  Wrote ${jsonPath}`);
  log(`  Wrote ${mdPath}`);

  await redis.quit();
}

main().catch(e => { console.error(e); process.exit(1); });