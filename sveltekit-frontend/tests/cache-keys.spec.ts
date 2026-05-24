// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildAceCompletionCacheKey, buildAcePacketCacheKey, hashStr } from '$lib/server/cache-keys.js';

describe('ACE cache keys', () => {
  it('derives a stable packet key from routing inputs', () => {
    const key = buildAcePacketCacheKey({
      model: 'gemma4-rotorquant:latest-iq4xs.gguf',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'summarize cluster 42',
      routingSignature: 'atlas+trace',
      dynamicContextSignature: 'ctx-1',
      dayBucket: '2026-05-19',
    });

    expect(key).toMatch(/^ace:packet:[a-f0-9]{64}$/);
  });

  it('separates completion cache entries by user query hash', () => {
    const packetKey = buildAcePacketCacheKey({
      model: 'gemma4-rotorquant:latest-iq4xs.gguf',
      stablePrefixHash: hashStr('stable-prefix'),
      userIntent: 'legal retrieval',
      routingSignature: 'atlas+trace',
      dynamicContextSignature: 'ctx-1',
      dayBucket: '2026-05-19',
    });

    const q1 = buildAceCompletionCacheKey(packetKey, hashStr('what is hearsay?'));
    const q2 = buildAceCompletionCacheKey(packetKey, hashStr('what is relevance?'));

    expect(q1).toMatch(/^ace:completion:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(q2).toMatch(/^ace:completion:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(q1).not.toBe(q2);
  });
});
