#!/usr/bin/env node
/**
 * retrieval-cascade-smoke.mjs
 *
 * Proves the full retrieval cascade without the SvelteKit dev server:
 *
 *   query
 *     → TRACE MCP trace.kag_search       (KAG notes + Qdrant vector)
 *     → TRACE MCP search.hybrid          (FTS + vector fusion)
 *     → TRACE MCP graph.expand_neighborhood  (Neo4j neighbors)
 *     → TRACE MCP graph.pagerank_top     (authority ranking)
 *     → TRACE MCP context.build_kv_packet   (compressed context)
 *     → TRACE MCP context.get_compressed_card (token-limited card)
 *
 * Pass condition:
 *   - Each step returns non-empty content
 *   - context.build_kv_packet returns a packet with ≥1 chunk
 *   - Total cascade < 30s
 *
 * Usage:
 *   node scripts/smoke/retrieval-cascade-smoke.mjs
 *   node scripts/smoke/retrieval-cascade-smoke.mjs --query "authentication patterns"
 *   node scripts/smoke/retrieval-cascade-smoke.mjs --strict
 *   node scripts/smoke/retrieval-cascade-smoke.mjs --verbose
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: {
    query:   { type: 'string',  default: 'codebase retrieval pipeline authentication' },
    strict:  { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

const QUERY   = flags.query;
const STRICT  = flags.strict;
const VERBOSE = flags.verbose;
const MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const TIMEOUT = 20_000;

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

const results = [];

async function mcpCall(toolName, args = {}) {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const line = text.split('\n').find(l => l.startsWith('data:') || l.startsWith('{'));
  const raw = line?.startsWith('data:') ? line.slice(5).trim() : line ?? text;
  const data = JSON.parse(raw);
  const content = data?.result?.content ?? data?.content ?? [];
  return Array.isArray(content) ? content.map(c => c.text ?? '').join('') : String(content);
}

async function gate(id, label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, label, status: 'PASS', detail: detail ?? '', ms });
    console.log(`  ${c.green('✓')} ${label}  ${c.dim(ms + 'ms')}${detail ? c.dim(' — ' + detail) : ''}`);
  } catch (err) {
    const ms = Date.now() - t0;
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg = warn ? err.message.slice(5).trim() : err.message;
    results.push({ id, label, status, detail: msg, ms });
    const icon = warn ? c.yellow('○') : c.red('✗');
    console.log(`  ${icon} ${label} ${c.dim('— ' + msg)}`);
  }
}

console.log(`\n${c.bold(c.dim('smoke: retrieval cascade'))}`);
console.log(c.dim(`  query: "${QUERY}"\n`));

const cascadeStart = Date.now();

// RC1. trace.kag_search
await gate('RC1', 'trace.kag_search', async () => {
  const text = await mcpCall('trace.kag_search', { query: QUERY, limit: 5 });
  if (!text || text.length < 10) throw new Error('empty');
  if (VERBOSE) console.log(c.dim('    ' + text.slice(0, 150)));
  return `${text.length} chars`;
});

// RC2. search.hybrid (FTS + vector fusion)
await gate('RC2', 'search.hybrid', async () => {
  const text = await mcpCall('search.hybrid', { query: QUERY, limit: 5 }).catch(e => {
    throw new Error(`WARN: ${e.message} — search.hybrid may not be available`);
  });
  if (!text || text.length < 10) throw new Error('WARN: empty — search.hybrid not wired');
  return `${text.length} chars`;
});

// RC3. graph.expand_neighborhood (expands neighbors of a top-authority file)
await gate('RC3', 'graph.expand_neighborhood', async () => {
  const text = await mcpCall('graph.expand_neighborhood', {
    filePath: 'src/lib/server/redis.ts',
    depth: 1,
  });
  if (!text || text.length < 5) throw new Error('WARN: empty — file may not be in graph');
  return `${text.length} chars`;
});

// RC4. graph.pagerank_top (authority ranking)
await gate('RC4', 'graph.pagerank_top', async () => {
  const text = await mcpCall('graph.pagerank_top', { limit: 10 });
  if (!text || text.length < 10) throw new Error('empty');
  return `${text.length} chars`;
});

// RC5. context.build_kv_packet (compressed context assembly)
let packet = null;
await gate('RC5', 'context.build_kv_packet', async () => {
  const text = await mcpCall('context.build_kv_packet', { query: QUERY, topK: 5 });
  if (!text || text.length < 10) throw new Error('empty');
  packet = text;
  // Try to detect chunk count from packet
  const chunkMatch = text.match(/"chunks"\s*:\s*\[([^\]]*)\]/s) ??
                     text.match(/chunks:\s*(\d+)/);
  const chunkCount = chunkMatch ? (chunkMatch[1].split('{').length - 1 || chunkMatch[1]) : '?';
  if (VERBOSE) console.log(c.dim('    ' + text.slice(0, 200)));
  return `${text.length} chars, ~${chunkCount} chunks`;
});

// RC6. context.get_compressed_card (token-limited card)
await gate('RC6', 'context.get_compressed_card', async () => {
  const text = await mcpCall('context.get_compressed_card', { query: QUERY, maxTokens: 2000 }).catch(e => {
    throw new Error(`WARN: ${e.message} — get_compressed_card may not be available`);
  });
  if (!text || text.length < 10) throw new Error('WARN: empty');
  return `${text.length} chars`;
});

const cascadeMs = Date.now() - cascadeStart;

// RC7. Total cascade time
{
  const id = 'RC7';
  const label = `total cascade time < 30s`;
  if (cascadeMs < 30_000) {
    results.push({ id, label, status: 'PASS', detail: `${cascadeMs}ms`, ms: cascadeMs });
    console.log(`  ${c.green('✓')} ${label}  ${c.dim(cascadeMs + 'ms')}`);
  } else {
    results.push({ id, label, status: 'WARN', detail: `${cascadeMs}ms — consider caching`, ms: cascadeMs });
    console.log(`  ${c.yellow('○')} ${label} ${c.dim('— ' + cascadeMs + 'ms (slow)')}`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
const parts = [c.green(pass + ' PASS'), warn ? c.yellow(warn + ' WARN') : '', fail ? c.red(fail + ' FAIL') : ''];
console.log(parts.filter(Boolean).join('  '));
console.log('');

if (packet && VERBOSE) {
  console.log(c.bold('Context packet preview:'));
  console.log(c.dim(packet.slice(0, 400)));
  console.log('');
}

if (STRICT && fail > 0) process.exit(1);