/**
 * Go Retrieval gRPC Client Adapter — Typed bridge to Go data plane.
 * Handles service discovery, channel lifecycle, and protobuf marshalling.
 * Fallback to HTTP/JSON for debugging or when gRPC unavailable.
 */

import { Channel, ChannelCredentials, Metadata } from '@grpc/grpc-js';
import { AtlasRuntimeContext, assertAtlasRuntimeRevisionQualified, RuntimeToolReceiptV1Schema, type RuntimeToolReceiptV1 } from './atlas-runtime-context';
import { pool } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';

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
  receipt?: RuntimeToolReceiptV1;
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
  receipt?: RuntimeToolReceiptV1;
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
  receipt?: RuntimeToolReceiptV1;
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
  assertAtlasRuntimeRevisionQualified(runtime);
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
  assertAtlasRuntimeRevisionQualified(runtime);
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
  assertAtlasRuntimeRevisionQualified(runtime);
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

/**
 * Real shape of `POST /search/codebase` on the live `legal-ai-go-retrieval` service (verified
 * live 2026-09-08, not guessed from the .proto alone. This is the HTTP JSON
 * representation emitted by the service; it is not evidence that the service
 * uses the ProtoJSON runtime serializer. Its keys are snake_case, while
 * canonical ProtoJSON defaults to lowerCamelCase. See `proto/active/retrieval.proto`
 * (`CodebaseSearchResponse`/`CodebaseChunk`) for the source contract this mirrors.
 */
interface GoCodebaseChunkHttp {
  chunk_id: string;
  file_path: string;
  score: number;
  packet_key?: string;
  source_ref?: string;
  content_hash?: string;
}
interface GoCodebaseSearchResponseHttp {
  chunks?: GoCodebaseChunkHttp[];
  total_ms?: number;
  receipt?: GoToolReceiptV2Http;
}

interface GoToolReceiptV2Http {
  schema?: string;
  tool_call_id?: string;
  tool_name?: string;
  run_id?: string;
  workspace_id?: string;
  workspace_revision?: string;
  packet_key?: string;
  packet_revision?: string;
  succeeded?: boolean;
  retrieval_confidence?: number;
  evidence_count?: number;
  validation_status?: string;
  output_checksum?: string;
  error_code?: string;
  canonical_authority?: boolean;
  writes_performed?: boolean;
  receipt_id?: string;
  receipt_checksum?: string;
}

function mapGoReceiptV2(receipt: GoToolReceiptV2Http | undefined): RuntimeToolReceiptV1 | undefined {
  if (!receipt) return undefined;
  const parsed = RuntimeToolReceiptV1Schema.safeParse({
    schema: 'atlas.runtime-tool-receipt.v1',
    receiptId: receipt.receipt_id,
    receiptChecksum: receipt.receipt_checksum,
    toolCallId: receipt.tool_call_id,
    toolName: receipt.tool_name,
    runId: receipt.run_id,
    workspaceId: receipt.workspace_id,
    packetKey: receipt.packet_key,
    workspaceRevision: receipt.workspace_revision,
    packetRevision: receipt.packet_revision,
    succeeded: receipt.succeeded,
    errorCode: receipt.error_code ?? null,
    retrievalConfidence: receipt.retrieval_confidence ?? null,
    evidenceCount: receipt.evidence_count,
    validationStatus: receipt.validation_status,
    outputChecksum: receipt.output_checksum ?? null,
    writesPerformed: receipt.writes_performed,
    canonicalAuthority: receipt.canonical_authority,
  });
  return parsed.success ? parsed.data : undefined;
}

async function retrieveFromGoHttp(
  runtime: AtlasRuntimeContext,
  query: string,
  options?: { topK?: number; lanes?: RetrievalLane[] }
): Promise<RetrieveResponse> {
  // NOTE: no real Go-service route exists for the original RetrieveRequest/RetrieveResponse
  // gRPC contract (runId/threadId/lanes/tokenBudget) -- the .proto's actual HTTP surface only
  // exposes /search/codebase, /search/evidence, /search/research, /search/bm25, /stats, /health
  // (confirmed live against `services/go-retrieval-service/main.go`'s mux.HandleFunc calls).
  // /search/codebase is the closest real match for a dense codebase-retrieval request; this
  // fallback calls it directly rather than a fictional /retrieval/retrieve endpoint that has
  // never existed on this service, and maps its real response shape into RetrieveResponse.
  const base = ENV.GO_RETRIEVAL_HTTP_URL;
  if (!base) throw new Error('GO_RETRIEVAL_HTTP_UNAVAILABLE');
  const url = new URL('/search/codebase', base);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'workspace-revision': runtime.workspaceRevision,
      'run-id': runtime.runId,
    },
    body: JSON.stringify({
      query,
      limit: options?.topK ?? 12,
      atlas_context: {
        tool_call_id: runtime.correlationId ?? '',
        run_id: runtime.runId,
        workspace_id: runtime.workspaceId,
        workspace_revision: runtime.workspaceRevision,
        packet_key: runtime.packetKey,
        packet_revision: runtime.packetRevision,
      },
      workspace_revision: runtime.workspaceRevision,
      packet_revision: runtime.packetRevision,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Go Retrieval HTTP failed: ${response.status} ${await response.text()}`
    );
  }

  const body: GoCodebaseSearchResponseHttp = await response.json();
  const chunks = body.chunks ?? [];

  // A transport chunk ID is a projection identifier, never a packet identity.
  // Drop hits without an explicit canonical packet_key rather than inventing
  // one from a chunk ID, file path, or transport position.
  const qualifiedChunks = chunks.filter((c) => (
    typeof c.packet_key === 'string' && c.packet_key.trim().length > 0 &&
    typeof c.source_ref === 'string' && c.source_ref.trim().length > 0 &&
    typeof c.content_hash === 'string' && c.content_hash.trim().length > 0
  ));

  return {
    retrievalId: `go-http:${runtime.runId}:${Date.now()}`,
    workspaceRevision: runtime.workspaceRevision,
    evidence: qualifiedChunks.map((c): EvidenceRef => ({
      packetKey: c.packet_key!,
      sourceRef: c.source_ref!,
      contentHash: c.content_hash!,
      denseScore: c.score,
    })),
    receipt: mapGoReceiptV2(body.receipt),
  };
}

/**
 * Was a fictional Go-service HTTP route (`/context/build`) that never existed on the live
 * `legal-ai-go-retrieval` service (confirmed 2026-09-08 against `services/go-retrieval-service/
 * main.go`'s full route table: only `/search/{evidence,research,codebase,bm25}`, `/stats`,
 * `/health`). No Go-side equivalent exists to redirect to. Per this repo's Postgres-is-truth
 * architecture, "assemble a bounded prompt for a known set of packetKeys" is answerable directly
 * against canonical Postgres without a cross-service hop, so this fallback now does that instead
 * of calling out to a nonexistent route.
 */
async function buildContextFromGoHttp(
  runtime: AtlasRuntimeContext,
  packetKeys: string[],
  maxTokens?: number
): Promise<ContextPacket> {
  const budget = maxTokens ?? runtime.tokenBudget.maximumInput;
  if (packetKeys.length === 0) {
    return { prompt: '', evidence: [], metadata: { workspaceId: runtime.workspaceId }, tokenCount: 0 };
  }

  const { rows } = await pool.query<{
    packet_key: string;
    source_ref: string;
    summary: string | null;
  }>(
    `SELECT packet_key, source_ref, summary FROM atlas_packets WHERE packet_key = ANY($1::text[])`,
    [packetKeys]
  );

  // Rough token estimate (chars/4) since no tokenizer is wired at this layer; bounds the prompt
  // conservatively rather than exactly.
  const CHARS_PER_TOKEN = 4;
  const maxChars = budget * CHARS_PER_TOKEN;

  let assembled = '';
  const evidence: Record<string, unknown>[] = [];
  for (const key of packetKeys) {
    const row = rows.find((r) => r.packet_key === key);
    if (!row) continue;
    const entry = `[${row.source_ref}]\n${row.summary ?? ''}`.trim();
    if (assembled.length + entry.length > maxChars) break;
    assembled += (assembled ? '\n\n' : '') + entry;
    evidence.push({ packetKey: row.packet_key, sourceRef: row.source_ref });
  }

  return {
    prompt: assembled,
    evidence,
    metadata: {
      workspaceId: runtime.workspaceId,
      source: 'postgres-direct',
      requestedPacketKeys: packetKeys.length,
      resolvedPacketKeys: evidence.length,
    },
    tokenCount: Math.ceil(assembled.length / CHARS_PER_TOKEN),
  };
}

/**
 * Was a fictional Go-service HTTP route (`/validate`) that never existed on the live
 * `legal-ai-go-retrieval` service — same root cause as `buildContextFromGoHttp` above. "Validate
 * a retrieved packet against Postgres canonical" (the VERIFY-state call site's own stated intent)
 * is a direct existence + identity check against `atlas_packets`, not something that needs a
 * second service.
 */
async function validatePacketFromGoHttp(
  _runtime: AtlasRuntimeContext,
  packetKey: string,
  proposedChange: Record<string, unknown>
): Promise<ValidationResult> {
  const { rows } = await pool.query<{ packet_key: string; source_ref: string }>(
    `SELECT packet_key, source_ref FROM atlas_packets WHERE packet_key = $1 LIMIT 1`,
    [packetKey]
  );

  const canonical = rows[0];
  if (!canonical) {
    return {
      valid: false,
      status: 'FAIL',
      errors: [`packet_key not found in Postgres canonical: ${packetKey}`],
    };
  }

  const expectedSourceRef = typeof proposedChange.sourceRef === 'string' ? proposedChange.sourceRef : undefined;
  if (expectedSourceRef && expectedSourceRef !== canonical.source_ref) {
    return {
      valid: false,
      status: 'WARN',
      errors: [
        `source_ref mismatch: expected "${expectedSourceRef}", canonical is "${canonical.source_ref}"`,
      ],
    };
  }

  return { valid: true, status: 'PASS', errors: [] };
}
