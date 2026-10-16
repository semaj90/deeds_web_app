import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLlamaRuntimeTools } from '../../src/mcp/llama-runtime-tools.ts';

const server = new McpServer({ name: 'llama-runtime-live-status-proof', version: '1.0.0' });
registerLlamaRuntimeTools(server);
const client = new Client({ name: 'llama-runtime-status-client', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const listing = await client.listTools();
  const result = await client.callTool({ name: 'llama_server.status', arguments: {} }, undefined, { timeout: 60_000 });
  const receipt = JSON.parse(result.content[0].text);
  console.log(JSON.stringify({
    schema: 'atlas.llama-runtime-mcp-status-proof.v1',
    observedAt: new Date().toISOString(),
    transport: 'in-memory MCP; real Windows controller and NVIDIA readback',
    tools: listing.tools.map(({ name }) => name),
    receipt,
    deployedTraceDiscoveryProven: false,
    liveStartUnloadCycleProven: false,
  }, null, 2));
  if (result.isError || receipt.serviceMutationPerformed !== false) process.exitCode = 1;
} finally {
  await client.close();
  await server.close();
}
