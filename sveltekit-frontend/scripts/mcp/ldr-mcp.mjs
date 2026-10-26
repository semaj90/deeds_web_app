#!/usr/bin/env node
/**
 * ldr-mcp.mjs — Local Deep Research MCP Server (stdio)
 *
 * Exposes 5 tools to OpenCode agents via the MCP stdio protocol:
 *   ldr.start_research   — start a new async LDR research task
 *   ldr.poll_status      — poll a running task by taskId
 *   ldr.get_report       — read the final Markdown report and sources
 *   ldr.search_history   — authenticated LDR /api/history lookup
 *   ldr.quick_summary    — legacy compatibility tool; explicitly unsupported
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
import { createLdrSessionV1 } from './ldr-session-v1.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local first, then .env from sveltekit-frontend ────────────────
for (const envPath of [resolve(__dirname, '../../.env.ldr.local'), resolve(__dirname, '../../.env.local'), resolve(__dirname, '../../.env')]) {
  if (!existsSync(envPath)) continue;
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
const ldrFetch = createLdrSessionV1({ baseUrl: LDR_BASE });

// ── Tool implementations ───────────────────────────────────────────────────────

async function startResearch({ query, max_iterations = 3, search_engines = ['searxng'] }) {
  if (!ENABLED) return { error: 'LDR_ENABLED=false', taskId: null };
  try {
    if (!query || typeof query !== 'string' || query.length < 3 || query.length > 2000 || !Number.isInteger(max_iterations) || max_iterations < 1 || max_iterations > 10 || !Array.isArray(search_engines) || search_engines.length !== 1 || !/^[a-z0-9_-]{1,64}$/i.test(search_engines[0])) {
      return { error: 'INVALID_RESEARCH_INPUT: select exactly one supported search engine', taskId: null };
    }
    const auth = await ldrFetch('/auth/check');
    if (!auth.ok || (await auth.json()).authenticated !== true) return { error: 'LDR_AUTH_REQUIRED', taskId: null };
    const res = await ldrFetch('/api/start_research', {
      method: 'POST',
      body: JSON.stringify({ query, iterations: max_iterations, search_engine: search_engines[0], mode: 'detailed' }),
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
      pollUrl: `/api/research/${encodeURIComponent(taskId)}/status`,
      hint: `Call ldr.poll_status with taskId "${taskId}" to check progress`,
    };
  } catch (e) {
    return { error: e.message, taskId: null };
  }
}

async function pollStatus({ taskId }) {
  if (!ENABLED) return { error: 'LDR_ENABLED=false', status: 'disabled' };
  try {
    const res = await ldrFetch(`/api/research/${encodeURIComponent(taskId)}/status`);
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
      const items = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(items)) return { found: false, cached: false, error: 'INVALID_LDR_HISTORY_RESPONSE' };
      const ql = query.toLowerCase();
      const match = items.find(r =>
        r.status === 'completed' &&
        typeof r.query === 'string' && r.query.length > 0 &&
        (r.query.toLowerCase().includes(ql) || ql.includes(r.query.toLowerCase()))
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
    else return { found: false, cached: false, error: `LDR returned ${res.status}` };
  } catch (error) {
    return { found: false, cached: false, error: error.message };
  }

  return { found: false, cached: false, queryHash: qHash, query };
}

async function quickSummary({ query, max_results = 5 }) {
  return { summary: null, error: 'UNSUPPORTED_BY_PINNED_LDR_API: use ldr.start_research, ldr.poll_status, then ldr.get_report' };
}

async function getReport({ taskId }) {
  if (!ENABLED) return { error: 'LDR_ENABLED=false', content: null };
  const response = await ldrFetch(`/api/report/${encodeURIComponent(taskId)}`);
  if (!response.ok) return { error: `LDR returned ${response.status}`, content: null };
  const data = await response.json();
  const content = data.content ?? data.summary;
  if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 2 * 1024 * 1024) {
    return { error: 'INVALID_OR_OVERSIZED_LDR_REPORT', content: null };
  }
  return { taskId, content, sources: Array.isArray(data.sources) ? data.sources : [], canonicalAuthority: false, qualification: 'UNREVIEWED_RESEARCH' };
}

// ── Tool definitions (JSON Schema) ────────────────────────────────────────────
const TOOLS = [
  {
    name: 'ldr.start_research',
    description:
      'Start an async task in the configured Local Deep Research container. Writes LDR-local research history only. Requires an authorized session; poll status then retrieve the report. Does not publish Atlas evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 2000, description: 'Research question or topic' },
        max_iterations: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: 'Number of research iteration rounds' },
        search_engines: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 1,
          default: ['searxng'],
          description: 'Exactly one engine supported by the pinned LDR API',
        },
      },
      required: ['query'],
    },
    handler: startResearch,
  },
  {
    name: 'ldr.get_report',
    description: 'Read an existing LDR Markdown report and sources. Unreviewed research, not canonical Atlas evidence.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['taskId'] },
    handler: getReport,
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
      'Legacy compatibility tool. Unsupported by the pinned container; returns an explicit error without launching research. Use start_research, poll_status, get_report.',
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
        result: { content: [{ type: 'text', text: JSON.stringify(result) }], ...(result.error ? { isError: true } : {}) },
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
