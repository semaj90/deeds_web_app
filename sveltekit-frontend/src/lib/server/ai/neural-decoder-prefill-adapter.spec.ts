import { describe, expect, it, vi } from 'vitest';
import { prepareNeuralDecoderFeaturePrefill } from './neural-decoder-prefill-adapter.js';

const row = (size: number) => Array.from({ length: size }, () => 0.01);

describe('neural decoder prefill adapter', () => {
  it('is disabled by default without touching decoder or cache', async () => {
    const decoder = vi.fn();
    const cache = { get: vi.fn(), put: vi.fn() };

    const result = await prepareNeuralDecoderFeaturePrefill({
      semantic768: [row(768)],
      prefillIdentityChecksum: 'a'.repeat(64),
      cache,
      decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder },
    });

    expect(result).toEqual({ status: 'DISABLED', response: null, envelope: null, key: null });
    expect(decoder).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('rejects an invalid identity before cache or decoder access', async () => {
    const cache = { get: vi.fn(), put: vi.fn() };
    const decoder = vi.fn();

    await expect(prepareNeuralDecoderFeaturePrefill({
      enabled: true,
      semantic768: [row(768)],
      prefillIdentityChecksum: 'not-a-checksum',
      cache,
      decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder },
    })).rejects.toThrow('NEURAL_DECODER_PREFILL_IDENTITY_INVALID');
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(decoder).not.toHaveBeenCalled();
  });

  it('delegates a valid explicit request to the guarded cache/decoder seam', async () => {
    const response = {
      schema: 'atlas.neural-decoder-encode.v1',
      checkpointRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      checkpointSha256: 'ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5',
      representationRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      batchSize: 1,
      latent_256: [row(256)],
      latent_128: [row(128)],
      latent_64: [row(64)],
      canonicalAuthority: false,
      writesPerformed: false,
    };
    const records = new Map<string, unknown>();
    const cache = {
      get: vi.fn(async (key: string) => records.get(key) ?? null),
      put: vi.fn(async (key: string, value: unknown) => { records.set(key, value); }),
    };
    const decoder = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));

    const result = await prepareNeuralDecoderFeaturePrefill({
      enabled: true,
      semantic768: [row(768)],
      prefillIdentityChecksum: 'b'.repeat(64),
      cache,
      decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder },
    });

    expect(result.status).toBe('MISS');
    expect(result.envelope.representationId).toBe('latent_256');
    expect(result.envelope.canonicalAuthority).toBe(false);
    expect(decoder).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
  });
});
