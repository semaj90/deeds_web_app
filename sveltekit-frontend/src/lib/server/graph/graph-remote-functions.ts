/**
 * Graph Remote Functions — small UI reads for the Graphify viewer
 *
 * These are thin Redis-cached reads over codebase-graph.json.
 * Heavy rebuilds stay in /api/codebase-index/* routes.
 *
 * All functions are server-only (called from +page.server.ts load()
 * or from +server.ts API routes). They return plain JSON-serialisable
 * objects so SvelteKit can pass them through load() data.
 *
 * Cache strategy: mtime-gated in-process (same session), plus
 * withRpcCache() for cross-request Redis caching (5 min TTL).
 *
 * Mirrors the spec:
 *   getGraphOverview()          → cluster tile data + top-level stats
 *   getGraphNode(rel)           → single file flags + neighbors
 *   getGraphPageRankTop(n)      → top-N nodes by Redis pagerank score
 *   getDirectoryEgoGraph(dir)   → files in dir + 1-hop import neighbors
 */

import { readFile, stat }      from 'node:fs/promises';
import { existsSync }          from 'node:fs';
import path                    from 'node:path';
import { withRpcCache }        from '$lib/server/cache/rpc-cache.js';
import { getRedis }            from '$lib/server/redis.js';
import {
  bowRpcKey,
  getBowTile,
  setBowTile,
  buildBowTextureForChunk,
  mergeBowTiles,
  clusterBowKey,
  somBowKey,
  chunkBowKey,
  type BowTextureTile,
} from '$lib/server/langextract/bag-cache.js';

// ── Graph JSON schema (subset of what index-codebase-fast writes) ────────────

interface RawFile {
  rel:          string;
  ext?:         string;
  tags?:        string[];
  imports?:     string[];
  lineCount?:   number;
  fanIn?:       number;
  isRoute?:     boolean;
  isTest?:      boolean;
  isSvelteComp?:boolean;
  hasAuth?:     boolean;
  hasZod?:      boolean;
  ssrUnsafe?:   boolean;
  sv4Legacy?:   boolean;
  hasPairedTest?:boolean;
  clusterId?:   number;
  somBmuRow?:   number;
  somBmuCol?:   number;
  todos?:       string[];
  routeParams?: string[];
}

interface RawDir {
  dir:       string;
  score?:    number;
  fileCount: number;
  auth?:     number;
  todos?:    number;
  tagList?:  string[];
  summary?:  string;
}

interface RawGraph {
  files?:       RawFile[];
  directories?: RawDir[];
  meta?: { createdAt: string; fileCount: number; mode: string };
}

// ── In-process mtime cache ────────────────────────────────────────────────────

let _graph:    RawGraph | null = null;
let _graphMtime = 0;

const GRAPH_PATH = path.resolve(
  process.cwd(),
  'docs/graph/codebase-graph.json',
);

async function loadGraph(): Promise<RawGraph> {
  if (!existsSync(GRAPH_PATH)) return { files: [], directories: [] };
  const { mtimeMs } = await stat(GRAPH_PATH);
  if (_graph && mtimeMs <= _graphMtime) return _graph;
  const raw = await readFile(GRAPH_PATH, 'utf8');
  _graph = JSON.parse(raw) as RawGraph;
  _graphMtime = mtimeMs;
  return _graph;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ClusterTile {
  clusterId:   number;
  fileCount:   number;
  ssrRisk:     number;
  pairedPct:   number;
  topTags:     string[];
  topDirs:     string[];
}

export interface GraphOverview {
  totalFiles:   number;
  totalDirs:    number;
  totalClusters:number;
  clusters:     ClusterTile[];
  stats: {
    ssrUnsafe:  number;
    sv4Legacy:  number;
    noTest:     number;
    noAuth:     number;
    avgScore:   number;
  };
  meta: { createdAt: string | null; mode: string };
}

export interface GraphNodeDetail {
  rel:          string;
  ext:          string;
  tags:         string[];
  lineCount:    number;
  fanIn:        number;
  flags: {
    isRoute:     boolean;
    isTest:      boolean;
    hasAuth:     boolean;
    hasZod:      boolean;
    ssrUnsafe:   boolean;
    sv4Legacy:   boolean;
    hasPairedTest:boolean;
  };
  clusterId:    number | null;
  somCell:      string | null;
  imports:      string[];        // direct imports listed in graph
  importedBy:   string[];        // reverse: files that import this one (fanIn sources)
  todos:        string[];
}

export interface PageRankEntry {
  rel:    string;
  score:  number;
  source: 'redis' | 'fanin';  // redis = computed by pytorch-graph; fanin = fallback
}

export interface EgoGraphNode {
  rel:        string;
  fanIn:      number;
  isRoute:    boolean;
  isTest:     boolean;
  hasAuth:    boolean;
  ssrUnsafe:  boolean;
  clusterId:  number | null;
  relation:   'self' | 'imports' | 'importedBy';
}

// ── getGraphOverview ──────────────────────────────────────────────────────────

export async function getGraphOverview(): Promise<GraphOverview> {
  return (
    await withRpcCache(
      'overview',
      async () => {
        const graph = await loadGraph();
        const files = graph.files ?? [];
        const dirs  = graph.directories ?? [];

        // Cluster tiles
        const clusterMap = new Map<number, { files: RawFile[]; dirs: Set<string> }>();
        for (const f of files) {
          const cid = f.clusterId ?? -1;
          if (!clusterMap.has(cid)) clusterMap.set(cid, { files: [], dirs: new Set() });
          const c = clusterMap.get(cid)!;
          c.files.push(f);
          c.dirs.add(path.dirname(f.rel));
        }

        const clusters: ClusterTile[] = [...clusterMap.entries()]
          .sort((a, b) => b[1].files.length - a[1].files.length)
          .map(([cid, { files: cf, dirs: cd }]) => ({
            clusterId:  cid,
            fileCount:  cf.length,
            ssrRisk:    cf.filter(f => f.ssrUnsafe).length,
            pairedPct:  cf.length
              ? Math.round(cf.filter(f => f.hasPairedTest).length / cf.length * 100)
              : 0,
            topTags:    [...new Set(cf.flatMap(f => f.tags ?? []))].slice(0, 5),
            topDirs:    [...cd].slice(0, 4),
          }));

        const avgScore = dirs.length
          ? dirs.reduce((s, d) => s + (d.score ?? 80), 0) / dirs.length
          : 80;

        return {
          totalFiles:    files.length,
          totalDirs:     dirs.length,
          totalClusters: clusterMap.size,
          clusters,
          stats: {
            ssrUnsafe: files.filter(f => f.ssrUnsafe).length,
            sv4Legacy:  files.filter(f => f.sv4Legacy).length,
            noTest:     files.filter(f => f.isRoute && !f.hasPairedTest).length,
            noAuth:     files.filter(f => f.isRoute && !f.hasAuth).length,
            avgScore:   Math.round(avgScore),
          },
          meta: {
            createdAt: graph.meta?.createdAt ?? null,
            mode:      graph.meta?.mode ?? 'fast-ast',
          },
        } satisfies GraphOverview;
      },
      { transport: 'remote-function', method: 'getGraphOverview', ttlSeconds: 300 },
    )
  ).value;
}

// ── getGraphNode ──────────────────────────────────────────────────────────────

export async function getGraphNode(rel: string): Promise<GraphNodeDetail | null> {
  return (
    await withRpcCache(
      rel,
      async () => {
        const graph = await loadGraph();
        const files = graph.files ?? [];
        const f = files.find(x => x.rel === rel);
        if (!f) return null;

        // Build reverse-import map (importedBy)
        const importedBy = files
          .filter(x => (x.imports ?? []).includes(f.rel))
          .map(x => x.rel)
          .slice(0, 20);

        return {
          rel:       f.rel,
          ext:       f.ext ?? '',
          tags:      f.tags ?? [],
          lineCount: f.lineCount ?? 0,
          fanIn:     f.fanIn ?? importedBy.length,
          flags: {
            isRoute:      f.isRoute      ?? false,
            isTest:       f.isTest       ?? false,
            hasAuth:      f.hasAuth      ?? false,
            hasZod:       f.hasZod       ?? false,
            ssrUnsafe:    f.ssrUnsafe    ?? false,
            sv4Legacy:    f.sv4Legacy    ?? false,
            hasPairedTest:f.hasPairedTest ?? false,
          },
          clusterId: f.clusterId ?? null,
          somCell:   f.somBmuRow != null ? `${f.somBmuRow}:${f.somBmuCol}` : null,
          imports:   (f.imports ?? []).slice(0, 30),
          importedBy,
          todos:     f.todos ?? [],
        } satisfies GraphNodeDetail;
      },
      { transport: 'remote-function', method: 'getGraphNode', ttlSeconds: 300 },
    )
  ).value;
}

// ── getGraphPageRankTop ───────────────────────────────────────────────────────

export async function getGraphPageRankTop(n = 25): Promise<PageRankEntry[]> {
  return (
    await withRpcCache(
      { n },
      async () => {
        // Prefer Redis-computed scores (written by pytorch-graph pageRankGPU or CouchDB)
        const redis = getRedis();
        const redisRaw = await redis.get('couchdb:pagerank_scores').catch(() => null);

        if (redisRaw) {
          const scores = JSON.parse(redisRaw) as Record<string, number>;
          return Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([rel, score]) => ({ rel, score, source: 'redis' as const }));
        }

        // Fallback: fanIn rank from graph JSON
        const graph = await loadGraph();
        const files = graph.files ?? [];
        return files
          .filter(f => (f.fanIn ?? 0) > 0)
          .sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0))
          .slice(0, n)
          .map(f => ({ rel: f.rel, score: f.fanIn ?? 0, source: 'fanin' as const }));
      },
      { transport: 'remote-function', method: 'getGraphPageRankTop', ttlSeconds: 300 },
    )
  ).value;
}

// ── getDirectoryEgoGraph ──────────────────────────────────────────────────────

export async function getDirectoryEgoGraph(dir: string): Promise<EgoGraphNode[]> {
  return (
    await withRpcCache(
      dir,
      async () => {
        const graph = await loadGraph();
        const files = graph.files ?? [];

        const dirNorm = dir.replace(/\\/g, '/').replace(/\/$/, '');
        const selfFiles = files.filter(f =>
          path.dirname(f.rel).replace(/\\/g, '/') === dirNorm,
        );
        const selfRels = new Set(selfFiles.map(f => f.rel));

        const nodes: EgoGraphNode[] = selfFiles.map(f => ({
          rel:       f.rel,
          fanIn:     f.fanIn ?? 0,
          isRoute:   f.isRoute   ?? false,
          isTest:    f.isTest    ?? false,
          hasAuth:   f.hasAuth   ?? false,
          ssrUnsafe: f.ssrUnsafe ?? false,
          clusterId: f.clusterId ?? null,
          relation:  'self' as const,
        }));

        // 1-hop: files that import something in this dir
        const importedBySet = new Set<string>();
        for (const f of files) {
          if (selfRels.has(f.rel)) continue;
          const importsIntoDir = (f.imports ?? []).some(imp => selfRels.has(imp));
          if (importsIntoDir && !importedBySet.has(f.rel)) {
            importedBySet.add(f.rel);
            nodes.push({
              rel: f.rel, fanIn: f.fanIn ?? 0, isRoute: f.isRoute ?? false,
              isTest: f.isTest ?? false, hasAuth: f.hasAuth ?? false,
              ssrUnsafe: f.ssrUnsafe ?? false, clusterId: f.clusterId ?? null,
              relation: 'importedBy' as const,
            });
          }
        }

        // 1-hop: files imported by files in this dir
        const importedSet = new Set<string>();
        for (const f of selfFiles) {
          for (const imp of f.imports ?? []) {
            if (!selfRels.has(imp) && !importedSet.has(imp)) {
              importedSet.add(imp);
              const target = files.find(x => x.rel === imp);
              if (target) {
                nodes.push({
                  rel: target.rel, fanIn: target.fanIn ?? 0, isRoute: target.isRoute ?? false,
                  isTest: target.isTest ?? false, hasAuth: target.hasAuth ?? false,
                  ssrUnsafe: target.ssrUnsafe ?? false, clusterId: target.clusterId ?? null,
                  relation: 'imports' as const,
                });
              }
            }
          }
        }

        return nodes.slice(0, 80); // cap for UI safety
      },
      { transport: 'remote-function', method: 'getDirectoryEgoGraph', ttlSeconds: 300 },
    )
  ).value;
}

// ── getBagOfWordsTexture ──────────────────────────────────────────────────────

export type BowArgs =
  | { chunkId: string; clusterId?: number; som?: { x: number; y: number } }
  | { clusterId: number }
  | { som: { x: number; y: number } };

export async function getBagOfWordsTexture(
  args: BowArgs
): Promise<{ tile: BowTextureTile | null; cache: { hit: boolean; key: string } }> {
  const rpcKey = bowRpcKey(args);
  const redis  = getRedis();

  // L1: RPC envelope cache
  const cached = await redis.get(rpcKey).catch(() => null);
  if (cached) {
    try {
      return { tile: JSON.parse(cached) as BowTextureTile, cache: { hit: true, key: rpcKey } };
    } catch { /* fall through */ }
  }

  // L2: specific tile key
  let tile: BowTextureTile | null = null;
  if ('chunkId' in args) {
    tile = await getBowTile(chunkBowKey(args.chunkId));
  } else if ('clusterId' in args) {
    tile = await getBowTile(clusterBowKey(args.clusterId));
  } else if ('som' in args) {
    tile = await getBowTile(somBowKey(args.som.x, args.som.y));
  }

  // L3: build from Qdrant tags (lazy, non-fatal)
  if (!tile) {
    try {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      const { ENV } = await import('$lib/server/env.server.js');
      const qdrant = new QdrantClient({ url: ENV.QDRANT_URL }) as unknown as {
        scroll: (col: string, opts: unknown) => Promise<{ points: { id: string; payload?: Record<string, unknown> }[] }>;
        retrieve: (col: string, opts: unknown) => Promise<{ id: string; payload?: Record<string, unknown> }[]>;
      };

      if ('chunkId' in args) {
        const [pt] = await qdrant.retrieve('codebase_chunks_768', { ids: [args.chunkId], with_payload: true });
        if (pt?.payload) {
          const text = [...(pt.payload.tags as string[] ?? []), String(pt.payload.chunkText ?? '')].join(' ');
          tile = buildBowTextureForChunk(args.chunkId, text, {
            clusterId: args.clusterId ?? (pt.payload.gpuCluster as number | undefined),
            som: args.som ?? (pt.payload.som_bmu_col !== undefined
              ? { x: pt.payload.som_bmu_col as number, y: pt.payload.som_bmu_row as number }
              : undefined),
          });
          await setBowTile(chunkBowKey(args.chunkId), tile);
        }
      } else if ('clusterId' in args) {
        const res = await qdrant.scroll('codebase_chunks_768', {
          filter: { must: [{ key: 'gpuCluster', match: { value: args.clusterId } }] },
          limit: 200,
          with_payload: true,
        });
        const tiles = (res.points ?? []).map(pt => {
          const text = [...(pt.payload?.tags as string[] ?? []), String(pt.payload?.chunkText ?? '')].join(' ');
          return buildBowTextureForChunk(String(pt.id), text);
        });
        if (tiles.length) {
          tile = mergeBowTiles(tiles, `cluster:${args.clusterId}`);
          tile.clusterId = args.clusterId;
          await setBowTile(clusterBowKey(args.clusterId), tile);
        }
      } else if ('som' in args) {
        const { x, y } = args.som;
        const res = await qdrant.scroll('codebase_chunks_768', {
          filter: { must: [{ key: 'som_bmu_col', match: { value: x } }, { key: 'som_bmu_row', match: { value: y } }] },
          limit: 100,
          with_payload: true,
        });
        const tiles = (res.points ?? []).map(pt => {
          const text = [...(pt.payload?.tags as string[] ?? []), String(pt.payload?.chunkText ?? '')].join(' ');
          return buildBowTextureForChunk(String(pt.id), text);
        });
        if (tiles.length) {
          tile = mergeBowTiles(tiles, `som:${x}:${y}`);
          tile.som = { x, y };
          await setBowTile(somBowKey(x, y), tile);
        }
      }
    } catch { /* Qdrant unavailable */ }
  }

  if (tile) {
    await redis.setex(rpcKey, 3600, JSON.stringify(tile)).catch(() => null);
  }

  return { tile, cache: { hit: false, key: rpcKey } };
}
