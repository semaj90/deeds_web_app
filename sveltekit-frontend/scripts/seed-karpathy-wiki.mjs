#!/usr/bin/env node
/**
 * Seed test vault notes for Graphify, ACE, Gemma4, Tool Calling.
 *
 * Writes directly to CouchDB karpathy_wiki — same DB the karpathy-wiki.ts
 * module hits. Uses ENV.COUCHDB_URL (default admin:legal_ai_pass@localhost).
 * Idempotent — re-running updates the existing docs by _rev.
 */

const RAW_URL = process.env.COUCHDB_URL || 'http://admin:deeds123@localhost:5984';
const DB      = 'karpathy_wiki';

// Node fetch refuses URLs with embedded creds — split into base + Basic auth header.
const u = new URL(RAW_URL);
const AUTH = (u.username || u.password)
  ? `Basic ${Buffer.from(`${u.username}:${u.password}`).toString('base64')}`
  : null;
const COUCHDB_URL = `${u.protocol}//${u.host}`;
const HEADERS = AUTH ? { Authorization: AUTH } : {};

const NOTES = [
  {
    _id: 'cluster:gpu:graphify',
    type: 'cluster',
    clusterId: 999,
    clusterType: 'gpu',
    purpose: 'Codebase intelligence pipeline — AST scan + GPU clustering + Karpathy wiki',
    summary: 'Graphify scans the SvelteKit codebase, extracts file metadata (imports, fanIn, ssr-safety, sv4-legacy flags), runs GPU k-means + SOM clustering, and persists summaries to CouchDB karpathy_wiki + Qdrant codebase_chunks_768.',
    dominantTags: ['ast', 'gpu-clustering', 'codebase-intel', 'karpathy-wiki'],
    representativeFiles: ['scripts/graphify-batch-gpu-analysis.mjs', 'scripts/graphify-cluster-summaries.mjs', 'src/lib/server/indexer/karpathy-wiki.ts'],
    topologicalNeighbors: [],
    relatedErrors: [],
    patterns: ['MapReduce over file metadata', 'GPU centroid calc via tensorrt_bridge.node'],
    warnings: [],
    pageRankTop5: [
      { path: 'src/lib/server/indexer/karpathy-wiki.ts', score: 0.045 },
      { path: 'scripts/graphify-batch-gpu-analysis.mjs', score: 0.038 },
    ],
    generatedAt: new Date().toISOString(),
    version: 1,
  },
  {
    _id: 'cluster:gpu:ace',
    type: 'cluster',
    clusterId: 998,
    clusterType: 'gpu',
    purpose: 'ACE retrieval pipeline — context assembler + KAG + RAG + DAG',
    summary: 'ACE assembles Qdrant semantic + ACP cross-feed + Redis KAG + Redis fast-AST + SOM/hypergraph/PageRank into a single context bundle. Includes per-path llm_output cache via code-llm-index.',
    dominantTags: ['ace', 'kag', 'rag', 'context-assembler', 'code-llm-index'],
    representativeFiles: ['src/lib/server/ace/context-assembler.ts', 'src/lib/server/cache/code-llm-index.ts'],
    topologicalNeighbors: [],
    relatedErrors: [],
    patterns: ['priority order: Qdrant > ACP > KAG > fast-AST > SOM/PR', 'RerankBreakdown for RL feedback'],
    warnings: ['FAST_AST_SCORE_CAP = 0.07 — never raise without RL retraining'],
    pageRankTop5: [
      { path: 'src/lib/server/ace/context-assembler.ts', score: 0.082 },
      { path: 'src/lib/server/cache/code-llm-index.ts', score: 0.034 },
    ],
    generatedAt: new Date().toISOString(),
    version: 1,
  },
  {
    _id: 'cluster:gpu:gemma4',
    type: 'cluster',
    clusterId: 997,
    clusterType: 'gpu',
    purpose: 'Gemma4 inference cascade — TensorRT-LLM > Bifrost > TurboQuant > Ollama',
    summary: '8-tier inference fallback. TurboQuant (llama-server) hits 70-79 tok/s with cache_prompt + KV q8_0. Unified gemma4-rotorquant:latest serves text + vision in one process — no VRAM swap.',
    dominantTags: ['gemma4', 'turboquant', 'bifrost', 'inference-cascade', 'vlm'],
    representativeFiles: ['src/lib/server/ai/openai-facade.ts', 'src/lib/server/ollama.ts'],
    topologicalNeighbors: [],
    relatedErrors: [],
    patterns: ['cache_prompt:true', 'KV cache q8_0', 'Bifrost epsilon-greedy 500ms deadline'],
    warnings: ['8GB VRAM budget: TurboQuant 5.6GB + Embed 580MB + Tagger 200MB ≈ 6.4GB'],
    pageRankTop5: [],
    generatedAt: new Date().toISOString(),
    version: 1,
  },
  {
    _id: 'cluster:gpu:tool-calling',
    type: 'cluster',
    clusterId: 996,
    clusterType: 'gpu',
    purpose: 'MCP / FastMCP / ACP tool-calling agentic loop',
    summary: 'MCP server at src/mcp/server.ts hosts 29 tools. ACP execute route + tools registry. /api/v1/chat/completions is OpenAI-shaped facade; /api/ai/agent runs the multi-round tool loop with rag_search, case_search, memory_recall, hyperedge_stats.',
    dominantTags: ['mcp', 'fastmcp', 'acp', 'tool-calling', 'agent'],
    representativeFiles: ['src/mcp/server.ts', 'src/routes/api/ai/agent/+server.ts', 'src/lib/server/ai/gemma4-agent.ts'],
    topologicalNeighbors: [],
    relatedErrors: [],
    patterns: ['Max 5 rounds', 'Forced final answer', 'Rate limit 20/user/min'],
    warnings: [],
    pageRankTop5: [
      { path: 'src/mcp/server.ts', score: 0.067 },
      { path: 'src/lib/server/ai/gemma4-agent.ts', score: 0.029 },
    ],
    generatedAt: new Date().toISOString(),
    version: 1,
  },
];

async function couchPut(id, doc) {
  // Get existing rev (if any) for idempotent update
  const getRes = await fetch(`${COUCHDB_URL}/${DB}/${encodeURIComponent(id)}`, { headers: HEADERS }).catch(() => null);
  let rev = null;
  if (getRes && getRes.ok) {
    const existing = await getRes.json();
    rev = existing._rev;
  }
  const body = rev ? { ...doc, _rev: rev } : doc;
  const putRes = await fetch(`${COUCHDB_URL}/${DB}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error(`PUT ${id} failed: ${putRes.status} ${await putRes.text()}`);
  return await putRes.json();
}

async function main() {
  console.log(`Seeding ${NOTES.length} notes to ${DB}…`);
  for (const note of NOTES) {
    const res = await couchPut(note._id, note);
    console.log(`  ✓ ${note._id} rev=${res.rev.slice(0, 10)}`);
  }

  // Verify
  const all = await fetch(`${COUCHDB_URL}/${DB}/_all_docs`, { headers: HEADERS }).then(r => r.json());
  console.log(`\nVerified: ${all.total_rows} doc${all.total_rows === 1 ? '' : 's'} in ${DB}`);
  console.log('IDs:', all.rows.map(r => r.id).join(', '));
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
