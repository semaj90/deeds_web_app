import { describe, expect, it } from 'vitest';
import type { NesCartridge, TokenMapCard, TokenMapPacket } from './token-map-types';

describe('token-map types', () => {
  it('accepts a layered token map card and cartridge shape', () => {
    const card: TokenMapCard = {
      id: 'tmc_1',
      chunkId: 'chunk_1',
      sourceRef: 'src/lib/server/ace/context-assembler.ts',
      feature: 'ace-cache',
      tokenCost: 128,
      compressedTokenCost: 42,
      bpeWasteScore: 0.67,
      summary: 'ACE cache packet for retrieval-first routing.',
      symbols: ['assembleACEContext'],
      envVars: ['REDIS_URL'],
      routes: ['/api/chat/stream'],
      tables: ['summary_cards'],
      graphLinks: ['summary_cards -> retrieval_cache_traces'],
      qdrantPointId: 'uuid-shape-1',
      turbovecCode: 'tv_001',
    };

    const cartridge: NesCartridge = {
      cartridgeId: 'cartridge_1',
      queryHash: 'query_hash_1',
      state: 'cache_hit',
      cards: [card],
      sourceRefs: [card.sourceRef],
      nextActions: ['return ACE packet', 'skip Gemma4 synthesis'],
      degraded: false,
    };

    const packet: TokenMapPacket = {
      query: 'where is auth?',
      feature: 'auth',
      cards: [card],
      cartridge,
    };

    expect(packet.cartridge.cards[0].feature).toBe('ace-cache');
    expect(packet.cartridge.state).toBe('cache_hit');
    expect(packet.cards[0].compressedTokenCost).toBeLessThan(packet.cards[0].tokenCost);
  });
});
