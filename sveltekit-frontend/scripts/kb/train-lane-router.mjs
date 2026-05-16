#!/usr/bin/env node
/**
 * train-lane-router.mjs
 *
 * Tier-1 interpretable lane router — reads the JSONL training set produced by
 * export-lane-router-training-set.mjs and builds a frequency-weighted decision
 * table that maps feature buckets → preferred lane_id.
 *
 * Writes:
 *   memory/kb/lane-router-policy.json          (durable ground truth)
 *   memory/kb/lane-router-policy-report.md     (human-readable summary)
 * Optionally writes to Redis: ace:lane:routing_policy (HASH, TTL 86400s)
 *
 * Algorithm:
 *   1. Load JSONL training set (accepted rows only, rerank_score > 0.5)
 *   2. Group by composite key (som_bmu_row_bucket, gpu_cluster, trust_tier)
 *   3. Within each group count lane_id occurrences + weighted by rerank_score
 *   4. For each key: pick the lane with highest weighted count → decision rule
 *   5. Serialize policy → Redis + disk
 *
 * Usage:
 *   node scripts/kb/train-lane-router.mjs
 *   node scripts/kb/train-lane-router.mjs --no-redis
 *   node scripts/kb/train-lane-router.mjs --dry-run
 *   node scripts/kb/train-lane-router.mjs --min-support 5
 *   node scripts/kb/train-lane-router.mjs --score-threshold 0.7
 */

import fs            from 'node:fs';
import path          from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const args            = process.argv.slice(2);
const DRY_RUN         = args.includes('--dry-run');
const NO_REDIS        = args.includes('--no-redis');
const MIN_SUPPORT_ARG = args.indexOf('--min-support');
const MIN_SUPPORT     = MIN_SUPPORT_ARG >= 0 ? Number(args[MIN_SUPPORT_ARG + 1]) : 3;
const SCORE_THRESH_I  = args.indexOf('--score-threshold');
const SCORE_THRESH    = SCORE_THRESH_I >= 0 ? Number(args[SCORE_THRESH_I + 1]) : 0.5;

const TRAINING_PATH   = path.join(ROOT, 'memory', 'kb', 'lane-router-training-set.jsonl');
const POLICY_PATH     = path.join(ROOT, 'memory', 'kb', 'lane-router-policy.json');
const REPORT_PATH     = path.join(ROOT, 'memory', 'kb', 'lane-router-policy-report.md');

const REDIS_KEY       = 'ace:lane:routing_policy';
const REDIS_TTL       = 86400; // 24h

// ── SOM row bucketing ─────────────────────────────────────────────────────────
// Collapse the raw som_bmu_row integer into one of 5 coarse buckets (0-4)
// so the decision table generalises across SOM grid positions.
function somBucket(row) {
  if (row === null || row === undefined) return 'unknown';
  const r = Number(row);
  if (r < 5)  return 'r0-4';
  if (r < 10) return 'r5-9';
  if (r < 15) return 'r10-14';
  if (r < 20) return 'r15-19';
  return 'r20+';
}

// ── Feature key ───────────────────────────────────────────────────────────────
function featureKey(row) {
  return [
    somBucket(row.som_bmu_row),
    String(row.gpu_cluster ?? 'unk'),
    String(row.trust_tier  ?? 'T3'),
  ].join('|');
}

// ── Load training set ─────────────────────────────────────────────────────────
function loadTrainingSet() {
  if (!fs.existsSync(TRAINING_PATH)) {
    console.error(`[lane-train] Training set not found: ${TRAINING_PATH}`);
    console.error(`[lane-train] Run: npm run kb:export-lane-router-training`);
    process.exit(1);
  }
  const lines  = fs.readFileSync(TRAINING_PATH, 'utf8').split('\n').filter(Boolean);
  const total  = lines.length;
  const parsed = [];
  let   bad    = 0;

  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      // Filter: only accepted rows above score threshold
      if (!r.accepted_context)                          continue;
      if ((r.rerank_score ?? r.raw_score ?? 0) < SCORE_THRESH) continue;
      if (!r.lane_id)                                   continue;
      parsed.push(r);
    } catch {
      bad++;
    }
  }
  return { parsed, total, bad };
}

// ── Build decision table ───────────────────────────────────────────────────────
function buildDecisionTable(rows) {
  // groups[key][lane_id] = { count, weightedScore }
  const groups = {};

  for (const r of rows) {
    const key  = featureKey(r);
    const lane = String(r.lane_id);
    const sc   = r.rerank_score ?? r.raw_score ?? 0;

    if (!groups[key])       groups[key] = {};
    if (!groups[key][lane]) groups[key][lane] = { count: 0, weightedScore: 0 };

    groups[key][lane].count++;
    groups[key][lane].weightedScore += sc;
  }

  // Build decision rules
  const rules = [];
  const skipped = [];

  for (const [key, lanes] of Object.entries(groups)) {
    const [somBkt, gpuCluster, trustTier] = key.split('|');
    const total = Object.values(lanes).reduce((s, l) => s + l.count, 0);

    if (total < MIN_SUPPORT) {
      skipped.push({ key, total });
      continue;
    }

    // Rank by weighted score (primary) then count (secondary)
    const ranked = Object.entries(lanes)
      .map(([lane, s]) => ({
        lane,
        count:         s.count,
        weightedScore: s.weightedScore,
        pct:           Math.round((s.count / total) * 100),
        avgScore:      s.weightedScore / s.count,
      }))
      .sort((a, b) =>
        b.weightedScore !== a.weightedScore
          ? b.weightedScore - a.weightedScore
          : b.count - a.count
      );

    const winner     = ranked[0];
    const confidence = winner.count / total;

    rules.push({
      key,
      som_bucket:   somBkt,
      gpu_cluster:  gpuCluster,
      trust_tier:   trustTier,
      preferred_lane: winner.lane,
      confidence:   Math.round(confidence * 1000) / 1000,
      support:      total,
      avg_score:    Math.round(winner.avgScore * 1000) / 1000,
      alternatives: ranked.slice(1).map(a => ({ lane: a.lane, pct: a.pct })),
    });
  }

  // Stable sort by support descending
  rules.sort((a, b) => b.support - a.support);

  return { rules, skipped };
}

// ── Serialise policy for Redis (HASH field per key) ───────────────────────────
function buildRedisHash(rules) {
  const hash = {};
  for (const r of rules) {
    hash[r.key] = JSON.stringify({
      lane:       r.preferred_lane,
      conf:       r.confidence,
      support:    r.support,
      avg_score:  r.avg_score,
    });
  }
  return hash;
}

// ── Write Redis ────────────────────────────────────────────────────────────────
async function writeRedis(hash) {
  let Redis;
  try {
    ({ default: Redis } = await import('ioredis'));
  } catch {
    console.warn('[lane-train] ioredis not available — skipping Redis write');
    return false;
  }

  const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  // Extract Redis host from DATABASE_URL or use default
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  const redis = new Redis(redisUrl, {
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    retryStrategy:        () => null,
  });
  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();

    // Write all fields in a pipeline
    const pipe = redis.pipeline();
    pipe.del(REDIS_KEY);
    for (const [field, value] of Object.entries(hash)) {
      pipe.hset(REDIS_KEY, field, value);
    }
    pipe.expire(REDIS_KEY, REDIS_TTL);
    await pipe.exec();

    console.log(`[lane-train] ✅ Redis ${REDIS_KEY} — ${Object.keys(hash).length} rules (TTL ${REDIS_TTL}s)`);
    return true;
  } catch (err) {
    console.warn(`[lane-train] Redis write skipped: ${err.message}`);
    return false;
  } finally {
    redis.disconnect();
  }
}

// ── Markdown report ────────────────────────────────────────────────────────────
function buildReport({ rules, skipped, totalRows, filteredRows, builtAt }) {
  const topRules = rules.slice(0, 20);
  const laneDistrib = {};
  for (const r of rules) {
    laneDistrib[r.preferred_lane] = (laneDistrib[r.preferred_lane] ?? 0) + 1;
  }

  const laneSummary = Object.entries(laneDistrib)
    .sort((a, b) => b[1] - a[1])
    .map(([lane, cnt]) => `| \`${lane}\` | ${cnt} |`)
    .join('\n');

  const ruleTable = topRules.map(r =>
    `| \`${r.som_bucket}\` | \`${r.gpu_cluster}\` | \`${r.trust_tier}\` | \`${r.preferred_lane}\` | ${r.confidence} | ${r.support} | ${r.avg_score} |`
  ).join('\n');

  return `# Lane Router Policy Report

_Generated: ${builtAt}_

## Summary

| Metric | Value |
|---|---|
| Training rows (total) | ${totalRows} |
| Accepted rows (filtered) | ${filteredRows} |
| Decision rules | ${rules.length} |
| Rules skipped (< ${MIN_SUPPORT} support) | ${skipped.length} |
| Score threshold | ${SCORE_THRESH} |
| Min support | ${MIN_SUPPORT} |
| Redis key | \`${REDIS_KEY}\` (TTL ${REDIS_TTL}s) |

## Lane Distribution (winning lane per rule)

| Lane | Rules |
|---|---|
${laneSummary}

## Top Rules (by support)

| SOM bucket | GPU cluster | Trust tier | Preferred lane | Confidence | Support | Avg score |
|---|---|---|---|---|---|---|
${ruleTable}

## Feature Key Format

\`{som_bucket}|{gpu_cluster}|{trust_tier}\`

SOM buckets: \`r0-4\`, \`r5-9\`, \`r10-14\`, \`r15-19\`, \`r20+\`, \`unknown\`

## Usage (ACE query path)

\`\`\`typescript
const key = \`\${somBucket}|\${gpuCluster}|\${trustTier}\`;
const raw = await redis.hget('ace:lane:routing_policy', key);
const { lane, conf } = raw ? JSON.parse(raw) : { lane: 'default', conf: 0 };
// conf < 0.6 → fall through to vector ANN; conf >= 0.6 → prefer named lane
\`\`\`

## Files

- Training set: \`memory/kb/lane-router-training-set.jsonl\`
- Policy JSON: \`memory/kb/lane-router-policy.json\`
- Redis: \`ace:lane:routing_policy\` (HASH)
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`[lane-train] Loading training set from ${TRAINING_PATH}...`);

  const { parsed, total, bad } = loadTrainingSet();
  console.log(`[lane-train] Rows: ${total} total  →  ${parsed.length} accepted (score ≥ ${SCORE_THRESH})  [${bad} unparseable]`);

  if (parsed.length === 0) {
    console.error('[lane-train] No qualifying rows — check your training set or lower --score-threshold');
    process.exit(1);
  }

  console.log(`[lane-train] Building decision table (min-support=${MIN_SUPPORT})...`);
  const { rules, skipped } = buildDecisionTable(parsed);
  console.log(`[lane-train] Rules: ${rules.length} built  /  ${skipped.length} skipped (low support)`);

  if (rules.length === 0) {
    console.error('[lane-train] No rules generated — try lowering --min-support');
    process.exit(1);
  }

  // Preview top 5
  console.log('[lane-train] Top rules:');
  for (const r of rules.slice(0, 5)) {
    const alts = r.alternatives.map(a => `${a.lane}(${a.pct}%)`).join(', ');
    console.log(`  ${r.key.padEnd(28)} → ${r.preferred_lane.padEnd(20)} conf=${r.confidence}  n=${r.support}  alts=[${alts}]`);
  }

  if (DRY_RUN) {
    console.log('[lane-train] DRY RUN — no files or Redis written');
    return;
  }

  // Write policy JSON
  const builtAt = new Date().toISOString();
  const policy = {
    _meta: {
      builtAt,
      totalRows:    total,
      filteredRows: parsed.length,
      rules:        rules.length,
      skipped:      skipped.length,
      scoreThreshold: SCORE_THRESH,
      minSupport:   MIN_SUPPORT,
      redisKey:     REDIS_KEY,
      redisTtl:     REDIS_TTL,
    },
    rules,
  };

  fs.mkdirSync(path.dirname(POLICY_PATH), { recursive: true });
  fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
  console.log(`[lane-train] ✅ Policy → ${POLICY_PATH}`);

  // Write report
  const report = buildReport({ rules, skipped, totalRows: total, filteredRows: parsed.length, builtAt });
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`[lane-train] ✅ Report → ${REPORT_PATH}`);

  // Write Redis
  if (!NO_REDIS) {
    const hash = buildRedisHash(rules);
    await writeRedis(hash);
  } else {
    console.log('[lane-train] --no-redis flag set — skipping Redis write');
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[lane-train] Done in ${elapsed}s`);
  console.log(`[lane-train] Next: use ace:lane:routing_policy in context-assembler.ts Stage A0`);
}

main().catch(err => {
  console.error('[lane-train] Error:', err.message);
  process.exit(1);
});
