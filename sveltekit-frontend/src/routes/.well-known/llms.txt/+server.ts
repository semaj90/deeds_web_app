/**
 * GET /.well-known/llms.txt  (and alias /llms.txt via SvelteKit rewrite)
 *
 * llms.txt spec: https://llmstxt.org/
 *
 * Serves a live, graph-aware architecture summary that LLMs and agent
 * orchestrators can fetch to understand this codebase:
 *
 *   # Deeds Legal AI — Architecture
 *   > One-liner
 *
 *   ## Stack
 *   ...
 *
 *   ## API Endpoints (top clusters)
 *   ...
 *
 *   ## NES-Arch Memory Tiers
 *   ...
 *
 * Data sources (best-effort, all non-fatal):
 *   1. docs/graph/codebase-graph.json — fast AST file list + tags
 *   2. Redis cluster summaries (summary:cluster:*)
 *   3. Redis LLMS.md root (llms:root) — directory index preamble
 *   4. Static stack section from package.json dependencies
 *
 * Cache: public, max-age=900 (15 min) — fresh enough for agent discovery,
 * stale enough not to hammer Redis on every agent request.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { buildParentAtlasAgentContractLines } from '$lib/server/llms/parent-atlas-agent-contract.js';

const GRAPH_JSON  = path.resolve('docs/graph/codebase-graph.json');
const PKG_JSON    = path.resolve('package.json');
const AGENTS_FILE = path.resolve('LLMS.md');

interface GraphFile {
  rel: string;
  tags: string[];
  isRoute: boolean;
  routeHandlers?: string[];
}

interface GraphData {
  files?: GraphFile[];
  fileCount?: number;
  createdAt?: string;
  mode?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function readGraphSummary(): Promise<{
  fileCount: number;
  routeCount: number;
  topTags: string[];
  sampleRoutes: string[];
  createdAt: string;
} | null> {
  if (!existsSync(GRAPH_JSON)) return null;
  try {
    const data = JSON.parse(await readFile(GRAPH_JSON, 'utf8')) as GraphData;
    const files = data.files ?? [];
    const tagFreq = new Map<string, number>();
    const routes: string[] = [];
    for (const f of files) {
      for (const t of f.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
      if (f.isRoute) routes.push(f.rel);
    }
    const topTags = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
    return {
      fileCount: data.fileCount ?? files.length,
      routeCount: routes.length,
      topTags,
      sampleRoutes: routes.slice(0, 20),
      createdAt: data.createdAt ?? 'unknown',
    };
  } catch {
    return null;
  }
}

async function readClusterSummaries(): Promise<Array<{ id: number; purpose: string; summary: string; tags: string[] }>> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const keys = (await redis.keys('summary:cluster:*')).slice(0, 10);
    if (!keys.length) return [];
    const vals = await redis.mget(...keys);
    return keys
      .map((k, i) => {
        const raw = vals[i];
        if (!raw) return null;
        try {
          const d = JSON.parse(raw) as { purpose?: string; summary?: string; tags?: string[]; clusterId?: number };
          const id = parseInt(k.split(':').pop() ?? '0', 10);
          return { id, purpose: d.purpose ?? '', summary: d.summary ?? '', tags: d.tags ?? [] };
        } catch { return null; }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  } catch {
    return [];
  }
}

async function readAgentsMdPreamble(): Promise<string | null> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const root = await redis.get('llms:root');
    if (root) {
      // Return first 60 lines (directory index + tool surface)
      return root.split('\n').slice(0, 60).join('\n');
    }
  } catch { /* Redis unavailable */ }
  // Disk fallback
  try {
    if (existsSync(AGENTS_FILE)) {
      const md = await readFile(AGENTS_FILE, 'utf8');
      return md.split('\n').slice(0, 60).join('\n');
    }
  } catch { /* non-fatal */ }
  return null;
}

async function readPkgDeps(): Promise<{ name: string; version: string; description: string } | null> {
  try {
    const pkg = JSON.parse(await readFile(PKG_JSON, 'utf8')) as {
      name?: string; version?: string; description?: string;
    };
    return { name: pkg.name ?? 'deeds-legal-ai', version: pkg.version ?? '0.0.0', description: pkg.description ?? '' };
  } catch { return null; }
}

// ── route ─────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async () => {
  const [graph, clusters, agentsMd, pkg] = await Promise.all([
    readGraphSummary().catch(() => null),
    readClusterSummaries().catch(() => []),
    readAgentsMdPreamble().catch(() => null),
    readPkgDeps().catch(() => null),
  ]);

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push('# Deeds Legal AI Platform');
  lines.push('');
  lines.push('> SvelteKit 2 + Svelte 5 (runes) legal AI platform with GPU-accelerated knowledge graph,');
  lines.push('> Qdrant vector search, Gemma4 legal VLM, 4D hyperedge memory, and A2A agent protocol.');
  lines.push('');

  lines.push(...buildParentAtlasAgentContractLines());

  if (pkg) {
    lines.push(`Version: ${pkg.version}`);
    lines.push('');
  }

  // ── Stack ─────────────────────────────────────────────────────────────────
  lines.push('## Stack');
  lines.push('');
  lines.push('- **Frontend**: SvelteKit 2 + Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)');
  lines.push('- **Styling**: UnoCSS v66 (svelte-scoped), Bits UI v2.16 headless components');
  lines.push('- **Database**: PostgreSQL 16 + Drizzle ORM 0.44 + pgvector 0.8.1');
  lines.push('- **Cache**: Redis (ioredis) — L1 exact-match (5ms) + L2 Bifrost semantic (2-5s)');
  lines.push('- **Vector DB**: Qdrant (GPU-accelerated, 9 collections, 768-dim embeddings)');
  lines.push('- **LLM**: Ollama `gemma4-rotorquant:latest` (text+vision, 5.3GB, GRPO legal LoRA)');
  lines.push('- **Embeddings**: `embeddinggemma:latest` 768-dim via Ollama / gRPC');
  lines.push('- **GPU**: N-API LibTorch + TensorRT on RTX 3060 Ti (CUDA 12.1) — 100× cosine ops');
  lines.push('- **Graph**: Neo4j (community graph, SIMILAR_TOPOLOGY edges) + CouchDB (Karpathy wiki)');
  lines.push('- **MCP**: FastMCP 29 tools (stdio transport) + A2A AgentCard at /.well-known/agent.json');
  lines.push('- **Queue**: RabbitMQ 7 queues (AMQP 0-9-1)');
  lines.push('- **Inference chain**: TurboQuant :8090 → Bifrost :3040 → Ollama :11434');
  lines.push('');

  // ── NES-Arch memory tiers ─────────────────────────────────────────────────
  lines.push('## NES-Arch Memory Tiers');
  lines.push('');
  lines.push('Memory is modelled after NES hardware banking:');
  lines.push('');
  lines.push('| Tier | Tech | Key pattern | TTL | Notes |');
  lines.push('|------|------|-------------|-----|-------|');
  lines.push('| Tiny RAM | Redis | `agents:dir:*` | 24h | Per-directory LLMS.md rendered markdown |');
  lines.push('| Tiny RAM | Redis | `code:index:*` | 6h | Fast-AST file metadata |');
  lines.push('| Tiny RAM | Redis | `wiki:note:dir:*` | 24h | Karpathy wiki notes per directory |');
  lines.push('| Tiny RAM | Redis | `summary:cluster:*` | 6h | Gemma4 GPU cluster narratives |');
  lines.push('| Tiny RAM | Redis | `summary:som:*` | 6h | SOM cell neighbourhood summaries |');
  lines.push('| Tiny RAM | Redis | `centroid:cluster:*` | 6h | Float32Array cluster centroids |');
  lines.push('| Bank ROM | Qdrant | `codebase_chunks_768` | ∞ | 768-dim dual-vector code search |');
  lines.push('| Cartridge | CouchDB | `karpathy_wiki/*` | ∞ | Long-term wiki notes + playbooks |');
  lines.push('| PPU | LibTorch N-API | — | — | GPU cosine similarity / k-means / SOM |');
  lines.push('');

  // ── LLMS.md preamble ────────────────────────────────────────────────────
  if (agentsMd) {
    lines.push('## LLMS.md Directory Index (excerpt)');
    lines.push('');
    lines.push(agentsMd);
    lines.push('');
  }

  // ── Codebase stats ────────────────────────────────────────────────────────
  if (graph) {
    lines.push('## Codebase Stats');
    lines.push('');
    lines.push(`- Files indexed: ${graph.fileCount}`);
    lines.push(`- Route handlers: ${graph.routeCount}`);
    lines.push(`- Last indexed: ${graph.createdAt}`);
    lines.push(`- Top tags: ${graph.topTags.join(', ')}`);
    lines.push('');

    if (graph.sampleRoutes.length > 0) {
      lines.push('## Sample API Routes');
      lines.push('');
      for (const r of graph.sampleRoutes) lines.push(`- \`${r}\``);
      lines.push('');
    }
  }

  // ── GPU cluster summaries ─────────────────────────────────────────────────
  if (clusters.length > 0) {
    lines.push('## GPU Cluster Summaries (top 10)');
    lines.push('');
    for (const c of clusters) {
      lines.push(`### Cluster ${c.id}${c.purpose ? ` — ${c.purpose}` : ''}`);
      if (c.summary) lines.push('');
      if (c.summary) lines.push(c.summary);
      if (c.tags.length) lines.push(`Tags: ${c.tags.join(', ')}`);
      lines.push('');
    }
  }

  // ── Agent discovery ───────────────────────────────────────────────────────
  lines.push('## Agent Discovery');
  lines.push('');
  lines.push('- **A2A AgentCard**: `GET /.well-known/agent.json`');
  lines.push('- **Agent API**: `POST /api/ai/agent` (Gemma4 tool-calling, SSE streaming)');
  lines.push('- **MCP**: stdio transport, 29 tools (`unified_ast_query`, `graph_search`, `wiki_note_lookup`, ...)');
  lines.push('- **ACP tools**: `GET /api/acp/tools`, `POST /api/acp/execute`');
  lines.push('');
  lines.push('## Optional');
  lines.push('');
  lines.push('- Full LLMS.md index: `/llms-full.txt`');
  lines.push('- Codebase graph JSON: `GET /api/codebase-index/stats`');

  const body = lines.join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
