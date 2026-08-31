import { describe, expect, it, vi } from 'vitest';
import { runNeuralDecoderPrefillCallerV1 } from './neural-decoder-prefill-caller-v1.js';
import type { NeuralDecoderFeatureCacheRecord } from './neural-decoder-client.js';

const row = (size: number) => Array.from({ length: size }, () => 0.01);
const BASE_PREFILL_IDENTITY = 'a'.repeat(64);

function memoryCache() {
  const records = new Map<string, NeuralDecoderFeatureCacheRecord>();
  return {
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    put: vi.fn(async (key: string, record: NeuralDecoderFeatureCacheRecord) => { records.set(key, record); }),
  };
}

function decoderResponse() {
  return {
    schema: 'atlas.neural-decoder-encode.v1',
    checkpointRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
    checkpointSha256: 'ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5',
    representationRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
    batchSize: 1,
    latent_256: [row(256)], latent_128: [row(128)], latent_64: [row(64)],
    canonicalAuthority: false, writesPerformed: false,
  };
}

function baseRequest(overrides: Partial<Parameters<typeof runNeuralDecoderPrefillCallerV1>[0]> = {}) {
  return {
    requestId: 'req-1',
    mode: 'DISABLED' as const,
    semantic768: [row(768)],
    basePrefillIdentityChecksum: BASE_PREFILL_IDENTITY,
    decoderContractRevision: 'decoder-contract-v1',
    decoderPolicyRevision: 'policy-v1',
    cache: memoryCache(),
    ...overrides,
  };
}

describe('PREFILL-CALLER-01A: DISABLED preserves old prefill behavior byte-for-byte', () => {
  it('never touches decoder or cache, and resolvedPrefillChecksum equals basePrefillIdentityChecksum verbatim', async () => {
    const decoder = vi.fn();
    const cache = memoryCache();
    const receipt = await runNeuralDecoderPrefillCallerV1(
      baseRequest({ cache, decoder: { fetch: decoder } }),
    );
    expect(receipt.mode).toBe('DISABLED');
    expect(receipt.cacheStatus).toBe('DISABLED');
    expect(receipt.decoderInvocations).toBe(0);
    expect(receipt.canonicalWrites).toBe(0);
    expect(receipt.retrievalVotesAdded).toBe(0);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.resolvedPrefillChecksum).toBe(BASE_PREFILL_IDENTITY);
    expect(decoder).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe('PREFILL-CALLER-01A: SHADOW_READONLY fail-open behavior', () => {
  it('DECODER_UNAVAILABLE on connection failure, resolvedPrefillChecksum unchanged', async () => {
    const decoder = vi.fn(async () => { throw new Error('fetch failed: ECONNREFUSED'); });
    const receipt = await runNeuralDecoderPrefillCallerV1(
      baseRequest({ mode: 'SHADOW_READONLY', decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder } }),
    );
    expect(receipt.cacheStatus).toBe('DECODER_UNAVAILABLE');
    expect(receipt.resolvedPrefillChecksum).toBe(BASE_PREFILL_IDENTITY);
    expect(receipt.canonicalWrites).toBe(0);
    expect(receipt.retrievalVotesAdded).toBe(0);
  });

  it('DECODER_REJECTED on invalid decoder response, resolvedPrefillChecksum unchanged', async () => {
    const decoder = vi.fn(async () => new Response(JSON.stringify({ garbage: true }), { status: 200 }));
    const receipt = await runNeuralDecoderPrefillCallerV1(
      baseRequest({ mode: 'SHADOW_READONLY', decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder } }),
    );
    expect(receipt.cacheStatus).toBe('DECODER_REJECTED');
    expect(receipt.resolvedPrefillChecksum).toBe(BASE_PREFILL_IDENTITY);
  });

  it('HIT/MISS records decoder provenance but still leaves resolvedPrefillChecksum unchanged (observes, does not decide)', async () => {
    const decoder = vi.fn(async () => new Response(JSON.stringify(decoderResponse()), { status: 200 }));
    const cache = memoryCache();
    const receipt = await runNeuralDecoderPrefillCallerV1(
      baseRequest({ mode: 'SHADOW_READONLY', cache, decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder } }),
    );
    expect(receipt.cacheStatus).toBe('MISS');
    expect(receipt.decoderInvocations).toBe(1);
    expect(receipt.decoderOutputChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.decoderQualifiedPrefillIdentityChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.resolvedPrefillChecksum).toBe(BASE_PREFILL_IDENTITY);
    expect(receipt.canonicalWrites).toBe(0);
    expect(receipt.retrievalVotesAdded).toBe(0);
  });
});

describe('PREFILL-CALLER-01A: load-bearing regression', () => {
  it('same input, same resolvedPrefillChecksum across every mode/outcome', async () => {
    const outcomes = await Promise.all([
      runNeuralDecoderPrefillCallerV1(baseRequest({ mode: 'DISABLED' })),
      runNeuralDecoderPrefillCallerV1(baseRequest({
        mode: 'SHADOW_READONLY',
        decoder: { fetch: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) },
      })),
      runNeuralDecoderPrefillCallerV1(baseRequest({
        mode: 'SHADOW_READONLY',
        decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: vi.fn(async () => new Response(JSON.stringify(decoderResponse()), { status: 200 })) },
      })),
    ]);
    const checksums = new Set(outcomes.map((r) => r.resolvedPrefillChecksum));
    expect(checksums.size).toBe(1);
    expect([...checksums][0]).toBe(BASE_PREFILL_IDENTITY);
  });
});

describe('PREFILL-CALLER-01B: deterministic replay (MISS then HIT, identical checksums)', () => {
  it('run 1 MISS (1 decoder call), run 2 HIT (0 decoder calls), identical provenance across both', async () => {
    const cache = memoryCache();
    const decoder = vi.fn(async () => new Response(JSON.stringify(decoderResponse()), { status: 200 }));
    const request = baseRequest({ mode: 'SHADOW_READONLY', cache, decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder } });

    const run1 = await runNeuralDecoderPrefillCallerV1(request);
    const run2 = await runNeuralDecoderPrefillCallerV1(request);

    expect(run1.cacheStatus).toBe('MISS');
    expect(run1.decoderInvocations).toBe(1);
    expect(run2.cacheStatus).toBe('HIT');
    expect(run2.decoderInvocations).toBe(0);
    expect(decoder).toHaveBeenCalledOnce();

    expect(run2.decoderQualifiedPrefillIdentityChecksum).toBe(run1.decoderQualifiedPrefillIdentityChecksum);
    expect(run2.latentInputChecksum).toBe(run1.latentInputChecksum);
    expect(run2.decoderOutputChecksum).toBe(run1.decoderOutputChecksum);
    expect(run2.resolvedPrefillChecksum).toBe(run1.resolvedPrefillChecksum);
  });
});
