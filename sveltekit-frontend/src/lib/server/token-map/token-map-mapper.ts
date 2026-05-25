import { createHash } from 'node:crypto';
import type { NewTokenMapCardRow } from '$lib/server/db/schema/token-map';
import type { NesCartridge, TokenMapPacket } from './token-map-types';
import {
  buildTurboVecMetadata,
  TURBOVEC_EMBEDDING_DIMENSION,
  TURBOVEC_EMBEDDING_MODEL
} from '$lib/server/vector/turbovec-contract';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function buildTokenMapCacheKey(packet: Pick<TokenMapPacket, 'query' | 'feature'>, model: string): string {
  return `token-map:${hashKey([packet.query.trim(), packet.feature, model.trim()].join('|'))}`;
}

export function packetToTokenMapRow(
  packet: TokenMapPacket,
  model: string,
  opts: {
    answerSummary?: string;
    answerHash?: string;
    qdrantPointId?: string;
    turbovecCode?: string;
    nextActions?: string[];
  } = {}
): NewTokenMapCardRow {
  const cards = packet.cards ?? [];
  const cartridge = packet.cartridge;
  const promptTokens = cards.reduce((sum, card) => sum + card.tokenCost, 0);
  const compressedTokens = cards.reduce((sum, card) => sum + card.compressedTokenCost, 0);
  const sourceRefs = unique([
    ...packet.cartridge.sourceRefs,
    ...cards.map((card) => card.sourceRef),
  ]);
  const chunkIds = unique(cards.map((card) => card.chunkId));
  const featureKeys = unique([packet.feature, ...cards.map((card) => card.feature)]);
  const graphPaths = unique(cards.flatMap((card) => card.graphLinks));
  const summarizedCards = cards
    .slice(0, 3)
    .map((card) => card.summary)
    .join(' | ');
  const answerSummary = opts.answerSummary ?? (summarizedCards || `Token map packet for ${packet.query}`);
  const answerHash = opts.answerHash ?? hashKey(answerSummary);
  const primaryCard = cards[0];
  const turbovecMetadata = primaryCard
    ? buildTurboVecMetadata({
        chunkId: primaryCard.chunkId,
        clusterId: primaryCard.clusterId,
        manifold4: primaryCard.manifold4,
        sourceRef: primaryCard.sourceRef,
        packedBytesRef: primaryCard.turbovecRef,
      })
    : buildTurboVecMetadata({
        chunkId: packet.cartridge.cartridgeId,
        sourceRef: packet.cartridge.sourceRefs[0],
      });

  return {
    cacheKey: buildTokenMapCacheKey(packet, model),
    query: packet.query,
    model,
    featureKey: packet.feature,
    packetState: cartridge.state,
    promptTokens,
    completionTokens: 0,
    totalTokens: promptTokens,
    compressedTokens,
    bpeWasteScore: promptTokens > 0 ? Math.max(0, 1 - compressedTokens / promptTokens) : 0,
    chunkIds,
    featureKeys,
    graphPaths,
    sourceRefs,
    toolPolicy: 'read_only',
    answerSummary,
    answerHash,
    qdrantPointId: opts.qdrantPointId ?? cards.find((card) => card.qdrantPointId)?.qdrantPointId ?? null,
    turbovecCode: opts.turbovecCode ?? cards.find((card) => card.turbovecCode)?.turbovecCode ?? null,
    nextActions: opts.nextActions ?? cartridge.nextActions ?? [],
    cacheable: !cartridge.degraded,
    degraded: cartridge.degraded,
    metadata: {
      cartridgeId: cartridge.cartridgeId,
      queryHash: cartridge.queryHash,
      cardCount: cards.length,
      turbovec: {
        ...turbovecMetadata,
        model: TURBOVEC_EMBEDDING_MODEL,
        dimension: TURBOVEC_EMBEDDING_DIMENSION,
      },
    },
  } satisfies NewTokenMapCardRow;
}

export function buildNesCartridge(
  query: string,
  cards: TokenMapPacket['cards'],
  sourceRefs: string[],
  opts: Partial<Omit<NesCartridge, 'cards' | 'sourceRefs'>> = {}
): NesCartridge {
  return {
    cartridgeId: opts.cartridgeId ?? `nes:${hashKey(query)}`,
    queryHash: opts.queryHash ?? hashKey(query),
    state: opts.state ?? 'atlas_lookup',
    cards,
    sourceRefs: unique(sourceRefs),
    nextActions: opts.nextActions ?? ['look up sourceRefs', 'retrieve token-map cards'],
    degraded: opts.degraded ?? false,
  };
}
