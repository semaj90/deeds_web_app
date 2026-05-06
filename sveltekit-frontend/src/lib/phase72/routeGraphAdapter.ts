/**
 * Route Graph Adapter — bridges phase72 route discovery with the codebase graph.
 *
 * Reads `docs/graph/codebase-graph.json` (produced by `npm run graphify:map`)
 * and exposes a query API that returns route nodes, imports, and dependency
 * relationships for the phase72 error-clustering pipeline.
 *
 * The graph JSON is loaded once and cached in-process.  Call `refreshGraph()`
 * to reload after a `graphify:map` run.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Graph types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  rel: string;
  ext: string;
  tags: string[];
  summary: string;
  imports: string[];
  exports: string[];
  dynImports: string[];
  reExports: string[];
  routeHandlers: string[];
  drizzleRefs: string[];
  isRoute: boolean;
  isSvelteComp: boolean;
  isTest: boolean;
  lineCount: number;
  hasAuth: boolean;
  hasZod: boolean;
  ssrUnsafe: boolean;
  sv4Legacy: boolean;
  fanIn: number;
  routeParams: string[];
  routeDepth: number;
  hasPairedTest: boolean;
}

export interface CodebaseGraph {
  nodes: GraphNode[];
  createdAt: string;
  fileCount: number;
  routeCount: number;
  componentCount: number;
  apiCount: number;
}

// ─── Graph loading ────────────────────────────────────────────────────────────

const GRAPH_PATHS = [
  join(process.cwd(), 'docs/graph/codebase-graph.json'),
  join(process.cwd(), 'sveltekit-frontend/docs/graph/codebase-graph.json'),
];

let _graph: CodebaseGraph | null = null;

function loadGraph(): CodebaseGraph {
  if (_graph) return _graph;

  for (const p of GRAPH_PATHS) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
        // Normalize: graph may store nodes under 'nodes' or 'files' key
        const nodes = (raw.nodes ?? raw.files ?? []) as GraphNode[];
        _graph = {
          nodes,
          createdAt: String(raw.createdAt ?? ''),
          fileCount: Number(raw.fileCount ?? nodes.length),
          routeCount: Number(raw.routeCount ?? 0),
          componentCount: Number(raw.componentCount ?? 0),
          apiCount: Number(raw.apiCount ?? 0),
        };
        return _graph;
      } catch { /* try next path */ }
    }
  }

  // Empty graph if file not found
  console.warn('[RouteGraphAdapter] codebase-graph.json not found — run: npm run graphify:map');
  _graph = { nodes: [], createdAt: '', fileCount: 0, routeCount: 0, componentCount: 0, apiCount: 0 };
  return _graph;
}

/** Force reload of the graph from disk (call after a graphify:map run). */
export function refreshGraph(): void {
  _graph = null;
}

// ─── Query API ────────────────────────────────────────────────────────────────

/** Get all route nodes (SvelteKit +server.ts and +page.server.ts files). */
export function getRouteNodes(): GraphNode[] {
  return loadGraph().nodes.filter((n) => n.isRoute);
}

/** Get all API route nodes (routes/api/** endpoints). */
export function getApiRouteNodes(): GraphNode[] {
  return loadGraph().nodes.filter(
    (n) => n.isRoute && n.rel.includes('/api/')
  );
}

/** Find a node by relative path. */
export function getNode(rel: string): GraphNode | undefined {
  return loadGraph().nodes.find((n) => n.rel === rel);
}

/** Get all nodes that import the given module path. */
export function getImporters(modulePath: string): GraphNode[] {
  return loadGraph().nodes.filter(
    (n) =>
      n.imports.some((imp) => imp.includes(modulePath)) ||
      n.dynImports.some((imp) => imp.includes(modulePath))
  );
}

/** Get nodes with 0 importers (fanIn = 0) — potential orphans. */
export function getOrphanCandidates(): GraphNode[] {
  return loadGraph().nodes.filter(
    (n) => n.fanIn === 0 && !n.isRoute && !n.isTest
  );
}

/** Get nodes without auth guards — security audit helper. */
export function getUnauthenticatedRoutes(): GraphNode[] {
  return getApiRouteNodes().filter((n) => !n.hasAuth);
}

/** Get nodes without Zod validation — security audit helper. */
export function getUnvalidatedRoutes(): GraphNode[] {
  return getApiRouteNodes().filter((n) => !n.hasZod);
}

/** Get nodes with Svelte 4 legacy patterns — migration audit helper. */
export function getLegacySvelteNodes(): GraphNode[] {
  return loadGraph().nodes.filter((n) => n.sv4Legacy);
}

/** Graph metadata summary (for health-check endpoints). */
export function getGraphSummary(): Omit<CodebaseGraph, 'nodes'> {
  const { nodes: _nodes, ...meta } = loadGraph();
  return meta;
}
