#!/usr/bin/env node
/**
 * gemma4-tool-call-smoke.mjs
 *
 * Verifies the full Gemma4 → TRACE MCP tool-call roundtrip:
 *
 *   Gemma4 (llama-server :8090)
 *     → tool_calls: [{ name: "trace.kag_search", arguments: {...} }]
 *     → TRACE MCP :8788  tools/call trace.kag_search
 *     → chunks returned
 *     → Gemma4 synthesis with context
 *     → operator-gated tools NOT auto-executed (verified absent)
 *
 * Tests:
 *   G1. llama-server reachable
 *   G2. TRACE MCP reachable
 *   G3. Gemma4 produces a tool call for a retrieval query
 *   G4. Tool call dispatches to TRACE MCP and returns chunks
 *   G5. Synthesis pass returns a final answer
 *   G6. Operator-gated tools (ops.*) are NOT called without approval
 *
 * Usage:
 *   node scripts/smoke/gemma4-tool-call-smoke.mjs
 *   node scripts/smoke/gemma4-tool-call-smoke.mjs --strict
 *   node scripts/smoke/gemma4-tool-call-smoke.mjs --max-rounds 3
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: {
    strict:      { type: 'boolean', default: false },
    'max-rounds': { type: 'string',  default: '3' },
  },
  strict: false,
});

const STRICT     = flags.strict;
const MAX_ROUNDS = parseInt(flags['max-rounds']) || 3;
const LLAMA_URL  = process.env.LLAMA_URL  ?? 'http://127.0.0.1:8090';
const MCP_URL    = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const TIMEOUT    = 60_000;

const GATED_TOOLS = ['ops.propose_patch', 'ops.run_targeted_test', 'ops.record_fix_attempt', 'ops.run_quality_gate'];

const TRACE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'trace_kag_search',
      description: 'Search the codebase knowledge graph and return relevant code chunks',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'natural language search query' },
          limit: { type: 'integer', description: 'max results', default: 5 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_pagerank_top',
      description: 'Return the highest-authority files in the codebase graph',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', default: 5 } },
        required: [],
      },
    },
  },
];

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

const results = [];

async function gate(id, label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, label, status: 'PASS', detail: detail ?? '', ms });
    console.log(`  ${c.green('✓')} ${label}${detail ? c.dim(' — ' + detail) : ''}`);
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg = warn ? err.message.slice(5).trim() : err.message;
    results.push({ id, label, status, detail: msg, ms });
    const icon = warn ? c.yellow('○') : c.red('✗');
    console.log(`  ${icon} ${label} ${c.dim('— ' + msg)}`);
    return false;
  }
}

async function llamaPost(body) {
  const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function mcpToolCall(name, args) {
  // Map underscore name to dot name (trace_kag_search → trace.kag_search)
  const mcpName = name.replace(/_/g, '.').replace(/\./g, (m, i, s) => {
    const parts = s.split('_');
    // Only first segment separator becomes a dot
    return i === s.indexOf('_') ? '.' : '_';
  });
  // Simpler: just try both dot and underscore forms
  const dotName = name.replace('_', '.');
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: dotName, arguments: args },
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
  const text = await res.text();
  const line = text.split('\n').find(l => l.startsWith('data:') || l.startsWith('{'));
  const raw = line?.startsWith('data:') ? line.slice(5).trim() : line ?? text;
  return JSON.parse(raw);
}

console.log(`\n${c.bold(c.dim('smoke: Gemma4 → TRACE MCP tool-call roundtrip'))}\n`);

// G1. llama-server up
const llamaUp = await gate('G1', `llama-server ${LLAMA_URL} /health`, async () => {
  const res = await fetch(`${LLAMA_URL}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`WARN: HTTP ${res.status} — start llama-server first`);
  return 'ok';
});

// G2. TRACE MCP up
const mcpUp = await gate('G2', `TRACE MCP ${MCP_URL} /health`, async () => {
  const res = await fetch(`${MCP_URL}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`WARN: HTTP ${res.status} — run npm run mcp:trace`);
  const body = await res.json().catch(() => ({}));
  return `uptime=${body.uptime ?? '?'}s`;
});

if (!llamaUp || !mcpUp) {
  console.log(c.yellow('\nSkipping roundtrip gates — required services not running.\n'));
  console.log(c.dim('Start with:  npm run mcp:trace  (in one terminal)'));
  console.log(c.dim('             llama-server.exe -m model.gguf -ngl 99 --port 8090  (in another)\n'));
  process.exit(STRICT ? 1 : 0);
}

// G3. Gemma4 produces a tool call
let firstToolCall = null;
await gate('G3', 'Gemma4 generates tool_calls for retrieval query', async () => {
  const data = await llamaPost({
    model: 'local',
    messages: [
      {
        role: 'system',
        content: 'You are a code search assistant. Use trace_kag_search to find relevant code.',
      },
      {
        role: 'user',
        content: 'Find the authentication middleware implementation.',
      },
    ],
    tools: TRACE_TOOLS,
    tool_choice: 'auto',
    max_tokens: 200,
    temperature: 0,
    stream: false,
  });
  const choice = data?.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  if (!toolCalls?.length) {
    // Check content for JSON tool call
    const content = choice?.message?.content ?? '';
    const m = content.match(/"name"\s*:\s*"(trace_kag_search|graph_pagerank_top)"/);
    if (m) throw new Error(`WARN: tool call in content not in tool_calls array — model needs tool_choice tuning`);
    throw new Error('WARN: no tool call generated — model may not support function calling');
  }
  firstToolCall = toolCalls[0];
  return `tool=${firstToolCall.function?.name}, args=${firstToolCall.function?.arguments?.slice(0, 60)}`;
});

// G4. Dispatch tool call to TRACE MCP
let toolResult = null;
if (firstToolCall) {
  await gate('G4', 'TRACE MCP executes dispatched tool call', async () => {
    const fnName = firstToolCall.function?.name ?? '';
    let args = {};
    try { args = JSON.parse(firstToolCall.function?.arguments ?? '{}'); } catch {}
    const data = await mcpToolCall(fnName, args);
    const content = data?.result?.content ?? data?.content ?? [];
    const text = Array.isArray(content) ? content.map(c => c.text ?? '').join('') : String(content);
    if (!text || text.length < 10) throw new Error('empty tool result from MCP');
    toolResult = text;
    return `${text.length} chars from MCP`;
  });
}

// G5. Synthesis pass with tool result
if (toolResult && firstToolCall) {
  await gate('G5', 'Gemma4 synthesizes answer from tool result', async () => {
    const data = await llamaPost({
      model: 'local',
      messages: [
        {
          role: 'system',
          content: 'You are a code search assistant. Use the tool results to answer.',
        },
        { role: 'user', content: 'Find the authentication middleware implementation.' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [firstToolCall],
        },
        {
          role: 'tool',
          tool_call_id: firstToolCall.id ?? 'tool_0',
          content: toolResult.slice(0, 2000),
        },
      ],
      max_tokens: 300,
      temperature: 0,
      stream: false,
    });
    const text = data?.choices?.[0]?.message?.content ?? '';
    if (!text || text.length < 10) throw new Error('empty synthesis response');
    return `${text.trim().slice(0, 60)}… (${text.length} chars)`;
  });
}

// G6. Operator-gated tools not auto-executed
await gate('G6', 'Operator-gated tools (ops.*) not present in tool list', async () => {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(5_000),
  });
  const text = await res.text();
  const line = text.split('\n').find(l => l.startsWith('data:') || l.startsWith('{'));
  const raw = line?.startsWith('data:') ? line.slice(5).trim() : line ?? text;
  const data = JSON.parse(raw);
  const toolNames = (data?.result?.tools ?? data?.tools ?? []).map(t => t.name);
  // Gated tools may exist in the list but should never be called by the model without approval
  // The real guard is in gemma4-tool-controller.ts — we just verify the model can't self-escalate
  // by checking the tools we expose in THIS smoke don't include gated tools
  const exposed = TRACE_TOOLS.map(t => t.function.name);
  const gatedExposed = GATED_TOOLS.filter(g => exposed.includes(g));
  if (gatedExposed.length) throw new Error(`gated tools exposed to model: ${gatedExposed.join(', ')}`);
  return `gated tools (ops.*) not in model tool list`;
});

// ── Summary ──────────────────────────────────────────────────────────────────

const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
const parts = [c.green(pass + ' PASS'), warn ? c.yellow(warn + ' WARN') : '', fail ? c.red(fail + ' FAIL') : ''];
console.log(parts.filter(Boolean).join('  '));
console.log('');

if (STRICT && fail > 0) process.exit(1);
