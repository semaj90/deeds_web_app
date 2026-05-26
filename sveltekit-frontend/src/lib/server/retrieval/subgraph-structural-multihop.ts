import { fromStableFileKey, type SubgraphSeedNeighborhoodInput, type SubgraphSeedNeighborhoodResult } from '$lib/server/retrieval/subgraph-seed-neighborhood.js';
import { buildSubgraphV1SeedNeighborhood } from '$lib/server/retrieval/subgraph-seed-neighborhood.js';
import { normalizeFeatureLabel } from '$lib/server/labels/feature-label-registry.js';
import { expandNeighbours, fetchAuthorityScores } from '$lib/server/search/neo4j-rerank.js';

export const SUBGRAPH_V2_VERSION = 'subgraph_v2_structural_multihop';
export const DEFAULT_MAX_NODES = 64;
export const DEFAULT_MAX_CYCLES = 12;
export const DEFAULT_MAX_HOPS = 3;

export type StructuralChainKind = 'route' | 'service' | 'schema';
export type StructuralIssueCode =
  | 'missing_seed'
  | 'missing_route_chain'
  | 'missing_service_chain'
  | 'missing_schema_chain'
  | 'node_cap_reached'
  | 'cycle_detected'
  | 'hop_cap_reached'
  | 'expansion_failure';

export interface StructuralIssue {
  code: StructuralIssueCode;
  severity: 'info' | 'warning' | 'error';
  message: string;
  recommendation: string;
  scope?: string;
}

export interface StructuralChainNode {
  kind: StructuralChainKind;
  stableKey: string;
  filePath: string;
  score: number;
  hop: number;
  label: string;
  reasons: string[];
  route?: string;
  symbol?: string;
  clusterId?: number;
  pagerank?: number | null;
}

export interface StructuralChainEdge {
  from: string;
  to: string;
  hop: number;
  reasons: string[];
}

export interface StructuralChain {
  kind: StructuralChainKind;
  nodes: StructuralChainNode[];
}

export interface SubgraphStructuralMultihopInput extends SubgraphSeedNeighborhoodInput {
  maxNodes?: number;
  maxCycles?: number;
}

export interface SubgraphStructuralMultihopResult {
  version: typeof SUBGRAPH_V2_VERSION;
  contract: {
    query: string | null;
    filePath: string | null;
    route: string | null;
    symbol: string | null;
  };
  caps: {
    maxSeeds: number;
    maxNeighbors: number;
    maxHops: number;
    maxNodes: number;
    maxCycles: number;
  };
  seed: SubgraphSeedNeighborhoodResult;
  nodes: StructuralChainNode[];
  edges: StructuralChainEdge[];
  chains: Record<StructuralChainKind, StructuralChain>;
  issues: StructuralIssue[];
  recommendations: string[];
  diagnostics: {
    visitedCount: number;
    frontierCount: number;
    cycleCount: number;
    truncated: boolean;
    hopCount: number;
  };
}

interface StructuralMultihopDependencies {
  expandFileStableKey(stableKey: string, hop: 1 | 2): Promise<string[]>;
  fetchAuthority(stableKeys: string[]): Promise<Record<string, { pagerank: number }>>;
}

const DEFAULT_DEPS: StructuralMultihopDependencies = {
  expandFileStableKey(stableKey, hop) {
    return expandNeighbours(stableKey, hop);
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

function toStableFileKey(filePath: string): string {
  return filePath.startsWith('file:') ? filePath : `file:${filePath}`;
}

function classifyFile(filePath: string): StructuralChainKind {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (
    normalized.includes('/schema') ||
    normalized.includes('/db/schema') ||
    normalized.includes('.schema.') ||
    normalized.endsWith('schema.ts')
  ) {
    return 'schema';
  }
  if (
    normalized.includes('/routes/') ||
    normalized.includes('/route/') ||
    normalized.endsWith('/+server.ts') ||
    normalized.endsWith('/+page.ts') ||
    normalized.endsWith('/+layout.ts')
  ) {
    return 'route';
  }
  return 'service';
}

function buildRecommendation(issue: StructuralIssue): string {
  return issue.recommendation;
}

function issueFromCategory(code: StructuralIssueCode, scope: string, message: string, recommendation: string, severity: 'info' | 'warning' | 'error' = 'warning'): StructuralIssue {
  return { code, scope, message, recommendation, severity };
}

export async function buildSubgraphV2StructuralMultihop(
  input: SubgraphStructuralMultihopInput,
  deps: Partial<StructuralMultihopDependencies> = {},
): Promise<SubgraphStructuralMultihopResult> {
  const maxSeeds = Math.max(1, Math.min(8, input.maxSeeds ?? 8));
  const maxNeighbors = Math.max(1, Math.min(50, input.maxNeighbors ?? 24));
  const maxHops = Math.max(1, Math.min(DEFAULT_MAX_HOPS, input.maxHops ?? DEFAULT_MAX_HOPS));
  const maxNodes = Math.max(1, Math.min(128, input.maxNodes ?? DEFAULT_MAX_NODES));
  const maxCycles = Math.max(0, Math.min(64, input.maxCycles ?? DEFAULT_MAX_CYCLES));
  const liveDeps = { ...DEFAULT_DEPS, ...deps };

  const seed = await buildSubgraphV1SeedNeighborhood({
    ...input,
    maxSeeds,
    maxNeighbors,
    maxHops: maxHops >= 2 ? 2 : 1,
  });

  const issues: StructuralIssue[] = [];
  const edges: StructuralChainEdge[] = [];
  const nodes = new Map<string, StructuralChainNode>();
  const visited = new Set<string>();
  const frontierSeeds = new Set<string>();

  const seedFileTargets = seed.primaryFileTargets.slice(0, maxNodes);
  for (const filePath of seedFileTargets) {
    const stableKey = toStableFileKey(filePath);
    frontierSeeds.add(stableKey);
    visited.add(stableKey);
    nodes.set(stableKey, {
      kind: classifyFile(filePath),
      stableKey,
      filePath,
      score: 1,
      hop: 0,
      label: normalizeFeatureLabel(seed.labels.feature_family),
      reasons: ['seed file target'],
    });
  }

  if (frontierSeeds.size === 0) {
    const issue = issueFromCategory(
      'missing_seed',
      'seed',
      'No structural seed file targets were discovered.',
      'Pass filePath, route, or symbol so the multihop walk has a stable anchor.',
      'error',
    );
    issues.push(issue);
    return finalize(seed, nodes, edges, issues, maxSeeds, maxNeighbors, maxHops, maxNodes, maxCycles, 0, 0, true);
  }

  let cycleCount = 0;
  let truncated = false;
  let hopCount = 0;
  let frontier = [...frontierSeeds];

  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    hopCount = hop;
    const layerExpanded = await Promise.all(
      frontier.map((stableKey) =>
        liveDeps.expandFileStableKey(stableKey, 1).catch(() => {
          issues.push(issueFromCategory(
            'expansion_failure',
            stableKey,
            `Failed to expand neighborhood for ${stableKey}.`,
            'Check Neo4j connectivity or narrow the seed to a file that exists in the import graph.',
            'warning',
          ));
          return [] as string[];
        })),
    );

    const candidateKeys = [...new Set(layerExpanded.flat().filter(Boolean))];
    const nextFrontier: string[] = [];
    const unseenKeys: string[] = [];

    for (const stableKey of candidateKeys) {
      if (visited.has(stableKey)) {
        cycleCount += 1;
        if (cycleCount <= maxCycles) {
          issues.push(issueFromCategory(
            'cycle_detected',
            stableKey,
            `Cycle detected while expanding ${stableKey}.`,
            'Reduce maxHops or pass a narrower anchor (route/filePath) to avoid revisiting the same import neighborhood.',
            'warning',
          ));
        }
        continue;
      }
      unseenKeys.push(stableKey);
      nextFrontier.push(stableKey);
      visited.add(stableKey);
    }

    if (unseenKeys.length === 0) {
      break;
    }

    const authority = await liveDeps.fetchAuthority(unseenKeys).catch(() => ({}));

    for (const stableKey of unseenKeys) {
      if (nodes.size >= maxNodes) {
        truncated = true;
        issues.push(issueFromCategory(
          'node_cap_reached',
          stableKey,
          `Node cap of ${maxNodes} reached while expanding the structural multihop graph.`,
          'Increase maxNodes only after narrowing the seed contract or lowering maxHops.',
          'warning',
        ));
        break;
      }

      const filePath = fromStableFileKey(stableKey);
    const kind = classifyFile(filePath);
      const pagerank = authority[stableKey]?.pagerank ?? null;
      const score = Math.min(0.95, 0.58 + Math.min(0.25, (pagerank ?? 0) * 0.25) + (kind === 'route' ? 0.05 : 0));
      const node: StructuralChainNode = {
        kind,
        stableKey,
        filePath,
        score,
        hop,
        label: normalizeFeatureLabel(
          kind === 'route'
            ? 'api-route'
            : kind === 'schema'
              ? 'database'
              : seed.labels.feature_family,
        ),
        reasons: [
          'structural multihop expansion',
          ...(pagerank != null ? [`authority=${pagerank.toFixed(3)}`] : []),
        ],
        pagerank,
      };
      nodes.set(stableKey, node);
    }

    for (const stableKey of nextFrontier) {
      for (const parent of frontier) {
        edges.push({
          from: parent,
          to: stableKey,
          hop,
          reasons: ['import-neighbor expansion'],
        });
      }
    }

    frontier = nextFrontier;
    if (nodes.size >= maxNodes) {
      truncated = true;
      break;
    }
  }

  if (hopCount >= maxHops && frontier.length > 0) {
    issues.push(issueFromCategory(
      'hop_cap_reached',
      'hop-cap',
      `Reached the hop cap of ${maxHops} before frontier exhaustion.`,
      'Raise maxHops only if the graph remains sparse after route/filePath narrowing.',
      'info',
    ));
  }

  const chainBuckets: Record<StructuralChainKind, StructuralChainNode[]> = {
    route: [],
    service: [],
    schema: [],
  };

  for (const node of nodes.values()) {
    chainBuckets[node.kind].push(node);
  }

  for (const kind of Object.keys(chainBuckets) as StructuralChainKind[]) {
    if (chainBuckets[kind].length === 0) {
      const recommendation =
        kind === 'route'
          ? 'Pass a route or seed a file under src/routes so the route chain can anchor.'
          : kind === 'schema'
            ? 'Include a db/schema file or vector index file in the seed so the schema chain is visible.'
            : 'Include a service module under src/lib/server or widen the seed to traverse service files.';

      const issueCode =
        kind === 'route'
          ? 'missing_route_chain'
          : kind === 'schema'
            ? 'missing_schema_chain'
            : 'missing_service_chain';

      issues.push(issueFromCategory(
        issueCode,
        kind,
        `No ${kind} chain was discovered in the structural multihop expansion.`,
        recommendation,
        'warning',
      ));
    }
  }

  const recommendations = [...new Set(issues.map(buildRecommendation))];

  return finalize(
    seed,
    nodes,
    edges,
    issues,
    maxSeeds,
    maxNeighbors,
    maxHops,
    maxNodes,
    maxCycles,
    cycleCount,
    hopCount,
    truncated,
    recommendations,
    chainBuckets,
  );
}

function finalize(
  seed: SubgraphSeedNeighborhoodResult,
  nodes: Map<string, StructuralChainNode>,
  edges: StructuralChainEdge[],
  issues: StructuralIssue[],
  maxSeeds: number,
  maxNeighbors: number,
  maxHops: number,
  maxNodes: number,
  maxCycles: number,
  cycleCount: number,
  hopCount: number,
  truncated: boolean,
  recommendations: string[] = [...new Set(issues.map(buildRecommendation))],
  chainBuckets: Record<StructuralChainKind, StructuralChainNode[]> = {
    route: [],
    service: [],
    schema: [],
  },
): SubgraphStructuralMultihopResult {
  if (seed.primaryFileTargets.length === 0 && !issues.some((issue) => issue.code === 'missing_seed')) {
    issues.push(issueFromCategory(
      'missing_seed',
      'seed',
      'Seed neighborhood did not produce any primary file targets.',
      'Pass filePath or route so the structural multihop graph has a deterministic starting point.',
      'error',
    ));
  }

  const liveRecommendations = recommendations.length
    ? recommendations
    : [...new Set(issues.map(buildRecommendation))];

  return {
    version: SUBGRAPH_V2_VERSION,
    contract: seed.contract,
    caps: {
      maxSeeds,
      maxNeighbors,
      maxHops,
      maxNodes,
      maxCycles,
    },
    seed,
    nodes: [...nodes.values()].sort((a, b) => b.score - a.score || a.stableKey.localeCompare(b.stableKey)),
    edges,
    chains: {
      route: { kind: 'route', nodes: chainBuckets.route.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath)) },
      service: { kind: 'service', nodes: chainBuckets.service.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath)) },
      schema: { kind: 'schema', nodes: chainBuckets.schema.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath)) },
    },
    issues,
    recommendations: liveRecommendations,
    diagnostics: {
      visitedCount: nodes.size,
      frontierCount: edges.length ? new Set(edges.map((edge) => edge.to)).size : 0,
      cycleCount,
      truncated,
      hopCount,
    },
  };
}
