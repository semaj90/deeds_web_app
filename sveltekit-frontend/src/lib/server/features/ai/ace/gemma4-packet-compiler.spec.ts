import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({
  resolveLlamaInferenceTarget: (...args: unknown[]) => mocks.resolve(...args),
}));

import { compilePacketWithGemma4 } from './gemma4-packet-compiler.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('packet compiler active-model resolution', () => {
  it('uses the loaded Ornith model and runtime endpoint', async () => {
    mocks.resolve.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:8090',
      model: 'ornith-1.5-9b',
    });
    const content = JSON.stringify({ facts: [], edges: [], state: {} });
    const event = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
    const responseBody = {
      async *[Symbol.asyncIterator]() {
        yield new TextEncoder().encode(event);
        yield new TextEncoder().encode('data: [DONE]\n');
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: responseBody });
    vi.stubGlobal('fetch', fetchMock);

    const result = await compilePacketWithGemma4({ sample: true });

    expect(mocks.resolve).toHaveBeenCalledWith(90_000);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"ornith-1.5-9b"'),
      }),
    );
    expect(result).toEqual({ facts: [], edges: [], state: {} });
  });

  it('does not call inference when model resolution fails', async () => {
    mocks.resolve.mockRejectedValue(new Error('model unavailable'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(compilePacketWithGemma4({ sample: true })).resolves.toEqual({
      facts: [],
      edges: [],
      state: {},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
