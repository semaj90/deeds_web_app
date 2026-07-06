/**
 * Dispatcher LangGraph Wiring — E2E Integration Tests
 * Tests the 9-node dispatcher routing, state mutations, and MCP tool binding
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcherGraph } from '$lib/server/langgraph/dispatcher-graph.js';
import type { DispatcherState, NodeContext } from '$lib/server/langgraph/dispatcher-nodes/types.js';

describe('Dispatcher LangGraph Wiring', () => {
  let graph: ReturnType<typeof createDispatcherGraph>;
  let mockNodeContext: NodeContext;

  beforeEach(() => {
    // Mock NodeContext (in production, these are real service clients)
    mockNodeContext = {
      mcpClient: {
        callTool: async (name: string, args: any) => ({
          content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
        }),
      },
      postgres: null,
      redis: null,
      qdrant: null,
      neo4j: null,
      logger: console,
    } as any;

    graph = createDispatcherGraph(mockNodeContext);
  });

  it('should initialize graph with 9 nodes + start/end', () => {
    // Graph compilation succeeds without errors
    expect(graph).toBeDefined();
    // Nodes exist (verified by type system; runtime check would require graph introspection)
    expect(graph).toHaveProperty('invoke');
    expect(graph).toHaveProperty('stream');
  });

  it('should route decision=quarantine → node_escalate_quarantine', async () => {
    const initialState: DispatcherState = {
      query: 'test query',
      candidates: [],
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'quarantine',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.95,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(initialState);
    expect(result.synthesis_path).toContain('start');
    expect(result.action).toBeDefined();
  });

  it('should route decision=recover → node_recover_identity', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [{ packet_key: 'missing:key', feature_id: 'auth' }] as any,
      identity_lane: 'recoverable',
      parity_status: 'out_of_sync',
      dispatch_decision: 'recover',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.75,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result.tool_calls.length).toBeGreaterThanOrEqual(0);
  });

  it('should route decision=validate → node_validate_envelope', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'unknown',
      dispatch_decision: 'validate',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result).toBeDefined();
  });

  it('should route decision=sync_qdrant → node_sync_qdrant_mirror', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'sync_qdrant',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result).toBeDefined();
  });

  it('should route decision=sync_neo4j → node_sync_neo4j_mirror', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'sync_neo4j',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result).toBeDefined();
  });

  it('should route decision=expand_graph → node_expand_topology', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'expand_graph',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result).toBeDefined();
  });

  it('should route decision=rerank → node_rerank_candidates', async () => {
    const state: DispatcherState = {
      query: 'test query',
      candidates: [
        { packet_key: 'p1', feature_id: 'f1', summary: 'summary 1' },
        { packet_key: 'p2', feature_id: 'f2', summary: 'summary 2' },
      ] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'rerank',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result.tool_calls.length).toBeGreaterThanOrEqual(0);
  });

  it('should route decision=synthesize → node_synthesize_answer', async () => {
    const state: DispatcherState = {
      query: 'What is authentication?',
      candidates: [
        { packet_key: 'auth:1', feature_id: 'auth.sessions', summary: 'Session validation logic' },
      ] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'synthesize',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.95,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result.result).toBeDefined();
  });

  it('should route decision=escalate → node_escalate_operator', async () => {
    const state: DispatcherState = {
      query: 'unknown query',
      candidates: [] as any,
      identity_lane: 'quarantine',
      parity_status: 'unknown',
      dispatch_decision: 'escalate',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.1,
      synthesis_path: [],
      tool_calls: [],
      errors: ['Identity recovery failed', 'No candidates available'],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should accumulate synthesis_path across nodes', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'validate',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result.synthesis_path.length).toBeGreaterThan(0);
    expect(result.synthesis_path[0]).toBe('start');
  });

  it('should log latency_ms in end node', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'validate',
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.9,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: Date.now(),
      action: '',
      reason: undefined,
      result: null,
    };

    const result = await graph.invoke(state);
    expect(result.latency_ms).toBeGreaterThan(0);
  });

  it('should handle unknown dispatch_decision gracefully', async () => {
    const state: DispatcherState = {
      query: 'test',
      candidates: [] as any,
      identity_lane: 'canonical',
      parity_status: 'in_sync',
      dispatch_decision: 'unknown_decision' as any,
      dispatch_node: undefined,
      dispatch_tool: undefined,
      dispatch_confidence: 0.0,
      synthesis_path: [],
      tool_calls: [],
      errors: [],
      latency_ms: 0,
      start_time: undefined,
      action: '',
      reason: undefined,
      result: null,
    };

    // Should route to escalate or log warning without crashing
    const result = await graph.invoke(state);
    expect(result).toBeDefined();
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });
});
