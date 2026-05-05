/**
 * GET /api/codebase-graph/json — serve fast-AST codebase graph as {nodes, edges}
 *
 * Reads docs/graph/codebase-graph.json (written by `npm run index:codebase:fast`)
 * and transforms the file/directory rows into a node-link shape consumable by
 * the existing CodebaseGraphCanvas + GraphExport components.
 *
 * Query params:
 *   ?limit=N       — cap nodes (default 500, max 5000)
 *   ?dirsOnly=1    — directory-level graph only (much sparser, ~349 nodes vs 2579)
 *   ?lowScore=N    — keep only dirs with score ≤ N (helps focus on hotspots)
 *
 * Cached in-process (mtime-gated) — same pattern as graph-intel.ts.
 */

import { json }                 from '@sveltejs/kit';
import { readFile, stat }       from 'node:fs/promises';
import { existsSync }           from 'node:fs';
import path                     from 'node:path';
import type { RequestHandler }  from './$types';

// ── Types matching CodebaseGraphCanvas + GraphExport ─────────────────────────

interface ViewerNode {
  id:        string;
  label:     string;
  type:      'file' | 'directory';
  path:      string;
  extension: string;
  size:      number;
  group:     number;          // for color: low score = warning group
  errorCount: number;         // for GraphExport: TODO count + auth gap
  filePath:  string;
  cluster:   string;          // top dir tag
}

interface ViewerEdge {
  source: string;
  target: string;
  type:   string;
  weight: number;
}

// ── Source schema (matches indexer output, mirrors graph-intel.ts) ───────────

interface RawFile  { rel: string; tags?: string[]; ext?: string; lineCount?: number; isRoute?: boolean; hasAuth?: boolean; todos?: string[]; imports?: string[] }
interface RawDir   { dir: string; score: number; fileCount: number; lines: number; apis: number; auth: number; todos: number; tagList: string[]; summary?: string }
interface RawGraph {
  files?:       RawFile[];
  directories?: RawDir[];
  dirs?:        RawDir[];
  mode?:        string;
  fileCount?:   number;
  createdAt?:   string;
  meta?:        { createdAt?: string; fileCount?: number; mode?: string };
}

// ── In-process mtime cache ───────────────────────────────────────────────────

const GRAPH_PATH = path.resolve('docs/graph/codebase-graph.json');
let _cached: RawGraph | null = null;
let _cachedAt = 0;

async function loadGraph(): Promise<RawGraph | null> {
  if (!existsSync(GRAPH_PATH)) return null;
  try {
    const { mtimeMs } = await stat(GRAPH_PATH);
    if (_cached && mtimeMs === _cachedAt) return _cached;
    _cached   = JSON.parse(await readFile(GRAPH_PATH, 'utf-8')) as RawGraph;
    _cachedAt = mtimeMs;
    return _cached;
  } catch { return null; }
}

// ── Score-to-group mapping (smaller = more attention) ────────────────────────

function dirGroup(score: number): number {
  if (score < 40) return 0;   // critical
  if (score < 60) return 1;   // warning
  if (score < 80) return 2;   // ok
  return 3;                    // good
}

function extToGroup(ext: string): number {
  switch (ext) {
    case 'svelte': return 4;
    case 'ts':     return 5;
    case 'js':
    case 'mjs':    return 6;
    case 'json':   return 7;
    default:       return 8;
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const graph = await loadGraph();
  if (!graph) {
    return json(
      { error: 'codebase-graph.json not found. Run `npm run index:codebase:fast` first.', nodes: [], edges: [], stats: {} },
      { status: 424 }
    );
  }

  // raw=1 — return files[] array directly for GraphifyViewer (no node/edge transform)
  const raw = url.searchParams.get('raw') === '1';
  if (raw) {
    const files = (graph.files ?? []).slice(0, 5000);
    return json({ files, meta: graph.meta ?? {} }, {
      headers: { 'cache-control': 'public, max-age=60' },
    });
  }

  const limit    = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '500', 10) || 500, 1), 5000);
  const dirsOnly = url.searchParams.get('dirsOnly') === '1';
  const lowScore = url.searchParams.has('lowScore')
    ? Math.max(0, Math.min(100, parseInt(url.searchParams.get('lowScore') ?? '100', 10)))
    : null;

  const dirs    = (graph.directories ?? graph.dirs ?? []).filter((d) => lowScore == null || d.score <= lowScore);
  const nodes:  ViewerNode[] = [];
  const edges:  ViewerEdge[] = [];
  const seenId  = new Set<string>();
  const dirById = new Map<string, RawDir>();

  // Add directory nodes (always)
  for (const d of dirs.slice(0, limit)) {
    const id = `dir:${d.dir}`;
    if (seenId.has(id)) continue;
    seenId.add(id);
    dirById.set(d.dir, d);
    nodes.push({
      id,
      label:      d.dir.split('/').pop() ?? d.dir,
      type:       'directory',
      path:       d.dir,
      extension:  '',
      size:       Math.max(8, Math.min(40, Math.round(Math.log2(d.fileCount + 1) * 6))),
      group:      dirGroup(d.score),
      errorCount: d.todos + Math.max(0, d.apis - d.auth),
      filePath:   d.dir,
      cluster:    d.tagList?.[0] ?? '',
    });
  }

  // Directory ↔ parent-dir edges (parent containment)
  for (const d of dirs) {
    const parent = d.dir.split('/').slice(0, -1).join('/');
    if (parent && dirById.has(parent)) {
      edges.push({ source: `dir:${parent}`, target: `dir:${d.dir}`, type: 'CONTAINS', weight: 1 });
    }
  }

  // File nodes + file→dir edges (only when not dirsOnly)
  if (!dirsOnly) {
    const fileBudget = Math.max(0, limit - nodes.length);
    const files = (graph.files ?? []).slice(0, fileBudget);
    for (const f of files) {
      const id = `file:${f.rel}`;
      if (seenId.has(id)) continue;
      seenId.add(id);
      const ext   = (f.ext ?? f.rel.split('.').pop() ?? '').toLowerCase().replace(/^\./, '');
      const dir   = f.rel.split('/').slice(0, -1).join('/');
      nodes.push({
        id,
        label:      f.rel.split('/').pop() ?? f.rel,
        type:       'file',
        path:       f.rel,
        extension:  ext,
        size:       Math.max(4, Math.min(20, Math.round(Math.log2((f.lineCount ?? 1) + 1) * 2))),
        group:      extToGroup(ext),
        errorCount: (f.todos?.length ?? 0) + (f.isRoute && !f.hasAuth ? 1 : 0),
        filePath:   f.rel,
        cluster:    (f.tags ?? [])[0] ?? '',
      });
      if (dir && dirById.has(dir)) {
        edges.push({ source: `dir:${dir}`, target: id, type: 'CONTAINS', weight: 0.5 });
      }
    }
  }

  return json({
    nodes,
    edges,
    stats: {
      mode:          graph.mode ?? 'fast-ast',
      createdAt:     graph.createdAt ?? null,
      sourceFiles:   graph.fileCount ?? graph.files?.length ?? 0,
      sourceDirs:    (graph.directories ?? graph.dirs ?? []).length,
      renderedNodes: nodes.length,
      renderedEdges: edges.length,
      dirsOnly,
      lowScoreFilter: lowScore,
    },
  });
};
