#!/usr/bin/env node
/**
 * eval-lane-router-policy.mjs
 *
 * Routing policy evaluator — measures whether ace:lane:routing_policy
 * decisions correlate with good retrieval outcomes in chunk_hit_log.
 *
 * Simulates what Stage A1 in context-assembler.ts would recommend for
 * each logged hit (using topoLabelFromPath + trust_tier), then compares
 * against the actual pipeline used and the rerank_score outcome.
 *
 * Metrics per topo_label bucket:
 *   precision  — when policy recommended X, was X actually the best lane? (avg rerank ≥ threshold)
 *   coverage   — fraction of rows where policy had a confident recommendation
 *   lift       — avg rerank_score for policy-recommended vs non-recommended lanes
 *   confusion  — which lanes the policy recommends vs what actually ran
 *
 * Output:
 *   memory/kb/lane-router-eval-report.json    (machine-readable)
 *   memory/kb/lane-router-eval-report.md      (human-readable)
 *
 * Usage:
 *   node scripts/kb/eval-lane-router-policy.mjs
 *   node scripts/kb/eval-lane-router-policy.mjs --limit 2000
 *   node scripts/kb/eval-lane-router-policy.mjs --score-threshold 0.5
 *   node scripts/kb/eval-lane-router-policy.mjs --dry-run
 */

import pg       from 'pg';
import Redis    from 'ioredis';
import fs       from 'node:fs';
import path     from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const LIMIT_I     = args.indexOf('--limit');
const LIMIT       = LIMIT_I >= 0 ? Number(args[LIMIT_I + 1]) : 5000;
const SCORE_I     = args.indexOf('--score-threshold');
const SCORE_THRESH = SCORE_I >= 0 ? Number(args[SCORE_I + 1]) : 0.5;
const CONF_THRESH  = 0.6; // must match Stage A1 threshold in context-assembler.ts

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://localhost:6379';
const REDIS_KEY = 'ace:lane:routing_policy';

const JSON_PATH = path.join(ROOT, 'memory', 'kb', 'lane-router-eval-report.json');
const MD_PATH   = path.join(ROOT, 'memory', 'kb', 'lane-router-eval-report.md');

// ── Inline classifyPath (mirrors topology-byte-mapper.ts) ────────────────────
// Keep in sync with train-lane-router.mjs and the TS source.
function topoLabelFromPath(p) {
  if (!p) return 'unclassified';
  const lp = p.toLowerCase();
  if (/\/(tests?|spec|__tests?__|e2e|playwright|vitest|scripts\/)/.test(lp)) return 'test-audit-devtool';
  if (/\/(scripts?|tools?|devtools?|audit)\//.test(lp))                       return 'test-audit-devtool';
  if (/\/(db|schema|drizzle|migrations?)\//.test(lp))                         return 'database-schema';
  if (/schema[-_]postgres|schema[-_]sqlite/.test(lp))                         return 'database-schema';
  if (/\/(graph|hypergraph|tensor|topology|som|neo4j|gds)\//.test(lp))        return 'graph-gpu-topology';
  if (/gpu|libtorch|tensorrt|cuda|simd/.test(lp))                             return 'graph-gpu-topology';
  if (/\/(ace|rag|kag|retrieval|indexer|vector|qdrant|embeddings?)\//.test(lp)) return 'trace-retrieval';
  if (/\/routes\/api\//.test(lp) || /\+server\.ts$/.test(lp))                return 'api-route';
  if (/\/(evidence|legal|citations?|statutes?|documents?|cases?)\//.test(lp)) return 'legal-evidence';
  if (/\/(components?|routes\/\(app\)|svelte)/.test(lp) && /\.svelte$/.test(lp)) return 'ui-component';
  if (/\/routes\/\(app\)\//.test(lp))                                         return 'ui-component';
  return 'unclassified';
}

// ── Fetch routing policy from Redis ──────────────────────────────────────────
async function fetchPolicy(redis) {
  try {
    await redis.ping();
    const raw = await redis.hgetall(REDIS_KEY);
    if (!raw || Object.keys(raw).length === 0) return null;
    const policy = {};
    for (const [field, value] of Object.entries(raw)) {
      try { policy[field] = JSON.parse(value); } catch { /* skip malformed */ }
    }
    return policy;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();

  // 1. Connect to Postgres
  const pool = new pg.Pool({ connectionString: DB_URL, max: 2, idleTimeoutMillis: 5000 });
  const client = await pool.connect();

  const { rows: [{ count }] } = await client.query(`SELECT COUNT(*)::int AS count FROM chunk_hit_log`);
  console.log(`[lane-eval] chunk_hit_log rows: ${count}  (evaluating last ${LIMIT})`);

  if (count === 0) {
    console.error('[lane-eval] chunk_hit_log is empty — run some queries first');
    client.release(); await pool.end(); process.exit(1);
  }

  const { rows } = await client.query(`
    SELECT
      chunk_id, relative_path, pipeline, som_cluster, gpu_cluster,
      score::real        AS raw_score,
      rerank_score::real AS rerank_score,
      COALESCE(rerank_score, score)::real >= $2 AS accepted_context,
      'T3'::text         AS trust_tier,
      hit_at
    FROM chunk_hit_log
    ORDER BY hit_at DESC
    LIMIT $1
  `, [LIMIT, SCORE_THRESH]);

  client.release();
  await pool.end();

  console.log(`[lane-eval] Loaded ${rows.length} rows`);

  // 2. Fetch policy from Redis
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true, maxRetriesPerRequest: 1,
    enableOfflineQueue: false, retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect().catch(() => {});

  const policy = await fetchPolicy(redis);
  redis.disconnect();

  const policyKeyCount = policy ? Object.keys(policy).length : 0;
  console.log(`[lane-eval] Redis ${REDIS_KEY}: ${policyKeyCount} rules${policy ? '' : ' (key missing — evaluating without policy)'}`);

  // 3. Simulate Stage A1 for each row
  //    A1 lookup: key = topoLabel|trust_tier
  //    Decision: if policy[key].conf >= 0.6 → recommend policy[key].lane
  //              else → no recommendation (fallthrough)
  const stats = {
    total:            rows.length,
    withRerankScore:  0,
    accepted:         0,
    policyKeys:       policyKeyCount,

    // Per topo-label buckets
    byTopoLabel: {},

    // Overall policy metrics
    policyApplied:    0,  // rows where policy had a confident recommendation
    policyMatch:      0,  // policy recommended lane === actual pipeline
    policyMatchGood:  0,  // match AND accepted_context=true (true positive)
    policyMatchBad:   0,  // match AND accepted_context=false (false positive)
    policyMissed:     0,  // policy recommended different lane, chunk was accepted (false negative)
    policyNoRec:      0,  // policy had no recommendation (or not confident)

    // Score lift
    rerankWithPolicy:    [],  // rerank scores for rows where policy recommended a lane
    rerankWithoutPolicy: [],  // rerank scores for rows with no policy rec
    rerankPolicyMatch:   [],  // rerank when policy matched actual lane
    rerankPolicyMiss:    [],  // rerank when policy recommended different lane
  };

  for (const row of rows) {
    if (row.rerank_score != null) stats.withRerankScore++;
    if (row.accepted_context)     stats.accepted++;

    const topoLabel   = topoLabelFromPath(row.relative_path);
    const trustTier   = row.trust_tier ?? 'T3';
    const policyKey   = `${topoLabel}|${trustTier}`;
    const policyEntry = policy?.[policyKey];
    const hasConf     = policyEntry && (policyEntry.conf ?? 0) >= CONF_THRESH;

    // Per-bucket
    if (!stats.byTopoLabel[topoLabel]) {
      stats.byTopoLabel[topoLabel] = {
        total: 0, accepted: 0, withRerank: 0,
        policyApplied: 0, policyMatch: 0, policyMatchGood: 0, policyMatchBad: 0,
        rerankScores: [],
        policyRerankScores: [],
        topLanes: {},
        policyRecommends: null,
      };
    }
    const bucket = stats.byTopoLabel[topoLabel];
    bucket.total++;
    if (row.accepted_context) bucket.accepted++;
    if (row.rerank_score != null) {
      bucket.withRerank++;
      bucket.rerankScores.push(row.rerank_score);
    }
    bucket.topLanes[row.pipeline] = (bucket.topLanes[row.pipeline] ?? 0) + 1;
    if (policyEntry && !bucket.policyRecommends) bucket.policyRecommends = policyEntry.lane;

    // Overall policy simulation
    if (hasConf) {
      stats.policyApplied++;
      bucket.policyApplied++;
      if (row.rerank_score != null) stats.rerankWithPolicy.push(row.rerank_score);

      const policyLane = policyEntry.lane;
      const actualLane = row.pipeline;
      const matches    = policyLane === actualLane;

      if (matches) {
        stats.policyMatch++;
        bucket.policyMatch++;
        if (row.rerank_score != null) {
          stats.rerankPolicyMatch.push(row.rerank_score);
          bucket.policyRerankScores.push(row.rerank_score);
        }
        if (row.accepted_context) { stats.policyMatchGood++; bucket.policyMatchGood++; }
        else                      { stats.policyMatchBad++;  bucket.policyMatchBad++;  }
      } else {
        if (row.accepted_context) stats.policyMissed++;
        if (row.rerank_score != null) stats.rerankPolicyMiss.push(row.rerank_score);
      }
    } else {
      stats.policyNoRec++;
      if (row.rerank_score != null) stats.rerankWithoutPolicy.push(row.rerank_score);
    }
  }

  // 4. Compute aggregate metrics
  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
  function p95(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
  }

  const metrics = {
    totalRows:          stats.total,
    rowsWithRerank:     stats.withRerankScore,
    rerankCoverage:     stats.total > 0 ? (stats.withRerankScore / stats.total * 100).toFixed(1) : '0.0',
    acceptedRows:       stats.accepted,
    acceptedRate:       stats.total > 0 ? (stats.accepted / stats.total * 100).toFixed(1) : '0.0',
    policyKeys:         stats.policyKeys,
    policyApplied:      stats.policyApplied,
    policyCoverage:     stats.total > 0 ? (stats.policyApplied / stats.total * 100).toFixed(1) : '0.0',
    policyMatchRate:    stats.policyApplied > 0 ? (stats.policyMatch / stats.policyApplied * 100).toFixed(1) : 'N/A',
    policyPrecision:    stats.policyMatch > 0 ? (stats.policyMatchGood / stats.policyMatch * 100).toFixed(1) : 'N/A',
    lift: {
      avgRerankWithPolicy:    avg(stats.rerankWithPolicy)?.toFixed(4) ?? 'N/A',
      avgRerankWithoutPolicy: avg(stats.rerankWithoutPolicy)?.toFixed(4) ?? 'N/A',
      avgRerankPolicyMatch:   avg(stats.rerankPolicyMatch)?.toFixed(4) ?? 'N/A',
      avgRerankPolicyMiss:    avg(stats.rerankPolicyMiss)?.toFixed(4) ?? 'N/A',
      p95RerankWithPolicy:    p95(stats.rerankWithPolicy)?.toFixed(4) ?? 'N/A',
      p95RerankWithoutPolicy: p95(stats.rerankWithoutPolicy)?.toFixed(4) ?? 'N/A',
    },
    byTopoLabel: {},
    scoreThreshold:  SCORE_THRESH,
    confThreshold:   CONF_THRESH,
    evaluatedAt:     new Date().toISOString(),
    warning: [],
  };

  // Per-bucket metrics
  for (const [label, b] of Object.entries(stats.byTopoLabel)) {
    const pct     = (n) => b.total > 0 ? (n / b.total * 100).toFixed(1) : '0.0';
    const domLane = Object.entries(b.topLanes).sort((a, z) => z[1] - a[1])[0]?.[0] ?? 'none';
    metrics.byTopoLabel[label] = {
      total:             b.total,
      accepted:          b.accepted,
      acceptedRate:      pct(b.accepted),
      withRerank:        b.withRerank,
      avgRerank:         avg(b.rerankScores)?.toFixed(4) ?? 'N/A',
      policyApplied:     b.policyApplied,
      policyMatch:       b.policyMatch,
      policyMatchGood:   b.policyMatchGood,
      precision:         b.policyMatch > 0 ? (b.policyMatchGood / b.policyMatch * 100).toFixed(1) : 'N/A',
      policyRecommends:  b.policyRecommends,
      dominantLane:      domLane,
      laneDistrib:       b.topLanes,
      avgRerankOnMatch:  avg(b.policyRerankScores)?.toFixed(4) ?? 'N/A',
    };
  }

  // Warnings
  if (stats.withRerankScore === 0) {
    metrics.warning.push('chunk_hit_log has 0 rows with rerank_score — lane router training data is not yet meaningful. Fix: ensure rerankScore is propagated in context-assembler.ts recordChunkHits() calls.');
  }
  if (stats.policyKeys === 0) {
    metrics.warning.push('ace:lane:routing_policy is empty — run: npm run kb:lane-router:full');
  }
  if (stats.policyApplied === 0 && stats.policyKeys > 0) {
    metrics.warning.push('Policy exists but 0 rows matched any key — likely key format mismatch (check topoLabelFromPath vs trained keys).');
  }

  // 5. Build markdown report
  const policyStatus = stats.policyKeys > 0
    ? `✅ ${stats.policyKeys} rules`
    : '❌ empty (run `npm run kb:lane-router:full`)';

  const rerankStatus = stats.withRerankScore > 0
    ? `${stats.withRerankScore}/${stats.total} rows (${metrics.rerankCoverage}%)`
    : '❌ 0 rows — `rerank_score` not yet propagated to chunk_hit_log';

  const liftRow = (label, vPol, vNoPol) => {
    if (vPol === 'N/A' || vNoPol === 'N/A') return `| ${label} | N/A | N/A | — |`;
    const diff = (parseFloat(vPol) - parseFloat(vNoPol)).toFixed(4);
    const sign = diff >= 0 ? '+' : '';
    return `| ${label} | ${vPol} | ${vNoPol} | ${sign}${diff} |`;
  };

  const topoRows = Object.entries(metrics.byTopoLabel)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([label, m]) =>
      `| \`${label}\` | ${m.total} | ${m.accepted} (${m.acceptedRate}%) | ${m.avgRerank} | \`${m.policyRecommends ?? '—'}\` | \`${m.dominantLane}\` | ${m.precision !== 'N/A' ? m.precision + '%' : '—'} |`
    ).join('\n');

  const warningBlock = metrics.warning.length
    ? '\n## ⚠️ Warnings\n\n' + metrics.warning.map(w => `- ${w}`).join('\n') + '\n'
    : '';

  const md = `# Lane Router Policy Evaluation Report

_Generated: ${metrics.evaluatedAt}_

## Summary

| Metric | Value |
|---|---|
| Rows evaluated | ${metrics.totalRows} |
| Rows with \`rerank_score\` | ${rerankStatus} |
| Accepted context rate | ${metrics.acceptedRows} / ${metrics.totalRows} (${metrics.acceptedRate}%) |
| Policy rules in Redis | ${policyStatus} |
| Policy coverage | ${metrics.policyApplied} rows matched a policy key (${metrics.policyCoverage}%) |
| Policy lane match rate | ${metrics.policyMatchRate}% (policy recommended == actual pipeline) |
| Policy precision | ${metrics.policyPrecision}% (match AND accepted) |
| Score threshold | ${SCORE_THRESH} |
| Conf threshold | ${CONF_THRESH} |
${warningBlock}
## Score Lift (policy recommendation vs no recommendation)

| Condition | Avg rerank | p95 rerank | Delta |
|---|---|---|---|
${liftRow('Policy applied', metrics.lift.avgRerankWithPolicy, metrics.lift.avgRerankWithoutPolicy)}
${liftRow('Policy matched actual lane', metrics.lift.avgRerankPolicyMatch, metrics.lift.avgRerankPolicyMiss)}

> **Positive delta** = policy-recommended lanes produced higher rerank scores (router is helping).
> **Zero/negative delta** = policy recommendations are not correlated with quality (needs more training data or rerank_score propagation).

## Per Topo-Label Breakdown

| Topo label | Rows | Accepted | Avg rerank | Policy rec | Dominant lane | Precision |
|---|---|---|---|---|---|---|
${topoRows}

## Interpretation

${stats.withRerankScore === 0 ? `
### 🔴 No rerank_score data yet

The router cannot be meaningfully evaluated. **Next steps:**
1. Ensure \`rerankScore\` is propagated in \`context-assembler.ts\` \`recordChunkHits()\`
2. Run several ACE queries to populate \`chunk_hit_log\`
3. Re-run this evaluator: \`node scripts/kb/eval-lane-router-policy.mjs\`
` : stats.policyKeys === 0 ? `
### 🟡 Policy not trained yet

chunk_hit_log has ${stats.withRerankScore} rows with rerank_score. **Next steps:**
1. \`npm run kb:export-lane-router-training\`
2. \`npm run kb:train-lane-router\`
3. Re-run this evaluator
` : `
### Current state

- Policy coverage: ${metrics.policyCoverage}% of evaluated rows matched a policy key
- Precision: ${metrics.policyPrecision}% — fraction of policy-matched rows that had good outcomes
- Lift: see table above

${parseFloat(metrics.policyPrecision) >= 70 ? '### ✅ Router is performing well — precision ≥ 70%' :
  parseFloat(metrics.policyPrecision) >= 50 ? '### 🟡 Router shows signal but needs more training data' :
  '### 🔴 Router precision is low — collect more chunk_hit_log data with rerank_scores, then retrain'}
`}

## Files

- Eval report (JSON): \`memory/kb/lane-router-eval-report.json\`
- Policy JSON: \`memory/kb/lane-router-policy.json\`
- Redis key: \`${REDIS_KEY}\` (${metrics.policyKeys} rules)
- Training set: \`memory/kb/lane-router-training-set.jsonl\`

## Next actions

\`\`\`bash
# Refresh scores with fixed attention calculation
npm run karpathy:gpu

# Retrain after chunk_hit_log accumulates rerank_scores
npm run kb:lane-router:full

# Re-evaluate
node scripts/kb/eval-lane-router-policy.mjs --limit 5000
\`\`\`
`;

  if (DRY_RUN) {
    console.log('[lane-eval] DRY RUN — no files written');
    console.log('\n--- Key metrics ---');
    console.log(`  rows:            ${metrics.totalRows}`);
    console.log(`  rerank coverage: ${rerankStatus}`);
    console.log(`  policy rules:    ${metrics.policyKeys}`);
    console.log(`  policy coverage: ${metrics.policyCoverage}%`);
    console.log(`  match rate:      ${metrics.policyMatchRate}%`);
    console.log(`  precision:       ${metrics.policyPrecision}%`);
    if (metrics.warning.length) {
      console.log('\n  WARNINGS:');
      metrics.warning.forEach(w => console.log(`  ⚠️  ${w}`));
    }
    return;
  }

  // 6. Write outputs
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(metrics, null, 2));
  fs.writeFileSync(MD_PATH, md);

  console.log(`[lane-eval] ✅ JSON  → ${JSON_PATH}`);
  console.log(`[lane-eval] ✅ MD    → ${MD_PATH}`);
  console.log(`[lane-eval] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`\n--- Key metrics ---`);
  console.log(`  rows:            ${metrics.totalRows}`);
  console.log(`  rerank coverage: ${stats.withRerankScore}/${stats.total} (${metrics.rerankCoverage}%)`);
  console.log(`  policy rules:    ${metrics.policyKeys}`);
  console.log(`  policy coverage: ${metrics.policyCoverage}%`);
  console.log(`  match rate:      ${metrics.policyMatchRate}%`);
  console.log(`  precision:       ${metrics.policyPrecision}%`);
  console.log(`  lift (avg):      ${metrics.lift.avgRerankWithPolicy} (w/ policy)  vs  ${metrics.lift.avgRerankWithoutPolicy} (w/o)`);
  if (metrics.warning.length) {
    console.log('\n  WARNINGS:');
    metrics.warning.forEach(w => console.log(`  ⚠️  ${w}`));
  }
}

main().catch(err => {
  console.error('[lane-eval] Error:', err.message);
  process.exit(1);
});