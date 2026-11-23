import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import { load } from '@grpc/proto-loader';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createAtlasRuntimeContext, RuntimeToolReceiptV1Schema } from './atlas-runtime-context.js';
import {
  buildContextFromGo,
  closeRetrievalGrpcClient,
  retrieveFromGo,
  validatePacketFromGo,
} from './go-retrieval-grpc-client.js';

const environment = vi.hoisted(() => ({
  RETRIEVAL_GRPC_URL: '',
  GO_RETRIEVAL_HTTP_URL: '',
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: environment }));

const unqualifiedRuntime = createAtlasRuntimeContext({
  runId: 'run',
  threadId: 'thread',
  resourceId: 'resource',
  workspaceId: 'workspace',
  packetKey: 'packet',
});

const qualifiedRuntime = createAtlasRuntimeContext({
  runId: 'run-p1-vertical-slice',
  threadId: 'thread-p1',
  resourceId: 'resource-p1',
  workspaceId: 'deeds-2026q4',
  workspaceRevision: 'rev:workspace:p1-001',
  packetKey: 'ace:packet:31954764ce55',
  packetRevision: 'rev:packet:p1-001',
  sourceRevision: 'rev:source:p1-001',
  correlationId: 'toolcall-p1-001',
});

let grpcServer: grpc.Server;
let lastMetadata: grpc.Metadata | null = null;

function buildGoProtoReceipt(ctx: Record<string, string>, succeeded: boolean, evidenceCount: number, validationStatus: string, errorCode = '', outputChecksum = 'sha256:aaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999') {
  const receiptId = `receipt:${ctx.runId}:${ctx.toolCallId}`;
  const checksumInput = [
    'atlas.tool-receipt.v2',
    receiptId,
    ctx.toolCallId,
    'atlas.retrieve',
    ctx.runId,
    ctx.workspaceId,
    ctx.workspaceRevision,
    ctx.packetKey,
    ctx.packetRevision,
    ctx.sourceRevision ?? '',
    String(succeeded),
    String(evidenceCount),
    validationStatus,
    outputChecksum,
    errorCode,
  ].join('\x00');
  const receiptChecksum = `sha256:${createHash('sha256').update(checksumInput).digest('hex')}`;
  return {
    schema: 'atlas.tool-receipt.v2',
    receiptId,
    receiptChecksum,
    toolCallId: ctx.toolCallId,
    toolName: 'atlas.retrieve',
    runId: ctx.runId,
    workspaceId: ctx.workspaceId,
    workspaceRevision: ctx.workspaceRevision,
    packetKey: ctx.packetKey,
    packetRevision: ctx.packetRevision,
    sourceRevision: ctx.sourceRevision ?? '',
    succeeded,
    errorCode: errorCode || undefined,
    retrievalConfidence: 0.92,
    evidenceCount,
    validationStatus,
    outputChecksum,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}

beforeAll(async () => {
  grpcServer = new grpc.Server();
  const protoPath = resolve(process.cwd(), '../proto/active/retrieval.proto');
  const definition = await load(protoPath, {
    includeDirs: [resolve(process.cwd(), '../proto/active'), resolve(process.cwd(), '../proto')],
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(definition) as unknown as {
    yorha: { retrieval: { RetrievalService: grpc.ServiceClientConstructor } };
  };
  grpcServer.addService(descriptor.yorha.retrieval.RetrievalService.service, {
    searchCodebase: (
      call: grpc.ServerUnaryCall<{ query: string; limit: number; atlasContext: Record<string, string> }, unknown>,
      callback: grpc.sendUnaryData<unknown>,
    ) => {
      lastMetadata = call.metadata;
      const auth = call.metadata.get('authorization')[0];
      if (call.request.query === 'REQUIRE_AUTH' && auth !== 'Bearer secret-operator-token') {
        callback({ code: grpc.status.UNAUTHENTICATED, message: 'INVALID_OPERATOR_TOKEN' });
        return;
      }
      if (call.request.query === 'SLOW_QUERY') {
        const timer = setTimeout(() => {
          callback(null, { chunks: [], totalMs: 250, representationUsed: 'semantic_768' });
        }, 250);
        call.on('cancelled', () => clearTimeout(timer));
        return;
      }
      if (call.request.query === 'REVIEW_REQUIRED_QUERY') {
        const ctx = call.request.atlasContext ?? {};
        callback(null, {
          chunks: [],
          totalMs: 6,
          representationUsed: 'semantic_768',
          receipt: buildGoProtoReceipt(ctx, true, 3, 'REVIEW_REQUIRED', 'SOURCE_BINDING_MISSING_OR_MISMATCH'),
        });
        return;
      }
      const ctx = call.request.atlasContext ?? {};
      const chunk = {
        chunkId: 'cand-101',
        filePath: 'src/lib/server/atlas/go-retrieval-grpc-client.ts',
        kind: 'server',
        score: 0.92,
        packetKey: ctx.packetKey || 'ace:packet:31954764ce55',
        sourceRef: 'src/lib/server/atlas/go-retrieval-grpc-client.ts',
        contentHash: 'sha256:1234567890abcdef',
        workspaceRevision: ctx.workspaceRevision,
        sourceRevision: ctx.sourceRevision,
        representationId: 'semantic_768',
        representationRevision: 'sha256:rep768',
        candidateId: 'cand-101',
        candidateOrdinal: 101,
      };
      callback(null, {
        chunks: [chunk],
        totalMs: 4,
        representationUsed: 'semantic_768',
        receipt: buildGoProtoReceipt(ctx, true, 1, 'PASS'),
      });
    },
  });
  const port = await new Promise<number>((accept, reject) =>
    grpcServer.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, boundPort) =>
      err ? reject(err) : accept(boundPort),
    ),
  );
  environment.RETRIEVAL_GRPC_URL = `127.0.0.1:${port}`;
});

afterAll(async () => {
  await closeRetrievalGrpcClient();
  grpcServer?.forceShutdown();
});

describe('Go retrieval P1 gRPC vertical slice (revision admission, auth, deadlines, cancellation, receipt validation)', () => {
  it('rejects retrieval before client creation when runtime is revision-unqualified', async () => {
    await expect(retrieveFromGo(unqualifiedRuntime, 'query')).rejects.toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });

  it('rejects context assembly before client creation when runtime is revision-unqualified', async () => {
    await expect(buildContextFromGo(unqualifiedRuntime, ['packet'])).rejects.toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });

  it('rejects packet validation before client creation when runtime is revision-unqualified', async () => {
    await expect(validatePacketFromGo(unqualifiedRuntime, 'packet', {})).rejects.toThrow('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  });

  it('executes an authenticated, revision-bound native gRPC SearchCodebase request and validates the returned receipt', async () => {
    const res = await retrieveFromGo(qualifiedRuntime, 'SearchCodebase vertical slice', {
      topK: 4,
      authToken: 'secret-operator-token',
      disableHttpFallback: true,
    });
    expect(res.workspaceRevision).toBe('rev:workspace:p1-001');
    expect(res.evidence).toHaveLength(1);
    expect(res.evidence[0]).toMatchObject({
      packetKey: 'ace:packet:31954764ce55',
      sourceRef: 'src/lib/server/atlas/go-retrieval-grpc-client.ts',
      sourceRevision: 'rev:source:p1-001',
      contentHash: 'sha256:1234567890abcdef',
    });
    expect(res.receipt).toBeDefined();
    expect(RuntimeToolReceiptV1Schema.safeParse(res.receipt).success).toBe(true);
    expect(lastMetadata?.get('authorization')[0]).toBe('Bearer secret-operator-token');
    expect(lastMetadata?.get('workspace-revision')[0]).toBe('rev:workspace:p1-001');
    expect(lastMetadata?.get('packet-key')[0]).toBe('ace:packet:31954764ce55');
  });

  it('propagates UNAUTHENTICATED gRPC error when auth token is invalid and HTTP fallback is disabled', async () => {
    await expect(
      retrieveFromGo(qualifiedRuntime, 'REQUIRE_AUTH', {
        authToken: 'wrong-token',
        disableHttpFallback: true,
      }),
    ).rejects.toThrow(/INVALID_OPERATOR_TOKEN/);
  });

  it('enforces gRPC deadline expiration (DEADLINE_EXCEEDED) on slow calls', async () => {
    await expect(
      retrieveFromGo(qualifiedRuntime, 'SLOW_QUERY', {
        deadlineMs: 30,
        disableHttpFallback: true,
      }),
    ).rejects.toThrow(/DEADLINE_EXCEEDED|Deadline exceeded/i);
  });

  it('supports AbortSignal cancellation of an in-flight gRPC call', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);
    await expect(
      retrieveFromGo(qualifiedRuntime, 'SLOW_QUERY', {
        signal: controller.signal,
        deadlineMs: 5000,
        disableHttpFallback: true,
      }),
    ).rejects.toThrow('ATLAS_GRPC_CALL_ABORTED');
  });

  it('normalizes Go REVIEW_REQUIRED receipt validationStatus to WARN instead of dropping the receipt', async () => {
    const res = await retrieveFromGo(qualifiedRuntime, 'REVIEW_REQUIRED_QUERY', {
      authToken: 'secret-operator-token',
      disableHttpFallback: true,
    });
    expect(res.evidence).toHaveLength(0);
    expect(res.receipt).toBeDefined();
    expect(res.receipt?.validationStatus).toBe('WARN');
    expect(res.receipt?.errorCode).toBe('SOURCE_BINDING_MISSING_OR_MISMATCH');
  });
});
