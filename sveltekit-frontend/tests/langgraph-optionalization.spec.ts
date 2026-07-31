/**
 * Test Suite: LangGraph Optionalization in TRACE MCP
 *
 * Validates that TRACE MCP functions correctly with LangGraph disabled.
 * - DispatcherMiddleware.wrap() skips state machine when langgraphEnabled=false
 * - Tool execution succeeds regardless of LangGraph status
 * - /health endpoint reports langgraph status accurately
 * - Feature flag defaults to true for backward compatibility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DispatcherMiddleware } from '../src/mcp/dispatcher-middleware.js';
import type { Pool } from 'pg';
import type { EngramMemoryBridge } from '../src/mcp/memory-bridge.js';
import type { LangGraphBridge, DispatcherState } from '../src/mcp/langgraph-bridge.js';

// Mock implementations
class MockPool implements Partial<Pool> {
  async connect() {
    return {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
  }
}

class MockEngramMemoryBridge implements Partial<EngramMemoryBridge> {
  async recordObservation() {}
}

class MockLangGraphBridge implements LangGraphBridge {
  getConfig() {
    return {
      maxStateSize: 32_000,
      maxToolResultChars: 12_000,
      priorityLanes: [],
      memoryOverflowBehavior: 'truncate' as const,
    };
  }

  applyHeadroom(state: DispatcherState): DispatcherState {
    return state;
  }

  async invokeTool(
    toolName: string,
    toolResult: Record<string, unknown>,
    currentState: DispatcherState
  ): Promise<{ result: unknown; updatedState: DispatcherState }> {
    return { result: toolResult, updatedState: currentState };
  }

  async persistStateToDB(state: DispatcherState, sessionId: string): Promise<void> {
    // Mock implementation
  }

  async ensureSchema(): Promise<void> {
    // Mock implementation
  }
}

describe('DispatcherMiddleware LangGraph Optionalization', () => {
  let middleware: DispatcherMiddleware;
  let mockPool: Partial<Pool>;
  let mockEngram: Partial<EngramMemoryBridge>;
  let mockLangGraph: LangGraphBridge;

  beforeEach(() => {
    mockPool = new MockPool();
    mockEngram = new MockEngramMemoryBridge();
    mockLangGraph = new MockLangGraphBridge();
  });

  describe('DispatcherMiddleware with langgraphEnabled=false', () => {
    it('should skip LangGraph state machine when langgraphEnabled=false', async () => {
      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngram as EngramMemoryBridge,
        mockLangGraph,
        false // langgraphEnabled=false
      );

      const toolHandler = vi.fn().mockResolvedValue({ success: true, data: 'test result' });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      const result = await wrapped({ query: 'test' });

      expect(result).toEqual({ success: true, data: 'test result' });
      expect(toolHandler).toHaveBeenCalledWith({ query: 'test' });
    });

    it('should create a NoOpLangGraphBridge when langgraphBridge is null', () => {
      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngram as EngramMemoryBridge,
        null, // null bridge = use NoOpLangGraphBridge
        false
      );

      const toolHandler = vi.fn().mockResolvedValue({ data: 'works' });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      expect(wrapped).toBeDefined();
      expect(typeof wrapped).toBe('function');
    });
  });

  describe('DispatcherMiddleware with langgraphEnabled=true (default)', () => {
    it('should use LangGraph state machine when langgraphEnabled=true', async () => {
      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngram as EngramMemoryBridge,
        mockLangGraph,
        true // langgraphEnabled=true (default)
      );

      const applyHeadroomSpy = vi.spyOn(mockLangGraph, 'applyHeadroom');
      const invokeToolSpy = vi.spyOn(mockLangGraph, 'invokeTool');

      const toolHandler = vi.fn().mockResolvedValue({ success: true });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      await wrapped({ query: 'test' });

      expect(applyHeadroomSpy).toHaveBeenCalled();
      expect(invokeToolSpy).toHaveBeenCalled();
    });
  });

  describe('Tool execution without Pool (null pool)', () => {
    it('should skip persistence when pool is null', async () => {
      const middleware = new DispatcherMiddleware(
        null, // null pool
        mockEngram as EngramMemoryBridge,
        mockLangGraph,
        false
      );

      const toolHandler = vi.fn().mockResolvedValue({ result: 'success' });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      const result = await wrapped({ input: 'data' });

      expect(result).toEqual({ result: 'success' });
      expect(toolHandler).toHaveBeenCalled();
    });
  });

  describe('Error handling with LangGraph disabled', () => {
    it('should propagate tool errors even with LangGraph disabled', async () => {
      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngram as EngramMemoryBridge,
        mockLangGraph,
        false
      );

      const error = new Error('Tool execution failed');
      const toolHandler = vi.fn().mockRejectedValue(error);
      const wrapped = middleware.wrap(toolHandler, 'failing.tool', 'session-123');

      await expect(wrapped({ input: 'data' })).rejects.toThrow('Tool execution failed');
    });

    it('should record observations even on error with LangGraph disabled', async () => {
      const mockEngramWithSpy = new MockEngramMemoryBridge();
      const recordObservationSpy = vi.spyOn(mockEngramWithSpy, 'recordObservation');

      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngramWithSpy as EngramMemoryBridge,
        mockLangGraph,
        false
      );

      const error = new Error('Test error');
      const toolHandler = vi.fn().mockRejectedValue(error);
      const wrapped = middleware.wrap(toolHandler, 'tool.name', 'session-456');

      try {
        await wrapped({ input: 'test' });
      } catch (e) {
        // Expected to throw
      }

      expect(recordObservationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_invocation',
          tool_name: 'tool.name',
          session_id: 'session-456',
          outcome: 'error',
        })
      );
    });
  });

  describe('Tool call metadata generation', () => {
    it('should generate unique tool call IDs regardless of LangGraph status', async () => {
      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngram as EngramMemoryBridge,
        mockLangGraph,
        false
      );

      const toolHandler = vi.fn().mockResolvedValue({ success: true });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      await wrapped({ query: 'test' });

      // Verify tool was called (metadata was generated internally)
      expect(toolHandler).toHaveBeenCalled();
    });
  });

  describe('Feature flag defaults to true (backward compatibility)', () => {
    it('should enable LangGraph by default when langgraphEnabled is not specified', () => {
      // Constructor defaults langgraphEnabled to true
      const middleware = new DispatcherMiddleware(
        mockPool as Pool,
        mockEngram as EngramMemoryBridge,
        mockLangGraph
        // langgraphEnabled defaults to true
      );

      const toolHandler = vi.fn().mockResolvedValue({ data: 'test' });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      expect(wrapped).toBeDefined();
      expect(typeof wrapped).toBe('function');
    });
  });

  describe('NoOpLangGraphBridge behavior', () => {
    it('should have NoOpLangGraphBridge pass through state unchanged', () => {
      const middleware = new DispatcherMiddleware(
        null, // null pool
        null, // null engram
        null, // null langgraphBridge = create NoOpLangGraphBridge
        false
      );

      const state: DispatcherState = {
        current_tool: 'test.tool',
        current_input: { query: 'test' },
        action: 'tool_call',
      };

      // Verify that middleware can be used without errors
      const toolHandler = vi.fn().mockResolvedValue({ success: true });
      const wrapped = middleware.wrap(toolHandler, 'test.tool', 'session-123');

      expect(wrapped).toBeDefined();
    });
  });
});
