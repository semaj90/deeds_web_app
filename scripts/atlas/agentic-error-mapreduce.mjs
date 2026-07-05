#!/usr/bin/env node
/**
 * Agentic Error MapReduce
 *
 * Map:    error_signal_stream rows → fingerprint / route / state / feature_id
 * Reduce: count, latest_seen, top_route, top_suggestion, confidence, cluster_group
 * Write:  upsert error_cluster_groups
 * Warm:   BitFrost repair cache (bifrost:repair:{error_class}:{model_name})
 *
 * Usage:
 *   node scripts/atlas/agentic-error-mapreduce.mjs [--dry-run] [--window-minutes 15] [--verbose]
 */

import pg from 'pg';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { selectRecoveryPacketsBatch } from './lib/topology-recovery-selector.mjs';

const { values: args } = parseArgs({
  options: {
    'dry-run':        { type: 'boolean', default: false },
    'window-minutes': { type: 'string',  default: '15' },
    verbose:          { type: 'boolean', default: false },
  },
  strict: false,
});

const DRY_RUN        = args['dry-run'];
const WINDOW_MINUTES = parseInt(args['window-minutes'] ?? '15', 10);
const VERBOSE        = args['verbose'];
const REPAIR_TTL     = 300;

// ── Observation normalization (mirrors hmm-error-classifier.ts) ───────────────

const OBS_PATTERNS = [
  { pattern: /relation.*does not exist|table.*not found/i,    obs: 'SQL_RELATION_MISSING' },
  { pattern: /column.*does not exist/i,                        obs: 'COLUMN_MISSING' },
  { pattern: /cannot find module|import.*fail|ERR_MODULE/i,    obs: 'IMPORT_FAIL' },
  { pattern: /404|not found/i,                                 obs: 'HTTP_404' },
  { pattern: /500|internal server error/i,                     obs: 'HTTP_500' },
  { pattern: /timeout|timed out|ETIMEDOUT|AbortError/i,        obs: 'TIMEOUT' },
  { pattern: /empty result|no rows|0 rows/i,                   obs: 'EMPTY_RESULT' },
  { pattern: /decode.*fail|msgpack|BYTEA|binary.*invalid/i,    obs: 'DECODE_FAIL' },
  { pattern: /TypeScript|TS\d{4}|type.*error|svelte-check/i,  obs: 'TYPECHECK_FAIL' },
  // Gemma4 architectural recommendation signals — same as hmm-error-classifier.ts
  { pattern: /refactor|consolidat|extract.*service|separate.*concern|dedup|dead.?code|remove.*unused|migrate.*to|replace.*with|abstract|modularize/i, obs: 'ARCH_SIGNAL' },
  { pattern: /should be|consider|recommend|suggest|would benefit|ought to|ideally|better approach/i, obs: 'REFACTOR_SIGNAL' },
];

function normalizeObs(raw) {
  for (const { pattern, obs } of OBS_PATTERNS) {
    if (pattern.test(raw)) return obs;
  }
  return null;
}

// ── HMM emission weights (mirrors hmm-error-classifier.ts) ───────────────────

// Emission + Prior mirrors hmm-error-classifier.ts exactly (including audit_recommendation)
const EMISSION = {
  schema_mismatch:      { SQL_RELATION_MISSING: 0.9, COLUMN_MISSING: 0.8, HTTP_500: 0.3, TYPECHECK_FAIL: 0.4 },
  missing_dependency:   { IMPORT_FAIL: 0.9, HTTP_404: 0.5, TYPECHECK_FAIL: 0.6 },
  stale_cache:          { EMPTY_RESULT: 0.7, HTTP_404: 0.4 },
  retrieval_miss:       { EMPTY_RESULT: 0.9, HTTP_404: 0.6, HTTP_500: 0.2 },
  worker_timeout:       { TIMEOUT: 0.95, HTTP_500: 0.4, EMPTY_RESULT: 0.3 },
  codec_failure:        { DECODE_FAIL: 0.95, HTTP_500: 0.3, TYPECHECK_FAIL: 0.5 },
  audit_recommendation: { ARCH_SIGNAL: 0.90, REFACTOR_SIGNAL: 0.85, TYPECHECK_FAIL: 0.10 },
  unknown:              { HTTP_500: 0.3, EMPTY_RESULT: 0.2, TIMEOUT: 0.2 },
};

const PRIOR = {
  schema_mismatch: 0.18, missing_dependency: 0.14, stale_cache: 0.14,
  retrieval_miss:  0.18, worker_timeout:     0.14, codec_failure: 0.09,
  audit_recommendation: 0.08, unknown: 0.05,
};

const SUGGESTED_ACTION = {
  schema_mismatch:      'Run drizzle-kit introspect and verify migration was applied',
  missing_dependency:   'Verify npm install ran; check $lib alias resolution',
  stale_cache:          'Invalidate BitFrost keys; re-warm from Postgres',
  retrieval_miss:       'Check Qdrant collection count and chunk_index population',
  worker_timeout:       'Increase AbortSignal.timeout; reduce batch size; check Gemma4 :8090',
  codec_failure:        'Verify @msgpack/msgpack round-trip; check BYTEA column integrity',
  audit_recommendation: 'Create review/refactor task in LangGraph Kanban; queue for operator review',
  unknown:              'Inspect evidence for raw error text; escalate to operator',
};

function classifyObservations(observations) {
  if (!observations.length) return { state: 'unknown', confidence: 0 };

  const states = Object.keys(EMISSION);
  let scores = {};
  for (const s of states) {
    scores[s] = (PRIOR[s] ?? 0.05) * ((EMISSION[s][observations[0]] ?? 0.01));
  }
  for (let t = 1; t < observations.length; t++) {
    const next = {};
    for (const s of states) {
      next[s] = scores[s] * ((EMISSION[s][observations[t]] ?? 0.01));
    }
    scores = next;
  }

  let bestState = 'unknown', bestScore = -1;
  for (const [s, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; bestState = s; }
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { state: bestState, confidence: total > 0 ? bestScore / total : 0 };
}

// ── Fingerprint helper ────────────────────────────────────────────────────────

function fingerprint(errorClass, modelName, featureId) {
  return createHash('sha256')
    .update(`${errorClass}:${modelName}:${featureId ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

// ── Database / Redis setup ────────────────────────────────────────────────────

const pool = new pg.Pool({
  host:     process.env.PGHOST     ?? '127.0.0.1',
  port:     parseInt(process.env.PGPORT     ?? '5434', 10),
  database: process.env.PGDATABASE ?? 'legal_ai_db',
  user:     process.env.PGUSER     ?? 'legal_admin',
  password: process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? '',
});

const redis = new Redis({
  host:               process.env.REDIS_HOST     ?? '127.0.0.1',
  port:               parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password:           process.env.REDIS_PASSWORD ?? 'redis',
  lazyConnect:        true,
  enableOfflineQueue: false,
  retryStrategy:      () => null,
});

// ── MAP phase ─────────────────────────────────────────────────────────────────

async function mapPhase() {
  const result = await pool.query(`
    SELECT
      id,
      packet_key,
      task_id,
      error_class,
      model_name,
      evidence,
      ingested_at
    FROM error_signal_stream
    WHERE ingested_at > NOW() - ($1 || ' minutes')::interval
    ORDER BY ingested_at ASC
  `, [WINDOW_MINUTES]);

  return result.rows.map(row => {
    const raw =
      (row.evidence?.message) ??
      (row.evidence?.error)   ??
      row.error_class         ??
      '';
    const obs       = normalizeObs(raw);
    const featureId = row.evidence?.feature_id ?? null;
    const route     = row.evidence?.route      ?? row.evidence?.endpoint ?? null;

    return {
      ...row,
      observation: obs,
      feature_id:  featureId,
      route,
      fp: fingerprint(row.error_class, row.model_name, featureId),
    };
  });
}

// ── REDUCE phase ──────────────────────────────────────────────────────────────

function reducePhase(mapped) {
  // Group by (error_class, model_name, task_id)
  const clusters = new Map();

  for (const row of mapped) {
    const key = `${row.error_class}:${row.model_name}:${row.task_id}`;
    if (!clusters.has(key)) {
      clusters.set(key, {
        error_class: row.error_class,
        model_name:  row.model_name,
        task_id:     row.task_id,
        packet_keys: new Set(),
        observations: [],
        routes:      new Map(),
        feature_ids: new Set(),
        fingerprints: new Set(),
        latest_seen: row.ingested_at,
        count: 0,
      });
    }

    const c = clusters.get(key);
    c.count++;
    c.packet_keys.add(row.packet_key);
    c.fingerprints.add(row.fp);
    if (row.observation) c.observations.push(row.observation);
    if (row.feature_id)  c.feature_ids.add(row.feature_id);
    if (row.route) {
      c.routes.set(row.route, (c.routes.get(row.route) ?? 0) + 1);
    }
    if (new Date(row.ingested_at) > new Date(c.latest_seen)) {
      c.latest_seen = row.ingested_at;
    }
  }

  // Classify each cluster
  const results = [];
  for (const [key, c] of clusters) {
    const classification = classifyObservations(c.observations);

    // Top route by frequency
    let topRoute = null, topCount = 0;
    for (const [route, cnt] of c.routes) {
      if (cnt > topCount) { topCount = cnt; topRoute = route; }
    }

    results.push({
      key,
      error_class:      c.error_class,
      model_name:       c.model_name,
      task_id:          c.task_id,
      packet_keys:      [...c.packet_keys],
      feature_ids:      [...c.feature_ids],
      fingerprints:     [...c.fingerprints],
      top_route:        topRoute,
      state:            classification.state,
      confidence:       classification.confidence,
      suggested_action: SUGGESTED_ACTION[classification.state],
      latest_seen:      c.latest_seen,
      count:            c.count,
    });
  }

  return results;
}

// ── WRITE phase ───────────────────────────────────────────────────────────────

async function writePhase(clusters) {
  // Topology-aware recovery selection: same community → highest PageRank → summary match
  // Deterministic: same (error_class, model_name, community_id) → same packet_key
  let recoveryMap = new Map();
  if (!DRY_RUN) {
    try {
      recoveryMap = await selectRecoveryPacketsBatch(pool, clusters);
    } catch (err) {
      console.warn('[mapreduce] topology recovery selection failed, falling back to null:', err.message);
    }
  }

  let written = 0;
  for (const c of clusters) {
    const recovery = recoveryMap.get(c.key);
    const recoveryKey    = recovery?.packet_key ?? null;
    const recoveryConf   = recovery?.confidence ?? c.confidence;
    const recoveryReason = recovery?.reason ?? null;

    if (DRY_RUN) {
      if (VERBOSE) {
        console.log(
          `[dry-run] cluster ${c.key}` +
          ` | count=${c.count}` +
          ` | state=${c.state}` +
          ` | confidence=${c.confidence.toFixed(3)}` +
          ` | route=${c.top_route ?? 'n/a'}` +
          ` | packets=${c.packet_keys.length}` +
          ` | recovery=${recoveryKey ?? '(not selected in dry-run)'}`
        );
      }
      continue;
    }

    await pool.query(`
      INSERT INTO error_cluster_groups
        (error_class, model_name, task_id, packet_keys, failure_count, last_seen,
         recovery_packet_key, recovery_confidence, recovery_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (error_class, model_name, task_id) DO UPDATE SET
        packet_keys         = $4,
        failure_count       = error_cluster_groups.failure_count + $5,
        last_seen           = $6,
        recovery_packet_key = COALESCE($7, error_cluster_groups.recovery_packet_key),
        recovery_confidence = $8,
        recovery_reason     = COALESCE($9, error_cluster_groups.recovery_reason)
    `, [
      c.error_class,
      c.model_name,
      c.task_id,
      c.packet_keys,
      c.count,
      c.latest_seen,
      recoveryKey,
      recoveryConf,
      recoveryReason,
    ]);

    written++;
  }
  return written;
}

// ── WARM phase ────────────────────────────────────────────────────────────────

async function warmPhase(clusters) {
  if (DRY_RUN) return 0;

  // Re-run topology recovery for warm phase (clusters already classified)
  let recoveryMap = new Map();
  try {
    recoveryMap = await selectRecoveryPacketsBatch(pool, clusters);
  } catch { /* non-blocking */ }

  const pipeline = redis.pipeline();
  for (const c of clusters) {
    const recovery = recoveryMap.get(c.key);
    const cacheKey = `bifrost:repair:${c.error_class}:${c.model_name}`;
    pipeline.setex(cacheKey, REPAIR_TTL, JSON.stringify({
      state:                c.state,
      confidence:           c.confidence,
      suggested_action:     c.suggested_action,
      top_route:            c.top_route,
      recovery_packet_key:  recovery?.packet_key ?? null,
      recovery_confidence:  recovery?.confidence ?? null,
      recovery_reason:      recovery?.reason ?? null,
      packet_keys:          c.packet_keys.slice(0, 10),
      feature_ids:          c.feature_ids.slice(0, 10),
      fingerprints:         c.fingerprints,
      failure_count:        c.count,
      last_seen:            c.latest_seen,
    }));
  }
  await pipeline.exec();
  return clusters.length;
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `[mapreduce] window=${WINDOW_MINUTES}m  dry-run=${DRY_RUN}  verbose=${VERBOSE}`
  );

  let redisOk = false;
  try {
    await redis.connect();
    await redis.ping();
    redisOk = true;
  } catch {
    console.warn('[mapreduce] Redis unavailable — BitFrost warming skipped');
  }

  try {
    // MAP
    const mapped = await mapPhase();
    console.log(`[mapreduce] MAP: ${mapped.length} signals`);
    if (!mapped.length) { console.log('[mapreduce] nothing to reduce'); return; }

    // REDUCE
    const clusters = reducePhase(mapped);
    console.log(`[mapreduce] REDUCE: ${clusters.length} clusters`);

    if (VERBOSE) {
      for (const c of clusters) {
        console.log(
          `  ${c.key} | count=${c.count} | state=${c.state}` +
          ` | conf=${c.confidence.toFixed(3)} | route=${c.top_route ?? '-'}`
        );
      }
    }

    // WRITE
    const written = await writePhase(clusters);
    console.log(`[mapreduce] WRITE: ${DRY_RUN ? '(dry-run)' : written} rows upserted`);

    // WARM
    if (redisOk) {
      const warmed = await warmPhase(clusters);
      console.log(`[mapreduce] WARM: ${DRY_RUN ? '(dry-run)' : warmed} repair keys (TTL ${REPAIR_TTL}s)`);
    }

    // Summary
    const byState = {};
    for (const c of clusters) byState[c.state] = (byState[c.state] ?? 0) + 1;
    console.log('[mapreduce] states:', JSON.stringify(byState));

  } finally {
    await pool.end().catch(() => {});
    if (redisOk) await redis.quit().catch(() => {});
  }
}

run().catch(err => {
  console.error('[mapreduce] Fatal:', err.message);
  process.exit(1);
});
