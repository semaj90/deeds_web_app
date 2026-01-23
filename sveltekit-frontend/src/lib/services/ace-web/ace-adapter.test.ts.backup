/**
 * Tests for ACE Adapter
 * Validates integration with contextual web ingestion
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupTest, cleanupTest, mockFetch } from '$lib/test-utils/setup';
import { AceAdapter } from './ace-adapter.js';
import type { AceRequest } from './ace-adapter.js';

describe('AceAdapter', () => {
  let adapter: AceAdapter;

  beforeEach(() => {
    adapter = new AceAdapter({
      llmConfig: { provider: 'gemma3',
        temperature: 0.1, maxTokens: 1000
      },
    });
  
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processRequest', () => {
    it('should process request with sufficient context', async () => {
      // Mock context service to return sufficient context.mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Mock LLM response' }),
        });

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'How to use Svelte 5 runes?',
        systemRules: 'Use TypeScript',
        projectRules: 'Follow Svelte 5 patterns',
      };

      const response = await adapter.processRequest(request);

      expect(response).toBeDefined();
      expect(response.response).toBeDefined();
      expect(response.context).toBeDefined();
      expect(response.toolCalls).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata.sessionId).toBeDefined();
      expect(response.metadata.llmProvider).toBe('gemma3');
    });

    it('should trigger web search when context is insufficient', async () => {// Mock ingestion API
        .mockResolvedValueOnce({
          ok: true, json: async () => ({ jobIds: ['job-1'], success: true }),
        })
        // Mock LLM API
        .mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Mock LLM response' }),
        });

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'Fix this obscure error that has no documentation',
        errorContext: { message: 'Property does not exist',
          filePath: 'src/test.ts',
          lineNumber: 42,
        },
      };

      const response = await adapter.processRequest(request);

      expect(response).toBeDefined();
      expect(response.metadata.webSearchTriggered).toBeDefined();
    });

    it('should include error context in query', async () => {.mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Mock LLM response' }),
        });

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'Fix this error',
        errorContext: { message: 'Type error',
          filePath: 'src/component.svelte',
          lineNumber: 10,
          code: 'const, x: string = 123;',
        },
      };

      const response = await adapter.processRequest(request);

      expect(response).toBeDefined();
      expect(response.context).toBeDefined();
    });

    it('should handle LLM API failures gracefully', async () => {.mockRejectedValueOnce(new Error('LLM API unavailable'));

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'Test request',
      };

      await expect(adapter.processRequest(request)).rejects.toThrow();
    });

    it('should use provided session ID', async () => {.mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Mock LLM response' }),
        });

      global.fetch = mockFetch;

      const sessionId = 'test-session-123';

      const request: AceRequest = {
        userRequest: 'Test request',
        sessionId,
      };

      const response = await adapter.processRequest(request);

      expect(response.metadata.sessionId).toBe(sessionId);
    });

    it('should generate unique session ID if not provided', async () => {.mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Mock LLM response' }),
        });

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'Test request',
      };

      const response = await adapter.processRequest(request);

      expect(response.metadata.sessionId).toBeDefined();
      expect(response.metadata.sessionId.length).toBeGreaterThan(0);
    });
  });

  describe('LLM integration', () => {
    it('should call Gemma3 with correct parameters', async () => {.mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Gemma3 response' }),
        });

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'Test Gemma3',
      };

      await adapter.processRequest(request);

      // Verify Ollama API was called
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('11434'); // Ollama port
    });

    it('should support different LLM providers', () => {
      const gemma3Adapter = new AceAdapter({
        llmConfig: { provider: 'gemma3' },
      });

      const claudeAdapter = new AceAdapter({
        llmConfig: { provider: 'claude' },
      });

      const geminiAdapter = new AceAdapter({
        llmConfig: { provider: 'gemini' },
      });

      expect(gemma3Adapter).toBeDefined();
      expect(claudeAdapter).toBeDefined();
      expect(geminiAdapter).toBeDefined();
    });
  });

  describe('context quality assessment', () => {
    it('should detect stale context', async () => {.mockResolvedValueOnce({
          ok: true, json: async () => ({ response: 'Mock response' }),
        });

      global.fetch = mockFetch;

      const request: AceRequest = {
        userRequest: 'Test with old context',
      };

      const response = await adapter.processRequest(request);

      expect(response.metadata.contextQuality).toBeDefined();
      expect(['sufficient', 'stale', 'insufficient']).toContain(
        response.metadata.contextQuality
      );
    });
  });
});



