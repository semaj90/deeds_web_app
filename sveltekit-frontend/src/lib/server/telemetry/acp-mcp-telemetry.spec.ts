import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
import { AcpTelemetryCollector } from './acp-mcp-telemetry.js';
import { recordPacketCentricTelemetryAcknowledged } from './packet-centric-telemetry.js';

const collectors: AcpTelemetryCollector[] = [];
const decision = { decision_type: 'tool_dispatch', selected_path: 'retrieval:rerank', confidence: 1, alternatives: [] };
function collector(options: ConstructorParameters<typeof AcpTelemetryCollector>[0] = {}) {
  const instance = new AcpTelemetryCollector({ enable_async_flush: false, ...options });
  collectors.push(instance);
  return instance;
}
beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));
afterEach(() => { for (const instance of collectors.splice(0)) instance.destroy(); });

describe('ACP buffer to existing packet writer', () => {
  it('preserves explicit context and emits only bounded operation summaries', async () => {
    const context = { packet_id: 'packet:fixture', feature_id: 'feature:fixture', source_ref: 'src/fixture.ts',
      som_cell: '2,3', tool_version: 'tool:fixture' };
    const instance = collector({ packet_context: context, node_id: 'fixture-node' });
    instance.recordRoutingDecision({ ...decision, metadata: { hiddenThoughts: 'private', tensor: [1, 2] } });
    instance.recordToolCall({ tool_name: 'retrieval:rerank', params_hash: 'private-params', execution_time_ms: 2,
      status: 'failure', error: 'private exception' });
    context.source_ref = 'src/changed.ts';
    await instance.flush();
    expect(query).toHaveBeenCalledTimes(2);
    expect(instance.getDeliveryStatus()).toEqual({ pending: 0, dropped: 0 });
    for (const [, parameters] of query.mock.calls) {
      const payload = JSON.parse(parameters[13]);
      expect(payload.packet_context).toMatchObject({ packet_id: 'packet:fixture', source_ref: 'src/fixture.ts', som_cell: '2,3' });
      expect(payload.acp_observation.schema).toBe('atlas.acp-observation.v1');
      expect(JSON.stringify(payload)).not.toMatch(/private|hiddenThoughts|tensor|params_hash/);
    }
  });

  it('retains events when the existing writer does not acknowledge and retries without claiming success', async () => {
    const instance = collector();
    instance.recordRoutingDecision(decision);
    query.mockRejectedValueOnce(Object.assign(new Error('fixture unavailable'), { code: '08006' }));
    await instance.flush();
    expect(instance.getDeliveryStatus().pending).toBe(1);
    await instance.flush();
    expect(instance.getDeliveryStatus().pending).toBe(0);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses the existing eval fallback and preserves ACP context in its JSON payload', async () => {
    const instance = collector({ packet_context: { packet_id: 'packet:fixture', rpc_transport: 'mcp' } });
    instance.recordAsyncOp({ op_type: 'mcp.invoke', op_name: 'identity:recover', execution_time_ms: 2, status: 'success' });
    query.mockRejectedValueOnce(Object.assign(new Error('missing table'), { code: '42P01' }));
    await instance.flush();
    expect(query.mock.calls[1][0]).toContain('INSERT INTO atlas_retrieval_eval_times');
    expect(JSON.parse(query.mock.calls[1][1][21])).toMatchObject({ packet_context: { packet_id: 'packet:fixture' },
      acp_observation: { async_ops: [{ op_type: 'mcp.invoke', op_name: 'identity:recover' }] } });
    expect(instance.getDeliveryStatus().pending).toBe(0);
  });

  it('shares an in-flight flush and does not remove events added during it', async () => {
    const instance = collector();
    instance.recordRoutingDecision(decision);
    let release!: (value: { rows: unknown[] }) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = instance.flush();
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    expect(instance.flush()).toBe(pending);
    instance.recordRoutingDecision(decision);
    release({ rows: [] });
    await pending;
    expect(instance.getDeliveryStatus().pending).toBe(1);
    await instance.flush();
    expect(query).toHaveBeenCalledTimes(2);
    expect(instance.getDeliveryStatus().pending).toBe(0);
  });

  it('bounds volatile storage and flush batches while reporting overflow', async () => {
    const bounded = collector({ max_buffer_events: 2 });
    for (let ordinal = 0; ordinal < 3; ordinal++) bounded.recordRoutingDecision(decision);
    expect(bounded.getDeliveryStatus()).toEqual({ pending: 2, dropped: 1 });
    const batched = collector();
    for (let ordinal = 0; ordinal < 17; ordinal++) batched.recordRoutingDecision(decision);
    await batched.flush();
    expect(query).toHaveBeenCalledTimes(16);
    expect(batched.getDeliveryStatus().pending).toBe(1);
  });

  it('fails closed on malformed observations and returns explicit false writer acknowledgement', async () => {
    const instance = collector();
    instance.recordRoutingDecision({ ...decision, confidence: NaN });
    await instance.flush();
    expect(query).not.toHaveBeenCalled();
    expect(instance.getDeliveryStatus().pending).toBe(1);
    const invalid = { schema: 'atlas.acp-observation.v1', tensor: [1, 2] };
    await expect(recordPacketCentricTelemetryAcknowledged({ acp_observation: invalid as never })).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
