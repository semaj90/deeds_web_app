import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import { load } from '@grpc/proto-loader';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { withPacketTelemetryContext } from '../telemetry/packet-telemetry-context.js';

const { environment, record } = vi.hoisted(() => ({
  environment: { RETRIEVAL_GRPC_ENABLED: true, RETRIEVAL_HTTP_ENABLED: true,
    RETRIEVAL_GRPC_URL: '', RETRIEVAL_HTTP_URL: '', GO_SEARCH_URL: '', GO_SEARCH_GRPC_URL: '' },
  record: vi.fn(),
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: environment }));
vi.mock('../telemetry/packet-centric-telemetry.js', () => ({ recordPacketCentricTelemetry: record }));
vi.mock('$lib/server/cache/rpc-cache.js', () => ({ withRpcCache: vi.fn() }));

let grpcServer: grpc.Server;
let httpServer: Server;
let client: typeof import('./retrieval-client.js');
let httpMode: 'unavailable' | 'invalid-json' = 'unavailable';

beforeAll(async () => {
  grpcServer = new grpc.Server();
  const definition = await load(resolve(process.cwd(), '../proto/active/retrieval.proto'), {
    includeDirs: [resolve(process.cwd(), '../proto')], keepCase: false, longs: Number, enums: String, defaults: true, oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(definition) as unknown as { yorha: { retrieval: { RetrievalService: grpc.ServiceClientConstructor } } };
  const fail = (_call: unknown, callback: grpc.sendUnaryData<unknown>) => callback({ code: grpc.status.UNAVAILABLE, details: 'fixture service unavailable' });
  grpcServer.addService(descriptor.yorha.retrieval.RetrievalService.service, { searchChunks: fail, searchEvidence: fail });
  const grpcPort = await new Promise<number>((accept, reject) => grpcServer.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(),
    (error, port) => error ? reject(error) : accept(port)));
  environment.RETRIEVAL_GRPC_URL = `127.0.0.1:${grpcPort}`;
  httpServer = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.statusCode = httpMode === 'unavailable' ? 503 : 200;
      response.end(httpMode === 'unavailable' ? '{}' : '{invalid');
    });
  });
  await new Promise<void>((accept) => httpServer.listen(0, '127.0.0.1', accept));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('FIXTURE_LISTENER_UNAVAILABLE');
  environment.RETRIEVAL_HTTP_URL = `http://127.0.0.1:${address.port}`;
  client = await import('./retrieval-client.js');
}, 20_000);

beforeEach(() => { record.mockReset().mockResolvedValue(undefined); httpMode = 'unavailable'; });
afterAll(async () => {
  grpcServer?.forceShutdown();
  if (httpServer) { httpServer.closeAllConnections(); await new Promise<void>((accept) => httpServer.close(() => accept())); }
});

describe('failed real loopback retrieval attempts', () => {
  it('preserves separate request contexts through concurrent real gRPC and HTTP failures', async () => {
    await Promise.all([
      withPacketTelemetryContext({ trace_id: 'trace:grpc', packet_context: { packet_id: 'packet:grpc' } },
        () => client.searchChunksViaGrpc('private request')),
      withPacketTelemetryContext({ trace_id: 'trace:http', packet_context: { packet_id: 'packet:http' } },
        () => client.searchCodebaseViaHttp({ query: 'private request' })),
    ]);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    for (const [event] of record.mock.calls) {
      const protocol = event.transport_telemetry.rpc_transport;
      expect(event.trace_id).toBe(`trace:${protocol}`);
      expect(event.packet_context.packet_id).toBe(`packet:${protocol}`);
    }
  });
  it('retains both generic and evidence gRPC attempts without altering null fallback', async () => {
    await expect(client.searchChunksViaGrpc('private request')).resolves.toBeNull();
    await expect(client.searchEvidenceViaGrpc({ query: 'private request' })).resolves.toBeNull();
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    for (const [event] of record.mock.calls) {
      expect(event.transport_telemetry).toMatchObject({ attempt_outcome: 'NO_RESULT', rpc_transport: 'grpc',
        measurements: { protobuf_encode: { calls: 1 }, protobuf_decode: null } });
      expect(event.packet_context).toEqual({ rpc_transport: 'grpc' });
      expect(JSON.stringify(event)).not.toContain('private request');
    }
  });

  it('retains non-OK HTTP attempts for both routes without inventing parse work', async () => {
    await expect(client.searchCodebaseViaHttp({ query: 'private request' })).resolves.toBeNull();
    await expect(client.searchEvidenceViaHttp({ query: 'private request' })).resolves.toBeNull();
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    for (const [event] of record.mock.calls) {
      expect(event.transport_telemetry).toMatchObject({ attempt_outcome: 'NO_RESULT', rpc_transport: 'http', http_version: null,
        measurements: { json_stringify: { calls: 1 }, json_parse: null } });
    }
  });

  it('retains a failed JSON parse even when the existing caller converts it to null', async () => {
    httpMode = 'invalid-json';
    await expect(client.searchCodebaseViaHttp({ query: 'private request' })).resolves.toBeNull();
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0].transport_telemetry).toMatchObject({ attempt_outcome: 'NO_RESULT',
      measurements: { json_parse: { calls: 1, failedCalls: 1 } } });
    expect(JSON.stringify(record.mock.calls[0][0])).not.toContain('{invalid');
  });
});
