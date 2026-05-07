/**
 * FF1 Tool Registry
 *
 * MCP-compatible agentic tools for the FF1 repair agent.
 * Gemma4 (or any MCP client) can call these tools to:
 *   - Read files                 (ff1_read_file)
 *   - Search the codebase        (ff1_search_codebase)
 *   - Get KAG notes              (ff1_get_kag_note)
 *   - Run validation commands    (ff1_run_validation)
 *   - Get graph neighbors        (ff1_get_graph_neighbors)
 *   - List past repair plans     (ff1_get_repair_history)
 *
 * Integration: import ff1McpToolDescriptors into src/mcp/server.ts.
 */

import { readFileSync, existsSync } from 'fs';
import { spawnSync }                from 'child_process';
import path                         from 'path';
import { ENV } from '$lib/server/env.server.js';

const ROOT         = path.resolve(process.cwd());
const MAX_READ     = 50_000;   // bytes
const MAX_CMD_OUT  = 8_000;    // chars
const QDRANT_URL   = ENV.QDRANT_URL;
const OLLAMA_URL   = ENV.OLLAMA_BASE_URL;
const REDIS_URL    = ENV.REDIS_URL;

// ── Allowlist for runValidation ───────────────────────────────────────────

const SAFE_CMD_RE = [
  /^npx tsgo\b/,
  /^npx tsc\b/,
  /^npx svelte-check\b/,
  /^npx vitest\s+run\b/,
  /^npm run check\b/,
  /^npm run test\b/,
  /^npm run ff1:audit\b/,
];

// ── Tool implementations ──────────────────────────────────────────────────

export const ff1Tools = {

  /** Read a workspace file (hard-capped at 50KB). */
  readFile(params: { path: string; startLine?: number; endLine?: number }): string {
    const abs = path.isAbsolute(params.path)
      ? params.path
      : path.join(ROOT, params.path);
    if (!existsSync(abs)) return `(file not found: ${params.path})`;

    const raw   = readFileSync(abs, { encoding: 'utf8', flag: 'r' }).slice(0, MAX_READ);
    const lines = raw.split('\n');
    const start = Math.max(0, (params.startLine ?? 1) - 1);
    const end   = params.endLine ? Math.min(lines.length, params.endLine) : lines.length;
    return lines.slice(start, end)
      .map((l, i) => `${String(start + i + 1).padStart(4)} │ ${l}`)
      .join('\n');
  },

  /** Semantic search over Qdrant codebase_chunks_768. */
  async searchCodebase(params: { query: string; k?: number; filterPath?: string }): Promise<string> {
    const k = params.k ?? 5;
    try {
      const eRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: params.query }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!eRes.ok) return 'Embedding service unavailable.';
      const { embedding } = await eRes.json() as { embedding: number[] };

      const filter = params.filterPath
        ? { must: [{ key: 'path', match: { value: params.filterPath } }] }
        : undefined;

      const sRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector: embedding, limit: k, with_payload: true, filter, score_threshold: 0.4 }),
        signal: AbortSignal.timeout(8_000),
      });
      const { result } = await sRes.json() as {
        result: Array<{ payload: Record<string, string>; score: number }>;
      };
      return result.map(r =>
        `[score=${r.score.toFixed(2)} path=${r.payload.path ?? '?'}]\n` +
        `${(r.payload.content ?? r.payload.summary ?? '').slice(0, 500)}`
      ).join('\n\n---\n\n');
    } catch (err) {
      return `Search failed: ${(err as Error).message}`;
    }
  },

  /** Get KAG wiki note for a directory from Redis. */
  async getKagNote(params: { dir: string }): Promise<string> {
    try {
      const { attachDispose } = await import('$lib/server/redis-disposable.js');
      const { createClient } = await import('redis');
      const raw = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000 } });
      await raw.connect();
      // D16: `await using` auto-calls .quit() on scope exit (even on throw)
      await using r = attachDispose(raw);
      const note = await r.get(`wiki:note:dir:${params.dir}`) as string | null;
      return note ?? `No KAG note for: ${params.dir}`;
    } catch (err) {
      return `KAG lookup failed: ${(err as Error).message}`;
    }
  },

  /** Run a whitelisted validation command synchronously. */
  runValidation(params: { command: string }): { exitCode: number; output: string } {
    const safe = SAFE_CMD_RE.some(re => re.test(params.command.trim()));
    if (!safe) {
      return { exitCode: 1, output: `Command not in allowlist: ${params.command}` };
    }
    const [cmd, ...args] = params.command.split(' ');
    const r = spawnSync(cmd, args, {
      cwd:      ROOT,
      encoding: 'utf8',
      timeout:  120_000,
      shell:    process.platform === 'win32',
    });
    const out = ((r.stdout ?? '') + '\n' + (r.stderr ?? '')).trim().slice(0, MAX_CMD_OUT);
    return { exitCode: r.status ?? 1, output: out };
  },

  /** Get import graph neighbors from codebase-graph.json. */
  getGraphNeighbors(params: { filePath: string }): string {
    const gp = path.join(ROOT, 'docs/graph/codebase-graph.json');
    if (!existsSync(gp)) return 'Graph not available — run: npm run graphify:daily';

    const graph = JSON.parse(readFileSync(gp, 'utf8')) as {
      files?: Array<{ rel: string; imports?: string[]; importedBy?: string[]; fanIn?: number }>;
    };
    const fp = params.filePath.replace(/\\/g, '/');
    const f  = graph.files?.find(x => x.rel === fp || x.rel.endsWith(fp));
    if (!f) return `Not found in graph: ${fp}`;

    return JSON.stringify({
      path:       f.rel,
      fanIn:      f.fanIn ?? (f.importedBy ?? []).length,
      imports:    (f.imports ?? []).slice(0, 15),
      importedBy: (f.importedBy ?? []).slice(0, 15),
    }, null, 2);
  },

  /** Get cached repair plans for a file from Redis. */
  async getRepairHistory(params: { filePath: string; limit?: number }): Promise<string> {
    try {
      const { attachDispose } = await import('$lib/server/redis-disposable.js');
      const { createClient } = await import('redis');
      const raw = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000 } });
      await raw.connect();
      // D16: `await using` auto-calls .quit() on scope exit (even on throw)
      await using r = attachDispose(raw);
      const keys = await r.keys('ff1:repair:plan:*') as string[];
      const plans: unknown[] = [];
      for (const k of keys.slice(0, params.limit ?? 5)) {
        const v = await r.get(k) as string | null;
        if (v) {
          const p = JSON.parse(v) as { files?: Array<{ path: string }> };
          if (p.files?.some(f => f.path.includes(params.filePath))) {
            plans.push(p);
          }
        }
      }
      return plans.length ? JSON.stringify(plans, null, 2) : 'No repair history found.';
    } catch (err) {
      return `History lookup failed: ${(err as Error).message}`;
    }
  },

} as const;

// ── MCP tool descriptors (FastMCP-compatible shape) ───────────────────────

export const ff1McpToolDescriptors = [
  {
    name:        'ff1_read_file',
    description: 'Read a workspace file (capped 50KB). Use startLine/endLine to focus on a region.',
    inputSchema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Workspace-relative file path' },
        startLine: { type: 'number' },
        endLine:   { type: 'number' },
      },
      required: ['path'],
    },
    handler: (p: Parameters<typeof ff1Tools.readFile>[0]) => Promise.resolve(ff1Tools.readFile(p)),
  },
  {
    name:        'ff1_search_codebase',
    description: 'Semantic search over the indexed codebase (codebase_chunks_768). Returns top-k relevant chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string' },
        k:          { type: 'number', description: 'Number of results (default 5)' },
        filterPath: { type: 'string', description: 'Filter to paths containing this string' },
      },
      required: ['query'],
    },
    handler: (p: Parameters<typeof ff1Tools.searchCodebase>[0]) => ff1Tools.searchCodebase(p),
  },
  {
    name:        'ff1_get_kag_note',
    description: 'Get the KAG wiki note for a directory (Redis wiki:note:dir:*).',
    inputSchema: {
      type: 'object',
      properties: { dir: { type: 'string', description: 'Workspace-relative directory path' } },
      required: ['dir'],
    },
    handler: (p: Parameters<typeof ff1Tools.getKagNote>[0]) => ff1Tools.getKagNote(p),
  },
  {
    name:        'ff1_run_validation',
    description: 'Run a whitelisted command (tsgo, svelte-check, vitest). Returns {exitCode, output}.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
    handler: (p: Parameters<typeof ff1Tools.runValidation>[0]) => Promise.resolve(ff1Tools.runValidation(p)),
  },
  {
    name:        'ff1_get_graph_neighbors',
    description: 'Get import graph neighbors for a file (fan-in/out from graphify AST data).',
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string' } },
      required: ['filePath'],
    },
    handler: (p: Parameters<typeof ff1Tools.getGraphNeighbors>[0]) => Promise.resolve(ff1Tools.getGraphNeighbors(p)),
  },
  {
    name:        'ff1_get_repair_history',
    description: 'Get cached Gemma4 repair plans for a file from Redis.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        limit:    { type: 'number', description: 'Max plans to return (default 5)' },
      },
      required: ['filePath'],
    },
    handler: (p: Parameters<typeof ff1Tools.getRepairHistory>[0]) => ff1Tools.getRepairHistory(p),
  },
] as const;
