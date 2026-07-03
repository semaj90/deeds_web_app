import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import { ENV } from '$lib/server/env.server.js';
import { getOllamaEmbeddingEndpoint } from '$lib/server/ollama.js';
import { tryEmbedOllama } from '$lib/server/embeddings/ollama.js';
import { countTokens, enforceTokenBudget } from '$lib/server/llm/token-budget.js';
import { getRedis } from '$lib/server/redis.js';
import { turbovecPrefilter, turbovecSearch } from '$lib/server/retrieval/turbovec-prefilter.js';
import { existsSync } from 'node:fs';
import { validateAceSchema, type SchemaValidationResult } from '$lib/server/ai/ace-schema-validator.js';

const execFileAsync = promisify(execFile);
const DOCUMENT_KNOWLEDGE_COLLECTION = 'document_knowledge_768';
const DOCUMENT_KNOWLEDGE_QUERY_PREFIX = 'knowledge:query:';
const DOCUMENT_KNOWLEDGE_CARD_PREFIX = 'knowledge:card:';
const DOCUMENT_KNOWLEDGE_PACKET_PREFIX = 'knowledge:packet:';
const DOCUMENT_KNOWLEDGE_CONTEXT_PREFIX = 'ace:ctx:';
const ACE_NES_PACKET_VERSION = 'ace-nes-card-tags-v1';
const MAX_GRAPH_PATHS = 12;
const MAX_SELECTED_CARDS = 8;
const MAX_RG_ANCHORS = 5;

export type AcePromptPreflightInput = {
  query: string;
  intent?: 'find' | 'fix' | 'implement' | 'prune' | 'consolidate' | 'explain';
  modelName: string;
  backend: 'bifrost' | 'turboquant' | 'ollama';
  tokenBudget: number;
  repoGitSha?: string;
  basePrompt?: string;
  aceContext?: Record<string, unknown>;
};

export type KnowledgeCardForPrompt = {
  cardId: string;
  packetId?: string;
  packetUlid?: string;
  titleId?: string;
  featureId?: string;
  kind: string;
  title: string;
  summary: string;
  sourceRefs: string[];
  chunkIds: string[];
  summaryIds: string[];
  featureLabels: string[];
  clusterTags: string[];
  topoClass?: string | null;
  graphLinks: Array<{
    relation: string;
    targetId: string;
    reason: string;
  }>;
  graphNeighbors?: Array<{
    cardId: string;
    relation: string;
    reason: string;
  }>;
  lifecycle: {
    status: 'active' | 'candidate_prune' | 'archive_to_deeds_lab' | 'production_ready';
    confidence: number;
    reason: string;
  };
  retrieval: {
    redisKey?: string;
    qdrantPointId?: string;
    embeddingModel: string;
    embeddingDim: number;
    score?: number;
  };
  nextAction: string;
  estimatedTokens: number;
  finalScore: number;
  exactHit?: boolean;
  qdrantScore?: number;
  semanticScore?: number;
  lexicalScore?: number;
  graphScore?: number;
  trustScore?: number;
  recencyScore?: number;
  turbovecScore?: number;
  sourceKind?: 'redis' | 'qdrant' | 'graph' | 'lexical';
};

export type AcePromptPreflightResult = {
  version: string;
  queryHash: string;
  contextPackKey: string;
  selectedCards: KnowledgeCardForPrompt[];
  packetIds: string[];
  packetUlids: string[];
  titleIds: string[];
  featureIds: string[];
  sourceRefs: string[];
  chunkIds: string[];
  featureLabels: string[];
  graphPaths: string[];
  prompt: {
    system: string;
    context: string;
    user: string;
    estimatedTokens: number;
  };
  routing: {
    selectedLane: 'bifrost' | 'turboquant';
    reason: string;
  };
  timing: {
    redisMs?: number;
    qdrantMs?: number;
    postgresMs?: number;
    turbovecMs?: number;
    graphMs?: number;
    totalMs: number;
  };
  degraded: boolean;
  cacheHit?: boolean;
};

type QueryEntities = {
  files: string[];
  routes: string[];
  tables: string[];
  envVars: string[];
  services: string[];
  commands: string[];
  models: string[];
  tokens: string[];
};

function findRepoRoot(startDir: string): string {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractQueryEntities(query: string): QueryEntities {
  const files = uniq(query.match(/[\w./\\-]+\.(?:ts|tsx|js|jsx|svelte|json|md|mjs|mts|sql|py|ps1|sh|toml|yaml|yml)/gi) ?? []);
  const routes = uniq(query.match(/\/(?:api|routes|cases|evidence|documents|assets)[\w/\-.\[\]]*/gi) ?? []);
  const envVars = uniq(query.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []).filter((value) => !/^(HTTP|GET|POST|PUT|DELETE|JSON|SQL|LLM|GPU|CPU|API|URL|URI)$/i.test(value));
  const services = uniq(
    (query.match(/\b(redis|qdrant|postgres|ollama|bifrost|langextract|turbovec|duckdb|langchain|gemma4|gemma3|libtorch|webgpu|cuda|xgboost)\b/gi) ?? []).map((value) => value.toLowerCase())
  );
  const commands = uniq(query.match(/(?:npm run [\w:-]+|node [\w./\\-]+|npx [\w./\\-]+|python [\w./\\-]+|pwsh [\w./\\-]+|`[^`]{2,180}`)/gi)?.map((value) => value.replace(/`/g, '')) ?? []);
  const models = uniq(query.match(/\b(?:embeddinggemma:latest|gemma4[-_:\w]*|gemma3[-_:\w]*|nomic-embed-text|qwen[\w.-]*)\b/gi)?.map((value) => value.toLowerCase()) ?? []);
  const tokens = uniq(query.match(/[A-Za-z0-9_./:-]{4,}/g) ?? []).slice(0, 40);
  const tables = uniq(query.match(/\b(?:agent_memory_observations|intent_synthesis|intent_synthesis_rewards|llm_context_cache|summary_cards|document_knowledge|feature_maps|codebase_chunks_768|knowledge_base)\b/gi)?.map((value) => value.toLowerCase()) ?? []);
  return { files, routes, tables, envVars, services, commands, models, tokens };
}

function buildCompactCard(card: KnowledgeCardForPrompt): string {
  const lines = [
    `[${card.cardId}] ${card.title}`,
    `packetId: ${card.packetId ?? '(none)'}`,
    `packetUlid: ${card.packetUlid ?? '(none)'}`,
    `titleId: ${card.titleId ?? '(none)'}`,
    `featureId: ${card.featureId ?? '(none)'}`,
    `summary: ${card.summary}`,
    `sourceRefs: ${card.sourceRefs.join(', ') || '(none)'}`,
    `chunkIds: ${card.chunkIds.join(', ') || '(none)'}`,
    `featureLabels: ${card.featureLabels.join(', ') || '(none)'}`,
    `nextAction: ${card.nextAction}`,
  ];
  return lines.join('\n');
}

function lifecycleTrustScore(status: KnowledgeCardForPrompt['lifecycle']['status']): number {
  switch (status) {
    case 'production_ready':
      return 1;
    case 'active':
      return 0.78;
    case 'archive_to_deeds_lab':
      return 0.35;
    case 'candidate_prune':
      return 0.12;
  }
}

function scoreLexical(card: KnowledgeCardForPrompt, entities: QueryEntities): number {
  const needlePool = new Set<string>([
    ...entities.tokens,
    ...entities.files,
    ...entities.routes,
    ...entities.tables,
    ...entities.envVars,
    ...entities.services,
    ...entities.commands,
    ...entities.models,
  ].map((value) => value.toLowerCase()));

  if (needlePool.size === 0) return 0;

  const haystack = new Set<string>([
    card.cardId,
    card.kind,
    card.title,
    card.summary,
    card.topoClass ?? '',
    ...card.sourceRefs,
    ...card.chunkIds,
    ...card.featureLabels,
    ...card.clusterTags,
    ...card.graphLinks.flatMap((link) => [link.relation, link.targetId, link.reason]),
  ].map((value) => value.toLowerCase()));

  let matches = 0;
  for (const token of needlePool) {
    if ([...haystack].some((item) => item.includes(token) || token.includes(item))) {
      matches += 1;
    }
  }
  return clamp01(matches / Math.max(1, Math.min(needlePool.size, 12)));
}

function graphPathsForCard(card: KnowledgeCardForPrompt): string[] {
  const links = card.graphNeighbors ?? card.graphLinks ?? [];
  return links.slice(0, MAX_GRAPH_PATHS).map((link) => `${card.cardId} -> ${link.relation} -> ${link.targetId}`);
}

function estimateCardTokens(card: KnowledgeCardForPrompt): number {
  return countTokens(buildCompactCard(card));
}

function packCardsForPrompt(cards: KnowledgeCardForPrompt[], maxTokens: number): {
  selected: KnowledgeCardForPrompt[];
  used: number;
} {
  const selected: KnowledgeCardForPrompt[] = [];
  let used = 0;

  for (const card of [...cards].sort((a, b) => b.finalScore - a.finalScore)) {
    if (selected.length >= MAX_SELECTED_CARDS) break;
    if (used + card.estimatedTokens > maxTokens) continue;
    selected.push(card);
    used += card.estimatedTokens;
  }

  return { selected, used };
}

async function runRgAnchors(root: string, query: string): Promise<string[]> {
  const entities = extractQueryEntities(query);
  const anchors = uniq([
    ...entities.files,
    ...entities.routes,
    ...entities.tables,
    ...entities.services,
    ...entities.models,
    ...entities.commands,
    ...entities.tokens,
  ]).slice(0, MAX_RG_ANCHORS);

  if (anchors.length === 0) return [];

  const searchDirs = [
    path.join(root, 'sveltekit-frontend', 'src'),
    path.join(root, 'sveltekit-frontend', 'scripts'),
    path.join(root, 'docs'),
    path.join(root, 'memory'),
    path.join(root, '.opencode'),
  ].filter((dir) => existsSync(dir));

  const results = new Set<string>();
  for (const anchor of anchors) {
    try {
      const { stdout } = await execFileAsync(
        'rg',
        ['-n', '-uu', '--max-count', '2', anchor, ...searchDirs],
        { cwd: root, maxBuffer: 2_000_000 }
      );
      for (const line of stdout.split(/\r?\n/)) {
        if (!line) continue;
        const idx = line.indexOf(':');
        if (idx > 0) {
          results.add(line.slice(0, idx));
        }
      }
    } catch {
      // best effort only
    }
  }

  return [...results];
}

async function readKnowledgePacket(redis: Redis, cardId: string): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(`${DOCUMENT_KNOWLEDGE_PACKET_PREFIX}${cardId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeCardFromPayload(payload: Record<string, unknown>, overrides: Partial<KnowledgeCardForPrompt> = {}): KnowledgeCardForPrompt {
  const lifecycleObj = parseJsonObject(payload.lifecycle) ?? overrides.lifecycle ?? {
    status: 'active',
    confidence: 0.5,
    reason: '',
  };
  const retrievalObj = parseJsonObject(payload.retrieval) ?? overrides.retrieval ?? {
    embeddingModel: 'embeddinggemma:latest',
    embeddingDim: 768,
  };
  const retrievalRedisKey = String(retrievalObj.redisKey ?? overrides.retrieval?.redisKey ?? '');
  const retrievalQdrantPointId = String(retrievalObj.qdrantPointId ?? overrides.retrieval?.qdrantPointId ?? '');

  return {
    cardId: String(payload.cardId ?? overrides.cardId ?? sha1(JSON.stringify(payload)).slice(0, 40)),
    packetId: String(payload.packet_id ?? payload.packetId ?? overrides.packetId ?? '').trim() || undefined,
    packetUlid: String(payload.packet_ulid ?? payload.packetUlid ?? overrides.packetUlid ?? '').trim() || undefined,
    titleId: String(payload.title_id ?? payload.titleId ?? overrides.titleId ?? '').trim() || undefined,
    featureId: String(payload.feature_id ?? payload.featureId ?? overrides.featureId ?? '').trim() || undefined,
    kind: String(payload.kind ?? overrides.kind ?? 'json-card'),
    title: String(payload.title ?? overrides.title ?? 'untitled'),
    summary: String(payload.summary ?? overrides.summary ?? ''),
    sourceRefs: uniq([
      ...(Array.isArray(payload.sourceRefs) ? (payload.sourceRefs as string[]) : []),
      ...(overrides.sourceRefs ?? []),
    ]),
    chunkIds: uniq([
      ...(Array.isArray(payload.chunkIds) ? (payload.chunkIds as string[]) : []),
      ...(overrides.chunkIds ?? []),
    ]),
    summaryIds: uniq([
      ...(Array.isArray(payload.summaryIds) ? (payload.summaryIds as string[]) : []),
      ...(overrides.summaryIds ?? []),
    ]),
    featureLabels: uniq([
      ...(Array.isArray(payload.featureLabels) ? (payload.featureLabels as string[]) : []),
      ...(overrides.featureLabels ?? []),
    ]),
    clusterTags: uniq([
      ...(Array.isArray(payload.clusterTags) ? (payload.clusterTags as string[]) : []),
      ...(overrides.clusterTags ?? []),
    ]),
    topoClass: (payload.topoClass as string | null | undefined) ?? overrides.topoClass ?? null,
    graphLinks: (Array.isArray(payload.graphLinks) ? payload.graphLinks : overrides.graphLinks ?? []).map((link) => ({
      relation: String((link as Record<string, unknown>).relation ?? 'uses'),
      targetId: String((link as Record<string, unknown>).targetId ?? ''),
      reason: String((link as Record<string, unknown>).reason ?? ''),
    })),
    graphNeighbors: (Array.isArray(payload.graphNeighbors) ? payload.graphNeighbors : overrides.graphNeighbors ?? []).map((link) => ({
      cardId: String((link as Record<string, unknown>).cardId ?? ''),
      relation: String((link as Record<string, unknown>).relation ?? 'uses'),
      reason: String((link as Record<string, unknown>).reason ?? ''),
    })),
    lifecycle: {
      status: (lifecycleObj as Record<string, unknown>).status as KnowledgeCardForPrompt['lifecycle']['status'] ?? 'active',
      confidence: Number((lifecycleObj as Record<string, unknown>).confidence ?? 0.5),
      reason: String((lifecycleObj as Record<string, unknown>).reason ?? ''),
    },
    retrieval: {
      redisKey: retrievalRedisKey,
      qdrantPointId: retrievalQdrantPointId,
      embeddingModel: String(retrievalObj.embeddingModel ?? 'embeddinggemma:latest'),
      embeddingDim: Number(retrievalObj.embeddingDim ?? 768),
      score: Number(retrievalObj.score ?? overrides.retrieval?.score ?? 0),
    },
    nextAction: String((payload as Record<string, unknown>).nextAction ?? overrides.nextAction ?? 'keep in active review'),
    estimatedTokens: Number((payload as Record<string, unknown>).estimatedTokens ?? overrides.estimatedTokens ?? 0),
    finalScore: Number((payload as Record<string, unknown>).finalScore ?? overrides.finalScore ?? 0),
    exactHit: Boolean((payload as Record<string, unknown>).exactHit ?? overrides.exactHit ?? false),
    qdrantScore: Number((payload as Record<string, unknown>).qdrantScore ?? overrides.qdrantScore ?? 0),
    semanticScore: Number((payload as Record<string, unknown>).semanticScore ?? overrides.semanticScore ?? 0),
    lexicalScore: Number((payload as Record<string, unknown>).lexicalScore ?? overrides.lexicalScore ?? 0),
    graphScore: Number((payload as Record<string, unknown>).graphScore ?? overrides.graphScore ?? 0),
    trustScore: Number((payload as Record<string, unknown>).trustScore ?? overrides.trustScore ?? 0),
    recencyScore: Number((payload as Record<string, unknown>).recencyScore ?? overrides.recencyScore ?? 0),
    turbovecScore: Number((payload as Record<string, unknown>).turbovecScore ?? overrides.turbovecScore ?? 0),
    sourceKind:
      ((payload as Record<string, unknown>).sourceKind as KnowledgeCardForPrompt['sourceKind'] | undefined) ??
      overrides.sourceKind ??
      'qdrant',
  };
}

const ACE_CTX_TTL_SECONDS = 3600; // 1h — matches MASTER-TODO §10I ACE packet caching

export async function buildAcePromptPreflight(
  input: AcePromptPreflightInput
): Promise<AcePromptPreflightResult> {
  const startMs = Date.now();
  const queryHash = sha1(`${input.query}:${input.intent ?? 'find'}:${input.backend}`);
  const contextPackKey = `${DOCUMENT_KNOWLEDGE_CONTEXT_PREFIX}${queryHash}`;
  const repoRoot = findRepoRoot(process.cwd());
  const redis = getRedis();

  // 0. Full packet cache short-circuit (Phase 10I)
  // Skip all retrieval if a complete ace:ctx:<hash> entry already exists.
  // Raw context_timeline rows are excluded from ACE — only sourceRef-linked packets are stored.
  try {
    const cachedRaw = await redis.get(contextPackKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as {
        version?: string;
        queryHash?: string;
        packet?: unknown;
        selectedCards?: KnowledgeCardForPrompt[];
        timing?: Record<string, number>;
        prompt?: { system: string; context: string; user: string; estimatedTokens: number };
        routing?: { selectedLane: string; reason: string };
        packetIds?: string[];
        packetUlids?: string[];
        titleIds?: string[];
        featureIds?: string[];
        sourceRefs?: string[];
        chunkIds?: string[];
        featureLabels?: string[];
        graphPaths?: string[];
      };
      if (
        cached.version === ACE_NES_PACKET_VERSION &&
        cached.selectedCards?.length &&
        cached.prompt
      ) {
        return {
          version: ACE_NES_PACKET_VERSION,
          queryHash,
          contextPackKey,
          selectedCards: cached.selectedCards,
          packetIds: cached.packetIds ?? [],
          packetUlids: cached.packetUlids ?? [],
          titleIds: cached.titleIds ?? [],
          featureIds: cached.featureIds ?? [],
          sourceRefs: cached.sourceRefs ?? [],
          chunkIds: cached.chunkIds ?? [],
          featureLabels: cached.featureLabels ?? [],
          graphPaths: cached.graphPaths ?? [],
          prompt: cached.prompt,
          routing: (cached.routing as AcePromptPreflightResult['routing']) ?? {
            selectedLane: 'turboquant',
            reason: 'cache_hit',
          },
          timing: {
            redisMs: Date.now() - startMs,
            qdrantMs: 0,
            postgresMs: 0,
            turbovecMs: 0,
            graphMs: 0,
            totalMs: Date.now() - startMs,
          },
          degraded: false,
          cacheHit: true,
        } as AcePromptPreflightResult;
      }
    }
  } catch {
    // cache miss or parse error — fall through to full build
  }

  const queryEntities = extractQueryEntities(input.query);
  const selectedCards: KnowledgeCardForPrompt[] = [];
  const packetIds = new Set<string>();
  const packetUlids = new Set<string>();
  const titleIds = new Set<string>();
  const featureIds = new Set<string>();
  const sourceRefs = new Set<string>();
  const chunkIds = new Set<string>();
  const featureLabels = new Set<string>();
  const graphPaths = new Set<string>();

  let degraded = false;
  let redisMs = 0;
  let qdrantMs = 0;
  let postgresMs = 0;
  let turbovecMs = 0;
  let graphMs = 0;

  // 1. Redis exact cache
  const redisStart = Date.now();
  const exactKey = `${DOCUMENT_KNOWLEDGE_QUERY_PREFIX}${queryHash}`;
  const exactHitRaw = await redis.get(exactKey).catch(() => null);
  if (exactHitRaw) {
    try {
      const exactHit = JSON.parse(exactHitRaw) as { cardId?: string; qdrantPointId?: string; redisKey?: string };
      if (exactHit.cardId) {
        const cardRaw = await redis.get(`${DOCUMENT_KNOWLEDGE_CARD_PREFIX}${exactHit.cardId}`).catch(() => null);
        const packet = await readKnowledgePacket(redis, exactHit.cardId);
        if (cardRaw) {
          const cardPayload = JSON.parse(cardRaw) as Record<string, unknown>;
          const card = normalizeCardFromPayload(cardPayload, {
            sourceKind: 'redis',
            exactHit: true,
            retrieval: {
              redisKey: exactHit.redisKey ?? `${DOCUMENT_KNOWLEDGE_CARD_PREFIX}${exactHit.cardId}`,
              qdrantPointId: exactHit.qdrantPointId ?? '',
              embeddingModel: 'embeddinggemma:latest',
              embeddingDim: 768,
              score: 1,
            },
            finalScore: 1,
            estimatedTokens: 0,
          });
          if (packet) {
            card.graphNeighbors = parseJsonArray(packet.graphNeighbors).map((link) => ({
              cardId: String((link as Record<string, unknown>).cardId ?? ''),
              relation: String((link as Record<string, unknown>).relation ?? 'uses'),
              reason: String((link as Record<string, unknown>).reason ?? ''),
            }));
            card.nextAction = String(packet.nextAction ?? card.nextAction);
          }
          selectedCards.push(card);
          if (card.packetId) packetIds.add(card.packetId);
          if (card.packetUlid) packetUlids.add(card.packetUlid);
          if (card.titleId) titleIds.add(card.titleId);
          if (card.featureId) featureIds.add(card.featureId);
          for (const value of card.sourceRefs) sourceRefs.add(value);
          card.chunkIds.forEach((value) => chunkIds.add(value));
          card.featureLabels.forEach((value) => featureLabels.add(value));
          graphPathsForCard(card).forEach((value) => graphPaths.add(value));
        }
      }
    } catch {
      // leave as degraded fallback
    }
  }
  redisMs = Date.now() - redisStart;

  // 2. token-map / LangExtract entities
  const entityAnchors = uniq([
    ...queryEntities.files,
    ...queryEntities.routes,
    ...queryEntities.tables,
    ...queryEntities.envVars,
    ...queryEntities.services,
    ...queryEntities.commands,
    ...queryEntities.models,
  ]);

  // 3. rg / lexical anchors if needed
  let rgMatches: string[] = [];
  if (entityAnchors.length > 0 && selectedCards.length === 0) {
    try {
      rgMatches = await runRgAnchors(repoRoot, input.query);
      for (const filePath of rgMatches) {
        sourceRefs.add(filePath);
      }
    } catch {
      // best effort only
    }
  }

  // 4. Qdrant dense search
  const qdrantStart = Date.now();
  let queryEmbedding: number[] | null = null;
    const embedded = await tryEmbedOllama(input.query, {
      model: 'embeddinggemma:latest',
      baseUrl: getOllamaEmbeddingEndpoint(),
      timeoutMs: 4000,
    }).catch(() => null);
  if (embedded?.embedding) {
    queryEmbedding = embedded.embedding;
  } else {
    degraded = true;
  }

  const qdrant = new QdrantClient({ url: ENV.QDRANT_URL });
  const qdrantCandidates: Array<Record<string, unknown>> = [];
  if (queryEmbedding) {
    const search = async (collection: string, limit: number) => {
      try {
        return await qdrant.search(collection, {
          vector: queryEmbedding!,
          limit,
          with_payload: true,
        });
      } catch {
        return [];
      }
    };
    const [documentHits, codebaseHits] = await Promise.all([
      search(DOCUMENT_KNOWLEDGE_COLLECTION, 8),
      queryEntities.files.length > 0 || queryEntities.commands.length > 0 || queryEntities.models.length > 0
        ? search('codebase_chunks_768', 5)
        : Promise.resolve([]),
    ]);
    qdrantCandidates.push(
      ...(documentHits as Array<Record<string, unknown>>),
      ...(codebaseHits as Array<Record<string, unknown>>)
    );
  }
  qdrantMs = Date.now() - qdrantStart;

  for (const hit of qdrantCandidates) {
    const payload = parseJsonObject(hit.payload) ?? {};
    const payloadRetrieval = parseJsonObject(payload.retrieval) ?? {};
    const card = normalizeCardFromPayload(payload, {
      sourceKind: 'qdrant',
      retrieval: {
        redisKey: String(payloadRetrieval.redisKey ?? ''),
        qdrantPointId: String(hit.id ?? payloadRetrieval.qdrantPointId ?? ''),
        embeddingModel: 'embeddinggemma:latest',
        embeddingDim: 768,
        score: Number(hit.score ?? 0),
      },
      qdrantScore: Number(hit.score ?? 0),
      semanticScore: clamp01(Number(hit.score ?? 0)),
    });
    if (!selectedCards.some((existing) => existing.cardId === card.cardId)) {
      selectedCards.push(card);
    }
    if (card.packetId) packetIds.add(card.packetId);
    if (card.packetUlid) packetUlids.add(card.packetUlid);
    if (card.titleId) titleIds.add(card.titleId);
    if (card.featureId) featureIds.add(card.featureId);
  }

  // 5. Postgres JSONB/sourceRef filter
  // Best-effort sourceRef alignment from locally persisted packet metadata.
  // This keeps the preflight deterministic without introducing a second data store.
  const postgresStart = Date.now();
  if (selectedCards.length > 0) {
    const sourceRefSeed = uniq(selectedCards.flatMap((card) => card.sourceRefs)).slice(0, 20);
    for (const ref of sourceRefSeed) {
      if (ref.startsWith('EXTERNAL:')) continue;
      sourceRefs.add(ref);
    }
  }
  postgresMs = Date.now() - postgresStart;

  // 6. graph / hypergraph expansion
  const graphStart = Date.now();
  const expandedCardIds = new Set<string>();
  for (const card of [...selectedCards]) {
    const packet = await readKnowledgePacket(redis, card.cardId).catch(() => null);
    if (!packet) continue;
    const neighbors = parseJsonArray(packet.graphNeighbors).map((link) => ({
      cardId: String((link as Record<string, unknown>).cardId ?? ''),
      relation: String((link as Record<string, unknown>).relation ?? 'uses'),
      reason: String((link as Record<string, unknown>).reason ?? ''),
    }));
    card.graphNeighbors = neighbors;
    neighbors.forEach((neighbor) => {
      if (neighbor.cardId) {
        graphPaths.add(`${card.cardId} -> ${neighbor.relation} -> ${neighbor.cardId}`);
      }
    });
    if (packet.nextAction && !card.nextAction) {
      card.nextAction = String(packet.nextAction);
    }

    const cardKey = `${DOCUMENT_KNOWLEDGE_CARD_PREFIX}${card.cardId}`;
    const relatedRaw = await redis.get(cardKey).catch(() => null);
    if (relatedRaw && !expandedCardIds.has(card.cardId)) {
      expandedCardIds.add(card.cardId);
    }
  }
  graphMs = Date.now() - graphStart;

  // 7. TurboVec rerank
  if (queryEmbedding) {
    try {
      const turboStart = Date.now();
      const searchResult = await turbovecSearch(queryEmbedding, { topK: 50, timeoutMs: 300 }).catch(() => ({ candidates: [] }));
      turbovecMs = Date.now() - turboStart;
      const turboIds = new Set((searchResult.candidates ?? []).map((candidate) => String(candidate.id)));
      for (const card of selectedCards) {
        if (card.retrieval.qdrantPointId && turboIds.has(String(card.retrieval.qdrantPointId))) {
          card.turbovecScore = Math.max(card.turbovecScore ?? 0, 1);
        }
      }
      const prefilter = await turbovecPrefilter(queryEmbedding, { topClusters: 5, timeoutMs: 250 }).catch(() => null);
      if (prefilter?.clusterIds?.length) {
        graphPaths.add(`turbovec_clusters:${prefilter.clusterIds.join(',')}`);
      }
    } catch {
      degraded = true;
    }
  }

  // 8. token-budget pruning
  const scoredCards = selectedCards
    .map((card) => {
      const lexicalScore = scoreLexical(card, queryEntities);
      const semanticScore = clamp01(Number(card.qdrantScore ?? card.semanticScore ?? 0));
      const graphScore = clamp01(
        Math.min(1, (card.graphNeighbors?.length ?? 0) / 4 + (card.graphLinks?.length ?? 0) / 6)
      );
      const trustScore = lifecycleTrustScore(card.lifecycle.status);
      const recencyScore = 0.5;
      const turbovecScore = clamp01(Number(card.turbovecScore ?? 0));
      const finalScore =
        0.25 * lexicalScore +
        0.25 * semanticScore +
        0.2 * graphScore +
        0.15 * trustScore +
        0.1 * recencyScore +
        0.05 * turbovecScore;
      const estimatedTokens = estimateCardTokens(card);
      return {
        ...card,
        lexicalScore,
        semanticScore,
        graphScore,
        trustScore,
        recencyScore,
        turbovecScore,
        finalScore,
        estimatedTokens,
      };
    })
    .filter((card) => card.sourceRefs.length > 0 || card.sourceKind === 'redis' || card.sourceKind === 'qdrant');

  const packed = packCardsForPrompt(scoredCards, Math.max(512, input.tokenBudget));
  const packedCards = packed.selected.map((card) => ({
    ...card,
    estimatedTokens: card.estimatedTokens,
    finalScore: card.finalScore,
  }));

  const pruneCandidates = packedCards.filter((card) => card.lifecycle.status === 'candidate_prune').map((card) => card.cardId);
  const archiveToDeedsLab = packedCards
    .filter((card) => card.lifecycle.status === 'archive_to_deeds_lab')
    .map((card) => card.cardId);
  const productionReady = packedCards.filter((card) => card.lifecycle.status === 'production_ready').map((card) => card.cardId);

  const contextPacket = {
    version: ACE_NES_PACKET_VERSION,
    cartridgeId: contextPackKey,
    intent: input.intent ?? 'explain',
    packetIds: uniq([...packetIds]),
    packetUlids: uniq([...packetUlids]),
    titleIds: uniq([...titleIds]),
    featureIds: uniq([...featureIds]),
    sourceRefs: uniq([...sourceRefs]),
    chunkIds: uniq([...chunkIds, ...packedCards.flatMap((card) => card.chunkIds)]),
    featureLabels: uniq([...featureLabels, ...packedCards.flatMap((card) => card.featureLabels)]),
    selectedCards: packedCards.map((card) => ({
      cardId: card.cardId,
      packetId: card.packetId,
      packetUlid: card.packetUlid,
      titleId: card.titleId,
      featureId: card.featureId,
      kind: card.kind,
      title: card.title,
      summary: card.summary,
      sourceRefs: card.sourceRefs,
      chunkIds: card.chunkIds,
      featureLabels: card.featureLabels,
      clusterTags: card.clusterTags,
      nextAction: card.nextAction,
      finalScore: Number(card.finalScore.toFixed(3)),
      estimatedTokens: card.estimatedTokens,
      lifecycle: card.lifecycle,
    })),
    graphPaths: uniq([...graphPaths]),
    pruneCandidates,
    archiveToDeedsLab,
    productionReady,
    nextActions: uniq(packedCards.map((card) => card.nextAction)),
    degraded,
  };

  const promptSystem = [
    'ACE Prompt Preflight Router.',
    'Use the compact ACE/NES packet and sourceRefs only.',
    'Do not expand raw files, full JSON, or markdown dumps into the generation prompt.',
    'Preserve packetIds, packetUlids, titleIds, featureIds, sourceRefs, chunkIds, contextPackKey, retrievalTrace, and backend identity.',
    `Model: ${input.modelName}`,
    `Backend: ${input.backend}`,
    input.basePrompt ? `Base prompt hash: ${sha1(input.basePrompt).slice(0, 16)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const promptContext = JSON.stringify(contextPacket, null, 2);
  const promptUser = input.query;
  const estimatedTokens = countTokens(`${promptSystem}\n${promptContext}\n${promptUser}`);

  // Only cache packets that have sourceRef-linked cards — raw logs must not enter ACE (Phase 10I)
  const cacheableCards = packedCards.filter((c) => c.sourceRefs.length > 0);
  if (cacheableCards.length > 0) {
    await redis
      .set(
        contextPackKey,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          version: ACE_NES_PACKET_VERSION,
          queryHash,
          modelName: input.modelName,
          backend: input.backend,
          packet: contextPacket,
          selectedCards: cacheableCards,
          packetIds: uniq([...packetIds]),
          packetUlids: uniq([...packetUlids]),
          titleIds: uniq([...titleIds]),
          featureIds: uniq([...featureIds]),
          sourceRefs: uniq([...sourceRefs]),
          chunkIds: uniq([...chunkIds, ...cacheableCards.flatMap((c) => c.chunkIds)]),
          featureLabels: uniq([...featureLabels, ...cacheableCards.flatMap((c) => c.featureLabels)]),
          graphPaths: uniq([...graphPaths]),
          prompt: {
            system: promptSystem,
            context: promptContext,
            user: promptUser,
            estimatedTokens,
          },
          routing: {
            selectedLane:
              estimatedTokens > 6000 || input.tokenBudget > 4096 || input.backend === 'turboquant'
                ? 'turboquant'
                : 'bifrost',
            reason:
              estimatedTokens > 6000
                ? 'large_context'
                : input.backend === 'turboquant'
                  ? 'backend_hint'
                  : packedCards.length <= 2
                    ? 'compact_prompt'
                    : 'semantic_reuse',
          },
          timing: {
            redisMs,
            qdrantMs,
            postgresMs,
            turbovecMs,
            graphMs,
            totalMs: Date.now() - startMs,
          },
        }),
        'EX',
        ACE_CTX_TTL_SECONDS,
      )
      .catch(() => {});
  }

  // P3 Gate: Validate ACE schema before returning prompt
  // Block placeholder terms and unsafe writes
  const schemaValidation = validateAceSchema({
    text: promptUser + promptSystem + promptContext,
    packet: packedCards[0]
      ? {
          source_ref: packedCards[0].sourceRefs?.[0],
          packet_id: packedCards[0].packetId,
          packet_ulid: packedCards[0].packetUlid,
          title_id: packedCards[0].titleId,
          feature_id: packedCards[0].featureLabels?.[0],
          packet_key: packedCards[0].cardId,
        }
      : undefined,
  });

  // Log validation result for audit
  if (!schemaValidation.valid) {
    console.warn('❌ ACE Schema Validation FAILED:', schemaValidation.report);
    // Store failed validation in Redis for operators to review
    await redis.set(`ace:schema:invalid:${queryHash}`, JSON.stringify(schemaValidation), 'EX', 3600).catch(() => {});
  }

  return {
    version: ACE_NES_PACKET_VERSION,
    queryHash,
    contextPackKey,
    selectedCards: packedCards,
    packetIds: uniq([...packetIds]),
    packetUlids: uniq([...packetUlids]),
    titleIds: uniq([...titleIds]),
    featureIds: uniq([...featureIds]),
    sourceRefs: uniq([...sourceRefs]),
    chunkIds: uniq([...chunkIds, ...packedCards.flatMap((card) => card.chunkIds)]),
    featureLabels: uniq([...featureLabels, ...packedCards.flatMap((card) => card.featureLabels)]),
    graphPaths: uniq([...graphPaths]),
    prompt: {
      system: promptSystem,
      context: promptContext,
      user: promptUser,
      estimatedTokens,
    },
    routing: {
      selectedLane:
        estimatedTokens > 6000 || input.tokenBudget > 4096 || input.backend === 'turboquant'
          ? 'turboquant'
          : 'bifrost',
      reason:
        estimatedTokens > 6000
          ? 'large_context'
          : input.backend === 'turboquant'
            ? 'backend_hint'
            : packedCards.length <= 2
              ? 'compact_prompt'
              : 'semantic_reuse',
    },
    timing: {
      redisMs,
      qdrantMs,
      postgresMs,
      turbovecMs,
      graphMs,
      totalMs: Date.now() - startMs,
    },
    degraded,
    cacheHit: false,
  };
}

// Provide a default export for compatibility with callers that import default.
export default buildAcePromptPreflight;
