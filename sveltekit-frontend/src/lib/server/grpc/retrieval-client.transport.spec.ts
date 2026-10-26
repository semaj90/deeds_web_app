import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import { load } from '@grpc/proto-loader';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const environment = vi.hoisted(() => ({ RETRIEVAL_GRPC_ENABLED: true, RETRIEVAL_HTTP_ENABLED: true,
  RETRIEVAL_GRPC_URL: '', RETRIEVAL_HTTP_URL: '', GO_SEARCH_URL: '', GO_SEARCH_GRPC_URL: '' }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: environment }));
vi.mock('$lib/server/cache/rpc-cache.js', () => ({ withRpcCache: vi.fn() }));

let grpcServer: grpc.Server;
let httpServer: Server;
let clientModule: typeof import('./retrieval-client.js');
const observations: unknown[] = [];

beforeAll(async () => {
  grpcServer = new grpc.Server();
  const definition = await load(resolve(process.cwd(), '../proto/active/retrieval.proto'), { includeDirs: [resolve(process.cwd(), '../proto')], keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true });
  const descriptor = grpc.loadPackageDefinition(definition) as unknown as { yorha: { retrieval: { RetrievalService: grpc.ServiceClientConstructor } } };
  grpcServer.addService(descriptor.yorha.retrieval.RetrievalService.service, {
    searchChunks: (call: grpc.ServerUnaryCall<{ query: string }, unknown>, callback: grpc.sendUnaryData<unknown>) => {
      setTimeout(() => callback(null, { results: [], totalMs: call.request.query.length }), call.request.query.length);
    },
  });
  const grpcPort = await new Promise<number>((accept, reject) => grpcServer.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : accept(port)));
  environment.RETRIEVAL_GRPC_URL = `127.0.0.1:${grpcPort}`;
  httpServer = createServer((request, response) => {
    request.resume();
    request.on('end', () => { response.setHeader('content-type', 'application/json'); response.end('{"results":[],"total_ms":1}'); });
  });
  await new Promise<void>((accept) => httpServer.listen(0, '127.0.0.1', accept));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('HTTP_FIXTURE_LISTENER_UNAVAILABLE');
  environment.RETRIEVAL_HTTP_URL = `http://127.0.0.1:${address.port}`;
  clientModule = await import('./retrieval-client.js');
}, 20_000);

afterAll(async () => {
  grpcServer?.forceShutdown();
  if (httpServer) { httpServer.closeAllConnections(); await new Promise<void>((accept) => httpServer.close(() => accept())); }
  if (process.env.ATLAS_TRANSPORT_WRITE_RECEIPT === '1') {
    const reportPath = resolve(process.cwd(), '../docs/reports', `retrieval-transport-loopback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(reportPath, JSON.stringify({ schema: 'atlas.retrieval-transport-loopback.v1',
      status: observations.length === 3 ? 'LOOPBACK_TRANSPORT_PROVEN' : 'PARTIAL',
      observations, canonicalAuthority: false, datastoreWritesPerformed: false,
      scope: 'Real grpc-js/HTTP loopback fixtures through existing retrieval client; not production service proof' }, null, 2) + '\n', { flag: 'wx' });
  }
});

describe('real loopback retrieval transport instrumentation', () => {
  it('records protobuf serialization/deserialization for concurrent real HTTP/2 gRPC calls', async () => {
    const results = await Promise.all(['short', 'longer-query'].map((query) => clientModule.searchChunksViaGrpc(query, 1)));
    for (const result of results) {
      expect(result).not.toBeNull();
      expect(result?.transportTelemetry).toMatchObject({ rpc_transport: 'grpc', http_version: '2',
        measurements: { protobuf_encode: { calls: 1, failedCalls: 0 }, protobuf_decode: { calls: 1, failedCalls: 0 }, json_parse: null } });
      expect(result?.transportTelemetry?.measurements.protobuf_encode?.bytes).toBeGreaterThan(0);
    }
    expect(results[0]?.transportTelemetry?.measurements.protobuf_encode?.bytes).not.toBe(results[1]?.transportTelemetry?.measurements.protobuf_encode?.bytes);
    observations.push(...results.map((result) => result?.transportTelemetry));
  });

  it('records actual HTTP JSON stringify/parse without claiming a negotiated HTTP version', async () => {
    const result = await clientModule.searchCodebaseViaHttp({ query: 'λ code', limit: 1 });
    expect(result?.transportTelemetry).toMatchObject({ rpc_transport: 'http', http_version: null,
      measurements: { json_stringify: { calls: 1, failedCalls: 0 }, json_parse: { calls: 1, failedCalls: 0 }, protobuf_encode: null } });
    expect(result?.transportTelemetry?.measurements.json_parse?.bytes).toBe(Buffer.byteLength('{"results":[],"total_ms":1}'));
    observations.push(result?.transportTelemetry);
  });
});
