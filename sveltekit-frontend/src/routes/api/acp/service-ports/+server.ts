/**
 * GET /api/acp/service-ports
 *
 * ACP (Agent Communication Protocol) service port discovery endpoint.
 * Returns gRPC metadata; QUIC is not advertised without a verified listener.
 *
 * Used by:
 *   - Other agents discovering gRPC service boundaries
 *   - A2A clients discovering approved service metadata
 *   - Tool registries building proto-to-tool mappings
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ACPServiceRegistry,
  buildA2AAgentDescriptor,
  listA2APeerTools,
  acpToolRegistry,
  negotiateQuicTransport,
  type A2AServicePort,
} from '$lib/server/acp/acp-grpc-quic-bridge.js';
import { requireAdmin } from '$lib/server/auth-utils.js';

const defaultRegistry: Partial<ACPServiceRegistry> = {
  embedding: {
    protoName: 'embedding.proto',
    serviceName: 'yorha.embedding.EmbeddingService',
    grpcPort: 50051,
    httpPort: 11434,
    quicPort: 443,
    methods: ['Embed', 'EmbedBatch', 'StreamEmbed'],
  },
  retrieval: {
    protoName: 'retrieval.proto',
    serviceName: 'yorha.retrieval.RetrievalService',
    grpcPort: 50053,
    httpPort: 8100,
    quicPort: 443,
    methods: ['Search', 'RRFFuse', 'Rerank'],
  },
  toolCalling: {
    protoName: 'tool_calling.proto',
    serviceName: 'yorha.tools.ToolCallingService',
    grpcPort: 50057,
    httpPort: 8090,
    quicPort: 443,
    methods: ['ExecuteTool', 'ExecuteToolBatch', 'ExecuteToolStream'],
  },
  chatAssistant: {
    protoName: 'chat_assistant.proto',
    serviceName: 'yorha.chat.ChatAssistantService',
    grpcPort: 50058,
    httpPort: 8090,
    quicPort: 443,
    methods: ['Chat', 'ChatStream', 'GetModels'],
  },
  codeIntel: {
    protoName: 'codeintel.proto',
    serviceName: 'yorha.codeintel.CodeIntelService',
    grpcPort: 50059,
    httpPort: 8090,
    quicPort: 443,
    methods: ['AnalyzeCode', 'TraverseGraph', 'GetRelationships'],
  },
};

export const GET: RequestHandler = (event) => {
  requireAdmin(event);
  const { url } = event;

  const host = url.hostname || '127.0.0.1';

  // Build A2A agent descriptor with service ports
  const agentDescriptor = buildA2AAgentDescriptor('deeds-legal-ai', acpToolRegistry, defaultRegistry);

  // Do not advertise HTTP/3 until a live listener and end-to-end path are verified.
  const servicePorts = negotiateQuicTransport(agentDescriptor.servicePorts, {
    enabled: false,
    listenerVerified: false,
    port: 443,
    altSvcPort: 443,
    alpn: ['h3', 'h2', 'http/1.1'],
  });

  return json(
    {
      agent: {
        id: agentDescriptor.id,
        name: agentDescriptor.name,
        version: agentDescriptor.version,
        capabilities: agentDescriptor.capabilities,
      },
      servicePorts: servicePorts.map((port) => ({
        id: port.id,
        protocol: port.protocol,
        host: port.host || host,
        port: port.port,
        protoFile: port.protoFile,
        serviceName: port.serviceName,
        methods: port.methods,
        tls: port.tls ?? false,
        quicEnabled: port.quicEnabled ?? false,
        altSvc: port.altSvc,
      })) as A2AServicePort[],
      tools: listA2APeerTools(acpToolRegistry, agentDescriptor).map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        serviceId: tool.serviceId,
        tags: tool.tags,
        quicOptional: tool.quicOptional,
      })),
      timestamp: new Date().toISOString(),
      quicSupport: {
        enabled: false,
        altSvcHeader: null,
        alpn: ['h2', 'http/1.1'],
      },
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    }
  );
};
