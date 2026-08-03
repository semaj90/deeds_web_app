/**
 * Go Retrieval gRPC Client Adapter — Typed bridge to Go data plane.
 * Handles service discovery, channel lifecycle, and protobuf marshalling.
 * Fallback to HTTP/JSON for debugging or when gRPC unavailable.
 */

import { Channel, ChannelCredentials, Metadata } from '@grpc/grpc-js';
import { AtlasRuntimeContext } from './atlas-runtime-context';

// TODO: Generate from .proto with protoc
// For now, mock the client interface
interface RetrievalServiceClient {
  retrieve(
    request: RetrieveRequest,
    metadata?: Metadata
  ): Promise<RetrieveResponse>;
  buildContext(
    request: BuildContextRequest,
    metadata?: Metadata
  ): Promise<ContextPacket>;
  validatePacket(
    request: ValidatePacketRequest,
    metadata?: Metadata
  ): Promise<ValidationResult>;
}

interface RetrieveRequest {
  runId: string;
  threadId: string;
  workspaceId: string;
  workspaceRevision: string;
  query: string;
  topK: number;
  lanes: RetrievalLane[];
  tokenBudget: number;
}

type RetrievalLane = 'DENSE' | 'SPARSE' | 'GRAPH' | 'SYMBOL' | 'TEMPORAL' | 'CENTROID';

interface EvidenceRef {
  packetKey: string;
  sourceRef: string;
  contentHash: string;
  denseScore?: number;
  sparseScore?: number;
  graphScore?: number;
  rerankScore?: number;
}

interface RetrieveResponse {
  retrievalId: string;
  workspaceRevision: string;
  evidence: EvidenceRef[];
}

interface BuildContextRequest {
  workspaceId: string;
  packetKeys: string[];
  maxTokens: number;
}

interface ContextPacket {
  prompt: string;
  evidence: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  tokenCount: number;
}

interface ValidatePacketRequest {
  workspaceId: string;
  packetKey: string;
  proposedChange: Record<string, unknown>;
}

interface ValidationResult {
  valid: boolean;
  status: 'PASS' | 'WARN' | 'FAIL';
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Channel Management
// ─────────────────────────────────────────────────────────────────────────

let globalChannel: Channel | null = null;
let globalClient: RetrievalServiceClient | null = null;

export async function getRetrievalGrpcClient(): Promise<RetrievalServiceClient> {
  const url = process.env.GO_RETRIEVAL_GRPC_URL || 'localhost:50051';

  if (globalChannel && globalClient) {
    return globalClient;
  }

  globalChannel = new Channel(url, ChannelCredentials.createInsecure(), {});
  // TODO: Load the actual proto and create the client stub
  // globalClient = new RetrievalServiceClient(url, ChannelCredentials.createInsecure());

  return globalClient!;
}

export async function closeRetrievalGrpcClient(): Promise<void> {
  if (globalChannel) {
    globalChannel.close();
    globalChannel = null;
    globalClient = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// API Wrapper — Forward runtime context to Go service
// ─────────────────────────────────────────────────────────────────────────

export async function retrieveFromGo(
  runtime: AtlasRuntimeContext,
  query: string,
  options?: {
    topK?: number;
    lanes?: RetrievalLane[];
  }
): Promise<RetrieveResponse> {
  const client = await getRetrievalGrpcClient();

  const request: RetrieveRequest = {
    runId: runtime.runId,
    threadId: runtime.threadId,
    workspaceId: runtime.workspaceId,
    workspaceRevision: runtime.workspaceRevision,
    query,
    topK: options?.topK ?? 12,
    lanes: options?.lanes ?? ['DENSE', 'SPARSE', 'GRAPH'],
    tokenBudget: runtime.tokenBudget.maximumInput,
  };

  const metadata = new Metadata();
  metadata.add('workspace-revision', runtime.workspaceRevision);
  metadata.add('run-id', runtime.runId);

  try {
    return await client.retrieve(request, metadata);
  } catch (err) {
    console.error('gRPC retrieval failed, falling back to HTTP:', err);
    return retrieveFromGoHttp(runtime, query, options);
  }
}

export async function buildContextFromGo(
  runtime: AtlasRuntimeContext,
  packetKeys: string[],
  maxTokens?: number
): Promise<ContextPacket> {
  const client = await getRetrievalGrpcClient();

  const request: BuildContextRequest = {
    workspaceId: runtime.workspaceId,
    packetKeys,
    maxTokens: maxTokens ?? runtime.tokenBudget.maximumInput,
  };

  try {
    return await client.buildContext(request);
  } catch (err) {
    console.error('gRPC buildContext failed, falling back to HTTP:', err);
    return buildContextFromGoHttp(runtime, packetKeys, maxTokens);
  }
}

export async function validatePacketFromGo(
  runtime: AtlasRuntimeContext,
  packetKey: string,
  proposedChange: Record<string, unknown>
): Promise<ValidationResult> {
  const client = await getRetrievalGrpcClient();

  const request: ValidatePacketRequest = {
    workspaceId: runtime.workspaceId,
    packetKey,
    proposedChange,
  };

  try {
    return await client.validatePacket(request);
  } catch (err) {
    console.error('gRPC validatePacket failed, falling back to HTTP:', err);
    return validatePacketFromGoHttp(runtime, packetKey, proposedChange);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP/JSON Fallback
// ─────────────────────────────────────────────────────────────────────────

async function retrieveFromGoHttp(
  runtime: AtlasRuntimeContext,
  query: string,
  options?: { topK?: number; lanes?: RetrievalLane[] }
): Promise<RetrieveResponse> {
  const url = new URL(process.env.GO_RETRIEVAL_HTTP_URL || 'http://localhost:8100/retrieval/retrieve');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'workspace-revision': runtime.workspaceRevision,
      'run-id': runtime.runId,
    },
    body: JSON.stringify({
      runId: runtime.runId,
      threadId: runtime.threadId,
      workspaceId: runtime.workspaceId,
      workspaceRevision: runtime.workspaceRevision,
      query,
      topK: options?.topK ?? 12,
      lanes: options?.lanes ?? ['DENSE', 'SPARSE', 'GRAPH'],
      tokenBudget: runtime.tokenBudget.maximumInput,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Go Retrieval HTTP failed: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function buildContextFromGoHttp(
  runtime: AtlasRuntimeContext,
  packetKeys: string[],
  maxTokens?: number
): Promise<ContextPacket> {
  const url = new URL(process.env.GO_RETRIEVAL_HTTP_URL || 'http://localhost:8100/context/build');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'workspace-revision': runtime.workspaceRevision,
    },
    body: JSON.stringify({
      workspaceId: runtime.workspaceId,
      packetKeys,
      maxTokens: maxTokens ?? runtime.tokenBudget.maximumInput,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Go Retrieval buildContext HTTP failed: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function validatePacketFromGoHttp(
  runtime: AtlasRuntimeContext,
  packetKey: string,
  proposedChange: Record<string, unknown>
): Promise<ValidationResult> {
  const url = new URL(process.env.GO_RETRIEVAL_HTTP_URL || 'http://localhost:8100/validate');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'workspace-revision': runtime.workspaceRevision,
    },
    body: JSON.stringify({
      workspaceId: runtime.workspaceId,
      packetKey,
      proposedChange,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Go Retrieval validate HTTP failed: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}
