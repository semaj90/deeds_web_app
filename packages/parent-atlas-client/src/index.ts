/**
 * Parent Atlas Client Package
 * Protocol adapters and transport implementations
 *
 * Exports:
 * - HTTP/REST client (browser and Node.js compatible)
 * - gRPC client (internal service-to-service)
 * - MCP client (tool integration)
 * - A2A client (agent-to-agent delegation)
 *
 * This package bridges the gap between consumers and the Parent Atlas runtime.
 * It imports from @deeds/parent-atlas-core (contracts only, no infrastructure).
 *
 * Protocol details are NOT exposed to core contracts.
 * @deeds/parent-atlas-core remains pure, transport-agnostic.
 */

// HTTP/REST client
export { HttpRetrievalClient, createHttpClient } from './http/client.js';
export type { HttpClientConfig, HttpError } from './http/client.js';

// gRPC client (internal)
export { GrpcRetrievalClient, createGrpcClient } from './grpc/client.js';
export type {
  GrpcClientConfig,
  GrpcCodebaseChunk,
  GrpcCodebaseSearchRequest,
  GrpcCodebaseSearchResponse,
  GrpcEvidenceSearchRequest,
  GrpcEvidenceSearchResponse,
  GrpcHealthDetails,
  RetrievalGrpcTransport,
} from './grpc/client.js';

// MCP client (tool integration)
export { McpClient, createMcpClient } from './mcp/client.js';
export type { McpClientConfig, McpError } from './mcp/client.js';

// A2A client (agent-to-agent)
export { A2aRetrievalAgent, createA2aAgent } from './a2a/client.js';
export type { A2aAgentConfig, A2aTaskResult } from './a2a/client.js';

// Transport errors
export { TransportError, McpTransportError, HttpTransportError } from './errors.js';
export type { TransportErrorOptions } from './errors.js';

// Re-export core contracts
export type { RetrievalFacade, RetrievalRequest, RetrievalResult, RetrievalPolicy } from '@deeds/parent-atlas-core';
export { getPolicyRegistry, DEFAULT_POLICIES } from '@deeds/parent-atlas-core';
