// @vitest-environment node
/**
 * NAME-ENV-01A proofs: the pure llama-server URL normalizer is import-safe, the runtime
 * contract stays strict, and Ornith request ids differ by transport while the canonical
 * model id does not.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveOrnithRequestModelV1, SERVER_CHAT_MODEL } from '$lib/ai/model-ids.js';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('$lib/server/env.server.js');
  vi.unstubAllEnvs();
});

describe('normalizeLlamaServerBaseUrlV1', () => {
  it.each([
    ['http://127.0.0.1:8090', 'http://127.0.0.1:8090'],
    ['http://127.0.0.1:8090/', 'http://127.0.0.1:8090'],
    ['http://127.0.0.1:8090/v1', 'http://127.0.0.1:8090'],
    ['http://127.0.0.1:8090/v1/', 'http://127.0.0.1:8090'],
    ['  http://127.0.0.1:8090/V1  ', 'http://127.0.0.1:8090'],
  ])('%s -> %s', async (input, expected) => {
    const { normalizeLlamaServerBaseUrlV1 } = await import('./llama-server-model-resolver.js');
    expect(normalizeLlamaServerBaseUrlV1(input)).toBe(expected);
    expect(normalizeLlamaServerBaseUrlV1(expected)).toBe(expected); // stable
  });
});

describe('import safety versus the runtime contract', () => {
  it('the resolver imports with ROTORQUANT_* unset', async () => {
    vi.stubEnv('ROTORQUANT_MODEL_PATH', '');
    vi.stubEnv('TURBO_MODEL_PATH', '');
    vi.doMock('$lib/server/env.server.js', () => ({ ENV: {} }));
    await expect(import('./llama-server-model-resolver.js')).resolves.toBeTruthy();
  });

  it('the runtime contract still throws where its contract requires', async () => {
    vi.doMock('$lib/server/env.server.js', () => ({ ENV: {} }));
    await expect(import('$lib/server/llm/runtime-contract.js')).rejects.toThrow(/ROTORQUANT_MODEL_PATH is required/);
  });
});

describe('Ornith request model id per transport', () => {
  it('direct llama-server sends the bare canonical id', () => {
    expect(resolveOrnithRequestModelV1('LLAMA_SERVER')).toEqual({
      target: 'LLAMA_SERVER',
      canonicalModelId: 'ornith-1.5-9b',
      requestModelId: 'ornith-1.5-9b',
    });
  });

  it('Bifrost sends the provider-prefixed id with the same canonical id', () => {
    expect(resolveOrnithRequestModelV1('BIFROST_OPENAI')).toEqual({
      target: 'BIFROST_OPENAI',
      canonicalModelId: 'ornith-1.5-9b',
      requestModelId: 'openai/ornith-1.5-9b',
    });
    expect(resolveOrnithRequestModelV1('BIFROST_OPENAI').canonicalModelId).toBe(SERVER_CHAT_MODEL);
  });

  it('unknown transport targets fail closed', () => {
    expect(() => resolveOrnithRequestModelV1('OLLAMA' as never)).toThrow(/UNKNOWN_ORNITH_TRANSPORT_TARGET/);
  });
});
