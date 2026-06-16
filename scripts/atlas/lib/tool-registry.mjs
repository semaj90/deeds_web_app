#!/usr/bin/env node
/**
 * Shared Parent Atlas MCP tool registry helpers.
 *
 * Used by:
 *   - scripts/atlas/build-mcp-tool-registry-index.mjs
 *   - scripts/atlas/runtime-mcp-tool-selector.mjs
 *   - scripts/agentic/startup-briefing.mjs
 *
 * The helpers are intentionally read-only and file-backed. They let startup
 * and query-time routing use the ranked MCP registry without depending on live
 * Qdrant availability.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
export const REGISTRY_JSON = path.join(REPORTS_DIR, 'mcp-tool-registry-index.json');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'your', 'you', 'are', 'have', 'has', 'been',
  'tool', 'tools', 'query', 'search', 'find', 'what', 'how', 'why', 'when', 'where', 'which', 'show', 'list',
  'use', 'using', 'can', 'could', 'should', 'would', 'need', 'make', 'fix', 'build', 'run', 'new', 'more',
  'opencode', 'agent', 'assistant', 'cli',
]);

export const QUERY_HINTS = {
  ace: ['cache', 'memory', 'dense'],
  kag: ['lexical', 'dense', 'graph'],
  dag: ['graph', 'ops', 'read'],
  gemma4: ['synthesis', 'ops'],
  bitfrost: ['cache', 'memory'],
  redis: ['cache', 'memory'],
  turbovec: ['rerank', 'dense'],
  hyperrag: ['dense', 'lexical', 'graph', 'rerank', 'synthesis'],
  som: ['dense', 'graph'],
  qdrant: ['dense'],
  neo4j: ['graph'],
  opencode: ['ops', 'read', 'identity'],
  cuvs: ['dense', 'rerank'],
  cagra: ['dense', 'rerank'],
  cuda: ['dense', 'ops'],
  cublas: ['dense', 'ops'],
  cudnn: ['dense', 'ops'],
  pytorch: ['dense', 'synthesis', 'ops'],
  libtorch: ['dense', 'synthesis', 'ops'],
  webgpu: ['dense', 'ops'],
  autoencoder: ['dense', 'synthesis'],
};

export function tokenizeQuery(query) {
  return [...new Set(
    String(query ?? '')
      .toLowerCase()
      .replace(/[_/.:#-]+/g, ' ')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => token.length > 1 && !STOPWORDS.has(token)),
  )];
}

function normalizedText(tool) {
  return [
    tool.tool_name,
    tool.description,
    tool.primary_layer,
    tool.namespace,
    tool.domain,
    tool.source_ref,
    ...(tool.layers ?? []),
    ...(tool.ontology ?? []),
    ...(tool.examples ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreToolForQuery(tool, tokens, queryText = '') {
  const text = normalizedText(tool);
  let score = Number(tool.score ?? 0);

  for (const token of tokens) {
    if (text.includes(token)) score += 10;
  }

  const hints = Object.entries(QUERY_HINTS)
    .filter(([hint]) => queryText.includes(hint))
    .flatMap(([, layers]) => layers);

  if (hints.some(layer => (tool.layers ?? []).includes(layer) || tool.primary_layer === layer)) {
    score += 12;
  }

  if ((tool.identity_fields?.length ?? 0) > 0) score += 6;
  if ((tool.writes_to?.length ?? 0) > 0) score -= 4;
  if (/gemma|summary|synthesis/.test(text) && queryText.includes('gemma4')) score += 8;
  if (/turbovec|rerank|rrf/.test(text) && /ace|kag|dag|hyperrag|rank/.test(queryText)) score += 8;
  if (/redis|bifrost|cache/.test(text) && /ace|bitfrost|redis|cache|memory/.test(queryText)) score += 8;
  if (/neo4j|graph|path|community/.test(text) && /dag|graph|neo4j|topology|path/.test(queryText)) score += 8;

  return score;
}

export async function loadRegistry(root = REPO_ROOT) {
  const registryPath = path.join(root, 'docs', 'reports', 'mcp-tool-registry-index.json');
  try {
    const raw = await fs.readFile(registryPath, 'utf8');
    const registry = JSON.parse(raw);
    return { registry, registryPath };
  } catch {
    return { registry: null, registryPath };
  }
}

export function rankRegistryTools(query, tools = [], topK = 12) {
  const queryText = String(query ?? '').toLowerCase();
  const tokens = tokenizeQuery(queryText);
  const ranked = [...tools]
    .map(tool => ({
      ...tool,
      pickup_score: scoreToolForQuery(tool, tokens, queryText),
    }))
    .sort((a, b) => b.pickup_score - a.pickup_score || (b.score ?? 0) - (a.score ?? 0) || String(a.tool_name).localeCompare(String(b.tool_name)))
    .slice(0, topK);

  return ranked;
}

export function canonicalPickupQueries() {
  return [
    { name: 'ace', query: 'ace bitfrost redis semantic cache dense retrieval' },
    { name: 'kag', query: 'kag source refs feature lookup lexical search' },
    { name: 'dag', query: 'dag graph topology neighborhood path expansion' },
    { name: 'gemma4', query: 'gemma4 summarize synthesis agent output' },
    { name: 'opencode', query: 'opencode startup tool routing agent bootstrap' },
    { name: 'hyperrag', query: 'hyperrag dense search bm25 rrf turbovec qdrant neo4j' },
  ];
}

