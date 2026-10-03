import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ollamaFetch: vi.fn(),
  isOnnxEmbedAvailable: vi.fn(),
  tryEmbedOnnx: vi.fn(),
}));

vi.mock('$lib/server/ollama.js', () => ({ ollamaFetch: mocks.ollamaFetch }));
vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceEmbedding: (_text: string, _model: string, run: () => Promise<unknown>) => run(),
}));
vi.mock('../embedding/onnx-embed.js', () => ({
  isOnnxEmbedAvailable: mocks.isOnnxEmbedAvailable,
  tryEmbedOnnx: mocks.tryEmbedOnnx,
}));

describe('server canonical embedding compatibility entrypoint', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses Ollama and never promotes the local ONNX challenger', async () => {
    const expected = new Array(768).fill(0.25);
    mocks.ollamaFetch.mockResolvedValue(new Response(JSON.stringify({
      model: 'embeddinggemma:latest',
      embedding: expected,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    mocks.isOnnxEmbedAvailable.mockResolvedValue(true);
    mocks.tryEmbedOnnx.mockResolvedValue(new Array(768).fill(0.5));

    const { tryEmbedCanonical } = await import('./ollama.js');
    const result = await tryEmbedCanonical('bounded test input', {
      baseUrl: 'http://ollama.test',
    });

    expect(result).toMatchObject({ source: 'ollama', model: 'embeddinggemma:latest' });
    expect(result?.embedding).toEqual(expected);
    expect(mocks.isOnnxEmbedAvailable).not.toHaveBeenCalled();
    expect(mocks.tryEmbedOnnx).not.toHaveBeenCalled();
  });

  it('fails closed when Ollama is unavailable instead of returning an off-space ONNX vector', async () => {
    mocks.ollamaFetch.mockResolvedValue(new Response('{}', { status: 503 }));
    mocks.isOnnxEmbedAvailable.mockResolvedValue(true);
    mocks.tryEmbedOnnx.mockResolvedValue(new Array(768).fill(0.5));

    const { tryEmbedCanonical } = await import('./ollama.js');
    const result = await tryEmbedCanonical('bounded test input', {
      baseUrl: 'http://ollama.test',
    });

    expect(result).toBeNull();
    expect(mocks.isOnnxEmbedAvailable).not.toHaveBeenCalled();
    expect(mocks.tryEmbedOnnx).not.toHaveBeenCalled();
  });
});
