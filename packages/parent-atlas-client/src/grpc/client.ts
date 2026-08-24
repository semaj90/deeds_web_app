/** gRPC client for the canonical Go retrieval service. */

import type { RetrievalFacade, RetrievalRequest, RetrievalResult } from '@deeds/parent-atlas-core';
import { GrpcTransportError } from '../errors.js';

export interface GrpcClientConfig {
  address: string;
  port?: number;
  ssl?: boolean;
  protoPath?: string;
  includeDirs?: string[];
  deadlineMs?: number;
  maxReceiveMessageLength?: number;
  maxSendMessageLength?: number;
  keepaliveTimeMs?: number;
  keepaliveTimeoutMs?: number;
  transport?: RetrievalGrpcTransport;
}

export interface RetrievalGrpcTransport {
  searchCodebase(request: Record<string, unknown>, deadline: Date): Promise<unknown>;
  searchEvidence(request: Record<string, unknown>, deadline: Date): Promise<unknown>;
  streamCodebase(request: Record<string, unknown>, deadline: Date): AsyncIterable<unknown>;
  streamEvidence(request: Record<string, unknown>, deadline: Date): AsyncIterable<unknown>;
  health(deadline: Date): Promise<unknown>;
  close?: () => void;
}

export interface GrpcEvidenceSearchRequest {
  query: string;
  caseId?: string;
  limit?: number;
  jurisdiction?: string;
  queryEmbedding?: number[] | Float32Array;
  includeDebug?: boolean;
  hop?: Record<string, unknown>;
  prefilter?: Record<string, unknown>;
  rank?: Record<string, unknown>;
}

export interface GrpcEvidenceSearchResponse {
  results?: unknown[];
  bundles?: unknown[];
  timing?: Record<string, unknown>;
  cacheSource?: string;
  debugJson?: string;
}

export interface GrpcHealthDetails {
  status?: string;
  pgvectorConnected?: boolean;
  qdrantConnected?: boolean;
  redisConnected?: boolean;
  embeddingServiceUp?: boolean;
  timestamp?: number | string;
}

export interface GrpcCodebaseSearchRequest {
  query: string;
  limit?: number;
  contentWeight?: number;
  signatureWeight?: number;
  kinds?: string[];
  httpMethod?: string;
  pathPrefixes?: string[];
  includeDebug?: boolean;
}

export interface GrpcCodebaseChunk {
  chunkId?: string;
  filePath?: string;
  kind?: string;
  contentPreview?: string;
  score?: number;
  startLine?: number;
  endLine?: number;
  tags?: string[];
};

export interface GrpcCodebaseSearchResponse {
  chunks?: GrpcCodebaseChunk[];
  totalMs?: number;
  debugJson?: string;
};

function endpoint(config: GrpcClientConfig): string {
  return `${config.address}:${config.port ?? 50053}`;
}

function mapResponse(request: RetrievalRequest, response: GrpcCodebaseSearchResponse): RetrievalResult {
  const candidates = (response.chunks ?? []).map((chunk, index) => ({
    id: chunk.chunkId ?? chunk.filePath ?? `grpc-chunk-${index}`,
    packet_key: chunk.chunkId ?? chunk.filePath ?? `grpc-chunk-${index}`,
    source_ref: chunk.filePath ?? '',
    file_path: chunk.filePath ?? '',
    directory_path: '',
    function_symbol: '',
    feature_id: chunk.chunkId ?? '',
    feature_label: chunk.kind ?? 'codebase chunk',
    summary: chunk.contentPreview ?? '',
    retrievedVia: 'qdrant' as const,
    score: Number(chunk.score ?? 0),
    rank: index + 1,
    scores: { semantic: Number(chunk.score ?? 0) },
    tags: chunk.tags ?? [],
  }));

  const elapsedMs = Number(response.totalMs ?? 0);
  return {
    query: request.query,
    useCase: request.useCase,
    candidates: candidates as RetrievalResult['candidates'],
    // SearchCodebase returns chunks, not assembled ACE/RLM context.
    // Keep this explicit so callers cannot mistake transport success for context assembly.
    context: { kind: 'unassembled', source: 'retrieval.grpc.searchCodebase' } as RetrievalResult['context'],
    trace: {
      queryId: `grpc:${Date.now().toString(36)}`,
      query: request.query,
      timestamp: new Date(),
      stages: { qdrant: { queryMs: elapsedMs, resultCount: candidates.length, topScore: Number(candidates[0]?.score ?? 0) } },
      totalMs: elapsedMs,
      cacheHitRate: 0,
      selectedPackets: candidates.map((candidate) => candidate.packet_key),
    },
  };
}

async function loadTransport(config: GrpcClientConfig): Promise<RetrievalGrpcTransport> {
  const [{ load }, grpc, path] = await Promise.all([
    import('@grpc/proto-loader'),
    import('@grpc/grpc-js'),
    import('node:path'),
  ]);
  const { existsSync } = await import('node:fs');
  const protoCandidates = [
    config.protoPath,
    process.env.ATLAS_RETRIEVAL_PROTO_PATH,
    path.resolve(process.cwd(), 'proto/active/retrieval.proto'),
    path.resolve(process.cwd(), '../proto/active/retrieval.proto'),
    path.resolve(process.cwd(), '../../proto/active/retrieval.proto'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const protoPath = protoCandidates.find((candidate) => existsSync(candidate)) ?? protoCandidates[0];
  if (!protoPath) throw new Error('Canonical retrieval proto path is not configured');
  const defaultIncludeDirs = [path.dirname(protoPath), path.dirname(path.dirname(protoPath))];
  const packageDefinition = await load(protoPath, {
    includeDirs: config.includeDirs ?? defaultIncludeDirs,
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    yorha: { retrieval: { RetrievalService: new (address: string, credentials: unknown, options?: Record<string, number>) => Record<string, (...args: unknown[]) => void> } };
  };
  const credentials = config.ssl ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  const channelOptions = {
    'grpc.max_receive_message_length': config.maxReceiveMessageLength ?? 16 * 1024 * 1024,
    'grpc.max_send_message_length': config.maxSendMessageLength ?? 4 * 1024 * 1024,
    'grpc.keepalive_time_ms': config.keepaliveTimeMs ?? 120_000,
    'grpc.keepalive_timeout_ms': config.keepaliveTimeoutMs ?? 20_000,
  };
  const client = new descriptor.yorha.retrieval.RetrievalService(endpoint(config), credentials, channelOptions);

  const call = (method: string, request: Record<string, unknown>, deadline: Date): Promise<unknown> =>
    new Promise((resolve, reject) => {
      client[method](request, { deadline }, (error: Error | null, response: unknown) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

  const streamCall = (method: string, request: Record<string, unknown>, deadline: Date): AsyncIterable<unknown> => ({
    async *[Symbol.asyncIterator]() {
      const stream = client[method](request, { deadline }) as unknown as {
        on(event: 'data' | 'error' | 'end', listener: (...args: unknown[]) => void): void;
      };
      const queue: unknown[] = [];
      let ended = false;
      let failure: unknown;
      let wake: (() => void) | undefined;
      const notify = () => { const resume = wake; wake = undefined; resume?.(); };
      stream.on('data', (value) => { queue.push(value); notify(); });
      stream.on('error', (error) => { failure = error; ended = true; notify(); });
      stream.on('end', () => { ended = true; notify(); });
      while (!ended || queue.length > 0) {
        if (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve; });
        while (queue.length > 0) yield queue.shift();
        if (failure) throw failure;
      }
      if (failure) throw failure;
    },
  });

  return {
    searchCodebase: (request, deadline) => call('searchCodebase', request, deadline),
    searchEvidence: (request, deadline) => call('searchEvidence', request, deadline),
    streamCodebase: (request, deadline) => streamCall('streamCodebase', request, deadline),
    streamEvidence: (request, deadline) => streamCall('streamEvidence', request, deadline),
    health: (request) => call('health', {}, request),
    close: () => client.close(),
  };
}

export class GrpcRetrievalClient implements RetrievalFacade {
  private readonly config: GrpcClientConfig;
  private transportPromise?: Promise<RetrievalGrpcTransport>;

  constructor(config: GrpcClientConfig) {
    this.config = config;
  }

  async search(request: RetrievalRequest): Promise<RetrievalResult> {
    const response = await this.searchCodebase({
      query: request.query,
      limit: request.topK,
      kinds: request.packetTypes,
      pathPrefixes: request.sourceScope,
      includeDebug: true,
    });
    return mapResponse(request, response);
  }

  /** Direct typed adapter for the Go SearchCodebase RPC. */
  async searchCodebase(request: GrpcCodebaseSearchRequest): Promise<GrpcCodebaseSearchResponse> {
    const transport = await this.getTransport();
    const deadline = new Date(Date.now() + (this.config.deadlineMs ?? 2500));
    try {
      return await transport.searchCodebase({
        query: request.query,
        limit: request.limit ?? 10,
        contentWeight: request.contentWeight ?? 0.6,
        signatureWeight: request.signatureWeight ?? 0.4,
        kinds: request.kinds ?? [],
        httpMethod: request.httpMethod ?? '',
        pathPrefixes: request.pathPrefixes ?? [],
        includeDebug: request.includeDebug ?? false,
      }, deadline) as GrpcCodebaseSearchResponse;
    } catch (error) {
      throw new GrpcTransportError(error instanceof Error ? error.message : 'gRPC SearchCodebase failed',
        typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: number }).code) : undefined,
        error);
    }
  }

  /** Direct typed adapter for the Go SearchEvidence RPC. */
  async searchEvidence(request: GrpcEvidenceSearchRequest): Promise<GrpcEvidenceSearchResponse> {
    const transport = await this.getTransport();
    const deadline = new Date(Date.now() + (this.config.deadlineMs ?? 5000));
    try {
      return await transport.searchEvidence({
        query: request.query,
        caseId: request.caseId ?? '',
        limit: request.limit ?? 10,
        jurisdiction: request.jurisdiction ?? '',
        queryEmbedding: request.queryEmbedding ? Array.from(request.queryEmbedding) : [],
        includeDebug: request.includeDebug ?? false,
        hop: request.hop ?? {},
        prefilter: request.prefilter ?? {},
        rank: request.rank ?? {},
      }, deadline) as GrpcEvidenceSearchResponse;
    } catch (error) {
      throw new GrpcTransportError(error instanceof Error ? error.message : 'gRPC SearchEvidence failed',
        typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: number }).code) : undefined,
        error);
    }
  }

  /** Consume progressive CodebaseChunkEvent messages without buffering the stream. */
  async *streamCodebase(request: GrpcCodebaseSearchRequest): AsyncIterable<unknown> {
    const deadline = new Date(Date.now() + (this.config.deadlineMs ?? 10000));
    try {
      yield* await this.getTransport().then((transport) => transport.streamCodebase({
        query: request.query,
        limit: request.limit ?? 10,
        contentWeight: request.contentWeight ?? 0.6,
        signatureWeight: request.signatureWeight ?? 0.4,
        kinds: request.kinds ?? [],
        httpMethod: request.httpMethod ?? '',
        pathPrefixes: request.pathPrefixes ?? [],
        includeDebug: request.includeDebug ?? false,
      }, deadline));
    } catch (error) {
      throw new GrpcTransportError(error instanceof Error ? error.message : 'gRPC StreamCodebase failed', undefined, error);
    }
  }

  /** Consume progressive EvidenceBundleEvent messages without buffering the stream. */
  async *streamEvidence(request: GrpcEvidenceSearchRequest): AsyncIterable<unknown> {
    const deadline = new Date(Date.now() + (this.config.deadlineMs ?? 10000));
    try {
      yield* await this.getTransport().then((transport) => transport.streamEvidence({
        query: request.query,
        caseId: request.caseId ?? '',
        limit: request.limit ?? 10,
        jurisdiction: request.jurisdiction ?? '',
        queryEmbedding: request.queryEmbedding ? Array.from(request.queryEmbedding) : [],
        includeDebug: request.includeDebug ?? false,
        hop: request.hop ?? {},
        prefilter: request.prefilter ?? {},
        rank: request.rank ?? {},
      }, deadline));
    } catch (error) {
      throw new GrpcTransportError(error instanceof Error ? error.message : 'gRPC StreamEvidence failed', undefined, error);
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.healthDetails();
      return response.status?.toLowerCase() === 'healthy' &&
        response.pgvectorConnected === true &&
        response.qdrantConnected === true &&
        response.embeddingServiceUp === true;
    } catch {
      return false;
    }
  }

  /** Return component-level service state without collapsing degraded status. */
  async healthDetails(): Promise<GrpcHealthDetails> {
    const transport = await this.getTransport();
    const deadline = new Date(Date.now() + (this.config.deadlineMs ?? 2500));
    try {
      return await transport.health(deadline) as GrpcHealthDetails;
    } catch (error) {
      throw new GrpcTransportError(error instanceof Error ? error.message : 'gRPC Health failed',
        typeof error === 'object' && error !== null && 'code' in error ? Number((error as { code?: number }).code) : undefined,
        error);
    }
  }

  /** Close the underlying channel when the owning worker or process shuts down. */
  async close(): Promise<void> {
    const transport = this.config.transport;
    if (transport?.close) transport.close();
    if (this.transportPromise) (await this.transportPromise).close?.();
    this.transportPromise = undefined;
  }

  private getTransport(): Promise<RetrievalGrpcTransport> {
    if (this.config.transport) return Promise.resolve(this.config.transport);
    this.transportPromise ??= loadTransport(this.config);
    return this.transportPromise;
  }
}

/**
 * Factory function
 */
export function createGrpcClient(config: GrpcClientConfig): GrpcRetrievalClient {
  return new GrpcRetrievalClient(config);
}

export type { GrpcTransportError } from '../errors.js';
