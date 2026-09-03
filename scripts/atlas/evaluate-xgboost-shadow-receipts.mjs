#!/usr/bin/env node
/**
 * XGBOOST-SHADOW-EVAL-01
 *
 * Read-only aggregator over the `atlas:xgboost:shadow:receipts:v1` Valkey Stream
 * (`atlas.xgboost-shadow-receipt.v1` entries emitted by
 * `sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts`'s
 * `emitShadowReceipt()` whenever `XGBOOST_RERANK_MODE=shadow`, the default).
 *
 * Computes, per receipt and in aggregate:
 *   - top1Changed        did the #1 packetKey differ between baseline and challenger order?
 *   - top3Overlap        |top3(baseline) ∩ top3(challenger)| / 3
 *   - top10Overlap       |top10(baseline) ∩ top10(challenger)| / 10 (or min(10, n))
 *   - rank correlation   Spearman's rho over the shared candidate set
 *   - servedOrderIntegrity  servedOrderChecksum === baselineOrderChecksum (must be 100%)
 *   - eligibilityReason breakdown (fallback traffic composition — never presented as
 *     representative of all Parent Atlas searches without this breakdown)
 *
 * This script NEVER writes to the stream, never changes XGBOOST_RERANK_MODE, and produces no
 * promotion verdict — it is evidence for a human/future gate (XGBOOST-PROMOTION-POLICY-01) to
 * consume, not a promotion decision by itself.
 *
 * Usage:
 *   node scripts/atlas/evaluate-xgboost-shadow-receipts.mjs [--limit=1000]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(repoRoot, 'docs/reports/xgboost-shadow-eval-v1.json');
const STREAM_KEY = 'atlas:xgboost:shadow:receipts:v1';

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10)) : 1000;

function spearmanRho(baselineOrder, challengerOrder) {
  // Shared candidates only — a challenger that dropped/added a candidate (shouldn't happen,
  // same input set) would break rank correlation math otherwise.
  const baselineRank = new Map(baselineOrder.map((key, i) => [key, i]));
  const challengerRank = new Map(challengerOrder.map((key, i) => [key, i]));
  const shared = baselineOrder.filter((key) => challengerRank.has(key));
  const n = shared.length;
  if (n < 2) return null;
  let sumSqDiff = 0;
  for (const key of shared) {
    const d = baselineRank.get(key) - challengerRank.get(key);
    sumSqDiff += d * d;
  }
  return 1 - (6 * sumSqDiff) / (n * (n * n - 1));
}

function overlapAtK(baselineOrder, challengerOrder, k) {
  const topBaseline = new Set(baselineOrder.slice(0, k));
  const topChallenger = new Set(challengerOrder.slice(0, k));
  const denom = Math.min(k, baselineOrder.length);
  if (denom === 0) return null;
  let hits = 0;
  for (const key of topBaseline) if (topChallenger.has(key)) hits += 1;
  return hits / denom;
}

async function main() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});

  let entries = [];
  let redisError = null;
  try {
    await redis.connect();
    // XRANGE from the start, capped at `limit` most-recent-first via XREVRANGE.
    const raw = await redis.xrevrange(STREAM_KEY, '+', '-', 'COUNT', limit);
    entries = raw;
  } catch (err) {
    redisError = err instanceof Error ? err.message : String(err);
  } finally {
    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.quit().catch(() => {});
    }
  }

  const receipts = [];
  let parseFailures = 0;
  for (const [, fields] of entries) {
    const fieldMap = {};
    for (let i = 0; i < fields.length; i += 2) fieldMap[fields[i]] = fields[i + 1];
    if (!fieldMap.receipt) continue;
    try {
      receipts.push(JSON.parse(fieldMap.receipt));
    } catch {
      parseFailures += 1;
    }
  }

  const perReceipt = [];
  const eligibilityCounts = {};
  let servedOrderIntegrityViolations = 0;

  for (const receipt of receipts) {
    const baselineOrder = receipt?.baseline?.orderedPacketKeys ?? [];
    const challengerOrder = receipt?.challenger?.orderedPacketKeys ?? [];
    const eligibilityReason = receipt?.eligibilityReason ?? 'UNKNOWN';
    eligibilityCounts[eligibilityReason] = (eligibilityCounts[eligibilityReason] ?? 0) + 1;

    if (receipt?.servedOrderChecksum !== receipt?.baselineOrderChecksum) {
      servedOrderIntegrityViolations += 1;
    }

    if (baselineOrder.length === 0 || challengerOrder.length === 0) continue;

    perReceipt.push({
      requestId: receipt.requestId ?? null,
      emittedAt: receipt.emittedAt ?? null,
      eligibilityReason,
      modelRevision: receipt?.challenger?.modelRevision ?? null,
      top1Changed: baselineOrder[0] !== challengerOrder[0],
      top3Overlap: overlapAtK(baselineOrder, challengerOrder, 3),
      top10Overlap: overlapAtK(baselineOrder, challengerOrder, 10),
      spearmanRho: spearmanRho(baselineOrder, challengerOrder),
      candidateCount: baselineOrder.length,
    });
  }

  const withRho = perReceipt.filter((r) => r.spearmanRho !== null);
  const aggregate = {
    receiptCount: receipts.length,
    parseFailures,
    comparableReceiptCount: perReceipt.length,
    top1ChangedRate: perReceipt.length
      ? perReceipt.filter((r) => r.top1Changed).length / perReceipt.length
      : null,
    avgTop3Overlap: perReceipt.length
      ? perReceipt.reduce((sum, r) => sum + (r.top3Overlap ?? 0), 0) / perReceipt.length
      : null,
    avgTop10Overlap: perReceipt.length
      ? perReceipt.reduce((sum, r) => sum + (r.top10Overlap ?? 0), 0) / perReceipt.length
      : null,
    avgSpearmanRho: withRho.length
      ? withRho.reduce((sum, r) => sum + r.spearmanRho, 0) / withRho.length
      : null,
    servedOrderIntegrityViolations,
    servedOrderIntegrityOk: servedOrderIntegrityViolations === 0,
    eligibilityReasonCounts: eligibilityCounts,
  };

  const report = {
    schema: 'atlas.xgboost-shadow-eval.v1',
    gate: 'XGBOOST-SHADOW-EVAL-01',
    generatedAt: new Date().toISOString(),
    streamKey: STREAM_KEY,
    redisError,
    aggregate,
    perReceipt,
    // Deliberately no promotion verdict here — that's XGBOOST-PROMOTION-POLICY-01's job, fed by
    // this evidence plus a frozen objective comparison (XGBOOST-OBJECTIVE-COMPARE-01), never by
    // shadow-receipt volume alone.
    promotionVerdict: null,
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    schema: report.schema,
    receiptCount: aggregate.receiptCount,
    comparableReceiptCount: aggregate.comparableReceiptCount,
    top1ChangedRate: aggregate.top1ChangedRate,
    avgTop10Overlap: aggregate.avgTop10Overlap,
    avgSpearmanRho: aggregate.avgSpearmanRho,
    servedOrderIntegrityOk: aggregate.servedOrderIntegrityOk,
    eligibilityReasonCounts: aggregate.eligibilityReasonCounts,
    redisError,
    report: reportPath,
  }, null, 2));

  if (redisError) process.exitCode = 1;
}

main();
