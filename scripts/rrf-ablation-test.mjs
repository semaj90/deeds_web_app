#!/usr/bin/env node
/**
 * rrf-ablation-test.mjs
 *
 * Standalone RRF ablation test — no SvelteKit imports, runs directly via node.
 * Tests each retrieval lane independently and combined via RRF.
 *
 * Metrics: DCG@10, NDCG@10, MRR@20, Recall@10
 * Gate: NDCG@10 ≥ 0.30 for "RRF combined" to show signal (lower bound — atlas_packets
 *       uses graphify tags as concept_ids, not manually labeled relevance docs).
 *
 * Usage:
 *   node scripts/rrf-ablation-test.mjs
 *   node scripts/rrf-ablation-test.mjs --json
 *   node scripts/rrf-ablation-test.mjs --save-baseline
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const _ollamaRaw = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;

const JSON_MODE = process.argv.includes('--json');
const SAVE_BASELINE = process.argv.includes('--save-baseline');
const K = 60; // RRF constant

// ── Test queries — keyed to actual source_ref paths in atlas_packets ────────
// Paths verified present via: SELECT DISTINCT source_ref FROM atlas_packets WHERE source_ref IN (...)
// Queries use ≤3 meaningful terms so plainto_tsquery AND-match succeeds in ≥1 BM25 hit.

const TEST_QUERIES = [
  {
    query: 'reranker boosted cluster',
    relevantPaths: [
      'src/lib/server/retrieval/boosted-reranker.ts',
      'src/lib/server/ai/graph-reranker.ts',
      'src/lib/server/retrieval/cluster-aware-reranker.ts',
    ],
  },
  {
    query: 'atlas retrieval lanes',
    relevantPaths: [
      'src/lib/server/atlas/context-for-file.ts',
      'src/lib/server/ace/multi-lane-retrieval.ts',
      'src/lib/server/features/rag/retrieval-lanes.ts',
    ],
  },
  {
    query: 'neo4j codebase sync',
    relevantPaths: [
      'src/lib/server/graph/codebase-neo4j-sync.ts',
      'src/lib/server/graph/neo4j-jsonl-exporter.ts',
    ],
  },
  {
    query: 'qdrant vector embedding',
    relevantPaths: [
      'src/lib/server/vector/qdrant-manager.ts',
      'src/lib/server/grpc/embedding-client.ts',
      'src/lib/server/embedding-cache-service.ts',
    ],
  },
  {
    query: 'qlora quality boost',
    relevantPaths: [
      'src/lib/server/retrieval/qlora-boost.ts',
      'src/lib/server/ace/ace-agent.ts',
    ],
  },
];

// ── Metrics ─────────────────────────────────────────────────────────────────

function computeMetrics(resultIds, relevantPaths, k = 10) {
  // Convert paths to normalized form for comparison
  const relevantSet = new Set(relevantPaths.map((p) => p.toLowerCase().replace(/\\/g, '/')));

  const topK = resultIds.slice(0, k);
  let dcg = 0;
  let mrrFound = false;
  let mrrValue = 0;
  let relevantInTopK = 0;

  for (let i = 0; i < topK.length; i++) {
    const id = String(topK[i]).toLowerCase().replace(/\\/g, '/');
    const isRelevant = relevantSet.has(id) ||
      [...relevantSet].some((p) => id.includes(p) || p.includes(id.split('/').slice(-1)[0]));

    if (isRelevant) {
      dcg += 1 / Math.log2(i + 2);
      if (!mrrFound) { mrrValue = 1 / (i + 1); mrrFound = true; }
      relevantInTopK++;
    }
  }

  // Ideal DCG: all relevant docs in top positions
  let idealDcg = 0;
  const idealCount = Math.min(relevantSet.size, k);
  for (let i = 0; i < idealCount; i++) idealDcg += 1 / Math.log2(i + 2);

  return {
    dcg: Math.round(dcg * 1000) / 1000,
    ndcg: idealDcg > 0 ? Math.round((dcg / idealDcg) * 1000) / 1000 : 0,
    mrr: Math.round(mrrValue * 1000) / 1000,
    recall: relevantSet.size > 0 ? Math.round((relevantInTopK / relevantSet.size) * 1000) / 1000 : 0,
  };
}

// ── Retrieval lanes ──────────────────────────────────────────────────────────

async function bm25Search(pool, query, limit = 20) {
  try {
    const res = await pool.query(
      `SELECT packet_id AS id,
              ts_rank_cd(
                to_tsvector('english', regexp_replace(
                  coalesce(source_ref,'') || ' ' ||
                  coalesce(packet_key,'') || ' ' ||
                  coalesce(summary,''), '[/\\.\\-]', ' ', 'g')),
                websearch_to_tsquery('english', $1)) AS score,
              source_ref
       FROM atlas_packets
       WHERE to_tsvector('english', regexp_replace(
               coalesce(source_ref,'') || ' ' ||
               coalesce(packet_key,'') || ' ' ||
               coalesce(summary,''), '[/\\.\\-]', ' ', 'g'))
             @@ websearch_to_tsquery('english', $1)
       ORDER BY score DESC
       LIMIT $2`,
      [query, limit]
    );
    return res.rows.map((r) => ({ id: r.source_ref || r.id, score: parseFloat(r.score) || 0.5 }));
  } catch (err) { console.error('BM25 error:', err.message); return []; }
}

// Gate: cap=8, require community_confidence >= 0.65, require feature_id OR community_id alignment.
// queryCtx = { featureId, communityId } derived from top Qdrant hit.
async function conceptOverlapSearch(pool, concepts, queryCtx = {}, limit = 8) {
  if (!concepts.length) return [];
  const { featureId = null, communityId = null } = queryCtx;
  try {
    const conditions = [];
    let paramIndex = 4;
    const params = [concepts, concepts.length, limit];

    if (featureId) {
      conditions.push(`feature_id = $${paramIndex++}`);
      params.push(featureId);
    }
    if (communityId !== null) {
      conditions.push(`community_id = $${paramIndex++}::int`);
      params.push(communityId);
    }

    const alignFilter = conditions.length > 0
      ? `AND (${conditions.join(' OR ')})`
      : '';

    const sql = `
      SELECT packet_id AS id,
             source_ref,
             (SELECT COUNT(*) FROM unnest(concept_ids) c WHERE c = ANY($1::text[])) AS overlap,
             (array_length(concept_ids, 1) + $2 -
              (SELECT COUNT(*) FROM unnest(concept_ids) c WHERE c = ANY($1::text[]))) AS union_size
      FROM atlas_packets
      WHERE concept_ids && $1::text[]
        AND COALESCE(community_confidence, 0) >= 0.65
        ${alignFilter}
      ORDER BY overlap DESC
      LIMIT $3`;

    const res = await pool.query(sql, params);
    return res.rows.map((r) => ({
      id: r.source_ref || r.id,
      score: r.union_size > 0 ? Number(r.overlap) / Number(r.union_size) : 0,
    }));
  } catch (err) { console.error('Concept error:', err.message); return []; }
}

async function qdrantSearch(query, embedding, limit = 20) {
  if (!embedding) return [];
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: { name: 'content', vector: embedding },
        limit,
        with_payload: ['file_path', 'sourceRef'],
        with_vector: false,
        score_threshold: 0.3,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    return (data.result ?? []).map((h) => ({
      id: h.payload?.file_path || h.payload?.sourceRef || String(h.id),
      score: h.score,
    }));
  } catch { return []; }
}

async function getEmbedding(query) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json();
    return data.embedding ?? null;
  } catch { return null; }
}

// Maps query terms to the concept_ids taxonomy used in atlas_packets
const CONCEPT_KEYWORD_MAP = [
  { concept: 'database_orm',             keywords: ['drizzle', 'postgres', 'schema', 'table', 'migration', 'query', 'sql', 'db', 'database', 'orm', 'insert', 'select', 'update', 'delete', 'column', 'index'] },
  { concept: 'api_endpoints',            keywords: ['api', 'route', 'endpoint', 'server', 'request', 'response', 'http', 'rest', 'handler', 'params', 'json', 'fetch', 'post', 'get', 'put', 'patch', 'delete'] },
  { concept: 'ui_components',            keywords: ['component', 'svelte', 'ui', 'button', 'modal', 'form', 'input', 'layout', 'page', 'render', 'style', 'css', 'class', 'slot', 'snippet', 'props'] },
  { concept: 'agent_intelligence',       keywords: ['agent', 'llm', 'gemma', 'ollama', 'chat', 'prompt', 'ai', 'inference', 'completion', 'token', 'embedding', 'rag', 'retrieval', 'context', 'ace'] },
  { concept: 'observability_telemetry',  keywords: ['log', 'trace', 'metric', 'monitor', 'analytics', 'event', 'track', 'telemetry', 'observ', 'langfuse', 'report', 'audit'] },
  { concept: 'infrastructure_config',    keywords: ['docker', 'redis', 'config', 'env', 'deploy', 'rabbitmq', 'queue', 'worker', 'health', 'startup', 'port', 'container', 'service'] },
  { concept: 'test_harness',             keywords: ['test', 'spec', 'vitest', 'playwright', 'e2e', 'unit', 'mock', 'fixture', 'assert', 'expect', 'check'] },
  { concept: 'native_accelerators',      keywords: ['gpu', 'cuda', 'napi', 'wasm', 'onnx', 'libtorch', 'tensor', 'native', 'cpp', 'binding', 'simd', 'webgpu'] },
  { concept: 'emergent_topology',        keywords: ['graph', 'neo4j', 'topology', 'pagerank', 'cluster', 'community', 'som', 'hypergraph', 'edge', 'node', 'vector'] },
  { concept: 'general_abstractions',     keywords: ['util', 'helper', 'lib', 'type', 'interface', 'class', 'function', 'module', 'export', 'import', 'store', 'state'] },
];

function extractConcepts(query) {
  const lower = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = new Set(lower.split(/\s+/).filter(w => w.length > 2));
  const matched = [];
  for (const { concept, keywords } of CONCEPT_KEYWORD_MAP) {
    if (keywords.some(kw => words.has(kw) || lower.includes(kw))) {
      matched.push(concept);
    }
  }
  return matched.slice(0, 4); // top 4 concepts max
}

// ── RRF combiner ─────────────────────────────────────────────────────────────

function combineRRF(lanes, weights, k = K) {
  const scores = new Map();

  for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
    const { hits, weight = 1.0 } = lanes[laneIdx];
    for (let rank = 0; rank < hits.length; rank++) {
      const id = hits[rank].id;
      const contribution = weight / (k + rank + 1);
      scores.set(id, (scores.get(id) || 0) + contribution);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}

// Apply community_confidence boost: packets with high-confidence SOM community
// assignment get a small multiplicative boost (max +10% for qdrant-sourced).
async function applyCommunityBoost(pool, combined) {
  if (!combined.length) return combined;
  const ids = combined.map(r => r.id);
  try {
    const res = await pool.query(
      `SELECT source_ref, community_confidence, community_source
       FROM atlas_packets
       WHERE source_ref = ANY($1::text[]) AND community_confidence IS NOT NULL`,
      [ids]
    );
    const confMap = new Map(res.rows.map(r => [r.source_ref, r.community_confidence ?? 0.25]));
    return combined.map(r => {
      const conf = confMap.get(r.id) ?? 0.25;
      // communityBoost = conf * 0.1 (max +10% for qdrant conf=1.0)
      return { ...r, score: r.score * (1 + conf * 0.1) };
    }).sort((a, b) => b.score - a.score);
  } catch { return combined; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  if (!JSON_MODE) {
    console.log('\n🧪 RRF Ablation Test — Phase 4A Baseline');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`  Queries: ${TEST_QUERIES.length} | DB: ${DATABASE_URL.replace(/:[^@]+@/, ':****@')}`);
    console.log(`  Qdrant: ${QDRANT_URL} | Ollama: ${OLLAMA_URL}\n`);
  }

  const allResults = [];

  try {
    // Verify atlas_packets is populated
    const countRes = await pool.query('SELECT COUNT(*) FROM atlas_packets');
    const totalPackets = parseInt(countRes.rows[0].count, 10);

    if (!JSON_MODE) console.log(`  atlas_packets: ${totalPackets} rows\n`);

    if (totalPackets === 0) {
      console.error('❌ atlas_packets is empty — run atlas:phase3i:ingest:qdrant first');
      process.exit(1);
    }

    const PRESETS = [
      { name: 'bm25_only',      bm25: 1.0,  concept: 0.0,  qdrant: 0.0  },
      { name: 'concept_only',   bm25: 0.0,  concept: 1.0,  qdrant: 0.0  },
      { name: 'qdrant_only',    bm25: 0.0,  concept: 0.0,  qdrant: 1.0  },
      { name: 'rrf_default',    bm25: 0.75, concept: 0.25, qdrant: 1.0  },
      { name: 'rrf_bm25_heavy', bm25: 1.5,  concept: 0.2,  qdrant: 0.8  },
      { name: 'rrf_vec_heavy',  bm25: 0.6,  concept: 0.2,  qdrant: 2.0  },
    ];

    for (const test of TEST_QUERIES) {
      if (!JSON_MODE) console.log(`  Query: "${test.query.slice(0, 60)}"`);

      const embedding = await getEmbedding(test.query);
      const concepts  = extractConcepts(test.query);

      // Run Qdrant first to get queryCtx (feature_id/community_id of top hit)
      const qdrantHits = await qdrantSearch(test.query, embedding, 25);

      // Derive query context from top Qdrant hit for concept alignment gate
      let queryCtx = {};
      if (qdrantHits.length > 0) {
        const topId = qdrantHits[0].id;
        try {
          const ctxRes = await pool.query(
            `SELECT feature_id, community_id FROM atlas_packets WHERE source_ref = $1 LIMIT 1`,
            [topId]
          );
          if (ctxRes.rows[0]) {
            queryCtx = {
              featureId:   ctxRes.rows[0].feature_id   ?? null,
              communityId: ctxRes.rows[0].community_id != null ? Number(ctxRes.rows[0].community_id) : null,
            };
          }
        } catch { /* ignore */ }
      }

      // BM25: top 15; Concept: capped at 8 with alignment gate
      const [bm25Hits, conceptHits] = await Promise.all([
        bm25Search(pool, test.query, 15),
        conceptOverlapSearch(pool, concepts, queryCtx, 8),
      ]);

      if (!JSON_MODE) {
        console.log(`    BM25: ${bm25Hits.length} | Concept: ${conceptHits.length} | Qdrant: ${qdrantHits.length} | Concepts: [${concepts.slice(0,3).join(',')}] ctx:{${queryCtx.featureId ?? '?'},${queryCtx.communityId ?? '?'}}`);
      }

      for (const preset of PRESETS) {
        let combined = combineRRF([
          { hits: bm25Hits, weight: preset.bm25 },
          { hits: conceptHits, weight: preset.concept },
          { hits: qdrantHits, weight: preset.qdrant },
        ]);
        combined = await applyCommunityBoost(pool, combined);

        const resultIds = combined.map((r) => r.id);
        const metrics = computeMetrics(resultIds, test.relevantPaths);

        const row = {
          query: test.query,
          preset: preset.name,
          metrics,
          resultCount: combined.length,
          topResult: combined[0]?.id || 'N/A',
          topScore: combined[0]?.score || 0,
        };

        allResults.push(row);

        if (!JSON_MODE) {
          console.log(
            `    ${preset.name.padEnd(15)} NDCG=${metrics.ndcg.toFixed(3)} MRR=${metrics.mrr.toFixed(3)} R@10=${metrics.recall.toFixed(3)} (${combined.length} results)`
          );
        }
      }

      if (!JSON_MODE) console.log('');
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    const summary = {};
    for (const preset of PRESETS) {
      const rows = allResults.filter((r) => r.preset === preset.name);
      const n = rows.length || 1;
      summary[preset.name] = {
        avgNdcg: Math.round(rows.reduce((s, r) => s + r.metrics.ndcg, 0) / n * 1000) / 1000,
        avgMrr:  Math.round(rows.reduce((s, r) => s + r.metrics.mrr, 0) / n * 1000) / 1000,
        avgRecall: Math.round(rows.reduce((s, r) => s + r.metrics.recall, 0) / n * 1000) / 1000,
      };
    }

    const rrfDefaultNdcg = summary['rrf_default']?.avgNdcg ?? 0;
    const bm25OnlyNdcg = summary['bm25_only']?.avgNdcg ?? 0;
    const qdrantOnlyNdcg = summary['qdrant_only']?.avgNdcg ?? 0;
    const rrfWinsBm25 = rrfDefaultNdcg >= bm25OnlyNdcg;
    const rrfWinsQdrant = rrfDefaultNdcg >= qdrantOnlyNdcg;

    const output = {
      timestamp: new Date().toISOString(),
      totalPackets,
      queries: TEST_QUERIES.length,
      summary,
      gate: {
        ndcg_threshold: 0.30,
        rrf_default_ndcg: rrfDefaultNdcg,
        passes: rrfDefaultNdcg >= 0.30,
        rrf_beats_bm25: rrfWinsBm25,
        rrf_beats_qdrant: rrfWinsQdrant,
      },
    };

    if (JSON_MODE) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('  ── Summary (avg across queries) ──────────────────────────');
      for (const [preset, s] of Object.entries(summary)) {
        const marker = preset === 'rrf_default' ? ' ◀' : '';
        console.log(`  ${preset.padEnd(18)} NDCG=${s.avgNdcg.toFixed(3)} MRR=${s.avgMrr.toFixed(3)} R@10=${s.avgRecall.toFixed(3)}${marker}`);
      }

      console.log('');
      const passIcon = output.gate.passes ? '✅' : '⚠️ ';
      console.log(`  ${passIcon} NDCG@10 gate: rrf_default=${rrfDefaultNdcg.toFixed(3)} (threshold ≥ 0.30)`);
      console.log(`  rrf_default beats bm25_only:   ${rrfWinsBm25 ? '✅' : '❌'} (${rrfDefaultNdcg.toFixed(3)} vs ${bm25OnlyNdcg.toFixed(3)})`);
      console.log(`  rrf_default beats qdrant_only: ${rrfWinsQdrant ? '✅' : '❌'} (${rrfDefaultNdcg.toFixed(3)} vs ${qdrantOnlyNdcg.toFixed(3)})`);

      if (!output.gate.passes) {
        console.log('\n  ⚠️  Gate not passed. Low NDCG means test queries do not match indexed content.');
        console.log('     Run: node scripts/atlas/ingest-qdrant-to-atlas-packets.mjs --limit=10000');
        console.log('     to expand atlas_packets coverage beyond 2009 rows.');
      }

      console.log('');
    }

    if (SAVE_BASELINE) {
      const path = 'docs/reports/rrf-ablation-baseline.json';
      writeFileSync(path, JSON.stringify(output, null, 2));
      console.log(`  📁 Baseline saved to ${path}`);
    }

    process.exit(output.gate.passes ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Ablation test failed:', err.message);
  process.exit(1);
});
