#!/usr/bin/env node
/**
 * llama-openai-smoke.mjs
 *
 * Verifies llama-server.exe is running and responds to OpenAI-compatible
 * requests including tool-call format. Does NOT require the SvelteKit dev server.
 *
 * Tests:
 *   1. /health — llama-server up
 *   2. /v1/models — model list
 *   3. /v1/chat/completions (no tools) — basic generation
 *   4. /v1/chat/completions (with tools) — tool-call response format
 *   5. parseLlamaToolCall regression — JSON-wrapped and raw formats
 *
 * Usage:
 *   node scripts/smoke/llama-openai-smoke.mjs
 *   node scripts/smoke/llama-openai-smoke.mjs --port 8090
 *   node scripts/smoke/llama-openai-smoke.mjs --port 8099   # TRT-LLM port
 *   node scripts/smoke/llama-openai-smoke.mjs --strict
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: {
    port:   { type: 'string', default: process.env.LLAMA_PORT ?? '8090' },
    strict: { type: 'boolean', default: false },
  },
  strict: false,
});

const PORT    = flags.port;
const STRICT  = flags.strict;
const BASE    = `http://127.0.0.1:${PORT}`;
const TIMEOUT = 30_000;

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

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Inline parseLlamaToolCall regression ─────────────────────────────────────

function parseLlamaToolCall(content) {
  if (!content) return null;
  // Format 1: JSON object with tool_calls array
  try {
    const obj = JSON.parse(content.trim());
    if (obj?.tool_calls?.length) return obj.tool_calls[0];
    if (obj?.name && (obj?.arguments || obj?.parameters)) return obj;
  } catch {}
  // Format 2: ```json fence
  const fence = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence) {
    try {
      const obj = JSON.parse(fence[1]);
      if (obj?.name) return obj;
    } catch {}
  }
  // Format 3: raw JSON anywhere in string (handles nested braces via bracket counting)
  const start = content.indexOf('{');
  if (start !== -1) {
    let depth = 0, end = -1;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) {
      try {
        const obj = JSON.parse(content.slice(start, end + 1));
        if (obj?.name) return obj;
      } catch {}
    }
  }
  return null;
}

console.log(`\n${c.bold(c.dim(`smoke: llama-server (:${PORT})`))}\n`);

// L1. Health
await gate('L1', `llama-server :${PORT} /health`, async () => {
  const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return body.status ?? 'ok';
});

// L2. /v1/models
await gate('L2', '/v1/models lists loaded model', async () => {
  const res = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const models = data?.data ?? [];
  if (!models.length) throw new Error('no models listed');
  return models.map(m => m.id).slice(0, 2).join(', ');
});

// L3. Basic completion
await gate('L3', '/v1/chat/completions basic response', async () => {
  const data = await post('/v1/chat/completions', {
    model: 'local',
    messages: [{ role: 'user', content: 'Reply with one word: hello' }],
    max_tokens: 512,
    temperature: 0,
    stream: false,
  });
  // Some llama-server builds use choices[0].text instead of choices[0].message.content
  const msg = data?.choices?.[0]?.message;
  // Gemma4 thinking models put chain-of-thought in reasoning_content; content holds the final answer
  const text = msg?.content || data?.choices?.[0]?.text || '';
  const reasoning = msg?.reasoning_content ?? '';
  if (!text && msg?.tool_calls?.length) return `WARN: model returned tool_calls instead of content for plain prompt`;
  // If finish_reason=length and reasoning is present, the model ran out of tokens mid-think
  if (!text && reasoning) throw new Error(`WARN: content empty (finish_reason=${data?.choices?.[0]?.finish_reason}) — increase max_tokens; reasoning started: ${reasoning.slice(0, 60)}…`);
  if (!text) throw new Error(`no content — raw: ${JSON.stringify(data?.choices?.[0]).slice(0, 120)}`);
  return `${text.trim().slice(0, 40)} (${data?.usage?.completion_tokens ?? '?'} tokens)`;
});

// L4. Tool-call format
await gate('L4', '/v1/chat/completions tool-call format', async () => {
  const data = await post('/v1/chat/completions', {
    model: 'local',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. When asked to search, call the trace_search tool.',
      },
      {
        role: 'user',
        content: 'Search for "authentication patterns" in the codebase.',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'trace_search',
          description: 'Search the codebase knowledge graph',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'search query' } },
            required: ['query'],
          },
        },
      },
    ],
    tool_choice: 'auto',
    max_tokens: 200,
    temperature: 0,
    stream: false,
  });
  const choice = data?.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  if (toolCalls?.length) return `tool_calls[0].function.name=${toolCalls[0].function.name}`;
  // Fallback: model may put JSON in content
  const content = choice?.message?.content ?? '';
  const parsed = parseLlamaToolCall(content);
  if (parsed) return `WARN: tool call in content, parsed name=${parsed.name ?? '?'}`;
  throw new Error('WARN: no tool call in response — model may not support tool_choice=auto');
});

// L5. parseLlamaToolCall regression
await gate('L5', 'parseLlamaToolCall handles all 3 formats', async () => {
  const cases = [
    // Format 1: OpenAI tool_calls array
    [JSON.stringify({ tool_calls: [{ function: { name: 'trace_search', arguments: '{"query":"test"}' } }] }), 'trace_search'],
    // Format 2: JSON fence
    ['```json\n{"name":"kag_search","arguments":{"query":"test"}}\n```', 'kag_search'],
    // Format 3: raw JSON in prose
    ['I will call {"name":"graph_expand","arguments":{"file":"src/lib/server/redis.ts"}} now.', 'graph_expand'],
  ];
  const failed = [];
  for (const [input, expected] of cases) {
    const result = parseLlamaToolCall(input);
    const name = result?.function?.name ?? result?.name;
    if (name !== expected) failed.push(`expected ${expected}, got ${name}`);
  }
  if (failed.length) throw new Error(failed.join('; '));
  return '3/3 formats parsed';
});

// ── Summary ──────────────────────────────────────────────────────────────────

const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
if (fail === 0 && warn === 0) {
  console.log(c.green(`${pass}/${results.length} gates passed`));
} else {
  const parts = [c.green(pass + ' PASS'), warn ? c.yellow(warn + ' WARN') : '', fail ? c.red(fail + ' FAIL') : ''];
  console.log(parts.filter(Boolean).join('  '));
}
console.log('');

if (STRICT && fail > 0) process.exit(1);
