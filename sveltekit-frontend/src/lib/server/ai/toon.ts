import type { FeatureLabel } from './feature-builder.js';

type MemoryItem = string | { type?: string; value?: string };

function normalizeMemory(memory: MemoryItem[]): string[] {
  return memory
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item.value === 'string') return item.value;
      return '';
    })
    .filter((item) => item.length > 0);
}

export function buildToonPacket({
  query,
  features,
  memory,
}: {
  query: string;
  features: FeatureLabel[];
  memory: MemoryItem[];
}): {
  q: string;
  f: Array<{ p: string; l: string[]; s: string; pr?: string[]; la?: string[]; sr?: string[] }>;
  m: string[];
} {
  return {
    q: query,
    f: features.slice(0, 8).map((feature) => ({
      p: feature.path,
      l: feature.labels.slice(0, 3),
      s: feature.summary,
      pr: feature.protocols ?? [],
      la: feature.languages ?? [],
      sr: feature.sourceRefs ?? [],
    })),
    m: normalizeMemory(memory).slice(-3),
  };
}

export function buildOpenCodeContextPacket({
  goal,
  query,
  features,
  memory,
  files,
}: {
  goal: string;
  query: string;
  features: FeatureLabel[];
  memory: MemoryItem[];
  files?: Array<{ path: string; lines: string; change: string }>;
}): {
  goal: string;
  context: {
    query: string;
    features: Array<{ path: string; labels: string[]; summary: string; protocols?: string[]; languages?: string[]; sourceRefs?: string[] }>;
    memory: Array<{ type: string; value: string }>;
  };
  files: Array<{ path: string; lines: string; change: string }>;
  constraints: string[];
  mcp: { tools_used: string[]; notes: string };
  plan: string[];
} {
  return {
    goal,
    context: {
      query,
      features: features.slice(0, 8).map((feature) => ({
        path: feature.path,
        labels: feature.labels.slice(0, 3),
        summary: feature.summary,
        protocols: feature.protocols ?? [],
        languages: feature.languages ?? [],
        sourceRefs: feature.sourceRefs ?? [],
      })),
      memory: normalizeMemory(memory)
        .slice(-3)
        .map((value) => ({ type: 'recent', value })),
    },
    files: files ?? [],
    constraints: [
      'Must use SvelteKit server routes',
      'Must use MCP POST JSON-RPC',
      'Must not call LLM outside Bifrost route chain',
      'Must keep Redis writes under 10ms budget target',
      'Must preserve prompt prefix stability',
    ],
    mcp: {
      tools_used: [
        'trace.kag_search',
        'graph.expand_neighborhood',
        'engram.ace_packet_inject',
        'engram.chat_memory_store',
      ],
      notes: 'All tools invoked through MCP JSON-RPC transport',
    },
    plan: [
      'Call trace.kag_search',
      'Expand graph multi-hop neighborhood',
      'Build feature labels',
      'Rerank features',
      'Build TOON packet',
      'Call Bifrost route chain',
      'Stream via SSE',
      'Persist memory to Redis',
    ],
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 2);
}

export type RerankBreakdownItem = {
  path: string;
  baseScore: number;
  tokenOverlap: number;
  overlapBoost: number;
  summaryBoost: number;
  finalScore: number;
};

export function rerankFeaturesWithBreakdown(
  query: string,
  features: FeatureLabel[]
): {
  features: FeatureLabel[];
  breakdown: RerankBreakdownItem[];
} {
  const queryTokens = new Set(tokenize(query));
  const baseWeight = 0.45;

  const scored = [...features]
    .map((feature) => {
      const labelText = [...feature.labels, feature.feature, feature.summary].join(' ');
      const labelTokens = tokenize(labelText);
      const tokenOverlap = labelTokens.filter((token) => queryTokens.has(token)).length;
      const overlapBoost = tokenOverlap * 0.22;
      const summaryBoost = feature.summary.length > 0 ? 0.05 : 0;
      const baseScore = feature.score ?? 0;
      const rerankScore = baseScore * baseWeight + overlapBoost + summaryBoost;
      const finalScore = Math.round(rerankScore * 1_000_000) / 1_000_000;

      return {
        feature: {
          ...feature,
          score: finalScore,
        },
        detail: {
          path: feature.path,
          baseScore,
          tokenOverlap,
          overlapBoost,
          summaryBoost,
          finalScore,
        } satisfies RerankBreakdownItem,
      };
    })
    .sort((a, b) => b.feature.score - a.feature.score);

  return {
    features: scored.map((entry) => entry.feature),
    breakdown: scored.map((entry) => entry.detail),
  };
}

export function rerankFeatures(query: string, features: FeatureLabel[]): FeatureLabel[] {
  return rerankFeaturesWithBreakdown(query, features).features;
}

