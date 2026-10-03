import { createHash } from 'node:crypto';
import { z } from 'zod';

const toolNames = ['atlas.backend_info', 'atlas.exact_topk_oracle', 'atlas.parity_report'] as const;
const countersSchema = z.object({
  cuda_execution: z.number().finite().nonnegative(),
  cpu_fallback: z.number().finite().nonnegative(),
  stub_invocation: z.number().finite().nonnegative(),
  cuda_error_fallback: z.number().finite().nonnegative(),
  oom_fallback: z.number().finite().nonnegative(),
}).strict();

const receiptBodySchema = z.object({
  schema: z.literal('atlas.native-acceleration-tool-receipt.v1'),
  toolName: z.enum(toolNames),
  access: z.literal('READ'),
  resultSha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  backend: z.string().nullable(),
  executionCounters: countersSchema.nullable(),
  counterScope: z.literal('CUMULATIVE_PROCESS_SNAPSHOT_NOT_PER_CALL'),
  writesPerformed: z.literal(false),
  modelCallsPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
});

const receiptSchema = receiptBodySchema.extend({
  receiptChecksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();

const fixture = Object.freeze({
  query: [1, 0] as const,
  corpus: [0, 1, 1, 0, 0.8, 0.6, -1, 0] as const,
  rows: 4,
  dimensions: 2,
  topK: 2,
});

export type NativeAccelerationToolPort = {
  backendInfo(): unknown;
  executionCounters(): unknown;
  exactTopK(query: Float32Array, corpus: Float32Array, rows: number, dimensions: number, topK: number): {
    indices: ArrayLike<number>;
    scores: ArrayLike<number>;
    backend: string;
  };
};

type ToolServer = {
  registerTool(name: string, registration: { description: string; inputSchema: z.ZodObject<any> }, handler: () => Promise<unknown>): void;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`;
}

function buildReceipt(toolName: typeof toolNames[number], result: unknown, backend: string | null, counters: unknown) {
  const parsedCounters = countersSchema.safeParse(counters);
  const body = receiptBodySchema.parse({
    schema: 'atlas.native-acceleration-tool-receipt.v1',
    toolName,
    access: 'READ',
    resultSha256: sha256(result),
    backend,
    executionCounters: parsedCounters.success ? parsedCounters.data : null,
    counterScope: 'CUMULATIVE_PROCESS_SNAPSHOT_NOT_PER_CALL',
    writesPerformed: false,
    modelCallsPerformed: false,
    canonicalAuthority: false,
  });
  return receiptSchema.parse({ ...body, receiptChecksum: sha256(body) });
}

function response(toolName: typeof toolNames[number], result: unknown, backend: string | null, counters: unknown, isError = false) {
  const body = { result, executionReceipt: buildReceipt(toolName, result, backend, counters) };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    ...(isError ? { isError: true } : {}),
  };
}

function runFixture(port: NativeAccelerationToolPort) {
  const native = port.exactTopK(
    new Float32Array(fixture.query),
    new Float32Array(fixture.corpus),
    fixture.rows,
    fixture.dimensions,
    fixture.topK,
  );
  const indices = Array.from(native.indices);
  const scores = Array.from(native.scores);
  const expectedIndices = [1, 2];
  const expectedScores = [1, 0.8];
  const matches = indices.length === expectedIndices.length
    && scores.length === expectedScores.length
    && indices.every((value, index) => value === expectedIndices[index])
    && scores.every((value, index) => Number.isFinite(value) && Math.abs(value - expectedScores[index]!) <= 1e-6);
  return {
    schema: 'atlas.native-exact-topk-fixture-result.v1',
    status: matches ? 'PARITY_MATCH' : 'NUMERICAL_MISMATCH',
    backend: native.backend,
    indices,
    scores,
    expectedIndices,
    expectedScores,
    fixture: { rows: fixture.rows, dimensions: fixture.dimensions, topK: fixture.topK, sha256: sha256(fixture) },
    datastoreAccess: false,
  };
}

export function registerNativeAccelerationTools(server: ToolServer, getPort: () => Promise<NativeAccelerationToolPort> | NativeAccelerationToolPort): void {
  server.registerTool(toolNames[0], {
    description: 'Read native acceleration backend/build metadata and cumulative execution counters. Does not access data stores or invoke a model.',
    inputSchema: z.object({}).strict(),
  }, async () => {
    try {
      const port = await getPort();
      const backendInfo = port.backendInfo();
      const exportInfo = (backendInfo as { per_export_backend?: Record<string, { backend?: string }> })?.per_export_backend?.batchCosineTopK;
      const result = { schema: 'atlas.native-backend-info-result.v1', backendInfo, datastoreAccess: false };
      return response(toolNames[0], result, exportInfo?.backend ?? null, port.executionCounters());
    } catch {
      return response(toolNames[0], { status: 'UNAVAILABLE', code: 'NATIVE_BACKEND_UNAVAILABLE' }, null, null, true);
    }
  });

  server.registerTool(toolNames[1], {
    description: 'Run the fixed four-vector exact top-K fixture through the native adapter; no caller-supplied corpus or store access.',
    inputSchema: z.object({}).strict(),
  }, async () => {
    try {
      const port = await getPort();
      const result = runFixture(port);
      return response(toolNames[1], result, result.backend, port.executionCounters(), result.status !== 'PARITY_MATCH');
    } catch {
      return response(toolNames[1], { status: 'UNAVAILABLE', code: 'NATIVE_TOPK_UNAVAILABLE' }, null, null, true);
    }
  });

  server.registerTool(toolNames[2], {
    description: 'Compare the native adapter against the frozen scalar exact top-K fixture and return a checksum-bound parity receipt.',
    inputSchema: z.object({}).strict(),
  }, async () => {
    try {
      const port = await getPort();
      const result = runFixture(port);
      return response(toolNames[2], result, result.backend, port.executionCounters(), result.status !== 'PARITY_MATCH');
    } catch {
      return response(toolNames[2], { status: 'UNAVAILABLE', code: 'NATIVE_PARITY_UNAVAILABLE' }, null, null, true);
    }
  });
}
