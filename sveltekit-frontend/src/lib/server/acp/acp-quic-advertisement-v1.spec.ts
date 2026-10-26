import { describe, expect, it } from 'vitest';
import {
  ACPServiceRegistry,
  ACPToolRegistry,
  buildA2AAgentDescriptor,
  negotiateQuicTransport,
} from './acp-grpc-quic-bridge.js';

const registry = ACPServiceRegistry.parse({
  embedding: { protoName: 'embedding.proto', serviceName: 'yorha.embedding.EmbeddingService', grpcPort: 50051, httpPort: 11434, quicPort: 443, methods: ['Embed'] },
  retrieval: { protoName: 'retrieval.proto', serviceName: 'yorha.retrieval.RetrievalService', grpcPort: 50053, httpPort: 8100, quicPort: 443, methods: ['Search', 'RRFFuse', 'Rerank'] },
  toolCalling: { protoName: 'tool_calling.proto', serviceName: 'yorha.tools.ToolCallingService', grpcPort: 50057, httpPort: 8090, quicPort: 443, methods: ['ExecuteTool'] },
  chatAssistant: { protoName: 'chat_assistant.proto', serviceName: 'yorha.chat.ChatAssistantService', grpcPort: 50058, httpPort: 8090, quicPort: 443, methods: ['Chat'] },
  codeIntel: { protoName: 'codeintel.proto', serviceName: 'yorha.codeintel.CodeIntelService', grpcPort: 50059, httpPort: 8090, quicPort: 443, methods: ['TraverseGraph'] },
});

function descriptor() {
  const tools = new ACPToolRegistry(registry);
  tools.registerTool({
    id: 'identity:recover',
    name: 'Identity Recover',
    description: 'Read-only retrieval',
    serviceId: 'retrieval',
    proto: 'retrieval.proto',
    methods: ['Search'],
    inputSchema: {},
    outputSchema: {},
    tags: [],
    quicOptional: true,
  });
  return buildA2AAgentDescriptor('atlas', tools, registry);
}

describe('QUIC capability advertisement', () => {
  it('does not advertise QUIC or Alt-Svc without a verified listener', () => {
    const agent = descriptor();
    const servicePorts = negotiateQuicTransport(agent.servicePorts, {
      enabled: true,
      listenerVerified: false,
      altSvcPort: 443,
    });

    expect(agent.quicEnabled).toBe(false);
    expect(agent.altSvcHeader).toBeUndefined();
    expect(servicePorts[0].quicEnabled).toBe(false);
    expect(servicePorts[0].altSvc).toBeUndefined();
  });

  it('advertises QUIC only when enabled and listener verification is explicit', () => {
    const servicePorts = negotiateQuicTransport(descriptor().servicePorts, {
      enabled: true,
      listenerVerified: true,
      altSvcPort: 443,
    });

    expect(servicePorts[0].quicEnabled).toBe(true);
    expect(servicePorts[0].altSvc).toBe('h3=":443"');
  });
});
