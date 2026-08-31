import { describe, expect, it, vi } from 'vitest';
import { buildNeuralDecoderFeaturePrefill, encodeNeuralLatents, encodeNeuralLatentsWithFeatureCache } from './neural-decoder-client.js';
import { prepareNeuralDecoderFeaturePrefill } from './neural-decoder-prefill-adapter.js';

const row = (size: number) => Array.from({ length: size }, () => 0.01);

describe('neural decoder client', () => {
  it('validates and returns revision-bound latent views', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      schema: 'atlas.neural-decoder-encode.v1',
      checkpointRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      checkpointSha256: 'ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5',
      representationRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      batchSize: 1,
      latent_256: [row(256)], latent_128: [row(128)], latent_64: [row(64)],
      canonicalAuthority: false, writesPerformed: false,
    }), { status: 200 }));
    const result = await encodeNeuralLatents([row(768)], { baseUrl: 'http://127.0.0.1:8121', fetch: fetcher });
    expect(result.latent_256[0]).toHaveLength(256);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('binds latent output to an existing prefill identity without claiming cache authority', () => {
    const response = {
      schema: 'atlas.neural-decoder-encode.v1',
      checkpointRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      checkpointSha256: 'ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5',
      representationRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      batchSize: 1,
      latent_256: [row(256)], latent_128: [row(128)], latent_64: [row(64)],
      canonicalAuthority: false, writesPerformed: false,
    };
    const envelope = buildNeuralDecoderFeaturePrefill('a'.repeat(64), response);
    expect(envelope.representationId).toBe('latent_256');
    expect(envelope.latent256Checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.canonicalAuthority).toBe(false);
  });

  it('rejects invalid input before making a request', async () => {
    const fetcher = vi.fn();
    await expect(encodeNeuralLatents([row(767)], { baseUrl: 'http://127.0.0.1:8121', fetch: fetcher })).rejects.toThrow('INPUT_INVALID');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('replays a decoder feature cache MISS then HIT without a second decoder call', async () => {
    const response = {
      schema: 'atlas.neural-decoder-encode.v1',
      checkpointRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      checkpointSha256: 'ac5c069d714bd1b07efdbe5abb1aea993c11b3851d427c508ce76e4eebb616c5',
      representationRevision: 'd6e9395e60f0bb039dd03368012697c5c393d36bb001b8f020b6d7ba22654259',
      batchSize: 1,
      latent_256: [row(256)], latent_128: [row(128)], latent_64: [row(64)],
      canonicalAuthority: false, writesPerformed: false,
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    const records = new Map<string, any>();
    const cache = {
      get: vi.fn(async (key: string) => records.get(key) ?? null),
      put: vi.fn(async (key: string, record: any) => { records.set(key, record); }),
    };
    const first = await encodeNeuralLatentsWithFeatureCache([row(768)], 'b'.repeat(64), cache, { baseUrl: 'http://127.0.0.1:8121', fetch: fetcher });
    const second = await encodeNeuralLatentsWithFeatureCache([row(768)], 'b'.repeat(64), cache, { baseUrl: 'http://127.0.0.1:8121', fetch: fetcher });
    expect(first.status).toBe('MISS');
    expect(second.status).toBe('HIT');
    expect(second.envelope.latent256Checksum).toBe(first.envelope.latent256Checksum);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it('keeps the default application path disabled without calling decoder or cache', async () => {
    const decoder = vi.fn();
    const cache = { get: vi.fn(), put: vi.fn() };
    const result = await prepareNeuralDecoderFeaturePrefill({
      semantic768: [row(768)],
      prefillIdentityChecksum: 'c'.repeat(64),
      cache,
      decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: decoder },
    });
    expect(result.status).toBe('DISABLED');
    expect(decoder).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('requires an existing prefill identity when explicitly enabled', async () => {
    const cache = { get: vi.fn(async () => null), put: vi.fn() };
    await expect(prepareNeuralDecoderFeaturePrefill({
      enabled: true,
      semantic768: [row(768)],
      prefillIdentityChecksum: 'not-a-checksum',
      cache,
      decoder: { baseUrl: 'http://127.0.0.1:8121', fetch: vi.fn() },
    })).rejects.toThrow('NEURAL_DECODER_PREFILL_IDENTITY_INVALID');
    expect(cache.get).not.toHaveBeenCalled();
  });
});
