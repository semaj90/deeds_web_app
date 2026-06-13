#!/usr/bin/env node
/**
 * atlas-startup-intelligence.mjs
 *
 * Atlas self-auditing startup scan. Runs on every session open and produces
 * four JSON artifacts that OpenCode subagents, LangGraph planners, and Gemma4
 * can read instead of re-auditing 250k files cold.
 *
 * Scans:
 *   1. PostgreSQL  — atlas_packets, agent_traces, concept coverage, signal gates
 *   2. Qdrant      — codebase_chunks_768 count, payload field coverage
 *   3. Neo4j       — edge counts (USED_CONCEPT, FROM_SOURCE, SIMILAR_TOPOLOGY)
 *   4. Redis       — key presence (karpathy, temporal, domain, reward sets)
 *   5. Reports     — freshness of key docs/reports JSON files
 *   6. Proto registry — active .proto service count
 *   7. MCP manifests  — tool count from manifest packets
 *
 * Outputs (docs/reports/atlas/):
 *   atlas-board-state.json    — service health + packet coverage summary
 *   atlas-kanban-tasks.json   — auto-generated TODO items from gate failures
 *   atlas-risk-report.json    — items blocking XGBoost training / cascade gate
 *   atlas-next-actions.json   — top 5 recommended next commands
 *
 * Usage:
 *   node scripts/atlas/atlas-startup-intelligence.mjs
 *   node scripts/atlas/atlas-startup-intelligence.mjs --apply   (write outputs)
 *   node scripts/atlas/atlas-startup-intelligence.mjs --verbose
 *   node scripts/atlas/atlas-startup-intelligence.mjs --json    (stdout only)
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { createRequire } from 'module';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(ROOT, 'docs', 'reports', 'atlas');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(...args) { if (!JSON_OUT) console.log(...args); }
function vlog(...args) { if (VERBOSE && !JSON_OUT) console.log(...args); }

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function tryPg(fn) {
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 3000,
    });
    try   { return await fn(pool); }
    finally { await pool.end().catch(() => {}); }
  } catch { return null; }
}

async function tryRedis(fn) {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis({
      host:              process.env.REDIS_HOST ?? '127.0.0.1',
      port:              parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password:          process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
      lazyConnect:       true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue:   false,
      retryStrategy:     () => null,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      await redis.ping();
      return await fn(redis);
    } finally {
      await redis.quit().catch(() => {});
    }
  } catch { return null; }
}

async function tryQdrant(path_) {
  try {
    const res = await fetch(`http://localhost:6333${path_}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function tryNeo4j(query, params = {}) {
  try {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      process.env.NEO4J_URI ?? 'bolt://localhost:7687',
      neo4j.default.auth.basic(
        process.env.NEO4J_USER ?? 'neo4j',
        process.env.NEO4J_PASSWORD ?? 'neo4j123',
      ),
    );
    const session = driver.session({ defaultAccessMode: neo4j.default.session.READ });
    try {
      const result = await session.run(query, params);
      return result.records;
    } finally {
      await session.close();
      await driver.close();
    }
  } catch { return null; }
}

function reportAge(filePath) {
  try {
    const stat = statSync(filePath);
    return Math.round((Date.now() - stat.mtimeMs) / 3600000 * 10) / 10; // hours
  } catch { return null; }
}

function protoCount() {
  const dirs = [
    path.join(ROOT, 'proto', 'active'),
    path.join(ROOT, 'sveltekit-frontend', 'proto', 'active'),
  ];
  let count = 0;
  for (const d of dirs) {
    try { count += readdirSync(d).filter(f => f.endsWith('.proto')).length; } catch {}
  }
  return count;
}

// ── Gate definitions ───────────────────────────────────────────────────────────

const GATES = {
  // Signal density gates (block XGBoost training)
  bm25_coverage:              { label: 'BM25 summary coverage ≥85%',              threshold: 85,    unit: '%' },
  concept_coverage_addressable: { label: 'concept_ids (addressable pkts) ≥60%',  threshold: 60,    unit: '%' },
  community_conf:             { label: 'community_conf (col+JSONB) ≥95%',          threshold: 95,    unit: '%' },
  // Retrieval gates
  qdrant_packets:             { label: 'Qdrant codebase_chunks_768 ≥7000',        threshold: 7000,  unit: 'pts' },
  neo4j_edges:                { label: 'Neo4j USED_CONCEPT ≥10000',               threshold: 10000, unit: 'edges' },
  // Training gate
  xgboost_features:           { label: 'XGBoost feature rows ≥50000',             threshold: 50000, unit: 'rows' },
  // Domain gate
  domain_coverage:            { label: 'Domain classification (addressable pkts) ≥95%', threshold: 95, unit: '%' },
};

// ── Main scan ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  log('\n═══ Atlas Startup Intelligence ═══\n');

  const board = {
    generated:    new Date().toISOString(),
    scan_ms:      0,
    postgres:     {},
    qdrant:       {},
    neo4j:        {},
    redis:        {},
    reports:      {},
    proto:        {},
    gates:        {},
  };

  // ── 1. PostgreSQL ──────────────────────────────────────────────────────────
  log('  Scanning PostgreSQL…');
  const pgData = await tryPg(async (pool) => {
    const [packets, traces, concepts, signals] = await Promise.all([
      pool.query(`SELECT
        COUNT(*)                                                                          AS total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref != '')              AS addressable,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 20)             AS with_summary,
        -- concept_ids: scoped to addressable packets only (non-empty source_ref)
        COUNT(*) FILTER (WHERE concept_ids IS NOT NULL AND cardinality(concept_ids) > 0
                          AND source_ref IS NOT NULL AND source_ref != '')               AS with_concepts_addressable,
        COUNT(*) FILTER (WHERE concept_ids IS NOT NULL AND cardinality(concept_ids) > 0) AS with_concepts_all,
        -- community_confidence: check both the top-level column AND JSONB payload
        COUNT(*) FILTER (WHERE community_confidence > 0
                          OR (payload->>'community_confidence')::numeric > 0)            AS community_conf_any,
        COUNT(*) FILTER (WHERE community_confidence >= 0.65
                          OR (payload->>'community_confidence')::numeric >= 0.65)        AS high_conf_community,
        COUNT(*) FILTER (WHERE payload->>'domain_class' IS NOT NULL)                     AS with_domain,
        COUNT(DISTINCT feature_id)                                                        AS distinct_features
        FROM atlas_packets`).catch(() => null),

      pool.query(`SELECT COUNT(*) AS total,
        COUNT(CASE WHEN outcome = 'success' THEN 1 END) AS success
        FROM agent_traces`).catch(() => null),

      pool.query(`SELECT COUNT(DISTINCT concept_id) AS total FROM concept_evidence`).catch(() => null),

      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN reward_prior > 0 OR (payload->>'reward_prior')::numeric > 0 THEN 1 END) AS with_reward
        FROM atlas_packets`).catch(() => null),
    ]);

    const p = packets?.rows[0];
    const t = traces?.rows[0];
    const c = concepts?.rows[0];
    const s = signals?.rows[0];

    if (!p) return null;

    const total       = Number(p.total) || 1;
    const addressable = Number(p.addressable) || 1;
    return {
      ok:                         true,
      total_packets:              Number(p.total),
      addressable_packets:        Number(p.addressable),
      with_summary:               Number(p.with_summary),
      with_concepts_addressable:  Number(p.with_concepts_addressable),
      with_concepts_all:          Number(p.with_concepts_all),
      community_conf_any:         Number(p.community_conf_any),
      high_conf_community:        Number(p.high_conf_community),
      with_domain:                Number(p.with_domain),
      distinct_features:          Number(p.distinct_features),
      bm25_pct:                   Math.round(Number(p.with_summary) / total * 100),
      // concept gate uses addressable denominator
      concept_pct:                Math.round(Number(p.with_concepts_addressable) / addressable * 100),
      concept_pct_all:            Math.round(Number(p.with_concepts_all) / total * 100),
      // community gate checks both column + JSONB
      community_pct:              Math.round(Number(p.community_conf_any) / total * 100),
      // domain gate uses addressable denominator (classifier only runs on non-empty source_ref packets)
      domain_pct:                 Math.round(Number(p.with_domain) / addressable * 100),
      total_traces:               Number(t?.total ?? 0),
      success_traces:             Number(t?.success ?? 0),
      total_concepts:             Number(c?.total ?? 0),
      with_reward:                Number(s?.with_reward ?? 0),
    };
  });

  board.postgres = pgData ?? { ok: false, error: 'connection_failed' };
  vlog('    Postgres:', JSON.stringify(board.postgres, null, 2));

  // ── 2. Qdrant ──────────────────────────────────────────────────────────────
  log('  Scanning Qdrant…');
  const qdrantData = await (async () => {
    const info = await tryQdrant('/collections/codebase_chunks_768');
    if (!info) return { ok: false, error: 'connection_failed' };
    const count = info.result?.points_count ?? 0;
    const cfg   = info.result?.config?.params?.vectors;
    return {
      ok:           true,
      points_count: count,
      has_content_vector: cfg != null,
    };
  })();

  board.qdrant = qdrantData;
  vlog('    Qdrant:', JSON.stringify(board.qdrant));

  // ── 3. Neo4j ───────────────────────────────────────────────────────────────
  log('  Scanning Neo4j…');
  const VERIFY_REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'verify-used-concept-edges.json');
  const neo4jData = await (async () => {
    // Try live Neo4j first (separate queries to avoid WITH-clause chain failures)
    const ucRecords = await tryNeo4j('MATCH ()-[r:USED_CONCEPT]->() RETURN count(r) AS uc');
    const fsRecords = await tryNeo4j('MATCH ()-[r:FROM_SOURCE]->() RETURN count(r) AS fs');
    const stRecords = await tryNeo4j('MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r) AS st');

    if (ucRecords && ucRecords.length > 0) {
      return {
        ok:                     true,
        source:                 'live',
        used_concept_edges:     Number(ucRecords[0].get('uc')),
        from_source_edges:      fsRecords?.length ? Number(fsRecords[0].get('fs')) : 0,
        similar_topology_edges: stRecords?.length ? Number(stRecords[0].get('st')) : 0,
      };
    }

    // Fallback: read the verify-used-concept-edges report if it exists
    try {
      const raw = await readFile(VERIFY_REPORT_PATH, 'utf8');
      const report = JSON.parse(raw);
      // report.neo4j.atlas_edges = Packet→Concept edges from atlas_packets source
      // report.neo4j.total_edges = all USED_CONCEPT edges across all sources
      const edgeCount = report.neo4j?.atlas_edges ?? report.neo4j?.total_edges ?? 0;
      return {
        ok:                     edgeCount > 0,
        source:                 'verify_report',
        used_concept_edges:     edgeCount,
        from_source_edges:      0,
        similar_topology_edges: 0,
        report_age_hours:       reportAge(VERIFY_REPORT_PATH),
        gate_pass:              report.gate?.pass ?? false,
      };
    } catch {}

    return { ok: false, error: 'connection_failed_or_empty', source: 'none' };
  })();

  board.neo4j = neo4jData;
  vlog('    Neo4j:', JSON.stringify(board.neo4j));

  // ── 4. Redis ───────────────────────────────────────────────────────────────
  log('  Scanning Redis…');
  const redisData = await tryRedis(async (redis) => {
    const [karpathy, temporal, domainKeys, rewardSet] = await Promise.all([
      redis.hlen('gpu:karpathy:scores'),
      redis.zcard('temporal:packet:zset'),
      redis.keys('domain:packet:class').then(k => k.length).catch(() => 0),
      redis.scard('reward:packets:top').catch(() => 0),
    ]);
    return {
      ok:              true,
      karpathy_files:  karpathy,
      temporal_packets: temporal,
      domain_keys:     domainKeys,
      reward_top_set:  rewardSet,
    };
  });

  board.redis = redisData ?? { ok: false, error: 'connection_failed' };
  vlog('    Redis:', JSON.stringify(board.redis));

  // ── 5. Reports freshness ───────────────────────────────────────────────────
  log('  Scanning reports…');
  const keyReports = {
    domain_ontology:  path.join(ROOT, 'docs/reports/domain-ontology-classification.json'),
    temporal_index:   path.join(ROOT, 'docs/reports/temporal-bitfrost-index.json'),
    xgboost_meta:     path.join(ROOT, 'docs/reports/xgboost-features-meta.json'),
    xgboost_training: path.join(ROOT, 'docs/reports/xgboost-training-report.json'),
    ranking_signals:  path.join(ROOT, 'docs/reports/ranking-signal-coverage.json'),
  };

  board.reports = {};
  let xgboostRows = 0;
  for (const [key, fpath] of Object.entries(keyReports)) {
    const ageH = reportAge(fpath);
    board.reports[key] = {
      exists:  existsSync(fpath),
      age_hours: ageH,
      stale:   ageH !== null && ageH > 24,
    };

    if (key === 'xgboost_meta' && existsSync(fpath)) {
      try {
        const meta = JSON.parse(await readFile(fpath, 'utf8'));
        xgboostRows = meta.total_rows ?? meta.rows ?? 0;
        board.reports[key].total_rows = xgboostRows;
      } catch {}
    }

    if (key === 'xgboost_training' && existsSync(fpath)) {
      try {
        const tr = JSON.parse(await readFile(fpath, 'utf8'));
        board.reports[key].ndcg_at_10 = tr.ndcg_at_10;
        board.reports[key].gate_pass  = tr.gate_pass;
        board.reports[key].model_type = tr.model_type;
      } catch {}
    }
  }

  // ── 6. Proto registry ─────────────────────────────────────────────────────
  log('  Scanning proto registry…');
  board.proto = { active_services: protoCount() };

  // ── 7. Gate evaluation ────────────────────────────────────────────────────
  log('  Evaluating gates…');
  const pg   = board.postgres;
  const qd   = board.qdrant;
  const n4   = board.neo4j;

  const gateResults = {
    bm25_coverage: {
      value: pg.bm25_pct ?? 0,
      pass:  (pg.bm25_pct ?? 0) >= GATES.bm25_coverage.threshold,
    },
    concept_coverage_addressable: {
      value: pg.concept_pct ?? 0,
      detail: `${pg.concept_pct ?? 0}% of ${pg.addressable_packets ?? 0} addressable pkts (all: ${pg.concept_pct_all ?? 0}%)`,
      pass:  (pg.concept_pct ?? 0) >= GATES.concept_coverage_addressable.threshold,
    },
    community_conf: {
      value: pg.community_pct ?? 0,
      detail: `${pg.community_pct ?? 0}% have community_confidence>0 (col+JSONB combined)`,
      pass:  (pg.community_pct ?? 0) >= GATES.community_conf.threshold,
    },
    qdrant_packets: {
      value: qd.points_count ?? 0,
      pass:  (qd.points_count ?? 0) >= GATES.qdrant_packets.threshold,
    },
    neo4j_edges: {
      value:  n4.used_concept_edges ?? 0,
      source: n4.source ?? 'none',
      pass:   (n4.used_concept_edges ?? 0) >= GATES.neo4j_edges.threshold,
    },
    xgboost_features: {
      value: xgboostRows,
      pass:  xgboostRows >= GATES.xgboost_features.threshold,
    },
    domain_coverage: {
      value: pg.domain_pct ?? 0,
      detail: `${pg.domain_pct ?? 0}% of ${(pg.addressable_packets ?? 0).toLocaleString()} addressable pkts (all: ${Math.round((pg.with_domain ?? 0) / (pg.total_packets ?? 1) * 100)}%)`,
      pass:  (pg.domain_pct ?? 0) >= GATES.domain_coverage.threshold,
    },
  };

  board.gates = Object.fromEntries(
    Object.entries(gateResults).map(([k, v]) => [k, { ...GATES[k], ...v }])
  );

  const passCount = Object.values(gateResults).filter(g => g.pass).length;
  const totalGates = Object.keys(gateResults).length;
  board.gate_summary = { pass: passCount, total: totalGates, pct: Math.round(passCount / totalGates * 100) };

  board.scan_ms = Date.now() - t0;

  // ── Build kanban tasks from gate failures ──────────────────────────────────
  const kanban = { generated: board.generated, tasks: [] };

  if (!gateResults.bm25_coverage.pass) {
    kanban.tasks.push({
      id: 'backfill-bm25-summaries',
      priority: 'P0',
      title: 'Backfill BM25 summaries',
      detail: `Only ${pg.bm25_pct}% of packets have summaries (gate ≥85%). Run: npm run atlas:backfill-reward`,
      command: 'node scripts/atlas/backfill-packet-metadata.mjs --apply',
      blocks: ['xgboost_training'],
    });
  }

  if (!gateResults.concept_coverage_addressable.pass) {
    kanban.tasks.push({
      id: 'backfill-concept-ids',
      priority: 'P0',
      title: 'Scale concept_id coverage (addressable packets)',
      detail: `Only ${pg.concept_pct}% of addressable packets have concept_ids (all: ${pg.concept_pct_all}%, gate ≥60% addressable). Run enrich-atlas-concept-ids.mjs or write-used-concept-edges.mjs --apply`,
      command: 'node scripts/atlas/write-used-concept-edges.mjs --apply',
      blocks: ['xgboost_training'],
    });
  }

  if (!gateResults.domain_coverage.pass) {
    kanban.tasks.push({
      id: 'reclassify-domain-ontology',
      priority: 'P1',
      title: 'Re-run domain ontology classification',
      detail: `${pg.domain_pct}% classified (gate ≥95%). Re-run: npm run atlas:ontology:classify`,
      command: 'node scripts/atlas/classify-domain-ontology.mjs --apply',
      blocks: [],
    });
  }

  if (!gateResults.neo4j_edges.pass) {
    kanban.tasks.push({
      id: 'seed-neo4j-used-concept',
      priority: 'P1',
      title: 'Seed Neo4j USED_CONCEPT edges',
      detail: `Only ${n4.used_concept_edges ?? 0} edges (gate ≥10,000).`,
      command: 'node scripts/atlas/write-used-concept-edges.mjs --apply',
      blocks: ['cascade_neo4j_expansion'],
    });
  }

  if (!board.reports.xgboost_training?.gate_pass && board.reports.xgboost_features?.exists) {
    kanban.tasks.push({
      id: 'train-xgboost-reranker',
      priority: 'P1',
      title: 'Train XGBoost supervised reranker (active lane)',
      detail: 'Feature CSV ready. XGBoost = supervised packet reranker (fast, explainable). PyTorch policy = agent action selector (next lane). Run in order: xgboost:train → xgboost:serve → cascade:smoke',
      command: 'npm run atlas:xgboost:train && python scripts/atlas/serve-xgboost-reranker.py',
      blocks: ['cascade_stage4_xgboost'],
    });
  }

  if (!board.reports.temporal_index?.exists || board.reports.temporal_index?.stale) {
    kanban.tasks.push({
      id: 'rebuild-temporal-index',
      priority: 'P2',
      title: 'Rebuild temporal Bitfrost index',
      detail: 'Temporal index missing or >24h old.',
      command: 'node scripts/atlas/build-temporal-bitfrost-index.mjs --apply',
      blocks: [],
    });
  }

  if ((board.redis.karpathy_files ?? 0) < 100) {
    kanban.tasks.push({
      id: 'refresh-karpathy-gpu',
      priority: 'P2',
      title: 'Refresh Karpathy GPU authority blend',
      detail: `Only ${board.redis.karpathy_files ?? 0} files in gpu:karpathy:scores.`,
      command: 'node scripts/karpathy-gpu-enrich.mjs',
      blocks: [],
    });
  }

  // ── Risk report ────────────────────────────────────────────────────────────
  const risk = {
    generated: board.generated,
    xgboost_training_blocked: !gateResults.bm25_coverage.pass || !gateResults.concept_coverage_addressable.pass,
    xgboost_gate_pass: board.reports.xgboost_training?.gate_pass ?? false,
    xgboost_ndcg: board.reports.xgboost_training?.ndcg_at_10 ?? null,
    cascade_stage4: board.reports.xgboost_training?.gate_pass
      ? 'xgboost_sidecar_ready'
      : 'gemma4_fallback_only',
    blockers: kanban.tasks.filter(t => t.priority === 'P0').map(t => t.id),
    warnings: kanban.tasks.filter(t => t.priority === 'P1').map(t => t.id),
    service_health: {
      postgres: pg.ok ?? false,
      qdrant:   qd.ok ?? false,
      neo4j:    n4.ok ?? false,
      redis:    board.redis.ok ?? false,
    },
  };

  // ── Next actions ───────────────────────────────────────────────────────────
  const nextActions = {
    generated: board.generated,
    architecture: {
      active_lane: 'XGBoost supervised reranker (Stage 4) — tabular, fast, explainable',
      next_lane:   'PyTorch policy network (Stage 5) — agent action selector with SOM+CUDA',
      future_lane: 'QLoRA/RL (Stage 6) — after reward signals are stable',
      som_role:    'SOM 20×20 is topology routing stored in payload — NOT retrieval. ' +
                   'EmbeddingGemma768→AE64→SOM→som_row/col/index. Policy (Stage 5) reads it.',
      xgboost_role: 'Stage 4: supervised ranking only — BM25, ANN, TurboVec, community_conf, ' +
                    'concept_overlap, reward_prior, som_cache_hit (binary), provenance_git_age. ' +
                    'som_cell_id (int) excluded — tree splits on SOM topology indices are meaningless.',
    },
    recommended: kanban.tasks.slice(0, 5).map((t, i) => ({
      rank: i + 1,
      id:   t.id,
      title: t.title,
      command: t.command,
      priority: t.priority,
    })),
    quick_wins: [
      ...(!board.reports.domain_ontology?.exists || board.reports.domain_ontology?.stale
        ? [{ title: 'Fix domain gate (50% → 95%): re-classify domain ontology', command: 'node scripts/atlas/classify-domain-ontology.mjs --apply' }]
        : []),
      ...((!board.reports.xgboost_training?.exists && board.reports.xgboost_features?.exists)
        ? [{ title: 'Train XGBoost supervised reranker — feature CSV ready (101k rows)', command: 'npm run atlas:xgboost:train' }]
        : []),
      ...(board.reports.xgboost_training?.gate_pass
        ? [{ title: 'Start XGBoost sidecar (port 8765)', command: 'npm run atlas:xgboost:serve' }]
        : []),
    ],
  };

  // ── Print summary ──────────────────────────────────────────────────────────
  if (!JSON_OUT) {
    console.log('\n══ Gate Results ══════════════════════════════════');
    for (const [k, g] of Object.entries(board.gates)) {
      const icon = g.pass ? '✅' : '❌';
      const detail = g.detail ? `  ← ${g.detail}` : '';
      console.log(`  ${icon} ${g.label.padEnd(45)} ${g.value}${g.unit ?? ''}${detail}`);
    }
    console.log(`\n  Gates: ${board.gate_summary.pass}/${board.gate_summary.total} (${board.gate_summary.pct}%)`);
    if (pg.ok) {
      console.log(`\n  Signal detail:`);
      console.log(`    concept_ids (addressable): ${pg.concept_pct ?? 0}% of ${(pg.addressable_packets ?? 0).toLocaleString()} pkts`);
      console.log(`    concept_ids (all):         ${pg.concept_pct_all ?? 0}% of ${(pg.total_packets ?? 0).toLocaleString()} pkts`);
      console.log(`    community_conf>0 (col+JSONB): ${pg.community_pct ?? 0}%  (${(pg.community_conf_any ?? 0).toLocaleString()} pkts)`);
      console.log(`    community_conf≥0.65:          ${Math.round((pg.high_conf_community ?? 0) / Math.max(1, pg.total_packets ?? 1) * 100)}%`);
      console.log(`    domain_class (addressable):   ${pg.domain_pct ?? 0}% of ${(pg.addressable_packets ?? 0).toLocaleString()} pkts (all: ${Math.round((pg.with_domain ?? 0) / Math.max(1, pg.total_packets ?? 1) * 100)}%)`);
    }

    console.log('\n══ Service Health ═══════════════════════════════');
    const svc = risk.service_health;
    console.log(`  ${svc.postgres ? '✅' : '❌'} PostgreSQL  ${pg.total_packets ?? '–'} packets`);
    console.log(`  ${svc.qdrant   ? '✅' : '❌'} Qdrant      ${qd.points_count ?? '–'} points`);
    console.log(`  ${svc.neo4j    ? '✅' : '❌'} Neo4j       ${n4.used_concept_edges ?? '–'} USED_CONCEPT edges  [source: ${n4.source ?? 'none'}]`);
    console.log(`  ${svc.redis    ? '✅' : '❌'} Redis       ${board.redis.karpathy_files ?? '–'} karpathy files`);

    console.log('\n══ XGBoost Status ════════════════════════════════');
    if (risk.xgboost_training_blocked) {
      console.log(`  ⛔ Training blocked — P0 gates not met`);
    } else if (!board.reports.xgboost_training?.exists) {
      console.log(`  ⏳ Feature CSV ready — run: npm run atlas:xgboost:train`);
    } else if (!risk.xgboost_gate_pass) {
      console.log(`  ⚠️  Model trained — NDCG@10=${risk.xgboost_ndcg ?? '?'} (gate ≥0.70 NOT met)`);
    } else {
      console.log(`  ✅ Model gate PASS — NDCG@10=${risk.xgboost_ndcg}`);
      console.log(`  ✅ Stage 4: ${risk.cascade_stage4}`);
    }

    if (nextActions.recommended.length > 0) {
      console.log('\n══ Next Actions ══════════════════════════════════');
      for (const a of nextActions.recommended) {
        console.log(`  [${a.priority}] ${a.title}`);
        console.log(`       ${a.command}`);
      }
    }

    console.log(`\n  Scan time: ${board.scan_ms}ms\n`);
  }

  // ── Write outputs ──────────────────────────────────────────────────────────
  if (APPLY) {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(path.join(REPORT_DIR, 'atlas-board-state.json'),   JSON.stringify(board, null, 2));
    writeFileSync(path.join(REPORT_DIR, 'atlas-kanban-tasks.json'),  JSON.stringify(kanban, null, 2));
    writeFileSync(path.join(REPORT_DIR, 'atlas-risk-report.json'),   JSON.stringify(risk, null, 2));
    writeFileSync(path.join(REPORT_DIR, 'atlas-next-actions.json'),  JSON.stringify(nextActions, null, 2));
    log(`\n  ✅ Wrote to ${REPORT_DIR}/`);
    log('    atlas-board-state.json');
    log('    atlas-kanban-tasks.json');
    log('    atlas-risk-report.json');
    log('    atlas-next-actions.json');
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ board, kanban, risk, nextActions }, null, 2));
  }

  // Exit 1 if any P0 blocker
  const p0Count = kanban.tasks.filter(t => t.priority === 'P0').length;
  if (p0Count > 0 && process.argv.includes('--strict')) process.exit(1);
}

main().catch(e => { console.error('atlas-startup-intelligence error:', e.message); process.exit(1); });
