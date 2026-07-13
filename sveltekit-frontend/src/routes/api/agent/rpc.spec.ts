// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleToolGatewayRequest: vi.fn(),
  logRequest: vi.fn(),
  logDispatch: vi.fn(),
  logResult: vi.fn(),
  recordAgentTrace: vi.fn(async () => undefined),
}));

vi.mock('$lib/agent/tool-gateway', () => ({
  buildToolGatewayManifest: vi.fn(() => ({ tools: [] })),
  handleToolGatewayRequest: mocks.handleToolGatewayRequest,
}));

vi.mock('$lib/agent/tool-diagnostic', () => ({
  ToolDiagnostics: {
    logRequest: mocks.logRequest,
    logDispatch: mocks.logDispatch,
    logResult: mocks.logResult,
    getSummary: vi.fn(),
    exportReport: vi.fn(),
    clear: vi.fn(),
    getLog: vi.fn(),
  },
}));

vi.mock('$lib/server/observability/agent-trace-recorder', () => ({
  recordAgentTrace: mocks.recordAgentTrace,
}));

vi.mock('$lib/server/env.server', () => ({
  ENV: {
    AGENT_TRACE_ENABLED: 'true',
  },
}));

describe('src/routes/api/agent/rpc/+server.ts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recordAgentTrace.mockResolvedValue(undefined);
  });

  it('records a non-global task id for successful RPC responses', async () => {
    mocks.handleToolGatewayRequest.mockResolvedValue({
      result: { ok: true },
      error: undefined,
    });

    const mod = await import('./rpc/+server.js');
    const resp = await mod.POST({
      request: new Request('http://localhost/api/agent/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { alpha: 1, beta: 2 },
        }),
      }),
      locals: { user: { id: 'user-1' } },
    } as never);

    expect(resp.status).toBe(200);
    expect(mocks.recordAgentTrace).toHaveBeenCalledTimes(1);
    const arg = mocks.recordAgentTrace.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(String(arg.taskId)).toMatch(/^rpc:tools\/call:/);
    expect(arg.taskId).not.toBe('global');
  });

  it('records task ids deterministically for equivalent param order', async () => {
    mocks.handleToolGatewayRequest.mockResolvedValue({
      result: { ok: true },
      error: undefined,
    });

    const mod = await import('./rpc/+server.js');

    await mod.POST({
      request: new Request('http://localhost/api/agent/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { beta: 2, alpha: 1 },
        }),
      }),
      locals: { user: { id: 'user-1' } },
    } as never);

    const first = String((mocks.recordAgentTrace.mock.calls[0]?.[0] as Record<string, unknown>).taskId);

    vi.clearAllMocks();
    mocks.recordAgentTrace.mockResolvedValue(undefined);
    mocks.handleToolGatewayRequest.mockResolvedValue({
      result: { ok: true },
      error: undefined,
    });

    await mod.POST({
      request: new Request('http://localhost/api/agent/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { alpha: 1, beta: 2 },
        }),
      }),
      locals: { user: { id: 'user-1' } },
    } as never);

    const second = String((mocks.recordAgentTrace.mock.calls[0]?.[0] as Record<string, unknown>).taskId);
    expect(first).toBe(second);
  });
});
