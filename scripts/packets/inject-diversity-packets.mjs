#!/usr/bin/env node
/**
 * inject-diversity-packets
 *
 * Inserts synthetic route_runtime_packets from non-chat routes to improve
 * training diversity. These represent plausible ACE executions that would
 * occur if ACE was instrumented across all API routes.
 *
 * Routes covered:
 *   /api/cases/:id            → feature: legal-cases
 *   /api/evidence/search      → feature: evidence-pipeline
 *   /api/rag/search           → feature: rag-retrieval
 *   /api/statutes/search      → feature: legal-statutes
 *   /api/codebase-index/search → feature: codebase-intelligence
 *
 * Usage:
 *   node scripts/packets/inject-diversity-packets.mjs [--dry-run]
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DRY_RUN = process.argv.includes('--dry-run');

for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

// Synthetic diversity templates — one per target route/feature combination
const SYNTHETIC_PACKETS = [
  // --- /api/cases (legal case management) ---
  {
    route: '/api/cases',
    feature_id: 'legal-cases',
    feature_ids: ['legal-cases', 'drizzle-schema'],
    som_cluster: 'cluster:dir:routes-api-cases',
    source_refs: [
      'sveltekit-frontend/src/routes/api/cases/+server.ts',
      'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
      'sveltekit-frontend/src/routes/(app)/cases/+page.svelte',
      'sveltekit-frontend/src/lib/server/db/client.ts',
    ],
    qdrant_hits: 12,
    redis_hot_keys: ['ace:cases:list:page1'],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 342,
    reward: 0.8,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/routes/api/cases/+server.ts', score: 0.91, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts', score: 0.87, lane: 'qdrant' },
    ],
    db_tables: ['cases', 'case_notes', 'evidence'],
    tool_calls: ['db.select', 'db.insert'],
    query_hash: 'cases_list_' + Date.now().toString(16).slice(-8),
    query_preview: 'List all open cases for current user with evidence count',
  },
  {
    route: '/api/cases/[id]',
    feature_id: 'legal-cases',
    feature_ids: ['legal-cases', 'evidence-pipeline'],
    som_cluster: 'cluster:dir:routes-api-cases',
    source_refs: [
      'sveltekit-frontend/src/routes/api/cases/[id]/+server.ts',
      'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
      'sveltekit-frontend/src/lib/server/analysis/entity-extraction.ts',
    ],
    qdrant_hits: 9,
    redis_hot_keys: ['ace:case:detail:uuid123'],
    cache_hit: true,
    cache_tier: 'redis',
    latency_ms: 89,
    reward: 0.9,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/routes/api/cases/[id]/+server.ts', score: 0.94, lane: 'qdrant' },
    ],
    db_tables: ['cases', 'evidence', 'citations'],
    tool_calls: ['db.select'],
    query_hash: 'case_detail_' + Date.now().toString(16).slice(-8),
    query_preview: 'Fetch case detail with all linked evidence and citations',
  },

  // --- /api/evidence (evidence pipeline) ---
  {
    route: '/api/evidence/search',
    feature_id: 'evidence-pipeline',
    feature_ids: ['evidence-pipeline', 'qdrant-vector-search'],
    som_cluster: 'cluster:dir:routes-api-evidence',
    source_refs: [
      'sveltekit-frontend/src/routes/api/evidence/search/+server.ts',
      'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
      'sveltekit-frontend/src/lib/server/indexer/legal-chunker.ts',
      'sveltekit-frontend/src/lib/server/grpc/embedding-client.ts',
    ],
    qdrant_hits: 18,
    redis_hot_keys: [],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 1240,
    reward: 0.7,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts', score: 0.89, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/indexer/legal-chunker.ts', score: 0.82, lane: 'qdrant' },
    ],
    db_tables: ['evidence', 'evidence_vectors', 'evidence_relationships'],
    tool_calls: ['qdrant.search', 'db.select', 'embed.query'],
    query_hash: 'evidence_search_' + Date.now().toString(16).slice(-8),
    query_preview: 'Semantic search across uploaded evidence for contract clauses',
  },
  {
    route: '/api/evidence/upload',
    feature_id: 'evidence-pipeline',
    feature_ids: ['evidence-pipeline', 'seaweedfs-storage'],
    som_cluster: 'cluster:dir:routes-api-evidence',
    source_refs: [
      'sveltekit-frontend/src/routes/api/evidence/upload/+server.ts',
      'sveltekit-frontend/src/lib/server/storage/minio-client.ts',
      'sveltekit-frontend/src/lib/server/analysis/forensics.ts',
      'sveltekit-frontend/src/lib/server/queue/rabbitmq-manager-fixed.ts',
    ],
    qdrant_hits: 5,
    redis_hot_keys: ['evidence:upload:session'],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 3400,
    reward: 0.7,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/lib/server/storage/minio-client.ts', score: 0.85, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/analysis/forensics.ts', score: 0.79, lane: 'kag' },
    ],
    db_tables: ['evidence', 'evidence_vectors'],
    tool_calls: ['seaweedfs.upload', 'rabbitmq.publish', 'db.insert'],
    query_hash: 'evidence_upload_' + Date.now().toString(16).slice(-8),
    query_preview: 'Upload PDF evidence file with OCR and entity extraction pipeline',
  },

  // --- /api/rag (retrieval-augmented generation) ---
  {
    route: '/api/rag/search',
    feature_id: 'rag-retrieval',
    feature_ids: ['rag-retrieval', 'qdrant-vector-search', 'legal-cases'],
    som_cluster: 'cluster:dir:routes-api-rag',
    source_refs: [
      'sveltekit-frontend/src/routes/api/rag/search/+server.ts',
      'sveltekit-frontend/src/lib/server/rag-pipeline.ts',
      'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
      'sveltekit-frontend/src/lib/server/cache.ts',
    ],
    qdrant_hits: 22,
    redis_hot_keys: ['rag:cache:legal_query'],
    cache_hit: true,
    cache_tier: 'bifrost',
    latency_ms: 2800,
    reward: 0.8,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/lib/server/rag-pipeline.ts', score: 0.93, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts', score: 0.88, lane: 'qdrant' },
    ],
    db_tables: ['rag_sessions', 'rag_messages', 'evidence'],
    tool_calls: ['qdrant.search', 'ollama.generate', 'db.insert'],
    query_hash: 'rag_search_' + Date.now().toString(16).slice(-8),
    query_preview: 'RAG query: what constitutes breach of fiduciary duty under Delaware law',
  },
  {
    route: '/api/rag/answer',
    feature_id: 'rag-retrieval',
    feature_ids: ['rag-retrieval', 'legal-statutes'],
    som_cluster: 'cluster:dir:routes-api-rag',
    source_refs: [
      'sveltekit-frontend/src/routes/api/rag/answer/+server.ts',
      'sveltekit-frontend/src/lib/server/rag-pipeline.ts',
      'sveltekit-frontend/src/lib/server/indexer/legal-chunker.ts',
    ],
    qdrant_hits: 15,
    redis_hot_keys: [],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 18400,
    reward: 0.7,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/routes/api/rag/answer/+server.ts', score: 0.91, lane: 'qdrant' },
    ],
    db_tables: ['rag_sessions', 'rag_messages', 'legal_documents'],
    tool_calls: ['qdrant.search', 'ollama.generate'],
    query_hash: 'rag_answer_' + Date.now().toString(16).slice(-8),
    query_preview: 'Generate cited legal answer from RAG context about statute of limitations',
  },

  // --- /api/statutes (legal statute search) ---
  {
    route: '/api/statutes/search',
    feature_id: 'legal-statutes',
    feature_ids: ['legal-statutes', 'qdrant-vector-search'],
    som_cluster: 'cluster:dir:routes-api-statutes',
    source_refs: [
      'sveltekit-frontend/src/routes/api/statutes/search/+server.ts',
      'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
      'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
    ],
    qdrant_hits: 11,
    redis_hot_keys: ['statute:search:cache'],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 890,
    reward: 0.8,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/routes/api/statutes/search/+server.ts', score: 0.88, lane: 'qdrant' },
    ],
    db_tables: ['statutes', 'statute_chunks', 'citations'],
    tool_calls: ['db.select', 'qdrant.search'],
    query_hash: 'statute_search_' + Date.now().toString(16).slice(-8),
    query_preview: 'Search statutes matching "reasonable care" in tort law jurisdiction',
  },

  // --- /api/codebase-index (codebase intelligence) ---
  {
    route: '/api/codebase-index/search',
    feature_id: 'codebase-intelligence',
    feature_ids: ['codebase-intelligence', 'qdrant-vector-search'],
    som_cluster: 'cluster:dir:routes-api-codebase-index',
    source_refs: [
      'sveltekit-frontend/src/routes/api/codebase-index/search/+server.ts',
      'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
      'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
    ],
    qdrant_hits: 25,
    redis_hot_keys: ['ace:codebase:query:hash'],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 560,
    reward: 0.9,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts', score: 0.95, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts', score: 0.88, lane: 'qdrant' },
    ],
    db_tables: [],
    tool_calls: ['qdrant.search', 'libtorch.cosine_similarity'],
    query_hash: 'codebase_search_' + Date.now().toString(16).slice(-8),
    query_preview: 'Semantic search across codebase chunks for authentication middleware patterns',
  },
  {
    route: '/api/codebase-index/stats',
    feature_id: 'codebase-intelligence',
    feature_ids: ['codebase-intelligence'],
    som_cluster: 'cluster:dir:routes-api-codebase-index',
    source_refs: [
      'sveltekit-frontend/src/routes/api/codebase-index/stats/+server.ts',
      'sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts',
    ],
    qdrant_hits: 0,
    redis_hot_keys: ['codebase:stats:cache'],
    cache_hit: true,
    cache_tier: 'redis',
    latency_ms: 45,
    reward: 0.7,
    ranked_cards: [],
    db_tables: [],
    tool_calls: ['qdrant.collection_info'],
    query_hash: 'codebase_stats_' + Date.now().toString(16).slice(-8),
    query_preview: 'Codebase index statistics: collection count, vector dimensions',
  },

  // --- /api/citations (citation management) ---
  {
    route: '/api/citations',
    feature_id: 'legal-citations',
    feature_ids: ['legal-citations', 'legal-cases'],
    som_cluster: 'cluster:dir:routes-api-citations',
    source_refs: [
      'sveltekit-frontend/src/routes/api/citations/+server.ts',
      'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    ],
    qdrant_hits: 6,
    redis_hot_keys: [],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 220,
    reward: 0.7,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/routes/api/citations/+server.ts', score: 0.82, lane: 'qdrant' },
    ],
    db_tables: ['citations', 'legal_precedents', 'cases'],
    tool_calls: ['db.select', 'db.insert'],
    query_hash: 'citation_list_' + Date.now().toString(16).slice(-8),
    query_preview: 'List citations for case linked to statute 42 USC 1983',
  },

  // --- /api/graph/som-topology (graph intelligence) ---
  {
    route: '/api/graph/som-topology',
    feature_id: 'graph-intelligence',
    feature_ids: ['graph-intelligence', 'codebase-intelligence'],
    som_cluster: 'cluster:dir:routes-api-graph',
    source_refs: [
      'sveltekit-frontend/src/routes/api/graph/som-topology/+server.ts',
      'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts',
      'scripts/run-hypergraph.ts',
    ],
    qdrant_hits: 30,
    redis_hot_keys: ['hg:checkpoint:kmeans:k20:n2000'],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 4200,
    reward: 0.9,
    ranked_cards: [
      { ref: 'scripts/run-hypergraph.ts', score: 0.92, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts', score: 0.89, lane: 'qdrant' },
    ],
    db_tables: [],
    tool_calls: ['libtorch.kmeans', 'neo4j.merge', 'qdrant.upsert'],
    query_hash: 'som_topo_' + Date.now().toString(16).slice(-8),
    query_preview: 'Build SOM topology from 2000 codebase chunk vectors, k=20 clusters',
  },

  // --- /api/ai/agent (multi-agent tool loop) ---
  {
    route: '/api/ai/agent',
    feature_id: 'ai-agent',
    feature_ids: ['ai-agent', 'rag-retrieval', 'legal-cases'],
    som_cluster: 'cluster:dir:routes-api-ai',
    source_refs: [
      'sveltekit-frontend/src/routes/api/ai/agent/+server.ts',
      'sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts',
      'sveltekit-frontend/src/lib/server/rag-pipeline.ts',
    ],
    qdrant_hits: 14,
    redis_hot_keys: ['rate:agent:user123', 'ace:agent:session'],
    cache_hit: false,
    cache_tier: 'miss',
    latency_ms: 22000,
    reward: 0.8,
    ranked_cards: [
      { ref: 'sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts', score: 0.96, lane: 'qdrant' },
      { ref: 'sveltekit-frontend/src/lib/server/rag-pipeline.ts', score: 0.87, lane: 'qdrant' },
    ],
    db_tables: ['rag_sessions', 'context_timeline'],
    tool_calls: ['gemma4.generate', 'rag_search', 'case_search', 'memory_recall'],
    query_hash: 'agent_loop_' + Date.now().toString(16).slice(-8),
    query_preview: 'Agentic loop: analyze case documents, extract entities, cross-reference statutes',
  },
];

function computeSourceRefQuality(source_refs) {
  if (!source_refs.length) return 0;
  const good = source_refs.filter(r =>
    /^(src|scripts|drizzle|docs)\/.+\.(ts|js|mjs|svelte)$/.test(r) &&
    !r.includes('.venv') && !r.includes('unknown') &&
    !r.includes('node_modules') && !r.includes('backup-')
  ).length;
  return good / source_refs.length;
}

async function main() {
  console.log(`\n=== inject-diversity-packets${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);
  console.log(`  packets to inject: ${SYNTHETIC_PACKETS.length}`);

  if (DRY_RUN) {
    for (const p of SYNTHETIC_PACKETS) {
      console.log(`  [dry] ${p.route} → feature=${p.feature_id} reward=${p.reward}`);
    }
    console.log('\n  Pass without --dry-run to insert.\n');
    return;
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  let inserted = 0;
  for (const p of SYNTHETIC_PACKETS) {
    const packet_uuid = randomUUID();
    const srcQuality = computeSourceRefQuality(p.source_refs);
    const raw = JSON.stringify({
      packet_version: 1,
      feature_id: p.feature_id,
      feature_ids: p.feature_ids,
      som_cluster: p.som_cluster,
      source_refs: p.source_refs,
      lane_ids: [],
      route: p.route,
      route_id: p.query_hash,
      cache_tier: p.cache_tier,
      cache_hit: p.cache_hit,
      qdrant_hits: p.qdrant_hits,
      redis_hot_keys: p.redis_hot_keys,
      latency_ms: p.latency_ms,
      source_ref_quality: srcQuality,
      ranked_cards: p.ranked_cards,
      db_tables: p.db_tables,
      tool_calls: p.tool_calls,
      _synthetic: true,
    });

    await pool.query(
      `INSERT INTO route_runtime_packets
         (packet_uuid, route, query_hash, query_preview,
          source_refs, feature_ids, lane_ids, cluster_id, som_cluster,
          qdrant_hits, redis_hot_keys, cache_hit, cache_tier,
          user_id, session_id, latency_ms, raw,
          packet_version, source_ref_quality, reward)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,
               $10,$11::jsonb,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20)
       ON CONFLICT DO NOTHING`,
      [
        packet_uuid,
        p.route,
        p.query_hash,
        p.query_preview,
        JSON.stringify(p.source_refs),
        JSON.stringify(p.feature_ids),
        JSON.stringify([]),
        null,
        p.som_cluster,
        p.qdrant_hits,
        JSON.stringify(p.redis_hot_keys),
        p.cache_hit,
        p.cache_tier,
        null,
        null,
        p.latency_ms,
        raw,
        1,
        srcQuality,
        p.reward,
      ]
    );
    console.log(`  ✓ inserted ${p.route} [${p.feature_id}]`);
    inserted++;
  }

  await pool.end();
  console.log(`\n  ${inserted} packets inserted.\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
