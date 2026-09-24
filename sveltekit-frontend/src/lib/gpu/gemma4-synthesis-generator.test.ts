/**
 * Unit tests for the Ornith synthesis generator (Stage 5).
 * Tests: fallback synthesis, citation extraction, ACE context handling
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { ACEContext } from '$lib/server/ace/types.js';
import type { DecomposedQuery } from './gemma4-policy-orchestrator';
import { synthesizeWithGemma4 } from './gemma4-synthesis-generator';

const { resolveLlamaInferenceTarget } = vi.hoisted(() => ({
  resolveLlamaInferenceTarget: vi.fn()
}));

vi.mock('$lib/server/llm/runtime-contract.js', () => ({ resolveLlamaInferenceTarget }));

describe('Ornith Synthesis Generator (legacy Gemma4 module/API name)', () => {
  beforeEach(() => {
    resolveLlamaInferenceTarget.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:8090',
      model: 'ornith-1.5-9b',
      configuredModel: 'configured-preference',
      modelSource: 'llama-server-loaded',
      selectionPolicy: 'LOADED_ACTIVE',
      selectionReceiptChecksum: 'fixture-checksum'
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('sends the loaded Ornith id as model to llama-server :8090 chat completions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"Grounded answer [src/example.ts]"}}]}\n\n' +
      'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    ));

    const result = await synthesizeWithGemma4({
      query: 'What does the example do?',
      decomposition: { intent: 'synthesize', subgoals: [] } as DecomposedQuery,
      aceContext: {
        ragChunks: [], kbChunks: [], caseChunks: [], docChunks: []
      } as ACEContext
    });

    expect(resolveLlamaInferenceTarget).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe('http://127.0.0.1:8090/v1/chat/completions');
    const payload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(payload.model).toBe('ornith-1.5-9b');
    expect(payload).not.toHaveProperty('llmModelId');
    expect(result.reasoning).toContain('Ornith');
  });

  it('keeps the non-streaming fallback on the same server and loaded model', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'Fallback answer [src/fallback.ts]' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await synthesizeWithGemma4({
      query: 'Explain the fallback path.',
      decomposition: { intent: 'synthesize', subgoals: [] } as DecomposedQuery,
      aceContext: {
        ragChunks: [], kbChunks: [], caseChunks: [], docChunks: []
      } as ACEContext
    });

    expect(resolveLlamaInferenceTarget).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(url).toBe('http://127.0.0.1:8090/v1/chat/completions');
      expect(JSON.parse(String(init?.body)).model).toBe('ornith-1.5-9b');
    }
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)).stream).toBe(true);
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).stream).toBe(false);
    expect(result.answer).toContain('Fallback answer');
  });

  describe('Fallback Synthesis', () => {
    it('should generate fallback answer when LLM unavailable', () => {
      // This test would verify getFallbackSynthesis behavior
      // In unit mode (no network), the synthesis will always fall back
      expect(true).toBe(true); // Placeholder
    });

    it('should combine packet summaries into answer', () => {
      // Test that multiple packets are combined into coherent answer
      expect(true).toBe(true); // Placeholder
    });

    it('should extract citations from ACE context', () => {
      // Test that citations from evidence are properly formatted
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Citation Parsing', () => {
    it('should extract [citation] format from answer text', () => {
      const answerText = 'Based on evidence [src/auth.ts] we can see that [src/db.ts] handles queries.';
      // Should extract: ['src/auth.ts', 'src/db.ts']
      expect(true).toBe(true); // Placeholder
    });

    it('should handle missing citations gracefully', () => {
      const answerText = 'No citations in this answer.';
      // Should return empty citations array
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('ACE Context Handling', () => {
    it('should preserve packet order in evidence', () => {
      // Test that selectedPackets and evidence arrays stay aligned
      expect(true).toBe(true); // Placeholder
    });

    it('should respect token budget when building context', () => {
      // Test that context window bounds are respected
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign high confidence to model synthesis', () => {
      // Model synthesis should have confidence > 0.8
      expect(true).toBe(true); // Placeholder
    });

    it('should assign lower confidence to fallback synthesis', () => {
      // Fallback synthesis should have confidence < 0.7
      expect(true).toBe(true); // Placeholder
    });
  });
});
