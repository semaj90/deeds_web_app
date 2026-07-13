// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAgentTrace: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/observability/agent-trace-recorder.js', () => ({
  recordAgentTrace: mocks.recordAgentTrace,
}));

describe('workflow-loop lineage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAgentTrace.mockResolvedValue(undefined);
  });

  it('uses runId as task lineage when caseId is absent', async () => {
    const { runWorkflowLoop } = await import('./workflow-loop.js');

    await runWorkflowLoop(
      {
        runId: 'run-123',
        query: 'schema mismatch',
        hmmErrorClass: 'schema_mismatch',
      },
      {
        repair: async () => ({
          ok: true,
          summary: 'fixed',
          suggestedFixes: ['patch'],
          touchedFiles: ['src/foo.ts'],
        }),
        smoke: async () => ({
          passed: true,
          command: 'npm test',
          outputSummary: 'ok',
        }),
        log: async () => undefined,
      },
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.recordAgentTrace).toHaveBeenCalledTimes(1);
    const arg = mocks.recordAgentTrace.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.taskId).toBe('run-123');
    expect(arg.traceSource).toBe('error-agent');
  });

  it('prefers caseId when present', async () => {
    const { runWorkflowLoop } = await import('./workflow-loop.js');

    await runWorkflowLoop(
      {
        runId: 'run-123',
        caseId: 'case-456',
        query: 'route mismatch',
        hmmErrorClass: 'route_contract_mismatch',
      },
      {
        repair: async () => ({
          ok: true,
          summary: 'fixed',
          suggestedFixes: ['patch'],
          touchedFiles: [],
        }),
        smoke: async () => ({
          passed: true,
          command: 'npm test',
          outputSummary: 'ok',
        }),
        log: async () => undefined,
      },
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.recordAgentTrace).toHaveBeenCalledTimes(1);
    const arg = mocks.recordAgentTrace.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.taskId).toBe('case-456');
  });
});
