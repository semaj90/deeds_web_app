#!/usr/bin/env node
/**
 * build-mcp-tool-registry-index.mjs
 *
 * Builds a ranked Parent Atlas markdown index from:
 *   - docs/reports/mcp-tool-ontology.json
 *   - docs/reports/mcp-tool-manifest-packets.json
 *
 * The report is intentionally read-only. It summarizes the live TRACE tool
 * surface and the static MCP / gRPC manifest surface into one navigable index.
 *
 * Optional Gemma4 summarization is used when the local gemma4-offload MCP is
 * available; otherwise the script falls back to deterministic section summaries.
 *
 * Outputs:
 *   docs/reports/mcp-tool-registry-index.json
 *   docs/reports/mcp-tool-registry-index.md
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORTS = path.join(ROOT, 'docs', 'reports');
const ONTOLOGY_JSON = path.join(REPORTS, 'mcp-tool-ontology.json');
const MANIFEST_JSON = path.join(REPORTS, 'mcp-tool-manifest-packets.json');
const OUT_JSON = path.join(REPORTS, 'mcp-tool-registry-index.json');
const OUT_MD = path.join(REPORTS, 'mcp-tool-registry-index.md');
const GEMMA_MCP = path.join(ROOT, 'sveltekit-frontend', 'scripts', 'mcp', 'gemma4-offload-mcp.mjs');

const LAYER_ORDER = ['identity', 'memory', 'cache', 'lexical', 'dense', 'graph', 'rerank', 'synthesis', 'ops', 'read', 'unknown'];
const LAYER_WEIGHTS = {
  identity: 100,
  memory: 95,
  cache: 92,
  graph: 90,
  rerank: 88,
  dense: 84,
  lexical: 80,
  synthesis: 76,
  read: 68,
  ops: 54,
  unknown: 40,
};

const trim = (s, n = 140) => {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeLayers(value) {
  if (Array.isArray(value) && value.length) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return ['unknown'];
}

function deriveLayers(tool) {
  const layers = new Set();
  const text = [
    tool.tool_name,
    tool.namespace,
    tool.description,
    tool.domain,
    ...(tool.ontology ?? []),
    ...(tool.examples ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const add = (layer, when) => { if (when) layers.add(layer); };
  add('identity', /source_ref|packet_key|feature_id|atlas\.(query|source_refs|packet_search)/.test(text));
  add('memory', /memory|engram|recall/.test(text));
  add('cache', /redis|bifrost|cache|ace\.compact|hot_hit|exact_match/.test(text));
  add('lexical', /bm25|fts|trgm|search|lookup|hybrid/.test(text));
  add('dense', /qdrant|embed|vector|ann|atlas\.prefilter/.test(text));
  add('graph', /neo4j|graph|pagerank|betweenness|community|neighborhood|path/.test(text));
  add('rerank', /rerank|rrf|turbovec|rank/.test(text));
  add('synthesis', /gemma|llm|summarize|generate|synthesis/.test(text));
  add('ops', /ops\.|propose_patch|record_fix|quality_gate|run_targeted/.test(text));
  add('read', /file\.read|db\.schema|db\.table|wiki\.|atlas\.get_chunk|atlas\.explain/.test(text));

  return [...layers.values()].length ? [...layers.values()] : normalizeLayers(tool.retrieval_layer);
}

function scoreTool(tool) {
  const layers = normalizeLayers(tool.layers ?? tool.retrieval_layer);
  let score = 0;
  for (const layer of layers) score += LAYER_WEIGHTS[layer] ?? 30;
  if ((tool.identity_fields?.length ?? 0) > 0) score += 8;
  if ((tool.writes_to?.length ?? 0) > 0) score -= 10;
  if ((tool.description ?? '').length > 50) score += 4;
  if ((tool.source?.includes('gemma4') ?? false) || /gemma/i.test(tool.description ?? '')) score += 2;
  return score;
}

function mergeTool(existing, incoming) {
  const merged = { ...existing, ...incoming };
  const layers = new Set([...(existing.layers ?? []), ...(incoming.layers ?? [])]);
  merged.layers = [...layers];
  merged.identity_fields = [...new Set([...(existing.identity_fields ?? []), ...(incoming.identity_fields ?? [])])];
  merged.writes_to = [...new Set([...(existing.writes_to ?? []), ...(incoming.writes_to ?? [])])];
  merged.examples = [...new Set([...(existing.examples ?? []), ...(incoming.examples ?? [])])].slice(0, 3);
  merged.sources = [...new Set([...(existing.sources ?? []), ...(incoming.sources ?? [])])];
  merged.score = scoreTool(merged);
  merged.primary_layer = (merged.layers ?? ['unknown'])[0] ?? 'unknown';
  return merged;
}

function mapOntologyTool(tool) {
  const layers = normalizeLayers(tool.retrieval_layer);
  return {
    tool_name: tool.tool_name,
    namespace: tool.namespace ?? tool.tool_name.split(/[.:]/)[0] ?? 'misc',
    description: tool.description ?? '',
    layers,
    identity_fields: tool.identity_fields ?? [],
    writes_to: tool.writes_to ?? [],
    permissions: tool.required_permissions ?? 'read_only',
    packet_kind: 'trace_tool',
    source: ['trace-mcp'],
    source_ref: tool.tool_name,
    examples: [],
  };
}

function mapManifestTool(tool) {
  const layers = deriveLayers(tool);
  return {
    tool_name: tool.tool_name,
    namespace: tool.tool_name.split(/[.:]/)[0] ?? 'misc',
    description: tool.description ?? '',
    layers,
    identity_fields: ['feature_id', 'source_ref', 'packet_key'].filter(field =>
      String(tool.description ?? '').toLowerCase().includes(field) || String(tool.tool_name ?? '').toLowerCase().includes(field),
    ),
    writes_to: tool.packet_kind === 'rpc_method'
      ? ['postgres']
      : [tool.transport === 'grpc' ? 'grpc' : 'postgres'],
    permissions: tool.packet_kind === 'rpc_method' ? 'read_write' : 'read_only',
    packet_kind: tool.packet_kind ?? 'tool_manifest',
    source: ['manifest-packets'],
    source_ref: tool.source_ref ?? tool.tool_name,
    examples: tool.examples ?? [],
    transport: tool.transport ?? null,
    domain: tool.domain ?? 'unknown',
    ontology: tool.ontology ?? [],
    service: tool.service ?? null,
    method: tool.method ?? null,
  };
}

function groupByLayer(tools) {
  const groups = Object.fromEntries(LAYER_ORDER.map(layer => [layer, []]));
  for (const tool of tools) {
    const primary = tool.primary_layer ?? tool.layers?.[0] ?? 'unknown';
    if (!groups[primary]) groups[primary] = [];
    groups[primary].push(tool);
  }
  for (const layer of Object.keys(groups)) {
    groups[layer].sort((a, b) => b.score - a.score || a.tool_name.localeCompare(b.tool_name));
  }
  return groups;
}

function buildEvidenceText(title, tools) {
  const rows = tools.map((t, i) => {
    const identity = t.identity_fields?.length ? `identity=${t.identity_fields.join(',')}` : 'identity=none';
    const writes = t.writes_to?.length ? `writes=${t.writes_to.join(',')}` : 'writes=none';
    return `${i + 1}. ${t.tool_name} | ${t.primary_layer} | ${identity} | ${writes} | ${trim(t.description, 180)}`;
  });
  return [`${title}`, ...rows].join('\n');
}

async function summarizeWithGemma(text, targetWords = 100) {
  if (!(await fs.stat(GEMMA_MCP).catch(() => null))) return null;
  return new Promise((resolve) => {
    const child = spawn('node', [GEMMA_MCP], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let done = false;
    let timer = null;

    const finish = (value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try { child.kill(); } catch { /* noop */ }
      resolve(value ?? null);
    };

    child.on('error', () => finish(null));
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      let idx;
      while ((idx = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, idx).trim();
        stdout = stdout.slice(idx + 1);
        if (!line) continue;
        let msg = null;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg?.id !== 2) continue;
        const raw = msg?.result?.content?.[0]?.text ?? '';
        const clean = String(raw).replace(/^\[[^\]]+\]\s*/, '').trim();
        finish(clean || null);
      }
    });

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'mcp-tool-registry-index', version: '0.1.0' },
      },
    }) + '\n');
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'gemma4_summarize',
        arguments: { text, target_words: targetWords },
      },
    }) + '\n');
    child.stdin.end();

    timer = setTimeout(() => finish(null), 12_000);
  });
}

function deterministicLayerSummary(layer, items) {
  const top = items.slice(0, 5).map(t => t.tool_name).join(', ');
  const identityCount = items.filter(t => (t.identity_fields?.length ?? 0) > 0).length;
  const writeCount = items.filter(t => (t.writes_to?.length ?? 0) > 0).length;
  return `Layer ${layer} contains ${items.length} tools. ${identityCount} expose identity fields and ${writeCount} write surfaces. Top-ranked tools: ${top || 'none'}.`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Parent Atlas MCP Tool Registry Index');
  lines.push('');
  lines.push(`**Generated**: ${report.generated_at}`);
  lines.push(`**Sources**: ${report.sources.join(' | ')}`);
  lines.push(`**Unique tools**: ${report.total_tools}`);
  lines.push(`**Trace tools**: ${report.trace_tools}`);
  lines.push(`**Manifest tools**: ${report.manifest_tools}`);
  lines.push(`**RPC methods**: ${report.rpc_methods}`);
  lines.push('');
  lines.push('## Index');
  for (const layer of LAYER_ORDER) {
    if (!report.by_layer[layer]?.length) continue;
    lines.push(`- [${layer.toUpperCase()}](#${layer}) (${report.by_layer[layer].length})`);
  }
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(report.overall_summary || 'Parent Atlas tool registry summary unavailable.');
  lines.push('');

  for (const layer of LAYER_ORDER) {
    const items = report.by_layer[layer];
    if (!items?.length) continue;
    lines.push(`## ${layer.toUpperCase()}`);
    lines.push('');
    const summary = report.layer_summaries[layer] || `This section contains ${items.length} tools.`;
    lines.push(summary);
    lines.push('');
    lines.push('| Rank | Tool | Source | Score | Identity | Writes To | Summary |');
    lines.push('|------|------|--------|-------|----------|-----------|---------|');
    for (const t of items) {
      lines.push(
        `| ${t.rank} | \`${t.tool_name}\` | ${t.sources.join(', ')} | ${t.score} | ${t.identity_fields.join(', ') || '—'} | ${t.writes_to.join(', ') || '—'} | ${trim(t.description, 120)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## All Tools Ranked');
  lines.push('');
  lines.push('| Rank | Tool | Primary Layer | Sources | Permissions | Score |');
  lines.push('|------|------|---------------|---------|-------------|-------|');
  for (const t of report.tools) {
    lines.push(
      `| ${t.rank} | \`${t.tool_name}\` | ${t.primary_layer} | ${t.sources.join(', ')} | ${t.permissions} | ${t.score} |`,
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- TRACE MCP remains the live read surface.');
  lines.push('- Manifest packets capture the broader MCP / gRPC registry surface.');
  lines.push('- `gemma4_summarize` is used for the section summaries when the local offload server is available; otherwise the report falls back to deterministic summaries.');
  lines.push('- This index is read-only and links into the Parent Atlas navigation surface.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const ontology = await readJson(ONTOLOGY_JSON);
  const manifest = await readJson(MANIFEST_JSON);

  if (!ontology) throw new Error(`Missing or unreadable report: ${ONTOLOGY_JSON}`);
  if (!manifest) throw new Error(`Missing or unreadable report: ${MANIFEST_JSON}`);

  const combined = new Map();
  const traceTools = (ontology.tools ?? []).map(mapOntologyTool);
  const manifestTools = (manifest.tools ?? []).map(mapManifestTool);

  for (const tool of [...traceTools, ...manifestTools]) {
    const key = tool.tool_name;
    const existing = combined.get(key);
    const normalized = {
      tool_name: tool.tool_name,
      namespace: tool.namespace,
      description: tool.description,
      layers: normalizeLayers(tool.layers),
      identity_fields: tool.identity_fields ?? [],
      writes_to: tool.writes_to ?? [],
      permissions: tool.permissions ?? 'read_only',
      packet_kind: tool.packet_kind ?? 'tool_manifest',
      sources: tool.source ?? ['unknown'],
      source_ref: tool.source_ref ?? tool.tool_name,
      examples: tool.examples ?? [],
      transport: tool.transport ?? null,
      domain: tool.domain ?? 'unknown',
      ontology: tool.ontology ?? [],
      service: tool.service ?? null,
      method: tool.method ?? null,
    };
    if (existing) combined.set(key, mergeTool(existing, normalized));
    else combined.set(key, { ...normalized, primary_layer: normalizeLayers(tool.layers)[0] ?? 'unknown', score: scoreTool(normalized) });
  }

  const tools = [...combined.values()].sort((a, b) => b.score - a.score || a.tool_name.localeCompare(b.tool_name));
  const ranked = tools.map((tool, idx) => ({ ...tool, rank: idx + 1 }));
  const byLayer = groupByLayer(ranked);

  const layerSummaries = {};
  for (const layer of LAYER_ORDER) {
    const items = byLayer[layer];
    if (!items?.length) continue;
    layerSummaries[layer] = deterministicLayerSummary(layer, items);
  }

  const overallEvidence = buildEvidenceText('Parent Atlas MCP tool registry overview', ranked.slice(0, 40));
  const overallSummary =
    (await summarizeWithGemma(overallEvidence, 120)) ||
    `Parent Atlas tool registry spans ${ranked.length} tools across ${Object.keys(byLayer).filter(k => byLayer[k]?.length).length} active layers. TRACE MCP covers the live surface; manifest packets cover the broader MCP / gRPC registry.`;

  const report = {
    generated_at: new Date().toISOString(),
    sources: [ONTOLOGY_JSON, MANIFEST_JSON],
    trace_tools: traceTools.length,
    manifest_tools: manifestTools.length,
    rpc_methods: manifest.rpc_methods_total ?? 0,
    total_tools: ranked.length,
    by_layer: byLayer,
    layer_summaries: layerSummaries,
    overall_summary: overallSummary,
    tools: ranked,
  };

  await fs.mkdir(REPORTS, { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2));
  await fs.writeFile(OUT_MD, buildMarkdown(report));

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
  console.log(`Tools: ${ranked.length} (TRACE ${traceTools.length}, manifest ${manifestTools.length})`);
}

main().catch(err => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
