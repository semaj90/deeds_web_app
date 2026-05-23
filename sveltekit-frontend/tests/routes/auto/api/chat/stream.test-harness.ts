import { vi } from 'vitest';

const _chatStreamMocks = vi.hoisted(() => ({
  mockAcquireGpuLease: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSetex: vi.fn(),
  mockRedisZrevrange: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockCallTraceMcp: vi.fn(),
  mockRankIntent: vi.fn(),
  mockMacroRerank: vi.fn((items: unknown[]) => items),
  mockRecallEngramsForIntent: vi.fn(),
  mockRetrieveSummaryCards: vi.fn(),
  mockGetPrefixToken: vi.fn(),
  mockStreamBifrost: vi.fn(),
  mockRunWorkflowLoop: vi.fn(),
}));

export const chatStreamMocks = _chatStreamMocks;

vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
  acquireGpuLease: chatStreamMocks.mockAcquireGpuLease,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    get: chatStreamMocks.mockRedisGet,
    setex: chatStreamMocks.mockRedisSetex,
    zrevrange: chatStreamMocks.mockRedisZrevrange,
  }),
}));

vi.mock('$lib/server/ai/intent-ranker.js', () => ({
  rankIntent: chatStreamMocks.mockRankIntent,
  macroRerank: chatStreamMocks.mockMacroRerank,
  recallEngramsForIntent: chatStreamMocks.mockRecallEngramsForIntent,
}));

vi.mock('$lib/server/ai/error-agent/workflow-loop.js', () => ({
  runWorkflowLoop: chatStreamMocks.mockRunWorkflowLoop,
}));

vi.mock('$lib/server/retrieval/summary-card-retrieval.js', () => ({
  retrieveSummaryCards: chatStreamMocks.mockRetrieveSummaryCards,
}));

vi.mock('$lib/server/ai/bifrost-cache-manager.js', () => ({
  BifrostCacheManager: {
    getPrefixToken: chatStreamMocks.mockGetPrefixToken,
  },
}));

vi.mock('$lib/server/bifrost/client.js', () => ({
  streamBifrostChatCompletions: chatStreamMocks.mockStreamBifrost,
}));

vi.mock('$lib/server/mcp/trace-http.js', () => ({
  callTraceMcp: chatStreamMocks.mockCallTraceMcp,
}));

vi.mock('$lib/server/ai/feature-builder.js', () => ({
  buildFeatureLabels: vi.fn().mockReturnValue([]),
}));

vi.mock('$lib/server/ai/engram-registry.js', () => ({
  storeChatMemoryTurn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    update: chatStreamMocks.mockDbUpdate,
  },
}));

vi.mock('$lib/server/db/schema', () => ({
  chatMessages: {},
  chatMetadata: {},
  intentEvalRuns: {},
}));

export function resetChatStreamMocks(): void {
  vi.resetAllMocks();

  chatStreamMocks.mockAcquireGpuLease.mockResolvedValue(null);
  chatStreamMocks.mockRedisSetex.mockResolvedValue('OK');
  chatStreamMocks.mockRedisZrevrange.mockResolvedValue([]);
  chatStreamMocks.mockDbUpdate.mockReturnValue({
    set: () => ({ where: async () => [] }),
  });
  chatStreamMocks.mockRankIntent.mockResolvedValue({
    queryHash: 'hash1',
    decision: 'run_retrieval',
    confidence: 0.9,
    rankedCandidates: [],
    rankingLoss: {
      bestDecision: 'run_retrieval',
      margin: 0.1,
      entropy: 0.2,
      negativeLogLikelihood: 0.1,
    },
    intentLabel: 'contracts',
    intentConfidence: 0.91,
    didYouMean: [],
    selectedFeatureInputs: {},
    cacheKeys: [],
    evalTraceId: 'run-1',
  });
  chatStreamMocks.mockRecallEngramsForIntent.mockResolvedValue([]);
  chatStreamMocks.mockRunWorkflowLoop.mockResolvedValue({
    status: 'ok',
    classification: { lane: 'general', riskScore: 0.1 },
    repair: { suggestedFixes: [] },
    smoke: null,
  });
  chatStreamMocks.mockCallTraceMcp.mockResolvedValue({ ok: false, ms: 0, data: null, error: 'not-configured' });
  chatStreamMocks.mockGetPrefixToken.mockResolvedValue('ptok');
  chatStreamMocks.mockStreamBifrost.mockImplementation(async function* () {
    yield { type: 'token', content: 'cached-packet-answer' };
    yield { type: 'done' };
  });
}

export function mockAceCacheMisses(): void {
  chatStreamMocks.mockRedisGet.mockImplementation(async (key: string) => {
    if (key.startsWith('ace:completion:')) return null;
    if (key.startsWith('ace:packet:')) return null;
    if (key.startsWith('ace:feature:')) return null;
    if (key.startsWith('ace:ctx:')) return null;
    return null;
  });
}

type SummaryCard = {
  cardKey: string;
  path: string;
  summaryType: string;
  summary: string;
  labels: string[];
  tools: unknown[];
  graphNeighbors: string[];
  qdrantScore: number;
  score: number;
};

export function makeSummaryCard(overrides: Partial<SummaryCard>): SummaryCard {
  return {
    cardKey: overrides.cardKey ?? 'card-1',
    path: overrides.path ?? 'src/lib/a.ts',
    summaryType: overrides.summaryType ?? 'api',
    summary: overrides.summary ?? 'summary',
    labels: overrides.labels ?? ['contracts'],
    tools: overrides.tools ?? [],
    graphNeighbors: overrides.graphNeighbors ?? [],
    qdrantScore: overrides.qdrantScore ?? 0.8,
    score: overrides.score ?? 0.8,
  };
}

export function makeSummaryCardsResponse(args: {
  cacheKey: string;
  source?: string;
  cacheHit?: boolean;
  cards: SummaryCard[];
}) {
  return {
    cacheHit: args.cacheHit ?? false,
    cacheKey: args.cacheKey,
    source: args.source ?? 'qdrant',
    cards: args.cards,
  };
}
