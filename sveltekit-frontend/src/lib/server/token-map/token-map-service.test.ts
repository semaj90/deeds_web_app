import { describe, expect, it, vi } from 'vitest';
import { persistTokenMapCartridge } from './token-map-service';

describe('token-map service', () => {
  it('persists a token-map cartridge to postgres and redis', async () => {
    const insertedRows: unknown[] = [];
    const redisCalls: Array<{ method: string; args: unknown[] }> = [];

    const db = {
      insert: vi.fn((table: unknown) => {
        expect(table).toBeTruthy();
        const chain = {
          onConflictDoUpdate: () => chain,
          returning: async () => [{ id: 'row-123' }],
        };
        const builder = {
          values: (row: unknown) => {
            insertedRows.push(row);
            return chain;
          },
        };
        return builder;
      }),
    };

    const redis = {
      set: vi.fn(async (...args: unknown[]) => {
        redisCalls.push({ method: 'set', args });
        return 'OK';
      }),
      sadd: vi.fn(async (...args: unknown[]) => {
        redisCalls.push({ method: 'sadd', args });
        return 1;
      }),
      expire: vi.fn(async (...args: unknown[]) => {
        redisCalls.push({ method: 'expire', args });
        return 1;
      }),
      xAdd: vi.fn(async (...args: unknown[]) => {
        redisCalls.push({ method: 'xAdd', args });
        return '1-0';
      }),
    };

    const result = await persistTokenMapCartridge(
      'run-42',
      {
        chunkId: 'chunk-1',
        featureFamily: 'turbovec-rerank',
        sourceRef: 'src/lib/server/vector/turbovec-client.ts',
        manifold4: [0.42, -0.13, 0.78, 0.21],
        turbovecRef: 'redis:turbovec:vec:chunk-1',
        query: 'where is auth?',
        summary: 'Token-map cartridge for auth retrieval.',
        tokenCost: 120,
        compressedTokenCost: 36,
        nextActions: ['persist token-map card', 'refresh Redis cartridge'],
      },
      {
        db: db as never,
        redis: redis as never,
        model: 'turboquant/gemma4-legal.gguf',
        ttlSeconds: 1800,
      }
    );

    expect(result.rowId).toBe('row-123');
    expect(result.acePacketKey).toBe('ace:packet:run-42');
    expect(result.packet.cartridge.state).toBe('cache_hit');
    expect(result.packet.cards[0].embeddingDimension).toBe(768);
    expect(result.row.cacheKey).toMatch(/^token-map:/);
    expect(result.row.metadata).toMatchObject({
      cartridgeId: 'ace:packet:run-42',
      cardCount: 1,
      turbovec: {
        model: 'embeddinggemma:latest',
        dimension: 768,
        quantizer: 'turbovec-4bit',
        rotationSeed: 'rotorquant-v1',
        packedBytesRef: 'redis:turbovec:vec:chunk-1',
      },
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'ace:packet:run-42',
      expect.stringContaining('"cartridgeId":"ace:packet:run-42"'),
      'EX',
      1800
    );
    expect(redis.sadd).toHaveBeenCalledWith(
      expect.stringMatching(/^token-map:feature:/),
      result.row.cacheKey
    );
    expect(redis.xAdd).toHaveBeenCalledWith(
      'engram:state:transitions',
      '*',
      expect.objectContaining({
        from_state: 'rerank',
        to_state: 'ace_packet_build',
        intent: 'token_map_alignment',
        success: 'true',
      })
    );

    expect(insertedRows).toHaveLength(1);
  });
});
