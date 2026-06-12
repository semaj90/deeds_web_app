#!/usr/bin/env node
/**
 * rrf-20-query-benchmark.mjs
 *
 * 20-query expanded RRF benchmark — standalone, no SvelteKit imports.
 * All source_ref paths verified present in atlas_packets.
 *
 * 4 categories × 5 queries: Retrieval, Embedding, Graph, Schema/Cache
 * 4 weight presets tested per query
 *
 * Gate: rrf_default avgNDCG@10 ≥ 0.40
 *
 * Usage:
 *   node scripts/rrf-20-query-benchmark.mjs
 *   node scripts/rrf-20-query-benchmark.mjs --json
 *   node scripts/rrf-20-query-benchmark.mjs --save
 */

import pg from 'pg';
import { writeFileSync } from 'node:fs';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const _ollamaRaw = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;

const JSON_MODE = process.argv.includes('--json');
const SAVE = process.argv.includes('--save');
const K = 60;

// ── 20 queries — all source_refs verified in atlas_packets ──────────────────

const TEST_QUERIES = [
  // ── Category A: Retrieval & Ranking (5 queries) ──────────────────────────
  {
    category: 'Retrieval',
    query: 'reranker boosted cluster score',
    relevantPaths: [
      'src/lib/server/retrieval/boosted-reranker.ts',
      'src/lib/server/ai/graph-reranker.ts',
    ],
  },
  {
    category: 'Retrieval',
    query: 'multi lane retrieval ace context',
    relevantPaths: [
      'src/lib/server/ace/multi-lane-retrieval.ts',
      'src/lib/server/features/rag/retrieval-lanes.ts',
    ],
  },
  {
    category: 'Retrieval',
    query: 'qlora quality boost redis',
    relevantPaths: [
      'src/lib/server/retrieval/qlora-boost.ts',
    ],
  },
  {
    category: 'Retrieval',
    query: 'atlas context file retrieval path',
    relevantPaths: [
      'src/lib/server/atlas/context-for-file.ts',
    ],
  },
  {
    category: 'Retrieval',
    query: 'ace agent packetizer',
    relevantPaths: [
      'src/lib/server/ace/ace-agent.ts',
      'src/lib/server/ai/phase101-parent-atlas-packetizer.js',
    ],
  },

  // ── Category B: Embedding & Vector (5 queries) ───────────────────────────
  {
    category: 'Embedding',
    query: 'embedding grpc client ollama',
    relevantPaths: [
      'src/lib/server/grpc/embedding-client.ts',
      'src/lib/server/batch-embedder.ts',
    ],
  },
  {
    category: 'Embedding',
    query: 'client embed onnx vector',
    relevantPaths: [
      'src/lib/ai/client-embed.ts',
    ],
  },
  {
    category: 'Embedding',
    query: 'embedding cache service redis',
    relevantPaths: [
      'src/lib/server/embedding-cache-service.ts',
    ],
  },
  {
    category: 'Embedding',
    query: 'qdrant vector search collection',
    relevantPaths: [
      'src/lib/server/vector/qdrant-manager.ts',
      'src/lib/server/services/qdrant-client.ts',
    ],
  },
  {
    category: 'Embedding',
    query: 'batch embedder queue',
    relevantPaths: [
      'src/lib/server/batch-embedder.ts',
      'src/lib/server/embedding-cache-service.ts',
    ],
  },

  // ── Category C: Graph & Neo4j (5 queries) ────────────────────────────────
  {
    category: 'Graph',
    query: 'neo4j codebase sync nodes',
    relevantPaths: [
      'src/lib/server/graph/codebase-neo4j-sync.ts',
    ],
  },
  {
    category: 'Graph',
    query: 'graph reranker neo4j signal',
    relevantPaths: [
      'src/lib/server/ai/graph-reranker.ts',
      'src/lib/server/graph/codebase-neo4j-sync.ts',
    ],
  },
  {
    category: 'Graph',
    query: 'atlas packetizer parent graph',
    relevantPaths: [
      'src/lib/server/ai/phase101-parent-atlas-packetizer.js',
      'src/lib/server/atlas/context-for-file.ts',
    ],
  },
  {
    category: 'Graph',
    query: 'graph reranker cluster',
    relevantPaths: [
      'src/lib/server/ai/graph-reranker.ts',
    ],
  },
  {
    category: 'Graph',
    query: 'retrieval lanes graph signal boost',
    relevantPaths: [
      'src/lib/server/features/rag/retrieval-lanes.ts',
      'src/lib/server/retrieval/boosted-reranker.ts',
    ],
  },

  // ── Category D: Schema, Cache & Queue (5 queries) ────────────────────────
  {
    category: 'Schema/Cache',
    query: 'postgres schema evidence table',
    relevantPaths: [
      'src/lib/server/db/schema-postgres.ts',
      'src/lib/db/schema/evidence.ts',
    ],
  },
  {
    category: 'Schema/Cache',
    query: 'cache redis loki client',
    relevantPaths: [
      'src/lib/server/cache.ts',
      'src/lib/cache/cache-service.svelte.ts',
      'src/lib/ai/client-cache.ts',
    ],
  },
  {
    category: 'Schema/Cache',
    query: 'rabbitmq queue message channel',
    relevantPaths: [
      'src/lib/server/queue/rabbitmq-manager-fixed.ts',
    ],
  },
  {
    category: 'Schema/Cache',
    query: 'document uploader svelte progress',
    relevantPaths: [
      'src/lib/components/ai/EnhancedDocumentUploader.svelte',
    ],
  },
  {
    category: 'Schema/Cache',
    query: 'drizzle schema postgres table column',
    relevantPaths: [
      'src/lib/server/db/schema-postgres.ts',
      'src/lib/db/schema/evidence.ts',
    ],
  },
];

// ── Metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(resultIds, relevantPaths, k = 10) {
  const relevantSet = new Set(relevantPaths.map((p) => p.toLowerCase().replace(/\\/g, '/')));
  const topK = resultIds.slice(0, k);
  let dcg = 0, mrrValue = 0, mrrFound = false, relevantInTopK = 0;

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

  let idealDcg = 0;
  for (let i = 0; i < Math.min(relevantSet.size, k); i++) idealDcg += 1 / Math.log2(i + 2);

  return {
    dcg: Math.round(dcg * 1000) / 1000,
    ndcg: idealDcg > 0 ? Math.round((dcg / idealDcg) * 1000) / 1000 : 0,
    mrr: Math.round(mrrValue * 1000) / 1000,
    recall: relevantSet.size > 0 ? Math.round((relevantInTopK / relevantSet.size) * 1000) / 1000 : 0,
  };
}

// ── Retrieval lanes ───────────────────────────────────────────────────────────

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
       ORDER BY score DESC LIMIT $2`,
      [query, limit]
    );
    return res.rows.map((r) => ({ id: r.source_ref || r.id, score: parseFloat(r.score) || 0.5 }));
  } catch (err) { return []; }
}

// Gate: cap=8, community_confidence >= 0.65, feature_id OR community_id alignment
async function conceptOverlapSearch(pool, concepts, queryCtx = {}, limit = 8) {
  if (!concepts.length) return [];
  const { featureId = null, communityId = null } = queryCtx;
  try {
    const alignFilter = (featureId || communityId !== null)
      ? `AND (
           ${featureId           ? `feature_id = $4`         : 'FALSE'}
           ${featureId && communityId !== null ? 'OR' : ''}
           ${communityId !== null ? `community_id = $5::int`  : 'FALSE'}
         )`
      : '';
    const params = [concepts, concepts.length, limit];
    if (featureId)            params.push(featureId);
    if (communityId !== null) params.push(communityId);

    const res = await pool.query(`
      SELECT packet_id AS id,
             source_ref,
             (SELECT COUNT(*) FROM unnest(concept_ids) c WHERE c = ANY($1::text[])) AS overlap,
             (array_length(concept_ids, 1) + $2 -
              (SELECT COUNT(*) FROM unnest(concept_ids) c WHERE c = ANY($1::text[]))) AS union_size
      FROM atlas_packets
      WHERE concept_ids && $1::text[]
        AND COALESCE(community_confidence, 0) >= 0.65
        ${alignFilter}
      ORDER BY overlap DESC LIMIT $3`, params);
    return res.rows.map((r) => ({
      id: r.source_ref || r.id,
      score: r.union_size > 0 ? Number(r.overlap) / Number(r.union_size) : 0,
    }));
  } catch (err) { return []; }
}

async function qdrantSearch(embedding, limit = 20) {
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
    if (keywords.some(kw => words.has(kw) || lower.includes(kw))) matched.push(concept);
  }
  return matched.slice(0, 4);
}

function combineRRF(lanes, k = K) {
  const scores = new Map();
  for (const { hits, weight = 1.0 } of lanes) {
    for (let rank = 0; rank < hits.length; rank++) {
      const id = hits[rank].id;
      scores.set(id, (scores.get(id) || 0) + weight / (k + rank + 1));
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }));
}

async function applyCommunityBoost(pool, combined) {
  if (!combined.length) return combined;
  const ids = combined.map(r => r.id);
  try {
    const res = await pool.query(
      `SELECT source_ref, community_confidence
       FROM atlas_packets
       WHERE source_ref = ANY($1::text[]) AND community_confidence IS NOT NULL`,
      [ids]
    );
    const confMap = new Map(res.rows.map(r => [r.source_ref, r.community_confidence ?? 0.25]));
    return combined.map(r => {
      const conf = confMap.get(r.id) ?? 0.25;
      return { ...r, score: r.score * (1 + conf * 0.1) };
    }).sort((a, b) => b.score - a.score);
  } catch { return combined; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  if (!JSON_MODE) {
    console.log('\n📊 RRF 20-Query Benchmark — Phase 4A');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`  Queries: ${TEST_QUERIES.length} | DB: ${DATABASE_URL.replace(/:[^@]+@/, ':****@')}`);
  }

  const PRESETS = [
    { name: 'rrf_default',    bm25: 0.75, concept: 0.25, qdrant: 1.0 },
    { name: 'bm25_heavy',     bm25: 1.5,  concept: 0.2,  qdrant: 0.8 },
    { name: 'concept_heavy',  bm25: 0.8,  concept: 0.5,  qdrant: 0.8 },
    { name: 'vector_heavy',   bm25: 0.6,  concept: 0.2,  qdrant: 2.0 },
  ];

  const allRows = [];
  const categoryNdcg = {};

  try {
    const countRes = await pool.query('SELECT COUNT(*) FROM atlas_packets');
    const totalPackets = parseInt(countRes.rows[0].count, 10);
    if (!JSON_MODE) console.log(`  atlas_packets: ${totalPackets} rows\n`);

    for (const test of TEST_QUERIES) {
      const embedding = await getEmbedding(test.query);
      const concepts = extractConcepts(test.query);

      const qdrantHits = await qdrantSearch(embedding, 25);

      let queryCtx = {};
      if (qdrantHits.length > 0) {
        try {
          const ctxRes = await pool.query(
            `SELECT feature_id, community_id FROM atlas_packets WHERE source_ref = $1 LIMIT 1`,
            [qdrantHits[0].id]
          );
          if (ctxRes.rows[0]) {
            queryCtx = {
              featureId: ctxRes.rows[0].feature_id ?? null,
              communityId: ctxRes.rows[0].community_id ?? null,
            };
          }
        } catch { /* queryCtx stays empty */ }
      }

      const [bm25Hits, conceptHits] = await Promise.all([
        bm25Search(pool, test.query, 15),
        conceptOverlapSearch(pool, concepts, queryCtx, 8),
      ]);

      if (!JSON_MODE) {
        console.log(`  [${test.category}] "${test.query}"`);
        console.log(`    BM25:${bm25Hits.length} Concept:${conceptHits.length} Qdrant:${qdrantHits.length}`);
      }

      for (const preset of PRESETS) {
        let combined = combineRRF([
          { hits: bm25Hits,    weight: preset.bm25 },
          { hits: conceptHits, weight: preset.concept },
          { hits: qdrantHits,  weight: preset.qdrant },
        ]);
        combined = await applyCommunityBoost(pool, combined);
        const metrics = computeMetrics(combined.map((r) => r.id), test.relevantPaths);
        allRows.push({ query: test.query, category: test.category, preset: preset.name, metrics });

        if (!JSON_MODE && preset.name === 'rrf_default') {
          console.log(`    rrf_default → NDCG=${metrics.ndcg.toFixed(3)} MRR=${metrics.mrr.toFixed(3)} R@10=${metrics.recall.toFixed(3)}`);
        }
      }

      if (!JSON_MODE) console.log('');
    }

    // ── Per-preset averages ──
    const summary = {};
    for (const preset of PRESETS) {
      const rows = allRows.filter((r) => r.preset === preset.name);
      const n = rows.length || 1;
      summary[preset.name] = {
        avgNdcg:   Math.round(rows.reduce((s, r) => s + r.metrics.ndcg,   0) / n * 1000) / 1000,
        avgMrr:    Math.round(rows.reduce((s, r) => s + r.metrics.mrr,    0) / n * 1000) / 1000,
        avgRecall: Math.round(rows.reduce((s, r) => s + r.metrics.recall, 0) / n * 1000) / 1000,
      };
    }

    // ── Per-category breakdown (rrf_default only) ──
    const categories = [...new Set(TEST_QUERIES.map((q) => q.category))];
    const byCategory = {};
    for (const cat of categories) {
      const rows = allRows.filter((r) => r.category === cat && r.preset === 'rrf_default');
      const n = rows.length || 1;
      byCategory[cat] = {
        avgNdcg:   Math.round(rows.reduce((s, r) => s + r.metrics.ndcg,   0) / n * 1000) / 1000,
        avgMrr:    Math.round(rows.reduce((s, r) => s + r.metrics.mrr,    0) / n * 1000) / 1000,
        avgRecall: Math.round(rows.reduce((s, r) => s + r.metrics.recall, 0) / n * 1000) / 1000,
        queries: rows.length,
      };
    }

    const defaultNdcg = summary['rrf_default']?.avgNdcg ?? 0;
    const output = {
      timestamp: new Date().toISOString(),
      totalPackets,
      queries: TEST_QUERIES.length,
      summary,
      byCategory,
      gate: {
        ndcg_threshold: 0.40,
        rrf_default_ndcg: defaultNdcg,
        passes: defaultNdcg >= 0.40,
      },
    };

    if (JSON_MODE) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('  ── Preset averages (20 queries) ──────────────────────────');
      for (const [preset, s] of Object.entries(summary)) {
        const marker = preset === 'rrf_default' ? ' ◀' : '';
        console.log(`  ${preset.padEnd(16)} NDCG=${s.avgNdcg.toFixed(3)} MRR=${s.avgMrr.toFixed(3)} R@10=${s.avgRecall.toFixed(3)}${marker}`);
      }
      console.log('');
      console.log('  ── By category (rrf_default) ─────────────────────────────');
      for (const [cat, s] of Object.entries(byCategory)) {
        console.log(`  ${cat.padEnd(14)} NDCG=${s.avgNdcg.toFixed(3)} MRR=${s.avgMrr.toFixed(3)} R@10=${s.avgRecall.toFixed(3)} (${s.queries}q)`);
      }
      console.log('');
      const passIcon = output.gate.passes ? '✅' : '⚠️ ';
      console.log(`  ${passIcon} Gate: rrf_default avgNDCG@10=${defaultNdcg.toFixed(3)} (threshold ≥ 0.40)\n`);
    }

    if (SAVE) {
      const path = 'docs/reports/rrf-20-query-benchmark.json';
      writeFileSync(path, JSON.stringify(output, null, 2));
      if (!JSON_MODE) console.log(`  📁 Report saved to ${path}`);
    }

    process.exit(output.gate.passes ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Benchmark failed:', err.message);
  process.exit(1);
});
