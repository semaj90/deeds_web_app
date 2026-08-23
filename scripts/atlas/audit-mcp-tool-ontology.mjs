#!/usr/bin/env node
/**
 * audit-mcp-tool-ontology.mjs
 *
 * Queries the TRACE MCP server for its full tools/list, then classifies each
 * tool by retrieval layer, identity fields it handles, and what stores it writes to.
 * Output: docs/reports/mcp-tool-ontology.json + mcp-tool-ontology.md
 *
 * Usage:
 *   node scripts/atlas/audit-mcp-tool-ontology.mjs
 *   node scripts/atlas/audit-mcp-tool-ontology.mjs --url http://127.0.0.1:8788
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'mcp-tool-ontology.json');
const OUT_MD   = path.join(REPORTS_DIR, 'mcp-tool-ontology.md');

const TRACE_MCP_URL = (process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788').replace(/\/$/, '');

// ── Layer classification heuristics ──────────────────────────────────────────

const LAYER_RULES = [
  { layer: 'cache',   patterns: ['redis', 'bifrost', 'hot_cache', 'exact_match', 'engram.redis'] },
  { layer: 'lexical', patterns: ['bm25', 'trgm', 'rg_search', 'rg_atlas', 'fts', 'full_text', 'kag.multi_lane'] },
  { layer: 'dense',   patterns: ['qdrant', 'ann', 'embed', 'vector', 'ace.compact', 'atlas.prefilter', 'codebase_chunks'] },
  { layer: 'graph',   patterns: ['neo4j', 'graph.', 'pagerank', 'betweenness', 'community', 'neighborhood', 'path'] },
  { layer: 'rerank',  patterns: ['rerank', 'turbovec', 'rrf', 'rank_chunks', 'trace_search_rerank'] },
  { layer: 'synthesis', patterns: ['synthesis', 'gemma', 'llm', 'summarize', 'generate', 'engram.ace_packet', 'kag.recall'] },
  { layer: 'identity', patterns: ['atlas.source_refs', 'atlas.packet_search', 'atlas:packet_search', 'kag.feature_lookup', 'atlas.query'] },
  { layer: 'memory',  patterns: ['engram.chat_memory', 'memory_recent', 'recall_similar', 'memory_store'] },
  { layer: 'ops',     patterns: ['ops.', 'propose_patch', 'record_fix', 'quality_gate', 'run_targeted'] },
  { layer: 'read',    patterns: ['file.read', 'db.table', 'db.schema', 'wiki.', 'atlas.get_chunk', 'atlas.explain'] },
];

const IDENTITY_FIELDS = ['feature_id', 'feature_label', 'source_ref', 'packet_key', 'identity_lane'];

const WRITE_STORES = {
  postgres: ['db.', 'atlas.coverage', 'ops.record', 'ops.propose', 'ops.run'],
  redis:    ['engram.redis', 'redis_health', 'bifrost'],
  qdrant:   ['evidence.link', 'evidence.enrich'],
  neo4j:    ['graph.community', 'graph.shortest', 'graph.expand'],
  kanban:   ['ops.propose_patch', 'ops.record_fix_attempt', 'kanban'],
  engram:   ['engram.ace_packet_inject', 'engram.chat_memory_store'],
};

function classifyTool(tool) {
  const name = tool.name ?? '';
  const desc = (tool.description ?? '').toLowerCase();
  const combined = `${name.toLowerCase()} ${desc}`;

  const layers = LAYER_RULES
    .filter(r => r.patterns.some(p => combined.includes(p.toLowerCase())))
    .map(r => r.layer);

  const identityFields = IDENTITY_FIELDS.filter(f => combined.includes(f));

  const writesTo = Object.entries(WRITE_STORES)
    .filter(([, patterns]) => patterns.some(p => combined.includes(p.toLowerCase())))
    .map(([store]) => store);

  // Derive namespace from name prefix (e.g. "graph.expand" → "graph")
  const namespace = name.includes('.') ? name.split('.')[0] :
                    name.includes(':') ? name.split(':')[0] : 'misc';

  const requiredPermissions = writesTo.length > 0 ? 'read_write' : 'read_only';

  return {
    tool_name: name,
    namespace,
    description: tool.description ?? '',
    retrieval_layer: layers.length > 0 ? layers : ['unknown'],
    identity_fields: identityFields,
    writes_to: writesTo,
    required_permissions: requiredPermissions,
    input_schema_keys: tool.inputSchema?.properties ? Object.keys(tool.inputSchema.properties) : [],
  };
}

// ── Fetch tools from TRACE MCP ────────────────────────────────────────────────

async function fetchTools() {
  console.log(`Fetching tools from ${TRACE_MCP_URL}/mcp ...`);
  const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`MCP returned ${res.status}`);

  const text = await res.text();

  // Handle SSE vs plain JSON
  let tools = [];
  if (text.startsWith('data:') || text.includes('\ndata:')) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      try {
        const d = JSON.parse(payload);
        if (d?.result?.tools) { tools = d.result.tools; break; }
      } catch { /* skip */ }
    }
  } else {
    const d = JSON.parse(text);
    tools = d?.result?.tools ?? [];
  }

  return tools;
}

// ── Build routing table by layer ──────────────────────────────────────────────

function buildRoutingTable(classified) {
  const table = {};
  for (const t of classified) {
    for (const layer of t.retrieval_layer) {
      if (!table[layer]) table[layer] = [];
      table[layer].push(t.tool_name);
    }
  }
  return table;
}

// ── Markdown report ───────────────────────────────────────────────────────────

function buildMarkdown(classified, routingTable, meta) {
  const lines = [
    `# MCP Tool Ontology`,
    ``,
    `**Generated**: ${new Date().toISOString()}  `,
    `**Source**: ${TRACE_MCP_URL}/mcp  `,
    `**Total tools**: ${meta.total}  `,
    ``,
    `## Retrieval Layer Routing Table`,
    ``,
    `This is the canonical routing table for OpenCode. Use the layer that matches the query shape.`,
    ``,
  ];

  const layerOrder = ['identity', 'memory', 'cache', 'lexical', 'dense', 'graph', 'rerank', 'synthesis', 'ops', 'read', 'unknown'];
  for (const layer of layerOrder) {
    const tools = routingTable[layer];
    if (!tools?.length) continue;
    lines.push(`### ${layer.toUpperCase()}`);
    lines.push(``);
    for (const t of tools) lines.push(`- \`${t}\``);
    lines.push(``);
  }

  lines.push(`## Full Tool Inventory`);
  lines.push(``);
  lines.push(`| Tool | Namespace | Layer(s) | Identity Fields | Writes To | Permissions |`);
  lines.push(`|------|-----------|----------|-----------------|-----------|-------------|`);

  for (const t of classified) {
    lines.push(
      `| \`${t.tool_name}\` | ${t.namespace} | ${t.retrieval_layer.join(', ')} | ${t.identity_fields.join(', ') || '—'} | ${t.writes_to.join(', ') || '—'} | ${t.required_permissions} |`
    );
  }

  lines.push(``);
  lines.push(`## Agent Decision Matrix`);
  lines.push(``);
  lines.push(`Use this matrix to route a query to the right tools without asking Gemma4 to decide.`);
  lines.push(``);
  lines.push(`| Query Shape | Start With | Then |`);
  lines.push(`|-------------|-----------|------|`);
  lines.push(`| "what is X?" | \`atlas.source_refs\`, \`kag.feature_lookup\` | \`atlas.packet_search\` |`);
  lines.push(`| "fix X" | L1 rg + \`atlas.packet_search\` | \`engram.chat_memory_recent\`, \`turbovec.rank_chunks\` |`);
  lines.push(`| "find files related to X" | \`kag.multi_lane_search\` | \`ace.compact_search\`, \`graph.expand_neighborhood\` |`);
  lines.push(`| "have we done X before?" | \`engram.chat_memory_recent\` | \`kag.recall_similar_fix\` |`);
  lines.push(`| "who depends on X?" | \`graph.expand_neighborhood\` | \`graph.community_for_node\`, \`graph.pagerank_top\` |`);
  lines.push(`| "summarize X" | \`atlas.packet_search\` | \`atlas.get_chunk\`, then Gemma4 |`);
  lines.push(`| "patch X" | Full pipeline (\`/parent-atlas-patch\`) | — |`);
  lines.push(``);

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const tools = await fetchTools();
  console.log(`  Fetched ${tools.length} tools`);

  const classified = tools.map(classifyTool);
  const routingTable = buildRoutingTable(classified);

  const namespaces = [...new Set(classified.map(t => t.namespace))].sort();
  const layerCounts = {};
  for (const t of classified) {
    for (const l of t.retrieval_layer) {
      layerCounts[l] = (layerCounts[l] ?? 0) + 1;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    source_url: `${TRACE_MCP_URL}/mcp`,
    total_tools: tools.length,
    namespaces,
    layer_counts: layerCounts,
    routing_table: routingTable,
    tools: classified,
  };

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2));
  await fs.writeFile(OUT_MD, buildMarkdown(classified, routingTable, { total: tools.length }));

  console.log(`\n  Namespaces: ${namespaces.join(', ')}`);
  console.log(`  Layer distribution:`);
  for (const [layer, count] of Object.entries(layerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${layer.padEnd(12)} ${count}`);
  }
  console.log(`\n  Written: ${OUT_JSON}`);
  console.log(`  Written: ${OUT_MD}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
