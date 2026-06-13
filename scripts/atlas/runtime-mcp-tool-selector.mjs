#!/usr/bin/env node
/**
 * runtime-mcp-tool-selector.mjs
 *
 * Selects the top-K MCP tools for a given query by:
 *   1. Embedding the query via Ollama (nomic-embed-text → embeddinggemma fallback)
 *   2. Searching codebase_chunks_768 filtered to source_kind='tool_manifest'
 *   3. Boosting by ontology overlap with detected query domain
 *   4. Returning tool names + llama_names ready for tools[] forwarding
 *
 * Also usable as a library:
 *   import { selectToolsForQuery } from './runtime-mcp-tool-selector.mjs';
 *
 * CLI smoke test:
 *   node scripts/atlas/runtime-mcp-tool-selector.mjs "find the top pagerank files"
 *   node scripts/atlas/runtime-mcp-tool-selector.mjs "search codebase for embedding errors" --top=12
 *   node scripts/atlas/runtime-mcp-tool-selector.mjs --audit
 */

import { fileURLToPath } from 'node:url';
import { dirname, join }  from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const _ollamaRaw = (process.env.OLLAMA_HOST ?? '127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw.includes(':') ? _ollamaRaw : `${_ollamaRaw}:11434`}`;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const DEFAULT_TOP_K = 12;

// Query domain → ontology signals for boost scoring
const DOMAIN_SIGNALS = {
  search:    ['retrieval', 'semantic_search', 'rag'],
  graph:     ['graph', 'neo4j', 'topology'],
  code:      ['code_intel', 'ast', 'symbol'],
  embed:     ['embedding', 'vector', 'inference'],
  legal:     ['legal', 'evidence', 'case_management'],
  cache:     ['cache', 'redis', 'inspection'],
  agent:     ['agent', 'planning', 'reasoning'],
  rank:      ['reranking', 'ranking', 'retrieval'],
  memory:    ['memory', 'prior_answer', 'cache'],
  knowledge: ['knowledge_base', 'wiki', 'notecard'],
  atlas:     ['atlas', 'feature_lookup', 'atlas_indexing'],
  trace:     ['kag', 'trace_memory', 'retrieval'],
  cluster:   ['clustering', 'som', 'topology'],
  repair:    ['repair', 'inference', 'sequence'],
  mcp:       ['mcp_tools', 'agent', 'planning'],
};

/** Detect which ontology signals are relevant to a query string */
function detectSignals(query) {
  const q = query.toLowerCase();
  const active = new Set();
  for (const [domain, tags] of Object.entries(DOMAIN_SIGNALS)) {
    if (q.includes(domain) || tags.some(t => q.includes(t.replace('_', ' ')))) {
      tags.forEach(t => active.add(t));
    }
  }
  // Always include retrieval as a baseline signal
  active.add('retrieval');
  return [...active];
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embed(text) {
  for (const model of ['nomic-embed-text:latest', 'embeddinggemma:latest']) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text.slice(0, 1024) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (Array.isArray(d.embedding) && d.embedding.length === 768) return d.embedding;
    } catch { /* try next */ }
  }
  return null;
}

// ── Qdrant search ─────────────────────────────────────────────────────────────

async function qdrantSearch(vector, { topK = DEFAULT_TOP_K, ontologyFilter = [] } = {}) {
  // Filter to tool_manifest packets only
  const filter = {
    must: [
      { key: 'packet_kind', match: { value: 'tool_manifest' } },
    ],
  };

  // Optional ontology boost via nested should (min_count form — Qdrant 1.8+ syntax)
  // Falls back to must-only if ontologyFilter is empty
  if (ontologyFilter.length > 0) {
    filter.should = ontologyFilter.map(tag => ({
      nested: {
        key: 'ontology',
        filter: { must: [{ match: { value: tag } }] },
      },
    }));
  }

  const body = {
    vector: { name: 'content', vector },
    limit: topK * 2, // oversample, then re-rank by ontology overlap below
    with_payload: true,
    filter,
  };

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
    const d = await res.json();
    return d.result ?? [];
  } catch (e) {
    return [];
  }
}

// ── Re-rank with ontology overlap boost ──────────────────────────────────────

function rerank(hits, querySignals, topK) {
  const signalSet = new Set(querySignals);
  return hits
    .map(h => {
      const ontology = h.payload?.ontology ?? [];
      const overlap  = ontology.filter(t => signalSet.has(t)).length;
      const boost    = overlap * 0.05; // each ontology match adds 0.05 to score
      return { ...h, reranked_score: h.score + boost, ontology_overlap: overlap };
    })
    .sort((a, b) => b.reranked_score - a.reranked_score)
    .slice(0, topK);
}

// ── LLAMA_TO_MCP_NAME — the canonical bidirectional map ──────────────────────
// Matches sveltekit-frontend/src/lib/server/ai/llama-tool-definitions.ts exactly.

const LLAMA_TO_MCP = {
  search__dev_context:         'search.dev_context',
  codebase__rg_search:         'codebase.rg_search',
  graph__expand_neighborhood:  'graph.expand_neighborhood',
  graph__shortest_path:        'graph.shortest_path',
  graph__community_for_node:   'graph.community_for_node',
  graph__pagerank_top:         'graph.pagerank_top',
  topology__search_near:       'topology.search_near',
  topology__same_som_cluster:  'topology.same_som_cluster',
  clusters__get_members:       'clusters.get_members',
  clusters__get_summary_lenses:'clusters.get_summary_lenses',
  trace__kag_search:           'trace.kag_search',
  trace__explain_retrieval:    'trace.explain_retrieval',
  context__get_compressed_card:'context.get_compressed_card',
  context__build_kv_packet:    'context.build_kv_packet',
  topology__search_4d:         'topology.search_4d',
  search__go_hybrid:           'search.go_hybrid',
  kb__search_cards:            'kb.search_cards',
  kb__get_card:                'kb.get_card',
  kb__expand_neighbors:        'kb.expand_neighbors',
  kb__explain_retrieval:       'kb.explain_retrieval',
};
const MCP_TO_LLAMA = Object.fromEntries(
  Object.entries(LLAMA_TO_MCP).map(([k, v]) => [v, k])
);

// ── Main export: selectToolsForQuery ─────────────────────────────────────────

/**
 * Select the top-K MCP tools relevant to a query.
 *
 * Returns:
 *   {
 *     mcp_names:   string[]   — dot-separated MCP tool names
 *     llama_names: string[]   — __ -separated llama-server tool names
 *     hits:        object[]   — raw Qdrant hits with reranked scores
 *     signals:     string[]   — detected ontology signals
 *     embed_ok:    boolean    — whether embedding succeeded
 *   }
 */
export async function selectToolsForQuery(query, { topK = DEFAULT_TOP_K } = {}) {
  const signals = detectSignals(query);
  const vector  = await embed(query);

  if (!vector) {
    // Fallback: return default read-only tool set
    const fallback = ['search.dev_context', 'codebase.rg_search', 'trace.kag_search',
                      'graph.expand_neighborhood', 'kb.search_cards'];
    return {
      mcp_names:   fallback.slice(0, topK),
      llama_names: fallback.slice(0, topK).map(n => MCP_TO_LLAMA[n] ?? n.replace(/\./g, '__')),
      hits:        [],
      signals,
      embed_ok:    false,
    };
  }

  const raw    = await qdrantSearch(vector, { topK });
  const ranked = rerank(raw, signals, topK);

  // Extract tool names from payloads
  const seen       = new Set();
  const mcp_names  = [];
  const llama_names = [];

  for (const hit of ranked) {
    const toolName = hit.payload?.tool_name;
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);

    // Resolve llama name — prefer manifest packet's llama_name field
    const llamaName = hit.payload?.llama_name
      ?? MCP_TO_LLAMA[toolName]
      ?? toolName.replace(/\./g, '__');

    mcp_names.push(toolName);
    llama_names.push(llamaName);
  }

  return { mcp_names, llama_names, hits: ranked, signals, embed_ok: true };
}

// ── Audit mode ────────────────────────────────────────────────────────────────

async function runAudit() {
  console.log('\n═══ MCP Tool Selection Audit ═══\n');

  // Coverage: are all 20 known LLAMA tools in Qdrant as manifest packets?
  const allLlamaNames = Object.keys(LLAMA_TO_MCP);
  const allMcpNames   = Object.values(LLAMA_TO_MCP);

  console.log(`Known LLAMA_TO_MCP mappings: ${allLlamaNames.length}`);

  // Check Qdrant for each tool by searching its manifest packet
  let qdrantFound = 0;
  for (const mcpName of allMcpNames) {
    try {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: { must: [{ key: 'tool_name', match: { value: mcpName } }] },
          limit: 1,
          with_payload: false,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      const d = await res.json();
      if (d.result?.points?.length > 0) qdrantFound++;
    } catch { /* skip */ }
  }

  console.log(`Tools found in Qdrant manifest: ${qdrantFound}/${allMcpNames.length}`);

  // Total tool manifest packets in Qdrant
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { must: [{ key: 'packet_kind', match: { value: 'tool_manifest' } }] } }),
      signal: AbortSignal.timeout(5_000),
    });
    const d = await res.json();
    console.log(`Total tool_manifest packets in Qdrant: ${d.result?.count ?? 'unknown'}`);
  } catch { /* skip */ }

  // Smoke test 5 representative queries
  const testQueries = [
    'find the top pagerank files in the codebase',
    'search codebase for embedding timeout errors',
    'inspect the parent atlas packet contract report',
    'trace KAG search over legal evidence',
    'expand graph neighborhood from database module',
  ];

  console.log('\nQuery selection smoke (top-5 per query):');
  const results = [];
  for (const q of testQueries) {
    const sel = await selectToolsForQuery(q, { topK: 5 });
    console.log(`  "${q.slice(0, 50)}"`);
    console.log(`    embed_ok: ${sel.embed_ok}  signals: ${sel.signals.slice(0, 3).join(', ')}`);
    console.log(`    tools: ${sel.mcp_names.join(', ')}`);
    results.push({ query: q, ...sel, hits: sel.hits.map(h => ({ tool: h.payload?.tool_name, score: h.reranked_score?.toFixed(3) })) });
  }

  // Gate summary
  const gates = [
    { name: 'qdrant_manifest_coverage', pass: qdrantFound >= 16, detail: `${qdrantFound}/${allMcpNames.length}` },
    { name: 'embed_working',           pass: results.every(r => r.embed_ok), detail: 'nomic-embed-text or embeddinggemma' },
    { name: 'tool_selection_returns_results', pass: results.every(r => r.mcp_names.length > 0), detail: `all 5 test queries returned tools` },
  ];

  console.log('\n══ Gate Results ═══════════════════════════');
  for (const g of gates) {
    console.log(`  ${g.pass ? '✅' : '❌'} ${g.name.padEnd(36)} ${g.detail}`);
  }
  console.log(`\n  ${gates.every(g => g.pass) ? '✅ AUDIT PASS' : '⚠️  AUDIT FAIL'}`);

  // Write report
  mkdirSync(join(ROOT, 'docs/reports'), { recursive: true });
  writeFileSync(
    join(ROOT, 'docs/reports/mcp-tool-selection-audit.json'),
    JSON.stringify({ generated: new Date().toISOString(), qdrantFound, gates, results }, null, 2)
  );
  console.log('\nReport: docs/reports/mcp-tool-selection-audit.json');
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('runtime-mcp-tool-selector.mjs');
if (isMain) {
  const args    = process.argv.slice(2);
  const isAudit = args.includes('--audit');
  const topKArg = args.find(a => a.startsWith('--top='));
  const topK    = topKArg ? parseInt(topKArg.split('=')[1], 10) : DEFAULT_TOP_K;
  const query   = args.filter(a => !a.startsWith('--')).join(' ');

  if (isAudit) {
    runAudit().catch(e => { console.error(e); process.exit(1); });
  } else if (query) {
    console.log(`\nQuery: "${query}"\n`);
    selectToolsForQuery(query, { topK }).then(sel => {
      console.log(`embed_ok:  ${sel.embed_ok}`);
      console.log(`signals:   ${sel.signals.join(', ')}`);
      console.log(`top ${sel.mcp_names.length} tools selected:`);
      for (let i = 0; i < sel.mcp_names.length; i++) {
        const h = sel.hits[i];
        console.log(`  ${i+1}. ${sel.mcp_names[i].padEnd(36)} score=${h?.reranked_score?.toFixed(3) ?? 'n/a'}`);
      }
    }).catch(e => { console.error(e); process.exit(1); });
  } else {
    console.log('Usage:');
    console.log('  node scripts/atlas/runtime-mcp-tool-selector.mjs "find pagerank files"');
    console.log('  node scripts/atlas/runtime-mcp-tool-selector.mjs "query" --top=8');
    console.log('  node scripts/atlas/runtime-mcp-tool-selector.mjs --audit');
  }
}
