import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNativeAccelerationTools } from '../../src/mcp/native-acceleration-tools.ts';
import { loadTensorRTBridge } from '../atlas/load-tensorrt-bridge.mjs';
import { buildGraphGatherFixture, proveSimdjsonGraphGather } from '../../../scripts/atlas/lib/simdjson-graph-gather-v1.mjs';

const addon = loadTensorRTBridge();
if (!addon) throw new Error('NATIVE_ADDON_UNAVAILABLE');
const server = new McpServer({ name: 'simdjson-array-metrics-proof', version: '1.0.0' });
registerNativeAccelerationTools(server, () => ({
  backendInfo: () => addon.getBackendInfo(),
  executionCounters: () => addon.getExecutionCounters(),
  exactTopK: (...args) => addon.batchCosineTopK(...args),
  simdjsonTensorMetrics: () => proveSimdjsonGraphGather({ addon, input: buildGraphGatherFixture() }),
}));
const client = new Client({ name: 'simdjson-array-metrics-client', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const listed = await client.listTools();
  const called = await client.callTool({ name: 'atlas.simdjson_tensor_metrics', arguments: {} });
  const body = JSON.parse(called.content[0].text);
  console.log(JSON.stringify({ schema: 'atlas.simdjson-tensor-mcp-proof.v1', observedAt: new Date().toISOString(),
    transport: 'IN_MEMORY_MCP_REAL_NATIVE_ADDON', tools: listed.tools.map(({ name }) => name),
    ...body, deployedTraceDiscoveryProven: false }, null, 2));
  if (called.isError || body.result.status !== 'CPU_NATIVE_PARITY_PASSED') process.exitCode = 1;
} finally {
  await client.close();
  await server.close();
}
