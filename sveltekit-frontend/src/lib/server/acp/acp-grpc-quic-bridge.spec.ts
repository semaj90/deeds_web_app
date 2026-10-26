import { connectivityState } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import {
  acpChannelPool,
  ACPServiceRegistry,
  ACPToolRegistry,
  buildA2AAgentDescriptor,
  listA2APeerTools,
} from './acp-grpc-quic-bridge.js';

const registry = ACPServiceRegistry.parse({
  embedding: { protoName: 'embedding.proto', serviceName: 'yorha.embedding.EmbeddingService', grpcPort: 50051, httpPort: 11434, quicPort: 443, methods: ['Embed'] },
  retrieval: { protoName: 'retrieval.proto', serviceName: 'yorha.retrieval.RetrievalService', grpcPort: 50053, httpPort: 8100, quicPort: 443, methods: ['Search', 'RRFFuse', 'Rerank', 'WritePacket'] },
  toolCalling: { protoName: 'tool_calling.proto', serviceName: 'yorha.tools.ToolCallingService', grpcPort: 50057, httpPort: 8090, quicPort: 443, methods: ['ExecuteTool', 'ExecuteToolBatch'] },
  chatAssistant: { protoName: 'chat_assistant.proto', serviceName: 'yorha.chat.ChatAssistantService', grpcPort: 50058, httpPort: 8090, quicPort: 443, methods: ['Chat'] },
  codeIntel: { protoName: 'codeintel.proto', serviceName: 'yorha.codeintel.CodeIntelService', grpcPort: 50059, httpPort: 8090, quicPort: 443, methods: ['TraverseGraph'] },
});

function makeTools() {
  const tools = new ACPToolRegistry(registry);
  for (const id of ['identity:recover', 'canonical:write', 'mirror:sync_qdrant']) {
    tools.registerTool({
      id,
      name: id,
      description: id,
      serviceId: id === 'identity:recover' ? 'retrieval' : (id === 'canonical:write' ? 'toolCalling' : 'retrieval'),
      proto: 'retrieval.proto',
      methods: id === 'identity:recover' ? ['Search'] : ['ExecuteTool'],
      inputSchema: {},
      outputSchema: {},
      tags: [],
      quicOptional: true,
    });
  }
  return tools;
}

describe('A2A peer discovery write boundary', () => {
  it('advertises only explicitly allowlisted read-only tool and methods', () => {
    const descriptor = buildA2AAgentDescriptor('atlas', makeTools(), registry);
    expect(descriptor.tools).toEqual(['identity:recover']);
    expect(descriptor.capabilities).toEqual(['retrieval']);
    expect(descriptor.servicePorts).toHaveLength(1);
    expect(descriptor.servicePorts[0].methods).toEqual(['Search', 'RRFFuse', 'Rerank']);
    expect(JSON.stringify(descriptor)).not.toMatch(/canonical:write|mirror:sync|ExecuteTool|WritePacket/);
    expect(listA2APeerTools(makeTools(), descriptor).map((tool) => tool.id)).toEqual(['identity:recover']);
  });

  it('fails closed when no explicitly approved peer tool exists', () => {
    const tools = new ACPToolRegistry(registry);
    tools.registerTool({
      id: 'unknown:future-tool', name: 'unknown', description: 'unknown', serviceId: 'retrieval',
      proto: 'retrieval.proto', methods: ['Search'], inputSchema: {}, outputSchema: {}, tags: [], quicOptional: true,
    });
    const descriptor = buildA2AAgentDescriptor('atlas', tools, registry);
    expect(descriptor.tools).toEqual([]);
    expect(descriptor.servicePorts).toEqual([]);
    expect(descriptor.capabilities).toEqual([]);
  });
});

describe('ACP gRPC channel pool', () => {
  it('creates and reuses a lazy channel without claiming an HTTP fallback', async () => {
    const config = { host: '127.0.0.1', port: 59991 };
    try {
      const first = await acpChannelPool.getChannel('retrieval-test', config);
      const repeated = await acpChannelPool.getChannel('retrieval-test', config);

      expect(first).toBeDefined();
      expect(repeated).toBe(first);
      expect(first.getConnectivityState(false)).not.toBe(connectivityState.SHUTDOWN);
    } finally {
      acpChannelPool.close('retrieval-test');
    }
  });

  it('closes only the requested service channel', async () => {
    const config = { host: '127.0.0.1', port: 59992 };
    const selected = await acpChannelPool.getChannel('selected-test', config);
    const retained = await acpChannelPool.getChannel('retained-test', config);

    try {
      acpChannelPool.close('selected-test');

      expect(selected.getConnectivityState(false)).toBe(connectivityState.SHUTDOWN);
      expect(retained.getConnectivityState(false)).not.toBe(connectivityState.SHUTDOWN);
    } finally {
      acpChannelPool.close('retained-test');
      acpChannelPool.close('selected-test');
    }
  });
});
