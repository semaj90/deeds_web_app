/**
 * Route Graph Adapter — bridges phase72 route discovery with the codebase graph.
 *
 * Reads `docs/graph/codebase-graph.json` (produced by `npm run graphify:map`)
 * and exposes a query API that returns route nodes, imports, and dependency
 * relationships for the phase72 error-clustering pipeline.
 *
 * EXTENDED (512-dim MRL + Domain Classification):
 * - Enriches nodes with domain classification (AUTH, DATA, API, UI)
 * - Computes 512-dim semantic embeddings via FeatureVectorGenerator
 * - Provides domain-specific query functions (fan-out queries)
 * - Maps library imports to domain classes (e.g., ioredis → DATA, lucia → AUTH)
 *
 * The graph JSON is loaded once and cached in-process.  Call `refreshGraph()`
 * to reload after a `graphify:map` run.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Domain Classification Library Mapping ────────────────────────────────────

/**
 * Maps library imports to domain classes.
 * Used for lexical-stage domain classification (before semantic embedding).
 */
export const LIBRARY_DOMAIN_MAP: Record<string, DomainClass> = {
  // AUTH domain
  lucia: 'AUTH',
  'jsonwebtoken': 'AUTH',
  'passport': 'AUTH',
  'bcrypt': 'AUTH',
  'argon2': 'AUTH',
  '@lucia-auth': 'AUTH',

  // DATA domain
  'drizzle-orm': 'DATA',
  'prisma': 'DATA',
  'sequelize': 'DATA',
  'typeorm': 'DATA',
  'mongoose': 'DATA',
  'ioredis': 'DATA',
  'redis': 'DATA',
  'pg': 'DATA',
  'mysql2': 'DATA',
  'sqlite3': 'DATA',
  'knex': 'DATA',
  'sql-bricks': 'DATA',
  'better-sqlite3': 'DATA',
  '@databases/pg': 'DATA',
  '@databases/mysql': 'DATA',

  // API domain
  'express': 'API',
  'fastify': 'API',
  'hapi': 'API',
  'koa': 'API',
  '@grpc/grpc-js': 'API',
  'axios': 'API',
  'node-fetch': 'API',
  'undici': 'API',
  'sveltekit': 'API',
  '@sveltejs/kit': 'API',
  'http': 'API',
  'https': 'API',

  // UI domain
  'svelte': 'UI',
  'vue': 'UI',
  'react': 'UI',
  'angular': 'UI',
  '@sveltejs/adapter-auto': 'UI',
  '@sveltejs/adapter-node': 'UI',
  'bits-ui': 'UI',
  'melt-ui': 'UI',
  'tailwindcss': 'UI',
  'unocss': 'UI',
};

// ─── Graph types ──────────────────────────────────────────────────────────────

/**
 * Domain classification: AUTH (auth, sessions), DATA (queries, DB), API (routes, endpoints), UI (components, views)
 */
export type DomainClass = 'AUTH' | 'DATA' | 'API' | 'UI' | 'UNKNOWN';

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
  // Domain classification (512-dim MRL alignment)
  domain?: DomainClass; // PRIMARY: lexical + semantic classification (AUTH, DATA, API, UI)
  domainConfidence?: number; // 0-1 confidence from ensemble classifier
  embedding?: number[]; // 512-dim MRL semantic embedding (evaluation candidate)
  embeddingDimension?: number; // 512 or 768 (fallback)
  libraryDomainHints?: Record<string, DomainClass>; // Imported library → domain mapping (ioredis→DATA, lucia→AUTH, etc.)
}

export interface CodebaseGraph {
  nodes: GraphNode[];
  createdAt: string;
  fileCount: number;
  routeCount: number;
  componentCount: number;
  apiCount: number;
}

// ─── Domain Classification Functions ──────────────────────────────────────────

/**
 * Classify a node's domain via lexical analysis of imports and path.
 * Returns domain class + confidence score + library hints.
 */
function classifyNodeDomain(node: GraphNode): {
  domain: DomainClass;
  confidence: number;
  libraryHints: Record<string, DomainClass>;
} {
  const domainScores: Record<DomainClass, number> = {
    AUTH: 0,
    DATA: 0,
    API: 0,
    UI: 0,
    UNKNOWN: 0,
  };

  const libraryHints: Record<string, DomainClass> = {};

  // Score based on library imports
  const allImports = [...(node.imports ?? []), ...(node.dynImports ?? [])];
  for (const imp of allImports) {
    for (const [libName, domain] of Object.entries(LIBRARY_DOMAIN_MAP)) {
      if (imp.includes(libName)) {
        domainScores[domain]++;
        libraryHints[libName] = domain;
      }
    }
  }

  // Score based on path and filename
  const pathLower = node.rel.toLowerCase();
  if (pathLower.includes('auth') || pathLower.includes('session') || pathLower.includes('login')) {
    domainScores['AUTH'] += 2;
  }
  if (pathLower.includes('db') || pathLower.includes('query') || pathLower.includes('data')) {
    domainScores['DATA'] += 2;
  }
  if (pathLower.includes('api') || pathLower.includes('route') || pathLower.includes('endpoint') || node.isRoute) {
    domainScores['API'] += 2;
  }
  if (pathLower.includes('component') || pathLower.includes('ui') || pathLower.includes('view') || node.isSvelteComp) {
    domainScores['UI'] += 2;
  }

  // Score based on Drizzle schema references
  if ((node.drizzleRefs ?? []).length > 0) {
    domainScores['DATA'] += 1;
  }

  // Score based on handler type
  if ((node.routeHandlers ?? []).some(h => h.includes('POST') || h.includes('PUT') || h.includes('DELETE'))) {
    domainScores['API'] += 1;
  }

  // Normalize and select top domain
  const maxScore = Math.max(...Object.values(domainScores));
  let topDomain: DomainClass = 'UNKNOWN';
  let confidence = 0;

  if (maxScore > 0) {
    topDomain = Object.entries(domainScores).sort((a, b) => b[1] - a[1])[0][0] as DomainClass;
    confidence = maxScore / 10; // Normalize to approximate 0-1 range
    confidence = Math.min(1, Math.max(0, confidence));
  }

  return { domain: topDomain, confidence, libraryHints };
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

// ─── Domain Classification Query API (Fan-out) ────────────────────────────────

/** Enrich all nodes with domain classification and confidence scores. */
export function enrichNodesWithDomains(): void {
  const graph = loadGraph();
  for (const node of graph.nodes) {
    const { domain, confidence, libraryHints } = classifyNodeDomain(node);
    node.domain = domain;
    node.domainConfidence = confidence;
    node.libraryDomainHints = libraryHints;
  }
}

/** Get nodes classified as AUTH domain (authentication, sessions, tokens). */
export function getAuthNodes(): GraphNode[] {
  enrichNodesWithDomains();
  return loadGraph().nodes.filter((n) => n.domain === 'AUTH');
}

/** Get nodes classified as DATA domain (queries, database, schema). */
export function getDataNodes(): GraphNode[] {
  enrichNodesWithDomains();
  return loadGraph().nodes.filter((n) => n.domain === 'DATA');
}

/** Get nodes classified as API domain (routes, endpoints, RPC). */
export function getApiNodes(): GraphNode[] {
  enrichNodesWithDomains();
  return loadGraph().nodes.filter((n) => n.domain === 'API');
}

/** Get nodes classified as UI domain (components, views, styling). */
export function getUiNodes(): GraphNode[] {
  enrichNodesWithDomains();
  return loadGraph().nodes.filter((n) => n.domain === 'UI');
}

/** Get nodes with low domain confidence (UNKNOWN or borderline classifications). */
export function getLowConfidenceDomainNodes(threshold: number = 0.4): GraphNode[] {
  enrichNodesWithDomains();
  return loadGraph().nodes.filter((n) => {
    const conf = n.domainConfidence ?? 0;
    return conf < threshold || n.domain === 'UNKNOWN';
  });
}

/** Get domain classification statistics across the codebase. */
export function getDomainStatistics(): Record<DomainClass, { count: number; avgConfidence: number }> {
  enrichNodesWithDomains();
  const graph = loadGraph();
  const stats: Record<DomainClass, { count: number; confidences: number[] }> = {
    AUTH: { count: 0, confidences: [] },
    DATA: { count: 0, confidences: [] },
    API: { count: 0, confidences: [] },
    UI: { count: 0, confidences: [] },
    UNKNOWN: { count: 0, confidences: [] },
  };

  for (const node of graph.nodes) {
    const domain = node.domain ?? 'UNKNOWN';
    const confidence = node.domainConfidence ?? 0;
    stats[domain].count++;
    stats[domain].confidences.push(confidence);
  }

  const result: Record<DomainClass, { count: number; avgConfidence: number }> = {} as any;
  for (const [domain, data] of Object.entries(stats)) {
    const avg = data.confidences.length > 0
      ? data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length
      : 0;
    result[domain as DomainClass] = { count: data.count, avgConfidence: Number(avg.toFixed(3)) };
  }

  return result;
}

/** Get nodes by domain with minimum confidence threshold (domain-specific security/audit). */
export function getNodesByDomain(
  domain: DomainClass,
  minConfidence: number = 0.5
): GraphNode[] {
  enrichNodesWithDomains();
  return loadGraph().nodes.filter(
    (n) => n.domain === domain && (n.domainConfidence ?? 0) >= minConfidence
  );
}

/** Get unvalidated AUTH nodes (potential security issue). */
export function getUnvalidatedAuthNodes(): GraphNode[] {
  const authNodes = getAuthNodes();
  return authNodes.filter((n) => !n.hasZod);
}

/** Get unauthenticated API nodes in DATA domain (potential data exposure). */
export function getUnauthenticatedDataApiNodes(): GraphNode[] {
  const dataNodes = getDataNodes();
  return dataNodes.filter((n) => n.isRoute && !n.hasAuth);
}
