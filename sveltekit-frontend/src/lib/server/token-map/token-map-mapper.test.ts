import { describe, expect, it } from 'vitest';
import { buildNesCartridge, buildTokenMapCacheKey, packetToTokenMapRow } from './token-map-mapper';

describe('token-map mapper', () => {
  it('builds a stable cache key and a db row from a token map packet', () => {
    const cartridge = buildNesCartridge('where is auth?', [
      {
        id: 'card-1',
        chunkId: 'chunk-1',
        sourceRef: 'src/lib/server/cache/ace-packet-cache.ts',
        feature: 'ace-cache',
        tokenCost: 120,
        compressedTokenCost: 36,
        bpeWasteScore: 0.7,
        summary: 'ACE cache packet supports fast retrieval.',
        symbols: ['getCachedAcePacket'],
        envVars: ['REDIS_URL'],
        routes: ['/api/chat/stream'],
        tables: ['token_map_cards'],
        graphLinks: ['token_map_cards -> summary_cards'],
      },
    ], ['src/lib/server/cache/ace-packet-cache.ts']);

    const packet = {
      query: 'where is auth?',
      feature: 'ace-cache',
      cards: cartridge.cards,
      cartridge,
    };

    const row = packetToTokenMapRow(packet, 'turboquant/gemma4-tq');

    expect(buildTokenMapCacheKey(packet, 'turboquant/gemma4-tq')).toMatch(/^token-map:/);
    expect(row.cacheKey).toMatch(/^token-map:/);
    expect(row.promptTokens).toBe(120);
    expect(row.compressedTokens).toBe(36);
    expect(row.totalTokens).toBe(120);
    expect(row.featureKeys).toContain('ace-cache');
    expect(row.sourceRefs).toContain('src/lib/server/cache/ace-packet-cache.ts');
    expect(row.degraded).toBe(false);
    expect(row.metadata).toMatchObject({
      cartridgeId: cartridge.cartridgeId,
      queryHash: cartridge.queryHash,
      cardCount: 1,
      turbovec: {
        embeddingModel: 'embeddinggemma:latest',
        dimension: 768,
        quantizer: 'turbovec-4bit',
        rotationSeed: 'rotorquant-v1',
        packedBytesRef: 'redis:turbovec:vec:chunk-1',
        clusterId: undefined,
      },
    });
  });
});
