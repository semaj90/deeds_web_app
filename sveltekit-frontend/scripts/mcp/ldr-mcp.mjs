#!/usr/bin/env node
/**
 * ldr-mcp.mjs — Local Deep Research MCP Server (stdio)
 *
 * Exposes 4 tools to OpenCode agents via the MCP stdio protocol:
 *   ldr.start_research   — start a new async LDR research task
 *   ldr.poll_status      — poll a running task by taskId
 *   ldr.search_history   — Redis-first cache lookup, then LDR /api/history
 *   ldr.quick_summary    — synchronous 5s one-shot summary
 *
 * Config (env vars, also read from sveltekit-frontend/.env):
 *   LDR_BASE_URL   default http://127.0.0.1:5000
 *   LDR_ENABLED    default true  (set to false to disable all tools)
 *
 * Usage (in opencode.json):
 *   "ldr-research": {
 *     "type": "local",
 *     "command": ["node", "scripts/mcp/ldr-mcp.mjs"],
 *     "enabled": true,
 *     "timeout": 120000
 *   }
 */

import { createInterface } from 'readline';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env from sveltekit-frontend ────────────────────────────────────────
const envPath = resolve(__dirname, '../../.env');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LDR_BASE = process.env.LDR_BASE_URL ?? 'http://127.0.0.1:5000';
const ENABLED  = process.env.LDR_ENABLED !== 'false';
const TIMEOUT  = 15_000;

// ── FNV-1a hash ───────────────────────────────────────────────────────────────
function fnv1a8(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function ldrFetch(path, init = {}) {
  return fetch(`${LDR_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
  });
}

// ── Tool implementations ───────────────────────────────────────────────────────

async function startResearch({ query, max_iterations = 3, search_engines = ['searxng', 'wikipedia'] }) {
  if (!ENABLED) return { error: 'LDR_ENABLED=false', taskId: null };
  try {
    const res = await ldrFetch('/api/research/start', {
      method: 'POST',
      body: JSON.stringify({ query, max_iterations, search_engines }),
    });
    if (!res.ok) return { error: `LDR returned ${res.status}`, taskId: null };
    const data = await res.json();
    const taskId = data.research_id ?? data.id ?? null;
    if (!taskId) return { error: 'No taskId in response', taskId: null };
    return {
      taskId,
      queryHash: fnv1a8(query),
      startedAt: new Date().toISOString(),
      status: 'started',
      pollUrl: `/api/research/status/${taskId}`,
      hint: `Call ldr.poll_status with taskId "${taskId}" to check progress`,
    };
  } catch (e) {
    return { error: e.message, taskId: null };
  }
}

async function pollStatus({ taskId }) {
  if (!ENABLED) return { error: 'LDR_ENABLED=false', status: 'disabled' };
  try {
    const res = await ldrFetch(`/api/research/status/${taskId}`);
    if (!res.ok) return { error: `LDR returned ${res.status}`, status: 'error', taskId };
    const data = await res.json();
    return {
      taskId,
      status: data.status ?? 'unknown',
      progress: data.progress ?? null,
      summary: data.summary ?? data.report ?? null,
      sources: Array.isArray(data.sources) ? data.sources.slice(0, 10) : [],
      sections: data.sections ?? null,
      durationMs: data.duration ?? null,
      error: data.error ?? null,
    };
  } catch (e) {
    return { error: e.message, status: 'error', taskId };
  }
}

async function searchHistory({ query, limit = 10 }) {
  if (!ENABLED) return { result: null, cached: false };
  const qHash = fnv1a8(query);

  // 1. Try LDR history API
  try {
    const res = await ldrFetch(`/api/history?limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      const ql = query.toLowerCase();
      const match = data.find(r =>
        r.status === 'completed' &&
        (r.query?.toLowerCase().includes(ql) || ql.includes(r.query?.toLowerCase() ?? ''))
      );
      if (match) {
        return {
          found: true,
          cached: false,
          queryHash: qHash,
          taskId: match.id ?? match.research_id ?? '',
          query: match.query ?? query,
          summary: match.summary ?? '',
          sources: Array.isArray(match.sources) ? match.sources.slice(0, 10) : [],
          completedAt: match.completed_at ?? null,
        };
      }
    }
  } catch { /* ignore */ }

  return { found: false, cached: false, queryHash: qHash, query };
}

async function quickSummary({ query, max_results = 5 }) {
  if (!ENABLED) return { summary: null, error: 'LDR_ENABLED=false' };
  try {
    const res = await ldrFetch('/api/research/quick-summary', {
      method: 'POST',
      body: JSON.stringify({ query, max_results }),
    });
    if (!res.ok) return { summary: null, error: `LDR returned ${res.status}` };
    const data = await res.json();
    return {
      query,
      summary: data.summary?.trim() ?? null,
      sources: Array.isArray(data.sources) ? data.sources.slice(0, 5) : [],
    };
  } catch (e) {
    return { summary: null, error: e.message };
  }
}

// ── Tool definitions (JSON Schema) ────────────────────────────────────────────
const TOOLS = [
  {
    name: 'ldr.start_research',
    description:
      'Start an async Local Deep Research task using Gemma4 + SearXNG + Wikipedia. Returns a taskId immediately — poll with ldr.poll_status. Best for comprehensive multi-source research that takes 30-120 seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 2000, description: 'Research question or topic' },
        max_iterations: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: 'Number of research iteration rounds' },
        search_engines: {
          type: 'array',
          items: { type: 'string' },
          default: ['searxng', 'wikipedia'],
          description: 'Search engines to use',
        },
      },
      required: ['query'],
    },
    handler: startResearch,
  },
  {
    name: 'ldr.poll_status',
    description:
      'Poll the status of a running LDR research task. Returns status (running/completed/failed), progress %, and the full result when completed.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, description: 'Task ID returned by ldr.start_research' },
      },
      required: ['taskId'],
    },
    handler: pollStatus,
  },
  {
    name: 'ldr.search_history',
    description:
      'Search past LDR research results by query text. Checks LDR /api/history for a matching completed task. Fast — no new research started.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 500, description: 'Query to find in research history' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['query'],
    },
    handler: searchHistory,
  },
  {
    name: 'ldr.quick_summary',
    description:
      'Synchronous quick-summary mode (~5-15s). Runs a single research round and returns a summary with sources. Use for fast background research when you need results immediately without polling.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 1000 },
        max_results: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
      },
      required: ['query'],
    },
    handler: quickSummary,
  },
];

// ── MCP stdio protocol ─────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ldr-mcp', version: '1.0.0' },
      },
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0', id,
      result: {
        tools: TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    const tool = TOOLS.find(t => t.name === toolName);

    if (!tool) {
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ error: `Tool not found: ${toolName}` }) }],
          isError: true,
        },
      });
      return;
    }

    try {
      const result = await tool.handler(args);
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      });
    } catch (e) {
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
          isError: true,
        },
      });
    }
    return;
  }

  // Unknown method
  send({
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

process.stderr.write(`[ldr-mcp] Started. LDR_BASE=${LDR_BASE} ENABLED=${ENABLED}\n`);
