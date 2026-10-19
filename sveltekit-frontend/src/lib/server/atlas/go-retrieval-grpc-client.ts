/**
 * Go Retrieval gRPC Client Adapter — Typed bridge to Go data plane.
 * Handles service discovery, channel lifecycle, and protobuf marshalling.
 * Fallback to HTTP/JSON for debugging or when gRPC unavailable.
 */

import { Metadata } from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AtlasRuntimeContext, assertAtlasRuntimeRevisionQualified, RuntimeToolReceiptV1Schema, type RuntimeToolReceiptV1 } from './atlas-runtime-context';
import { pool } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';

interface RetrievalServiceClient {
  searchCodebase(
    request: Record<string, unknown>,
    metadata: Metadata,
    options: { deadline: Date },
    callback: (error: Error | null, response?: Record<string, any>) => void
  ): void;
  close(): void;
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

interface ContextPacket {
  prompt: string;
  evidence: Record<string, unknown>[];
  metadata: Record<string, unknown>;
  tokenCount: number;
  receipt?: RuntimeToolReceiptV1;
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

let globalClient: RetrievalServiceClient | null = null;
let globalClientUrl: string | null = null;

export async function getRetrievalGrpcClient(): Promise<RetrievalServiceClient> {
  const url = ENV.RETRIEVAL_GRPC_URL || '127.0.0.1:50053';

  if (globalClient && globalClientUrl === url) {
    return globalClient;
  }

  globalClient?.close();
  const grpc = await import('@grpc/grpc-js');
  const protoLoader = await import('@grpc/proto-loader');
  const protoCandidates = [
    path.resolve(process.cwd(), '../proto/active/retrieval.proto'),
    path.resolve(process.cwd(), 'proto/active/retrieval.proto'),
    path.resolve(process.cwd(), '../../proto/active/retrieval.proto'),
  ];
  const protoPath = protoCandidates.find((candidate) => existsSync(candidate));
  if (!protoPath) throw new Error('RETRIEVAL_PROTO_NOT_FOUND');
  const packageDefinition = await protoLoader.load(protoPath, {
    includeDirs: [path.dirname(protoPath), path.dirname(path.dirname(protoPath))],
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(packageDefinition) as any;
  const RetrievalService = descriptor.yorha?.retrieval?.RetrievalService;
  if (!RetrievalService) throw new Error('RETRIEVAL_SERVICE_PROTO_DESCRIPTOR_MISSING');
  globalClient = new RetrievalService(url, grpc.credentials.createInsecure()) as RetrievalServiceClient;
  globalClientUrl = url;

  return globalClient;
}

export async function closeRetrievalGrpcClient(): Promise<void> {
  globalClient?.close();
  globalClient = null;
  globalClientUrl = null;
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
  try {
    const client = await getRetrievalGrpcClient();
    const metadata = new Metadata();
    metadata.add('workspace-revision', runtime.workspaceRevision);
    metadata.add('run-id', runtime.runId);
    const response = await new Promise<Record<string, any>>((resolve, reject) => {
      client.searchCodebase(
        {
          query,
          limit: options?.topK ?? 12,
          atlasContext: {
            toolCallId: runtime.correlationId ?? randomUUID(),
            runId: runtime.runId,
            workspaceId: runtime.workspaceId,
            workspaceRevision: runtime.workspaceRevision,
            packetKey: runtime.packetKey,
            packetRevision: runtime.packetRevision,
          },
        },
        metadata,
        { deadline: new Date(Date.now() + 10_000) },
        (error, result) => error ? reject(error) : resolve(result ?? {}),
      );
    });
    const receipt = response.receipt;
    const mappedReceipt = mapGoReceiptV2(receipt ? {
      schema: receipt.schema,
      receipt_id: receipt.receiptId,
      receipt_checksum: receipt.receiptChecksum,
      tool_call_id: receipt.toolCallId,
      tool_name: receipt.toolName,
      run_id: receipt.runId,
      workspace_id: receipt.workspaceId,
      workspace_revision: receipt.workspaceRevision,
      packet_key: receipt.packetKey,
      packet_revision: receipt.packetRevision,
      succeeded: receipt.succeeded,
      error_code: receipt.errorCode,
      retrieval_confidence: receipt.retrievalConfidence,
      evidence_count: receipt.evidenceCount,
      validation_status: receipt.validationStatus,
      output_checksum: receipt.outputChecksum,
      writes_performed: receipt.writesPerformed,
      canonical_authority: receipt.canonicalAuthority,
    } : undefined);
    const chunks = response.receipt?.validationStatus === 'PASS' ? response.chunks ?? [] : [];
    const evidence = chunks.filter((chunk: Record<string, any>) => (
      typeof chunk.packetKey === 'string' && chunk.packetKey.trim().length > 0 &&
      typeof chunk.sourceRef === 'string' && chunk.sourceRef.trim().length > 0 &&
      typeof chunk.contentHash === 'string' && chunk.contentHash.trim().length > 0 &&
      chunk.workspaceRevision === runtime.workspaceRevision &&
      typeof chunk.sourceRevision === 'string' && chunk.sourceRevision.trim().length > 0 &&
      typeof chunk.candidateId === 'string' && chunk.candidateId.trim().length > 0
    ));
    if (response.receipt?.validationStatus !== 'PASS') {
      console.warn('[go-retrieval] SearchCodebase returned a non-qualified receipt', {
        validationStatus: response.receipt?.validationStatus ?? 'MISSING',
        errorCode: response.receipt?.errorCode ?? null,
        returnedChunks: response.chunks?.length ?? 0,
      });
    } else if ((response.chunks?.length ?? 0) > 0 && evidence.length === 0) {
      console.warn('[go-retrieval] SearchCodebase hits failed revision/identity admission', {
        returnedChunks: response.chunks.length,
        rejectedChunks: response.chunks.length,
        workspaceRevision: runtime.workspaceRevision,
      });
    }
    return {
      retrievalId: `go-grpc:${runtime.runId}:${Date.now()}`,
      workspaceRevision: runtime.workspaceRevision,
      evidence: evidence.map((chunk: Record<string, any>): EvidenceRef => ({
        packetKey: chunk.packetKey,
        sourceRef: chunk.sourceRef,
        contentHash: chunk.contentHash,
        denseScore: typeof chunk.score === 'number' ? chunk.score : undefined,
      })),
      receipt: mappedReceipt,
    };
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
  return buildContextFromGoHttp(runtime, packetKeys, maxTokens);
}

export async function validatePacketFromGo(
  runtime: AtlasRuntimeContext,
  packetKey: string,
  proposedChange: Record<string, unknown>
): Promise<ValidationResult> {
  assertAtlasRuntimeRevisionQualified(runtime);
  return validatePacketFromGoHttp(runtime, packetKey, proposedChange);
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
