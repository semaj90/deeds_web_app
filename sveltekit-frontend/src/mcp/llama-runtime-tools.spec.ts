import { describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod/v3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLlamaRuntimeTools, type LlamaControlAction, type LlamaControlRunner } from './llama-runtime-tools.js';

function receipt(action: LlamaControlAction) {
  return {
    schema: 'atlas.llama-runtime-control.v1', action, port: 8090, status: 'STOPPED',
    serviceMutationPerformed: false, before: null, after: null,
    memoryDeltas: [], memoryReleaseObserved: null, error: null,
  };
}

function payload(result: unknown) {
  const parsed = z.object({ content: z.array(z.object({ text: z.string() })) }).parse(result);
  return JSON.parse(parsed.content[0].text);
}

async function connect(runner: Mock<LlamaControlRunner> = vi.fn<LlamaControlRunner>(async (action) => receipt(action))) {
  const server = new McpServer({ name: 'llama-runtime-test', version: '1.0.0' });
  registerLlamaRuntimeTools(server, runner);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'llama-runtime-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, runner, close: async () => { await client.close(); await server.close(); } };
}

describe('llama-server MCP controls', () => {
  it('lists three bounded tools and reads status through an actual MCP exchange', async () => {
    const session = await connect();
    try {
      const listed = await session.client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual(['llama_server.status', 'llama_server.start', 'llama_server.unload']);
      const result = await session.client.callTool({ name: 'llama_server.status', arguments: {} });
      expect(result.isError).toBe(false);
      expect(payload(result)).toMatchObject({ status: 'STOPPED', memoryReleaseObserved: null });
      expect(session.runner).toHaveBeenCalledWith('status', undefined);
    } finally { await session.close(); }
  });

  it.each([
    ['llama_server.start', {}],
    ['llama_server.unload', { confirm: false }],
    ['llama_server.start', { confirm: true, profile: 'arbitrary-model' }],
    ['llama_server.unload', { confirm: true, pid: 123 }],
    ['llama_server.status', { port: 8091 }],
  ])('rejects unsafe inputs before executing %s', async (name, args) => {
    const session = await connect();
    try {
      const result = await session.client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      expect(session.runner).not.toHaveBeenCalled();
    } finally { await session.close(); }
  });

  it('passes only approved profiles and explicit actions', async () => {
    const session = await connect();
    try {
      await session.client.callTool({ name: 'llama_server.start', arguments: { confirm: true } });
      await session.client.callTool({ name: 'llama_server.start', arguments: { confirm: true, profile: 'ornith-1.5-vlm' } });
      await session.client.callTool({ name: 'llama_server.unload', arguments: { confirm: true } });
      expect(session.runner.mock.calls).toEqual([['start', 'ornith-1.5'], ['start', 'ornith-1.5-vlm'], ['unload', undefined]]);
    } finally { await session.close(); }
  });

  it('preserves refusal receipts without claiming memory was released', async () => {
    const runner = vi.fn(async (action: LlamaControlAction) => ({ ...receipt(action), status: 'ERROR', error: 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP' }));
    const session = await connect(runner);
    try {
      const result = await session.client.callTool({ name: 'llama_server.unload', arguments: { confirm: true } });
      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({ error: 'SLOT_BUSY_OR_UNKNOWN_REFUSING_STOP', serviceMutationPerformed: false, memoryReleaseObserved: null });
    } finally { await session.close(); }
  });

  it('fails closed on malformed or wrong-action backend receipts', async () => {
    for (const value of [{}, receipt('start')]) {
      const session = await connect(vi.fn<LlamaControlRunner>(async () => value));
      try {
        const result = await session.client.callTool({ name: 'llama_server.status', arguments: {} });
        expect(result.isError).toBe(true);
        expect(payload(result).serviceMutationPerformed).toBeNull();
      } finally { await session.close(); }
    }
  });
});
