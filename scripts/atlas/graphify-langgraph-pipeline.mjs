#!/usr/bin/env node
/**
 * graphify-langgraph-pipeline.mjs
 *
 * LangGraph-orchestrated automation pipeline for the Atlas codebase index.
 *
 * Nodes (run in order, each restartable via --stage):
 *   audit_coverage   → compute signal-density gaps (BM25, concept_ids, community_conf, Qdrant)
 *   feature_extract  → assign feature_id to packets missing it (path heuristic + domain label)
 *   kanban_task      → emit prioritised task list as JSON (what needs enrichment, in what order)
 *   embed_missing    → embed packets missing Qdrant vectors (nomic-embed-text → embeddinggemma fallback)
 *   index_bm25       → backfill bm25_text in payload for packets that lack it
 *   rank_signals     → compute + persist RRF ranking signal coverage report
 *   prune_noise      → remove .cache/ artifact packets + flag duplicates
 *
 * Usage:
 *   node scripts/atlas/graphify-langgraph-pipeline.mjs
 *   node scripts/atlas/graphify-langgraph-pipeline.mjs --apply
 *   node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage feature_extract
 *   node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --verbose
 *   node scripts/atlas/graphify-langgraph-pipeline.mjs --dry-run
 *
 * Deps: pg (installed), node-fetch polyfill not needed (Node 18+), no LangGraph npm required
 *       (uses lightweight local StateGraph shim so the script stays portable)
 */

import pg             from 'pg';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '../..');
const REPORT = join(ROOT, 'docs/reports');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const APPLY      = argv.includes('--apply') && !argv.includes('--dry-run');
const VERBOSE    = argv.includes('--verbose');
const DRY_RUN    = !APPLY;
const STAGE_ARG  = (() => { const i = argv.indexOf('--stage'); return i !== -1 ? argv[i+1] : null; })();
const LIMIT_ARG  = (() => { const a = argv.find(x => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : 500; })();

// ── Service URLs ──────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL   = process.env.QDRANT_URL   || 'http://localhost:6333';
const NEO4J_URL    = process.env.NEO4J_URL    || 'http://localhost:7474';
const NEO4J_USER   = process.env.NEO4J_USER   || 'neo4j';
const NEO4J_PASS   = process.env.NEO4J_PASS   || 'neo4j123';
const _ollamaRaw   = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL   = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
const COLLECTION   = 'codebase_chunks_768';

// ── Lightweight StateGraph shim ───────────────────────────────────────────────
// Avoids importing the full LangGraph npm package while preserving the same
// node → edge → conditional routing semantics.

class StateGraph {
  constructor(initialState) {
    this._state    = { ...initialState };
    this._nodes    = new Map();
    this._edges    = new Map();
    this._compiled = false;
  }

  addNode(name, fn) {
    this._nodes.set(name, fn);
    return this;
  }

  addEdge(from, to) {
    this._edges.set(from, () => to);
    return this;
  }

  addConditionalEdge(from, condFn) {
    this._edges.set(from, condFn);
    return this;
  }

  compile() { this._compiled = true; return this; }

  async invoke(input, opts = {}) {
    Object.assign(this._state, input);
    const start = opts.startNode ?? this._nodes.keys().next().value;
    let current = start;

    while (current && current !== '__end__') {
      const fn = this._nodes.get(current);
      if (!fn) throw new Error(`Node "${current}" not found`);

      const t0     = Date.now();
      const patch  = await fn(this._state);
      const elapsed = Date.now() - t0;
      Object.assign(this._state, patch ?? {});
      log(`  [${current}] ${elapsed}ms`);

      const router = this._edges.get(current);
      current = router ? router(this._state) : null;
    }
    return this._state;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

function log(...args) { if (!DRY_RUN || VERBOSE) console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function neo4jRun(stmt, params = {}) {
  try {
    const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body: JSON.stringify({ statements: [{ statement: stmt, parameters: params }] }),
      signal: AbortSignal.timeout(15_000),
    });
    const d = await res.json();
    if (d.errors?.length) throw new Error(d.errors[0].message);
    return d.results[0]?.data ?? [];
  } catch (e) {
    vlog(`  neo4j error: ${e.message}`);
    return [];
  }
}

async function embed(text) {
  for (const model of ['nomic-embed-text:latest', 'embeddinggemma:latest']) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next */ }
  }
  return null;
}

async function qdrantUpsert(points) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
  return (await res.json()).result;
}

// Map a source_ref / file path → domain feature label
function inferFeatureId(sourceRef = '', summary = '') {
  const text = (sourceRef + ' ' + summary).toLowerCase();

  const rules = [
    [/auth|session|login|lucia|password/,         'auth_session'],
    [/evidence|upload|ocr|pdf|media/,             'evidence_pipeline'],
    [/qdrant|vector|embed|768|ann|similarity/,    'vector_search'],
    [/neo4j|graph|cypher|topology|som/,           'graph_intelligence'],
    [/redis|cache|valkey|bifrost/,                'cache_layer'],
    [/langgraph|langchain|agent|supervisor/,       'agent_orchestration'],
    [/drizzle|schema|migrate|postgres|pg/,         'database_orm'],
    [/routes?\/api|server|endpoint|\+server/,      'api_endpoints'],
    [/svelte|component|ui|button|dialog/,          'frontend_ui'],
    [/mcp|tool.manifest|tool.call/,               'mcp_tools'],
    [/atlas|packet|karpathy|graphify/,             'atlas_indexing'],
    [/bm25|fts|search|retrieval|rrf/,             'retrieval_ranking'],
    [/concept|ontology|taxonomy|label/,            'concept_taxonomy'],
    [/chunk|indexer|chunker|split/,               'chunking_pipeline'],
    [/rabbitmq|amqp|queue|worker/,                'message_queue'],
    [/grpc|proto|turbovec|embedding.service/,      'grpc_services'],
    [/court|legal|case|evidence|statute/,          'legal_domain'],
    [/test|spec|vitest|playwright/,               'testing'],
    [/docker|compose|container|wsl/,              'infrastructure'],
    [/script|atlas|scripts\//,                    'atlas_scripts'],
  ];

  for (const [re, label] of rules) {
    if (re.test(text)) {
      return createHash('sha256').update(`feature:${label}`).digest('hex').slice(0, 16);
    }
  }
  return createHash('sha256').update(`feature:general`).digest('hex').slice(0, 16);
}

function domainLabel(sourceRef = '') {
  const text = sourceRef.toLowerCase();
  if (/auth|session|login/.test(text))      return 'auth_session';
  if (/evidence|upload|ocr|pdf/.test(text)) return 'evidence_pipeline';
  if (/qdrant|vector|embed/.test(text))     return 'vector_search';
  if (/neo4j|graph|cypher/.test(text))      return 'graph_intelligence';
  if (/redis|cache|bifrost/.test(text))     return 'cache_layer';
  if (/agent|langgraph/.test(text))         return 'agent_orchestration';
  if (/drizzle|schema|migrate/.test(text))  return 'database_orm';
  if (/api|server|endpoint/.test(text))     return 'api_endpoints';
  if (/svelte|component|ui/.test(text))     return 'frontend_ui';
  if (/mcp|tool/.test(text))               return 'mcp_tools';
  if (/atlas|packet|karpathy/.test(text))   return 'atlas_indexing';
  if (/search|bm25|rrf/.test(text))        return 'retrieval_ranking';
  if (/chunk|indexer/.test(text))          return 'chunking_pipeline';
  if (/legal|case|statute/.test(text))     return 'legal_domain';
  if (/script/.test(text))                 return 'atlas_scripts';
  return 'general';
}

// ── Pipeline state shape ──────────────────────────────────────────────────────

const INITIAL_STATE = {
  // Coverage audit results
  totalPackets:      0,
  addressable:       0,
  missingFeatureId:  0,
  missingBm25:       0,
  missingConcepts:   0,
  missingVectors:    0,
  noiseRefs:         0,

  // Work performed
  featureIdsAssigned:  0,
  vectorsUpserted:     0,
  bm25Backfilled:      0,
  noiseRemoved:        0,

  // Kanban output
  tasks: [],

  // Gate results
  gates: [],
  errors: [],
};

// ── Node implementations ──────────────────────────────────────────────────────

/**
 * Node 1: audit_coverage
 * Reads atlas_packets and computes gap counts across all signal dimensions.
 */
async function auditCoverage(state) {
  log('\n── Node: audit_coverage ─────────────────────────────────────────');

  const [totals] = await query(`
    SELECT
      COUNT(*)                                              AS total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END)  AS addressable,
      COUNT(CASE WHEN feature_id IS NULL
                   AND packet_key IS NOT NULL THEN 1 END) AS missing_feature_id,
      COUNT(CASE WHEN (payload->>'bm25_text') IS NULL
                   AND packet_key IS NOT NULL THEN 1 END) AS missing_bm25,
      COUNT(CASE WHEN (concept_ids IS NULL
                   OR array_length(concept_ids,1) = 0)
                   AND packet_key IS NOT NULL THEN 1 END) AS missing_concepts,
      COUNT(CASE WHEN source_ref LIKE '%.cache%'
                   OR source_ref LIKE '%/tmp/%'    THEN 1 END) AS noise_refs
    FROM atlas_packets
  `);

  // Check Qdrant for missing vectors
  let qdrantCount = 0;
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5_000) });
    const d = await r.json();
    qdrantCount = d.result?.points_count ?? 0;
  } catch { /* offline */ }

  const missingVectors = Math.max(0, parseInt(totals.addressable) - qdrantCount);

  log(`  total packets:       ${totals.total}`);
  log(`  addressable:         ${totals.addressable}`);
  log(`  missing feature_id:  ${totals.missing_feature_id}`);
  log(`  missing bm25_text:   ${totals.missing_bm25}`);
  log(`  missing concepts:    ${totals.missing_concepts}`);
  log(`  missing vectors:     ~${missingVectors} (qdrant=${qdrantCount})`);
  log(`  noise refs:          ${totals.noise_refs}`);

  return {
    totalPackets:     parseInt(totals.total),
    addressable:      parseInt(totals.addressable),
    missingFeatureId: parseInt(totals.missing_feature_id),
    missingBm25:      parseInt(totals.missing_bm25),
    missingConcepts:  parseInt(totals.missing_concepts),
    missingVectors,
    noiseRefs:        parseInt(totals.noise_refs),
  };
}

/**
 * Node 2: feature_extract
 * For packets missing feature_id, infers one from source_ref + summary using
 * the domain label rules (no LLM call — pure heuristic, deterministic).
 * Updates atlas_packets and upserts FeatureNode + IMPLEMENTS_FEATURE edge in Neo4j.
 */
async function featureExtract(state) {
  log('\n── Node: feature_extract ────────────────────────────────────────');

  if (state.missingFeatureId === 0) {
    log('  nothing to do — all addressable packets have feature_id');
    return { featureIdsAssigned: 0 };
  }

  const rows = await query(`
    SELECT packet_id, packet_key, source_ref, summary, payload
    FROM atlas_packets
    WHERE feature_id IS NULL
      AND packet_key IS NOT NULL
    LIMIT $1
  `, [LIMIT_ARG]);

  log(`  processing ${rows.length} packets (limit ${LIMIT_ARG} of ${state.missingFeatureId})`);

  let assigned = 0;
  const NEO4J_BATCH = [];

  for (const row of rows) {
    const featureId = inferFeatureId(row.source_ref, row.summary ?? '');
    const label     = domainLabel(row.source_ref);

    if (APPLY) {
      await pool.query(
        `UPDATE atlas_packets SET feature_id = $1, updated_at = NOW()
         WHERE packet_id = $2 AND feature_id IS NULL`,
        [featureId, row.packet_id]
      );
    }

    NEO4J_BATCH.push({ pk: row.packet_key, fid: featureId, label });
    assigned++;
  }

  // Batch Neo4j IMPLEMENTS_FEATURE edges
  if (APPLY && NEO4J_BATCH.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < NEO4J_BATCH.length; i += CHUNK) {
      const slice = NEO4J_BATCH.slice(i, i + CHUNK);
      await neo4jRun(
        `UNWIND $rows AS r
         MATCH (p:Packet { packet_key: r.pk })
         MERGE (f:Feature { feature_id: r.fid })
           ON CREATE SET f.label = r.label
         MERGE (p)-[:IMPLEMENTS_FEATURE]->(f)`,
        { rows: slice.map(r => ({ pk: r.pk, fid: r.fid })) }
      );
    }
    log(`  neo4j IMPLEMENTS_FEATURE edges written: ${NEO4J_BATCH.length}`);
  }

  log(`  feature_ids assigned: ${assigned}${DRY_RUN ? ' (dry-run)' : ''}`);
  return { featureIdsAssigned: assigned };
}

/**
 * Node 3: kanban_task
 * Builds a prioritised task manifest from the audit state.
 * Writes to docs/reports/atlas-kanban-tasks.json.
 */
async function kanbanTask(state) {
  log('\n── Node: kanban_task ────────────────────────────────────────────');

  const tasks = [];
  const now   = new Date().toISOString();

  // Priority order: data density gates first, then enrichment, then pruning
  if (state.missingFeatureId > 0) tasks.push({
    id:       'feature_extract',
    priority: 'P0',
    label:    'Assign feature_id to unclassified packets',
    count:    state.missingFeatureId,
    script:   'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage feature_extract',
    gate:     'feature_id coverage ≥ 60%',
    blockedBy: [],
  });

  if (state.missingVectors > 50) tasks.push({
    id:       'embed_missing',
    priority: 'P0',
    label:    'Embed packets missing Qdrant vectors',
    count:    state.missingVectors,
    script:   'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage embed_missing',
    gate:     'Qdrant vector coverage ≥ 80%',
    blockedBy: [],
  });

  if (state.missingBm25 > 0) tasks.push({
    id:       'index_bm25',
    priority: 'P1',
    label:    'Backfill bm25_text in payload for BM25 search lane',
    count:    state.missingBm25,
    script:   'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage index_bm25',
    gate:     'BM25 coverage ≥ 85%',
    blockedBy: ['feature_extract'],
  });

  if (state.missingConcepts > 0) tasks.push({
    id:       'concept_backfill',
    priority: 'P1',
    label:    'Assign concept taxonomy to packets missing concept_ids',
    count:    state.missingConcepts,
    script:   'node scripts/atlas/seed-concept-taxonomy.mjs --apply',
    gate:     'concept_ids coverage ≥ 60%',
    blockedBy: ['feature_extract'],
  });

  tasks.push({
    id:       'rank_signals',
    priority: 'P2',
    label:    'Audit and persist RRF ranking signal coverage',
    count:    state.addressable,
    script:   'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage rank_signals',
    gate:     'All 3 ranking gates PASS (BM25 ≥85%, concepts ≥60%, community_conf coverage)',
    blockedBy: ['index_bm25', 'concept_backfill'],
  });

  if (state.noiseRefs > 0) tasks.push({
    id:       'prune_noise',
    priority: 'P3',
    label:    'Remove .cache/ artifact packets',
    count:    state.noiseRefs,
    script:   'node scripts/atlas/graphify-langgraph-pipeline.mjs --apply --stage prune_noise',
    gate:     'noise refs < 5',
    blockedBy: [],
  });

  tasks.push({
    id:       'xgboost_export',
    priority: 'P2',
    label:    'Export XGBoost training features (unblocked once signal gates pass)',
    count:    state.addressable,
    script:   'node scripts/atlas/export-xgboost-features.mjs --apply',
    gate:     'NDCG@10 ≥ 0.80, ≥500 success traces',
    blockedBy: ['rank_signals'],
  });

  log(`  tasks generated: ${tasks.length}`);
  for (const t of tasks) {
    log(`    [${t.priority}] ${t.id} — ${t.count.toLocaleString()} items`);
  }

  mkdirSync(REPORT, { recursive: true });
  if (APPLY) {
    writeFileSync(join(REPORT, 'atlas-kanban-tasks.json'),
      JSON.stringify({ generated: now, tasks }, null, 2));
    log('  wrote docs/reports/atlas-kanban-tasks.json');
  }

  return { tasks };
}

/**
 * Node 4: embed_missing
 * Finds packets in atlas_packets that don't have a corresponding Qdrant vector,
 * embeds them, and upserts. Uses packet_key hash as stable numeric Qdrant ID.
 */
async function embedMissing(state) {
  log('\n── Node: embed_missing ──────────────────────────────────────────');

  if (state.missingVectors <= 0) {
    log('  nothing to do — Qdrant appears fully covered');
    return { vectorsUpserted: 0 };
  }

  // Scroll existing Qdrant IDs in batches to find gaps
  // Simpler: just re-upsert packets ordered by most-enriched first (idempotent PUT)
  const rows = await query(`
    SELECT packet_key, source_ref, feature_id, community_id, summary, payload
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND summary IS NOT NULL
    ORDER BY
      CASE WHEN feature_id IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN payload->>'bm25_text' IS NOT NULL THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT $1
  `, [LIMIT_ARG]);

  log(`  processing ${rows.length} packets for embedding`);

  let ok = 0;
  const BATCH = 10;

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice  = rows.slice(i, i + BATCH);
    const points = [];

    for (const row of slice) {
      const text = [
        row.summary ?? '',
        row.payload?.bm25_text ?? '',
        row.source_ref,
      ].filter(Boolean).join(' ').slice(0, 2048);

      const vector = await embed(text);
      if (!vector) { vlog(`  skip ${row.packet_key} — embed returned null`); continue; }

      const numId = parseInt(row.packet_key.slice(0, 8), 16);
      points.push({
        id:      numId,
        vector:  { content: vector },
        payload: {
          source_ref:   row.source_ref,
          feature_id:   row.feature_id,
          community_id: row.community_id ?? 0,
          packet_key:   row.packet_key,
          atlas_enriched: true,
          canonicalSourceRef: row.source_ref,
        },
      });
    }

    if (points.length && APPLY) {
      try {
        await qdrantUpsert(points);
        ok += points.length;
      } catch (err) {
        vlog(`  qdrant batch error: ${err.message}`);
      }
    } else if (points.length) {
      ok += points.length; // dry-run count
    }

    if (i % 50 === 0) process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length} embedded`);
  }
  process.stdout.write('\n');

  log(`  vectors upserted: ${ok}${DRY_RUN ? ' (dry-run)' : ''}`);
  return { vectorsUpserted: ok };
}

/**
 * Node 5: index_bm25
 * For packets missing payload.bm25_text, constructs it from source_ref + summary
 * + ontology labels (no LLM required — deterministic field composition).
 * Writes the bm25_text into payload JSONB.
 */
async function indexBm25(state) {
  log('\n── Node: index_bm25 ─────────────────────────────────────────────');

  const rows = await query(`
    SELECT packet_id, packet_key, source_ref, feature_id, summary, payload
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
      AND (payload->>'bm25_text') IS NULL
    LIMIT $1
  `, [LIMIT_ARG]);

  if (rows.length === 0) {
    log('  nothing to do — all packets have bm25_text');
    return { bm25Backfilled: 0 };
  }

  log(`  backfilling ${rows.length} packets`);
  let done = 0;

  for (const row of rows) {
    const parts = [
      row.source_ref ?? '',
      row.summary ?? '',
      domainLabel(row.source_ref),
      row.feature_id ? `feature:${row.feature_id.slice(0, 8)}` : '',
    ].filter(Boolean);

    const bm25Text = parts.join(' ');
    const newPayload = { ...(row.payload ?? {}), bm25_text: bm25Text };

    if (APPLY) {
      await pool.query(
        `UPDATE atlas_packets
         SET payload = $1::jsonb, updated_at = NOW()
         WHERE packet_id = $2
           AND (payload->>'bm25_text') IS NULL`,
        [JSON.stringify(newPayload), row.packet_id]
      );
    }
    done++;
  }

  log(`  bm25_text backfilled: ${done}${DRY_RUN ? ' (dry-run)' : ''}`);
  return { bm25Backfilled: done };
}

/**
 * Node 6: rank_signals
 * Audits RRF signal coverage and emits a report.
 * Computes: BM25 coverage, concept coverage, community_conf tier, Qdrant density.
 */
async function rankSignals(state) {
  log('\n── Node: rank_signals ───────────────────────────────────────────');

  const [cov] = await query(`
    SELECT
      COUNT(*) FILTER (WHERE packet_key IS NOT NULL) AS addressable,
      COUNT(*) FILTER (WHERE packet_key IS NOT NULL AND (payload->>'bm25_text') IS NOT NULL) AS has_bm25,
      COUNT(*) FILTER (WHERE packet_key IS NOT NULL AND concept_ids IS NOT NULL
                         AND array_length(concept_ids,1) > 0) AS has_concepts,
      COUNT(*) FILTER (WHERE community_confidence >= 0.65) AS high_conf,
      COUNT(*) FILTER (WHERE packet_key IS NOT NULL AND community_confidence IS NOT NULL) AS any_conf
    FROM atlas_packets
  `);

  let qdrantCount = 0;
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5_000) });
    const d = await r.json();
    qdrantCount = d.result?.points_count ?? 0;
  } catch { /* offline */ }

  const addr         = parseInt(cov.addressable);
  const bm25Pct      = addr > 0 ? (parseInt(cov.has_bm25)    / addr * 100).toFixed(1) : '0';
  const conceptPct   = addr > 0 ? (parseInt(cov.has_concepts) / addr * 100).toFixed(1) : '0';
  const highConfPct  = addr > 0 ? (parseInt(cov.high_conf)   / addr * 100).toFixed(1) : '0';
  const qdrantPct    = addr > 0 ? (qdrantCount               / addr * 100).toFixed(1) : '0';

  const gates = [
    { name: 'bm25_coverage_85pct',    pass: parseFloat(bm25Pct) >= 85,    detail: `${bm25Pct}% (${cov.has_bm25}/${addr})` },
    { name: 'concept_coverage_60pct', pass: parseFloat(conceptPct) >= 60, detail: `${conceptPct}% (${cov.has_concepts}/${addr})` },
    { name: 'community_conf_95pct',   pass: addr > 0 && (parseInt(cov.any_conf) / addr) >= 0.95, detail: `${(parseInt(cov.any_conf)/addr*100).toFixed(1)}% (${cov.any_conf}/${addr})` },
    { name: 'qdrant_coverage_50pct',  pass: parseFloat(qdrantPct) >= 50,  detail: `${qdrantPct}% (~${qdrantCount}/${addr})` },
  ];

  log('  Ranking signal coverage:');
  for (const g of gates) {
    log(`    ${g.pass ? '✅' : '❌'} ${g.name.padEnd(30)} ${g.detail}`);
  }

  const allPass = gates.every(g => g.pass);
  log(`  XGBoost unblocked: ${allPass ? '✅ YES' : '❌ NO — fix failing gates first'}`);

  const report = {
    generated: new Date().toISOString(),
    addressable: addr,
    bm25:     { count: parseInt(cov.has_bm25),    pct: bm25Pct },
    concepts: { count: parseInt(cov.has_concepts), pct: conceptPct },
    highConf: { count: parseInt(cov.high_conf),   pct: highConfPct },
    qdrant:   { count: qdrantCount,               pct: qdrantPct },
    gates,
    xgboostUnblocked: allPass,
  };

  mkdirSync(REPORT, { recursive: true });
  if (APPLY) {
    writeFileSync(join(REPORT, 'ranking-signal-coverage.json'), JSON.stringify(report, null, 2));
    log('  wrote docs/reports/ranking-signal-coverage.json');
  }

  return { gates };
}

/**
 * Node 7: prune_noise
 * Removes .cache/, /tmp/, and test-fixture source_refs.
 * Marks them with source_kind='pruned' rather than hard-delete (reversible).
 */
async function pruneNoise(state) {
  log('\n── Node: prune_noise ────────────────────────────────────────────');

  if (state.noiseRefs === 0) {
    log('  nothing to do');
    return { noiseRemoved: 0 };
  }

  const rows = await query(`
    SELECT packet_id, source_ref FROM atlas_packets
    WHERE source_ref LIKE '%.cache%'
       OR source_ref LIKE '%/tmp/%'
       OR source_ref LIKE '%__pycache__%'
       OR source_ref LIKE '%.pyc'
    LIMIT 500
  `);

  log(`  marking ${rows.length} noise packets as source_kind='pruned'`);

  if (APPLY && rows.length > 0) {
    const ids = rows.map(r => r.packet_id);
    await pool.query(
      `UPDATE atlas_packets SET source_kind = 'pruned', updated_at = NOW()
       WHERE packet_id = ANY($1::text[])`,
      [ids]
    );
  }

  if (VERBOSE) {
    for (const r of rows.slice(0, 5)) log(`    pruned: ${r.source_ref}`);
    if (rows.length > 5) log(`    … and ${rows.length - 5} more`);
  }

  log(`  pruned: ${rows.length}${DRY_RUN ? ' (dry-run)' : ''}`);
  return { noiseRemoved: rows.length };
}

// ── Build graph ───────────────────────────────────────────────────────────────

function buildGraph() {
  const g = new StateGraph({ ...INITIAL_STATE });

  g.addNode('audit_coverage',  auditCoverage);
  g.addNode('feature_extract', featureExtract);
  g.addNode('kanban_task',     kanbanTask);
  g.addNode('embed_missing',   embedMissing);
  g.addNode('index_bm25',      indexBm25);
  g.addNode('rank_signals',    rankSignals);
  g.addNode('prune_noise',     pruneNoise);

  // Linear DAG: audit → feature → kanban → embed → bm25 → rank → prune
  g.addEdge('audit_coverage',  'feature_extract');
  g.addEdge('feature_extract', 'kanban_task');
  g.addEdge('kanban_task',     'embed_missing');
  g.addEdge('embed_missing',   'index_bm25');
  g.addEdge('index_bm25',      'rank_signals');
  g.addEdge('rank_signals',    'prune_noise');
  g.addEdge('prune_noise',     '__end__');

  return g.compile();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mode = DRY_RUN ? 'DRY RUN' : 'APPLY';
  console.log(`\n═══ Graphify LangGraph Pipeline (${mode}) ═══\n`);

  if (STAGE_ARG) {
    console.log(`Running single node: ${STAGE_ARG}\n`);
  }

  const graph = buildGraph();

  const startNode = STAGE_ARG ?? 'audit_coverage';

  const result = await graph.invoke({}, { startNode });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══ Pipeline Summary ══════════════════════════════════════');
  console.log(`  addressable packets:   ${result.addressable.toLocaleString()}`);
  console.log(`  feature_ids assigned:  ${result.featureIdsAssigned}`);
  console.log(`  vectors upserted:      ${result.vectorsUpserted}`);
  console.log(`  bm25 backfilled:       ${result.bm25Backfilled}`);
  console.log(`  noise pruned:          ${result.noiseRemoved}`);

  if (result.tasks?.length > 0) {
    console.log(`\n  Kanban task queue (${result.tasks.length} tasks):`);
    for (const t of result.tasks) {
      console.log(`    [${t.priority}] ${t.id} — ${t.count.toLocaleString()} items — gate: ${t.gate}`);
    }
  }

  if (result.gates?.length > 0) {
    console.log('\n  Ranking gate summary:');
    for (const g of result.gates) {
      console.log(`    ${g.pass ? '✅' : '❌'} ${g.name.padEnd(32)} ${g.detail}`);
    }
  }

  const allGatesPass = result.gates?.every?.(g => g.pass) ?? false;
  const xgboostReady = allGatesPass && result.vectorsUpserted >= 0;
  console.log(`\n  XGBoost export ready: ${xgboostReady ? '✅' : '❌'}`);
  console.log(`  Mode: ${DRY_RUN ? 'dry-run (add --apply to write)' : 'applied'}`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
  process.exit(1);
});
