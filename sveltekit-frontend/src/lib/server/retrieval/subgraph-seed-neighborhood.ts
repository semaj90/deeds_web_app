import { getRouteClusterPriors, getRouteFeatureMap } from '$lib/server/atlas/route-feature-map.js';
import {
  normalizeLabels,
  type LabelNormalizationInput,
  type NormalizedLabels,
} from '$lib/server/labels/normalize-labels.js';
import { normalizeFeatureLabel, type CanonicalFeatureLabel } from '$lib/server/labels/feature-label-registry.js';
import { expandNeighbours, fetchAuthorityScores } from '$lib/server/search/neo4j-rerank.js';

export const SUBGRAPH_V1_VERSION = 'subgraph_v1_seed_neighborhood';
export const DEFAULT_MAX_SEEDS = 8;
export const DEFAULT_MAX_NEIGHBORS = 24;
export const DEFAULT_MAX_HOPS = 1;

export type SeedInputKind = 'query' | 'file' | 'route' | 'symbol' | 'cluster';
export type NeighborhoodNodeKind = 'file' | 'cluster' | 'route' | 'symbol';

export interface SubgraphSeedNeighborhoodInput {
  query?: string | null;
  filePath?: string | null;
  route?: string | null;
  symbol?: string | null;
  maxSeeds?: number;
  maxNeighbors?: number;
  maxHops?: 1 | 2;
}

export interface SubgraphSeedTarget {
  kind: SeedInputKind;
  key: string;
  score: number;
  label: CanonicalFeatureLabel;
  reasons: string[];
  stableKey?: string;
  filePath?: string;
  route?: string;
  symbol?: string;
  clusterId?: number;
}

export interface SubgraphNeighborhoodNode {
  kind: NeighborhoodNodeKind;
  key: string;
  score: number;
  label: CanonicalFeatureLabel;
  reasons: string[];
  stableKey?: string;
  filePath?: string;
  route?: string;
  symbol?: string;
  clusterId?: number;
  pagerank?: number | null;
}

export interface SubgraphSeedNeighborhoodResult {
  version: typeof SUBGRAPH_V1_VERSION;
  contract: {
    query: string | null;
    filePath: string | null;
    route: string | null;
    symbol: string | null;
  };
  caps: {
    maxSeeds: number;
    maxNeighbors: number;
    maxHops: 1 | 2;
  };
  labels: NormalizedLabels;
  primaryFileTargets: string[];
  seeds: SubgraphSeedTarget[];
  neighborhood: SubgraphNeighborhoodNode[];
}

interface RouteContext {
  route: string;
  file?: string | null;
  clusters: number[];
}

interface GraphNeighborhoodDependencies {
  resolveRouteContext(route: string): RouteContext | null;
  expandFileStableKey(stableKey: string, hops: 1 | 2): Promise<string[]>;
  fetchAuthority(stableKeys: string[]): Promise<Record<string, { pagerank: number }>>;
}

const DEFAULT_DEPS: GraphNeighborhoodDependencies = {
  resolveRouteContext(route) {
    const entry = getRouteFeatureMap(route);
    if (!entry) return null;
    return {
      route,
      file: entry.file ?? null,
      clusters: getRouteClusterPriors(route),
    };
  },
  expandFileStableKey(stableKey, hops) {
    return expandNeighbours(stableKey, hops);
  },
  async fetchAuthority(stableKeys) {
    return fetchAuthorityScores(stableKeys);
  },
};

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function toStableFileKey(filePath: string): string {
  return filePath.startsWith('file:') ? filePath : `file:${filePath}`;
}

export function fromStableFileKey(stableKey: string): string {
  return stableKey.startsWith('file:') ? stableKey.slice(5) : stableKey;
}

function scoreClusterSeed(index: number): number {
  return Math.max(0.55, 0.88 - index * 0.04);
}

function scoreNeighbor(pagerank: number | null | undefined, routeAligned: boolean): number {
  const authority = Number.isFinite(pagerank) ? Number(pagerank) : 0;
  const base = 0.55 + Math.min(0.25, authority * 0.25);
  return Math.min(0.95, base + (routeAligned ? 0.08 : 0));
}

function buildLabelInput(input: SubgraphSeedNeighborhoodInput, routeContext: RouteContext | null): LabelNormalizationInput {
  const kind =
    routeContext?.route != null ? 'api-route' :
    cleanText(input.filePath)?.includes('/routes/') ? 'api-route' :
    cleanText(input.symbol) ? 'symbol' :
    cleanText(input.query) ? 'retrieval' :
    'general';

  const primaryCluster = routeContext?.clusters[0];
  const topology = kind === 'api-route' ? 'api-route' : kind === 'symbol' ? 'agent' : 'retrieval';

  return {
    jsonb: {
      feature_family: kind,
      route_type: routeContext?.route ? 'route' : undefined,
      topo_class: topology,
      cluster_key: primaryCluster != null ? `gpu:${primaryCluster}` : undefined,
    },
    centroid: {
      label: primaryCluster != null ? String(primaryCluster) : null,
      topology,
      clusterKey: primaryCluster != null ? `gpu:${primaryCluster}` : null,
    },
    karpathy: {
      bucket: routeContext?.route ? 'warm' : cleanText(input.filePath) ? 'cool' : 'cold',
    },
  };
}

function rankSeedTargets(
  input: SubgraphSeedNeighborhoodInput,
  labels: NormalizedLabels,
  routeContext: RouteContext | null,
  maxSeeds: number,
): SubgraphSeedTarget[] {
  const seeds = new Map<string, SubgraphSeedTarget>();
  const label = normalizeFeatureLabel(labels.feature_family);

  const push = (seed: SubgraphSeedTarget) => {
    const existing = seeds.get(seed.key);
    if (!existing || seed.score > existing.score) seeds.set(seed.key, seed);
  };

  const query = cleanText(input.query);
  const filePath = cleanText(input.filePath) ?? routeContext?.file ?? null;
  const route = cleanText(input.route) ?? routeContext?.route ?? null;
  const symbol = cleanText(input.symbol);

  if (filePath) {
    push({
      kind: 'file',
      key: filePath,
      stableKey: toStableFileKey(filePath),
      filePath,
      score: 1,
      label,
      reasons: ['explicit filePath target'],
    });
  }

  if (route) {
    push({
      kind: 'route',
      key: route,
      route,
      score: 0.98,
      label: 'api-route',
      reasons: ['explicit route target'],
      filePath: routeContext?.file ?? undefined,
    });
  }

  if (symbol) {
    push({
      kind: 'symbol',
      key: symbol,
      symbol,
      score: 0.92,
      label: 'symbol',
      reasons: ['explicit symbol target'],
      filePath: filePath ?? undefined,
    });
  }

  if (query) {
    push({
      kind: 'query',
      key: query,
      score: 0.75,
      label: normalizeFeatureLabel(labels.feature_family),
      reasons: ['free-text query seed'],
    });
  }

  routeContext?.clusters.slice(0, maxSeeds).forEach((clusterId, index) => {
    push({
      kind: 'cluster',
      key: `gpu:${clusterId}`,
      clusterId,
      score: scoreClusterSeed(index),
      label: 'graph',
      reasons: index === 0 ? ['primary route cluster prior'] : ['secondary route cluster prior'],
      route: routeContext.route,
      filePath: routeContext.file ?? undefined,
    });
  });

  return [...seeds.values()]
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, maxSeeds);
}

async function buildNeighborhoodNodes(
  seeds: SubgraphSeedTarget[],
  routeContext: RouteContext | null,
  maxNeighbors: number,
  maxHops: 1 | 2,
  deps: GraphNeighborhoodDependencies,
): Promise<SubgraphNeighborhoodNode[]> {
  const clusterIds = new Set<number>(
    seeds.filter((seed) => seed.clusterId != null).map((seed) => seed.clusterId as number),
  );
  const fileSeeds = seeds
    .filter((seed) => seed.kind === 'file' && seed.stableKey)
    .map((seed) => seed.stableKey as string);

  const neighborhood = new Map<string, SubgraphNeighborhoodNode>();

  for (const clusterId of clusterIds) {
    const node: SubgraphNeighborhoodNode = {
      kind: 'cluster',
      key: `gpu:${clusterId}`,
      clusterId,
      label: 'graph',
      score: scoreClusterSeed(0),
      reasons: ['seed cluster prior'],
      route: routeContext?.route ?? undefined,
      filePath: routeContext?.file ?? undefined,
    };
    neighborhood.set(node.key, node);
  }

  if (fileSeeds.length === 0) {
    return [...neighborhood.values()]
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
      .slice(0, maxNeighbors);
  }

  const expanded = await Promise.all(
    fileSeeds.map((seed) => deps.expandFileStableKey(seed, maxHops).catch(() => [])),
  );
  const stableKeys = [...new Set(expanded.flat().filter(Boolean))].filter(
    (stableKey) => !fileSeeds.includes(stableKey),
  );

  const authority = stableKeys.length
    ? await deps.fetchAuthority(stableKeys).catch(() => ({}))
    : {};

  for (const stableKey of stableKeys) {
    const filePath = fromStableFileKey(stableKey);
    const routeAligned = !!routeContext?.file && filePath.startsWith(routeContext.file.split('/').slice(0, -2).join('/'));
    const pagerank = authority[stableKey]?.pagerank ?? null;
    neighborhood.set(stableKey, {
      kind: 'file',
      key: stableKey,
      stableKey,
      filePath,
      label: routeAligned ? 'api-route' : 'retrieval',
      score: scoreNeighbor(pagerank, routeAligned),
      pagerank,
      reasons: [
        'graph neighbor expansion',
        ...(routeAligned ? ['aligned with route directory'] : []),
        ...(pagerank != null ? [`authority=${pagerank.toFixed(3)}`] : []),
      ],
    });
  }

  return [...neighborhood.values()]
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, maxNeighbors);
}

export async function buildSubgraphV1SeedNeighborhood(
  input: SubgraphSeedNeighborhoodInput,
  deps: Partial<GraphNeighborhoodDependencies> = {},
): Promise<SubgraphSeedNeighborhoodResult> {
  const maxSeeds = Math.max(1, Math.min(DEFAULT_MAX_SEEDS, input.maxSeeds ?? DEFAULT_MAX_SEEDS));
  const maxNeighbors = Math.max(1, Math.min(50, input.maxNeighbors ?? DEFAULT_MAX_NEIGHBORS));
  const maxHops = input.maxHops ?? DEFAULT_MAX_HOPS;
  const liveDeps = { ...DEFAULT_DEPS, ...deps };

  const route = cleanText(input.route);
  const inferredRoute = route ?? (cleanText(input.query)?.startsWith('/') ? cleanText(input.query) : null);
  const routeContext = inferredRoute ? liveDeps.resolveRouteContext(inferredRoute) : null;
  const labels = normalizeLabels(buildLabelInput(input, routeContext));
  const seeds = rankSeedTargets(input, labels, routeContext, maxSeeds);
  const neighborhood = await buildNeighborhoodNodes(
    seeds,
    routeContext,
    maxNeighbors,
    maxHops,
    liveDeps,
  );

  const primaryFileTargets = [...new Set(
    seeds
      .map((seed) => seed.filePath)
      .concat(neighborhood.map((node) => node.filePath))
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )];

  return {
    version: SUBGRAPH_V1_VERSION,
    contract: {
      query: cleanText(input.query),
      filePath: cleanText(input.filePath),
      route: route,
      symbol: cleanText(input.symbol),
    },
    caps: {
      maxSeeds,
      maxNeighbors,
      maxHops,
    },
    labels,
    primaryFileTargets,
    seeds,
    neighborhood,
  };
}
