import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { tokenMapCards, type NewTokenMapCardRow } from '$lib/server/db/schema.js';
import { buildNesCartridge, packetToTokenMapRow } from './token-map-mapper.js';
import type { NesCartridge, TokenMapCard, TokenMapPacket } from './token-map-types.js';

export interface TokenMapCartridgePayload {
  chunkId: string;
  featureFamily: string;
  sourceRef: string;
  manifold4: [number, number, number, number];
  turbovecRef: string;
  query?: string;
  summary?: string;
  tokenCost?: number;
  compressedTokenCost?: number;
  qdrantPointId?: string;
  turbovecCode?: string;
  clusterId?: string;
  latent64Ref?: string;
  compressionLoss?: number;
  sourceRefs?: string[];
  nextActions?: string[];
  symbols?: string[];
  envVars?: string[];
  routes?: string[];
  tables?: string[];
  graphLinks?: string[];
  degraded?: boolean;
  cardId?: string;
}

export interface AcePacketLike {
  sourceRefs?: string[];
  rankedCards?: Array<Record<string, unknown>>;
  degraded?: boolean;
  promptCacheKey?: string;
}

type TokenMapDb = {
  insert: (table: typeof tokenMapCards) => {
    values: (row: NewTokenMapCardRow) => {
      onConflictDoUpdate: (args: {
        target: unknown[];
        set: Partial<NewTokenMapCardRow> & Record<string, unknown>;
      }) => {
        returning: (selection?: { id: unknown }) => Promise<Array<{ id: string }>>;
      };
    };
  };
};

type TokenMapRedis = Pick<Redis, 'set' | 'sadd' | 'expire' | 'xadd'> & {
  xAdd?: (stream: string, id: string, message: Record<string, string>) => Promise<unknown>;
};

type PersistenceDeps = {
  db?: TokenMapDb;
  redis?: TokenMapRedis;
  model?: string;
  ttlSeconds?: number;
};

export interface PersistedTokenMapCartridge {
  rowId: string;
  cacheKey: string;
  acePacketKey: string;
  packet: TokenMapPacket;
  cartridge: NesCartridge;
  row: NewTokenMapCardRow;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function hashRunId(value: string): string {
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
}

async function resolveServices(): Promise<{ db: TokenMapDb; redis: TokenMapRedis }> {
  const [{ db }, { getRedis }] = await Promise.all([
    import('$lib/server/db/client.js'),
    import('$lib/server/redis.js'),
  ]);

  return {
    db: db as unknown as TokenMapDb,
    redis: getRedis() as unknown as TokenMapRedis,
  };
}

function toTokenMapCard(payload: TokenMapCartridgePayload): TokenMapCard {
  const promptTokens = Math.max(0, payload.tokenCost ?? payload.summary?.length ?? 0);
  const compressedTokens = Math.max(
    0,
    payload.compressedTokenCost ?? Math.round(promptTokens * 0.35)
  );

  return {
    id: payload.cardId ?? payload.chunkId,
    chunkId: payload.chunkId,
    sourceRef: payload.sourceRef,
    feature: payload.featureFamily,
    embeddingModel: 'embeddinggemma:latest',
    embeddingDimension: 768,
    quantizer: 'turbovec-4bit',
    rotationSeed: 'rotorquant-v1',
    turbovecRef: payload.turbovecRef,
    tokenCost: promptTokens,
    compressedTokenCost: compressedTokens,
    bpeWasteScore: promptTokens > 0 ? Math.max(0, 1 - compressedTokens / promptTokens) : 0,
    summary: payload.summary ?? `Token-map cartridge for ${payload.sourceRef}`,
    symbols: payload.symbols ?? [],
    envVars: payload.envVars ?? [],
    routes: payload.routes ?? [],
    tables: payload.tables ?? ['token_map_cards'],
    graphLinks: payload.graphLinks ?? ['token_map_cards -> ace_packet'],
    qdrantPointId: payload.qdrantPointId,
    turbovecCode: payload.turbovecCode,
    clusterId: payload.clusterId,
    latent64Ref: payload.latent64Ref,
    manifold4: payload.manifold4,
    compressionLoss: payload.compressionLoss,
  };
}

function toPacket(runId: string, payload: TokenMapCartridgePayload): TokenMapPacket {
  const card = toTokenMapCard(payload);
  const query = payload.query ?? `${payload.featureFamily}:${payload.chunkId}`;
  const sourceRefs = unique([payload.sourceRef, ...(payload.sourceRefs ?? [])]);
  const cartridge = buildNesCartridge(query, [card], sourceRefs, {
    cartridgeId: `ace:packet:${runId}`,
    queryHash: hashRunId(`${runId}|${query}`),
    state: payload.degraded ? 'rerank' : 'cache_hit',
    nextActions: payload.nextActions ?? ['persist token-map card', 'refresh Redis cartridge'],
    degraded: payload.degraded ?? false,
  });

  return {
    query,
    feature: payload.featureFamily,
    cards: [card],
    cartridge,
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function toManifold4(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }

  const nums = value.map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : 0));
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 0];
}

export function deriveTokenMapCartridgePayloadFromAcePacket(
  query: string,
  packet: AcePacketLike
): TokenMapCartridgePayload | null {
  const rankedCard = packet.rankedCards?.[0] ?? null;
  const sourceRef =
    firstString(
      packet.sourceRefs?.[0],
      rankedCard?.sourceRef,
      rankedCard?.path,
      rankedCard?.filePath,
      rankedCard?.file_path
    ) ?? undefined;

  if (!sourceRef) {
    return null;
  }

  const chunkId =
    firstString(
      rankedCard?.chunkId,
      rankedCard?.chunk_id,
      rankedCard?.id,
      rankedCard?.nodeId,
      `chunk:${hashRunId(`${query}|${sourceRef}`)}`
    ) ?? `chunk:${hashRunId(`${query}|${sourceRef}`)}`;

  const featureFamily =
    firstString(
      rankedCard?.featureFamily,
      rankedCard?.feature,
      rankedCard?.feature_key,
      'ace-cache'
    ) ?? 'ace-cache';

  const manifold4 = toManifold4(rankedCard?.manifold4);
  const tokenCost = firstNumber(rankedCard?.tokenCost, rankedCard?.promptTokens);
  const compressedTokenCost = firstNumber(
    rankedCard?.compressedTokenCost,
    rankedCard?.compressedTokens
  );
  const qdrantPointId = firstString(
    rankedCard?.qdrantPointId,
    rankedCard?.qdrant_point_id,
    rankedCard?.pointId
  );
  const turbovecCode = firstString(rankedCard?.turbovecCode, rankedCard?.turbovec_code);
  const clusterId = firstString(rankedCard?.clusterId, rankedCard?.cluster_id);
  const latent64Ref = firstString(rankedCard?.latent64Ref, rankedCard?.latent64_ref);
  const summary = firstString(rankedCard?.summary, rankedCard?.headline) ?? undefined;

  return {
    chunkId,
    featureFamily,
    sourceRef,
    manifold4: manifold4 ?? [0, 0, 0, 0],
    turbovecRef: firstString(rankedCard?.turbovecRef, rankedCard?.turbovec_ref) ?? `redis:turbovec:vec:${chunkId}`,
    query,
    summary,
    tokenCost,
    compressedTokenCost,
    qdrantPointId,
    turbovecCode,
    clusterId,
    latent64Ref,
    compressionLoss: firstNumber(rankedCard?.compressionLoss, rankedCard?.compression_loss),
    sourceRefs: unique([
      sourceRef,
      ...(Array.isArray(rankedCard?.sourceRefs) ? rankedCard.sourceRefs.filter((value): value is string => typeof value === 'string') : []),
      ...(packet.sourceRefs ?? []),
    ]),
    nextActions: packet.degraded ? ['run exact search', 'recall cluster tags', 'extract entities', 'build ACE packet'] : ['persist token-map card'],
    degraded: Boolean(packet.degraded),
    cardId: firstString(rankedCard?.cardId, rankedCard?.card_id),
  };
}

export async function persistTokenMapCartridge(
  runId: string,
  payload: TokenMapCartridgePayload,
  deps: PersistenceDeps = {}
): Promise<PersistedTokenMapCartridge> {
  const { db, redis } = deps.db && deps.redis ? deps : await resolveServices();
  const model = deps.model ?? 'turboquant/gemma4-legal.gguf';
  const ttlSeconds = Math.max(60, deps.ttlSeconds ?? 3600);

  const packet = toPacket(runId, payload);
  const row = packetToTokenMapRow(packet, model, {
    answerSummary: payload.summary,
    answerHash: payload.cardId ? hashRunId(payload.cardId) : undefined,
    qdrantPointId: payload.qdrantPointId,
    turbovecCode: payload.turbovecCode,
    nextActions: payload.nextActions,
  });

  const [inserted] = await db
    .insert(tokenMapCards)
    .values(row)
    .onConflictDoUpdate({
      target: [tokenMapCards.cacheKey],
      set: {
        query: row.query,
        model: row.model,
        featureKey: row.featureKey,
        packetState: row.packetState,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        compressedTokens: row.compressedTokens,
        bpeWasteScore: row.bpeWasteScore,
        chunkIds: row.chunkIds,
        featureKeys: row.featureKeys,
        graphPaths: row.graphPaths,
        sourceRefs: row.sourceRefs,
        toolPolicy: row.toolPolicy,
        answerSummary: row.answerSummary,
        answerHash: row.answerHash,
        qdrantPointId: row.qdrantPointId,
        turbovecCode: row.turbovecCode,
        nextActions: row.nextActions,
        cacheable: row.cacheable,
        degraded: row.degraded,
        metadata: row.metadata,
        updatedAt: new Date(),
      },
    })
    .returning({ id: tokenMapCards.id });
  const rowId = inserted?.id ?? row.cacheKey;
  const acePacketKey = `ace:packet:${runId}`;
  const cartridgePayload = {
    ...packet.cartridge,
    rowId,
    sourceRef: payload.sourceRef,
    featureFamily: payload.featureFamily,
    manifold4: payload.manifold4,
    turbovecRef: payload.turbovecRef,
    degraded: payload.degraded ?? false,
  };

  await redis.set(acePacketKey, JSON.stringify(cartridgePayload), 'EX', ttlSeconds);
  await redis.set(`token-map:row:${row.cacheKey}`, JSON.stringify({ ...row, id: rowId }), 'EX', ttlSeconds);
  await redis.sadd(`token-map:feature:${payload.featureFamily}`, row.cacheKey);
  await redis.expire(`token-map:feature:${payload.featureFamily}`, ttlSeconds);

  if (typeof redis.xAdd === 'function') {
    await redis.xAdd('engram:state:transitions', '*', {
      from_state: payload.degraded ? 'graph_expand' : 'rerank',
      to_state: 'ace_packet_build',
      intent: 'token_map_alignment',
      success: 'true',
    });
  } else if (typeof redis.xadd === 'function') {
    await redis.xadd(
      'engram:state:transitions',
      '*',
      'from_state',
      payload.degraded ? 'graph_expand' : 'rerank',
      'to_state',
      'ace_packet_build',
      'intent',
      'token_map_alignment',
      'success',
      'true'
    );
  }

  return {
    rowId,
    cacheKey: row.cacheKey,
    acePacketKey,
    packet,
    cartridge: packet.cartridge,
    row,
  };
}
