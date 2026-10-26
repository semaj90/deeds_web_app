import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import type { DispatcherState, NodeContext } from '../langgraph/dispatcher-nodes/types.js';
const { query, directWrite } = vi.hoisted(() => ({ query: vi.fn(), directWrite: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
vi.mock('../langgraph/dispatcher-nodes/index.js', () => {
  const node = async (state: DispatcherState) => ({ ...state, action: 'success', result: { summary: 'private fixture output' } });
  return { nodeBitmapGateScoring: node, nodeEscalateQuarantine: node, nodeRecoverIdentity: node,
    nodeValidateEnvelope: node, nodeSyncQdrantMirror: node, nodeSyncNeo4jMirror: node,
    nodeExpandTopology: node, nodeRerankCandidates: node, nodeSynthesizeAnswer: node, nodeEscalateOperator: node };
});
import { emitDispatcherTelemetry, withDispatcherTelemetry } from './dispatcher-telemetry-wrapper.js';
import { createDispatcherGraph } from '../langgraph/dispatcher-graph.js';

const redis = { setex: directWrite } as unknown as Redis;
const postgres = { run: directWrite };
function state(): DispatcherState {
  return { trace_id: 'trace:dispatcher-fixture', query: 'private query', candidates: [], identity_lane: 'canonical', parity_status: 'aligned',
    dispatch_decision: 'synthesize', dispatch_confidence: 0, synthesis_path: [], tool_calls: [], errors: [],
    latency_ms: 0, action: 'success', packet_context: { packet_id: 'packet:fixture', source_ref: 'src/fixture.ts',
      feature_id: 'feature:fixture', som_cell: '1,2', tool_version: 'tool:fixture' } };
}
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  directWrite.mockReset().mockImplementation(() => { throw new Error('No direct orchestration writes allowed'); });
});

describe('dispatcher observation handoff', () => {
  it('reuses the packet writer without direct clients or assumed tables and preserves zero confidence', async () => {
    const input = state();
    input.dispatch_confidence = 0.7;
    const emitted = await emitDispatcherTelemetry('node_fixture', input, redis, postgres, 2, { confidence: 0 });
    expect(emitted).toMatchObject({ redis_written: false, redis_key: '', postgres_deferred: true,
      telemetry_event: { confidence: 0, packet_context: input.packet_context } });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(directWrite).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).not.toContain('INSERT INTO acp_telemetry');
    const payload = JSON.parse(query.mock.calls[0][1][13]);
    expect(payload.acp_observation).toMatchObject({ routing_decisions: [{ confidence: 0 }],
      async_ops: [{ op_type: 'dispatcher.node', status: 'success' }] });
    expect(JSON.stringify(payload)).not.toContain('private query');
  });

  it('preserves the original handler exception while recording failure', async () => {
    const failure = new Error('private handler failure');
    const wrapped = withDispatcherTelemetry('node_fixture', async () => { throw failure; }, redis, postgres);
    await expect(wrapped(state())).rejects.toBe(failure);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(query.mock.calls[0][1][13]);
    expect(payload.acp_observation.async_ops[0].status).toBe('failure');
    expect(JSON.stringify(payload)).not.toContain(failure.message);
  });

  it('returns a failed state unchanged without waiting for the telemetry writer', async () => {
    let release!: (value: { rows: unknown[] }) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const output: DispatcherState = { ...state(), action: 'failed' };
    const wrapped = withDispatcherTelemetry('node_fixture', async () => output, redis, postgres);
    expect(await wrapped(state())).toBe(output);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(JSON.parse(query.mock.calls[0][1][13]).acp_observation.async_ops[0].status).toBe('failure');
    release({ rows: [] });
  });

  it('keeps explicit packet context through the actual compiled graph and final state', async () => {
    const input = state();
    const context = { state: input, redis, postgres, mcpClient: {}, qdrant: {}, neo4j: {} } as NodeContext;
    const graph = createDispatcherGraph(context);
    const output = await graph.invoke(input);
    expect(output.packet_context).toEqual(input.packet_context);
    expect(output.trace_id).toBe(input.trace_id);
    expect(output.result).toEqual({ summary: 'private fixture output' });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(query.mock.calls[0][1][13]);
    expect(payload.packet_context).toMatchObject(input.packet_context!);
    expect(payload.trace_id).toBe(input.trace_id);
    expect(payload.acp_observation.trace_id).toBe(input.trace_id);
    expect(payload.acp_observation.node_id).toBe('node_synthesize_answer');
    expect(JSON.stringify(payload)).not.toContain(output.result.summary);
    expect(directWrite).not.toHaveBeenCalled();
  });

  it('does not infer packet identity from candidate rows and rejects invalid duration without writes', async () => {
    const input = state();
    delete input.packet_context;
    input.candidates = [{ packet_key: 'packet:unqualified', source_ref: 'src/unknown.ts', feature_id: 'feature:unknown',
      confidence: 1, identity_lane: 'canonical' }];
    await emitDispatcherTelemetry('node_fixture', input, redis, postgres, 2);
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(JSON.parse(query.mock.calls[0][1][13]).packet_context.packet_id).toBeNull();
    const invalid = await emitDispatcherTelemetry('node_fixture', input, redis, postgres, Infinity);
    expect(invalid.postgres_deferred).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(directWrite).not.toHaveBeenCalled();
  });
});
