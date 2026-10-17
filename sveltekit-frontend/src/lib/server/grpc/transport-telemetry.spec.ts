import { describe, expect, it, vi } from 'vitest';
import { instrumentGrpcPackageCodecs, measureTransportCodec, observeTransport, TransportTelemetrySchema } from './transport-telemetry.js';

describe('transport codec observations', () => {
  it('retains failed codec measurements through the observer while preserving the original exception', async () => {
    const failure = new Error('private fixture error');
    const observer = vi.fn();
    await expect(observeTransport('http', async () => measureTransportCodec('json_parse', () => { throw failure; }, () => 0),
      '/fixture', observer)).rejects.toBe(failure);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({ attempt_outcome: 'THREW', operation: '/fixture',
      measurements: { json_parse: { calls: 1, failedCalls: 1 } } });
    expect(JSON.stringify(observer.mock.calls[0][0])).not.toContain(failure.message);
  });

  it('observes null fallback results without waiting for a pending writer', async () => {
    const observer = vi.fn((_observation: unknown) => new Promise<void>(() => {}));
    await expect(observeTransport('grpc', async () => null, 'SearchChunks', observer)).resolves.toBeNull();
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({ attempt_outcome: 'NO_RESULT', rpc_transport: 'grpc' });
  });

  it('does not emit failure records for successful empty results or let observer errors replace a fallback', async () => {
    const observer = vi.fn(() => { throw new Error('writer unavailable'); });
    const result = await observeTransport('http', async () => ({ results: [] }), '/fixture', observer);
    expect(result.transportTelemetry.attempt_outcome).toBe('RETURNED');
    expect(observer).not.toHaveBeenCalled();
    await expect(observeTransport('http', async () => null, '/fixture', observer)).resolves.toBeNull();
  });

  it('measures only executed JSON operations and leaves unobserved HTTP version/codecs null', async () => {
    const result = await observeTransport('http', async () => {
      const text = measureTransportCodec('json_stringify', () => JSON.stringify({ title: 'λ' }), (value) => Buffer.byteLength(value));
      return measureTransportCodec('json_parse', () => JSON.parse(text), () => Buffer.byteLength(text));
    });
    expect(result.title).toBe('λ');
    expect(result.transportTelemetry).toMatchObject({ rpc_transport: 'http', http_version: null,
      measurements: { protobuf_encode: null, protobuf_decode: null, json_stringify: { calls: 1 }, json_parse: { calls: 1 } } });
    expect(result.transportTelemetry.measurements.json_stringify?.bytes).toBe(Buffer.byteLength('{"title":"λ"}'));
  });

  it('wraps actual serializers once while preserving bytes, receiver and thrown errors', async () => {
    const method = {
      prefix: 'ok',
      requestSerialize(this: { prefix: string }, value: unknown) { return Buffer.from(this.prefix + JSON.stringify(value)); },
      responseDeserialize(value: Buffer) { return { bytes: value.byteLength }; },
    };
    const definition = { service: { method } };
    instrumentGrpcPackageCodecs(definition);
    instrumentGrpcPackageCodecs(definition);
    const result = await observeTransport('grpc', async () => {
      const bytes = method.requestSerialize.call(method, { id: 1 });
      expect(bytes.toString()).toBe('ok{"id":1}');
      return method.responseDeserialize(bytes);
    });
    expect(result).toMatchObject({ bytes: 10, transportTelemetry: { rpc_transport: 'grpc', http_version: '2',
      measurements: { protobuf_encode: { calls: 1 }, protobuf_decode: { calls: 1 }, json_parse: null } } });
    const failure = new Error('codec fixture error');
    await expect(observeTransport('http', async () => measureTransportCodec('json_parse', () => { throw failure; }, () => 0))).rejects.toBe(failure);
  });

  it('isolates concurrent observations and never retains query text in measurement metadata', async () => {
    const results = await Promise.all([1, 7].map(async (size) => observeTransport('http', async () => {
      await new Promise((resolve) => setTimeout(resolve, size));
      measureTransportCodec('json_stringify', () => 'x'.repeat(size), (value) => value.length);
      return { id: size };
    })));
    expect(results.map((result) => result.transportTelemetry?.measurements.json_stringify?.bytes)).toEqual([1, 7]);
    expect(JSON.stringify(results[0].transportTelemetry)).not.toContain('xxxxx');
  });

  it('rejects nonfinite timings and hidden extra payload before persistence', async () => {
    const result = await observeTransport('http', async () => ({}));
    expect(TransportTelemetrySchema.safeParse(result.transportTelemetry).success).toBe(true);
    expect(TransportTelemetrySchema.safeParse({ ...result.transportTelemetry, tensor: [1, 2] }).success).toBe(false);
    expect(TransportTelemetrySchema.safeParse({ ...result.transportTelemetry, measurements: {
      ...result.transportTelemetry.measurements, json_parse: { calls: 1, failedCalls: 0, milliseconds: Infinity, bytes: 1 } } }).success).toBe(false);
  });
});
