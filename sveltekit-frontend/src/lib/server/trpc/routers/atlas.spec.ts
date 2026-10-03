import { describe, expect, it } from 'vitest';
import { atlasRouter } from './atlas.js';

describe('atlasRouter.getPacketRegistry', () => {
  it('returns a stable valid schema response with no writes', async () => {
    const caller = atlasRouter.createCaller({} as any);
    const result = await caller.getPacketRegistry({});

    expect(result.schema).toBe('atlas.rpc-packet-registry.v1');
    expect(result.receipt.writesPerformed).toBe(false);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.receipt.canonicalAuthority).toBe(false);
    expect(Array.isArray(result.entries)).toBe(true);
  });
});
