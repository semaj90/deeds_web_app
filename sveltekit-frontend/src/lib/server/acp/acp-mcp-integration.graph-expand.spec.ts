import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecuteGraphExpandMcpTool = vi.hoisted(() => vi.fn());

vi.mock('./acp-grpc-quic-bridge.js', () => ({
  acpToolRegistry: {
    getTool: vi.fn((toolId: string) => toolId === 'graph:expand' ? { id: toolId } : null),
    registerTool: vi.fn(),
  },
}));

vi.mock('$lib/server/ai/mcp-tool-dispatch.js', () => ({
  executeGraphExpandMcpTool: mockExecuteGraphExpandMcpTool,
}));

describe('ACP graph:expand dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to the shared bounded adapter and propagates failure status', async () => {
    const args = { sourceRefs: ['src/example.ts'], maxHops: 2, limit: 10 };
    const adapterResult = { tool: 'graph:expand', success: false, data: null, error: 'graph unavailable' };
    mockExecuteGraphExpandMcpTool.mockResolvedValueOnce(adapterResult);

    const { executeACPTool } = await import('./acp-mcp-integration.js');
    const result = await executeACPTool({ toolId: 'graph:expand', args });

    expect(mockExecuteGraphExpandMcpTool).toHaveBeenCalledWith(args);
    expect(result.success).toBe(false);
    expect(result.result).toEqual(adapterResult);
  });
});
