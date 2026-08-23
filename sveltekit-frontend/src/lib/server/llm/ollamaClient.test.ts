import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bifrostChat: vi.fn(),
  llmModelId: 'hforf.gguf',
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat: (...args: unknown[]) => mocks.bifrostChat(...args),
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({
  LLM_MODEL_ID: mocks.llmModelId,
}));

describe('ollamaClient', () => {
  beforeEach(() => {
    mocks.bifrostChat.mockReset();
    mocks.bifrostChat.mockResolvedValue('ok');
  });

  it('uses the canonical runtime model for legal memo generation', async () => {
    const { generateLegalMemo } = await import('./ollamaClient.js');

    await generateLegalMemo('Case A', 'Important notes');

    expect(mocks.bifrostChat).toHaveBeenCalledTimes(1);
    expect(mocks.bifrostChat.mock.calls[0][1]).toBe('hforf.gguf');
  });

  it('uses the canonical runtime model for PDF summary generation', async () => {
    const { generatePDFSummaryFromNotes } = await import('./ollamaClient.js');

    await generatePDFSummaryFromNotes([
      { content: 'Note body', createdAt: '2026-08-13T00:00:00.000Z' },
    ]);

    expect(mocks.bifrostChat).toHaveBeenCalledTimes(1);
    expect(mocks.bifrostChat.mock.calls[0][1]).toBe('hforf.gguf');
  });
});
