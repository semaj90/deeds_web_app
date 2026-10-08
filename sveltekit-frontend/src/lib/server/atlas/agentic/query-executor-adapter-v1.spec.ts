import { describe, expect, it, vi } from 'vitest';
import { buildQueryExecutionPlanV1, compileExecutorRequestV1, dispatchQueryExecutionNodeV1 } from './query-executor-adapter-v1.js';

const h = (c: string) => `sha256:${c.repeat(64)}`;
const artifact = { artifactId: 'snapshot:fixture', checksum: h('a'), revision: 'snapshot-r1' };
const node = (overrides: Record<string, unknown> = {}) => ({
  nodeId: 'cpu-probe', dependencies: [], executorClass: 'CPU', transport: 'FASTAPI',
  parameters: { topK: 5 }, artifactRefs: [], evidenceRefs: ['evidence:seed'],
  expectedOutputSchema: 'validator:fixture-v1', producerRevision: 'executor:r1', ...overrides,
});
const plan = (nodes = [node()]) => buildQueryExecutionPlanV1({
  schema: 'atlas.query-execution-plan.v1', planId: 'plan:fixture', policyRevision: 'policy:r1',
  nodes: nodes as never, canonicalAuthority: false,
});
const response = (overrides: Record<string, unknown> = {}) => ({
  schema: 'atlas.executor-response.v1', nodeId: 'cpu-probe', status: 'PASS', exitCode: 0,
  stdoutDigest: h('b'), stderrDigest: h('c'), outputChecksum: h('d'), outputArtifactRefs: [],
  evidenceRefs: ['evidence:executor'], producerRevision: 'executor:r1', durationMs: 3,
  writesPerformed: false, ...overrides,
});

describe('typed query executor adapter', () => {
  it('compiles a checksummed plan node to a write-disabled request', () => {
    const request = compileExecutorRequestV1({ plan: plan(), nodeId: 'cpu-probe' });
    expect(request.transport).toBe('FASTAPI');
    expect(request.writesAllowed).toBe(false);
    expect(request.planChecksum).toBe(plan().planChecksum);
  });

  it('rejects forward dependencies and cyclic plans', () => {
    expect(() => plan([node({ nodeId: 'a', dependencies: ['b'] }), node({ nodeId: 'b', dependencies: ['a'] })])).toThrow();
  });

  it('requires revisioned artifacts for GPU and bulk gRPC data', () => {
    expect(() => plan([node({ executorClass: 'GPU_RTX' })])).toThrow();
    expect(() => plan([node({ transport: 'GRPC', parameters: { vectorPayload: 'x' } })])).toThrow();
    expect(() => plan([node({ transport: 'GRPC', parameters: { payload: 'x'.repeat(4097) } })])).toThrow();
  });

  it('dispatches only through the declared transport and produces a strict validation barrier', async () => {
    const local = vi.fn(async () => response());
    const fastapi = vi.fn(async () => response());
    const grpc = vi.fn(async () => response());
    const result = await dispatchQueryExecutionNodeV1({ plan: plan(), nodeId: 'cpu-probe', transports: { local, fastapi, grpc } });
    expect(fastapi).toHaveBeenCalledOnce();
    expect(local).not.toHaveBeenCalled();
    expect(grpc).not.toHaveBeenCalled();
    expect(result.validation.status).toBe('PASS');
    expect(result.writesPerformed).toBe(false);
  });

  it('uses gRPC transport for a gRPC plan node', async () => {
    const grpc = vi.fn(async () => response({ nodeId: 'grpc-probe' }));
    const grpcPlan = plan([node({ nodeId: 'grpc-probe', transport: 'GRPC' })]);
    await dispatchQueryExecutionNodeV1({ plan: grpcPlan, nodeId: 'grpc-probe', transports: {
      local: vi.fn(async () => response({ nodeId: 'grpc-probe' })),
      fastapi: vi.fn(async () => response({ nodeId: 'grpc-probe' })),
      grpc,
    } });
    expect(grpc).toHaveBeenCalledOnce();
  });

  it('rejects nominal PASS without execution proof and rejects response identity drift', async () => {
    const transports = { local: vi.fn(async () => response()), fastapi: vi.fn(async () => response({ exitCode: 1 })), grpc: vi.fn(async () => response()) };
    const result = await dispatchQueryExecutionNodeV1({ plan: plan(), nodeId: 'cpu-probe', transports });
    expect(result.validation.status).toBe('FAIL');
    await expect(dispatchQueryExecutionNodeV1({ plan: plan(), nodeId: 'cpu-probe', transports: { ...transports, fastapi: vi.fn(async () => response({ nodeId: 'other' })) } })).rejects.toThrow('EXECUTOR_RESPONSE_NODE_MISMATCH');
    await expect(dispatchQueryExecutionNodeV1({ plan: plan(), nodeId: 'cpu-probe', transports: { ...transports, fastapi: vi.fn(async () => response({ producerRevision: 'unexpected' })) } })).rejects.toThrow('EXECUTOR_PRODUCER_REVISION_MISMATCH');
  });
});
