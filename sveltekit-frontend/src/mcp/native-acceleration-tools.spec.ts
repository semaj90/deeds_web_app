import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNativeAccelerationTools, type NativeAccelerationToolPort } from './native-acceleration-tools.js';

const counters = {
  cuda_execution: 4,
  cpu_fallback: 2,
  stub_invocation: 0,
  cuda_error_fallback: 0,
  oom_fallback: 0,
};

function register(port: NativeAccelerationToolPort | null) {
  const handlers = new Map<string, () => Promise<any>>();
  const server = {
    registerTool(name: string, _registration: unknown, handler: () => Promise<any>) {
      handlers.set(name, handler);
    },
  };
  registerNativeAccelerationTools(server, () => {
    if (!port) throw new Error('NATIVE_ACCELERATION_DIAGNOSTICS_UNAVAILABLE');
    return port;
  });
  return handlers;
}

function payload(response: any) {
  return JSON.parse(response.content[0].text);
}

describe('native acceleration TRACE tools', () => {
  it('registers only the three bounded diagnostics and receipts backend metadata', async () => {
    const handlers = register({
      backendInfo: () => ({ per_export_backend: { batchCosineTopK: { backend: 'libtorch_cuda' } } }),
      executionCounters: () => counters,
      exactTopK: () => ({ indices: new Int32Array([1, 2]), scores: new Float32Array([1, 0.8]), backend: 'cuda_cublas' }),
    });
    expect([...handlers.keys()]).toEqual(['atlas.backend_info', 'atlas.exact_topk_oracle', 'atlas.parity_report']);

    const result = payload(await handlers.get('atlas.backend_info')!());
    expect(result.result.backendInfo.per_export_backend.batchCosineTopK.backend).toBe('libtorch_cuda');
    expect(result.executionReceipt).toMatchObject({
      schema: 'atlas.native-acceleration-tool-receipt.v1',
      access: 'READ',
      backend: 'libtorch_cuda',
      counterScope: 'CUMULATIVE_PROCESS_SNAPSHOT_NOT_PER_CALL',
      writesPerformed: false,
      modelCallsPerformed: false,
      canonicalAuthority: false,
    });
    expect(result.executionReceipt.receiptChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('runs only the fixed four-vector fixture and records matching parity', async () => {
    let observed: unknown[] = [];
    const handlers = register({
      backendInfo: () => ({}),
      executionCounters: () => counters,
      exactTopK: (query, corpus, rows, dimensions, topK) => {
        observed = [Array.from(query), Array.from(corpus), rows, dimensions, topK];
        return { indices: new Int32Array([1, 2]), scores: new Float32Array([1, 0.8]), backend: 'cuda_cublas' };
      },
    });
    const result = payload(await handlers.get('atlas.exact_topk_oracle')!());
    expect(observed).toEqual([[1, 0], Array.from(new Float32Array([0, 1, 1, 0, 0.8, 0.6, -1, 0])), 4, 2, 2]);
    expect(result.result).toMatchObject({ status: 'PARITY_MATCH', indices: [1, 2], expectedIndices: [1, 2], datastoreAccess: false });
    expect(result.executionReceipt).toMatchObject({ toolName: 'atlas.exact_topk_oracle', backend: 'cuda_cublas' });
    expect(result.executionReceipt.resultSha256).toMatch(/^sha256:[0-9a-f]{64}$/);

    const parity = payload(await handlers.get('atlas.parity_report')!());
    expect(parity.result.status).toBe('PARITY_MATCH');
  });

  it('reports numerical mismatches and unavailable native exports without claiming success', async () => {
    const mismatchHandlers = register({
      backendInfo: () => ({}),
      executionCounters: () => counters,
      exactTopK: () => ({ indices: new Int32Array([2, 1]), scores: new Float32Array([0.8, 1]), backend: 'cpu' }),
    });
    const mismatch = await mismatchHandlers.get('atlas.parity_report')!();
    expect(mismatch.isError).toBe(true);
    expect(payload(mismatch).result.status).toBe('NUMERICAL_MISMATCH');

    const unavailable = await register(null).get('atlas.exact_topk_oracle')!();
    expect(unavailable.isError).toBe(true);
    expect(payload(unavailable).result.status).toBe('UNAVAILABLE');
    expect(payload(unavailable).executionReceipt.writesPerformed).toBe(false);
  });

  it('serves the three tools through an in-memory MCP tools/list and tools/call exchange', async () => {
    const server = new McpServer({ name: 'native-acceleration-fixture', version: '1.0.0' });
    registerNativeAccelerationTools(server, () => ({
      backendInfo: () => ({ per_export_backend: { batchCosineTopK: { backend: 'cpu_fallback' } } }),
      executionCounters: () => counters,
      exactTopK: () => ({ indices: new Int32Array([1, 2]), scores: new Float32Array([1, 0.8]), backend: 'cpu' }),
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'native-acceleration-test-client', version: '1.0.0' });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual(['atlas.backend_info', 'atlas.exact_topk_oracle', 'atlas.parity_report']);
      const called = await client.callTool({ name: 'atlas.parity_report', arguments: {} });
      expect(JSON.parse((called.content[0] as { text: string }).text).result.status).toBe('PARITY_MATCH');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
