// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundaryCalls: Array<{ call: { tool: string; args: unknown }; temporal: unknown }> = [];
const selectionCalls: Array<{ failed_boundary: any; plan: any }> = [];
const dispatched: Array<unknown> = [];

vi.mock('../atlas/temporal/temporal-tool-execution-boundary.js', () => ({
  decideTemporalToolExecutionFromPostgres: vi.fn(async (input: any) => {
    boundaryCalls.push(input);
    if (input.call.tool === 'search.hybrid') {
      return {
        execution_key: 'a'.repeat(64),
        disposition: 'SELECT_ALTERNATIVE',
        reused_result_ref: null,
        prior_event_id: 'evt:failed',
        reason: 'EXACT_FAILURE_DO_NOT_REPEAT',
        boundary_checksum: 'b'.repeat(64),
      };
    }
    return {
      execution_key: 'c'.repeat(64),
      disposition: 'DISPATCH_EXECUTE',
      reused_result_ref: null,
      prior_event_id: null,
      reason: 'NO_HISTORY',
      boundary_checksum: 'd'.repeat(64),
    };
  }),
  temporalBoundaryAllowsDispatch: (decision: any) => String(decision.disposition).startsWith('DISPATCH_'),
}));

vi.mock('../atlas/temporal/temporal-action-alternative-boundary.js', () => ({
  selectTemporalAlternativeToolFromPostgres: vi.fn(async (input: any) => {
    selectionCalls.push(input);
    return {
      selected_call: { tool: 'rg_search', args: { pattern: 'resolveCanonicalCandidateId' } },
      selected_temporal: { schema: 'selected-temporal-context' },
      selected_execution_key: 'c'.repeat(64),
      selected_candidate_action_id: 'candidate:rg',
    };
  }),
}));

vi.mock('./mcp-tool-dispatch.js', () => ({
  tool_codebase_rg_search: vi.fn(async (args: unknown) => {
    dispatched.push(args);
    return { ok: true, tool: 'rg_search', matches: ['hit:1'] };
  }),
  tool_graph_expand_neighborhood: vi.fn(),
  tool_search_hybrid: vi.fn(),
}));

beforeEach(() => {
  boundaryCalls.length = 0;
  selectionCalls.length = 0;
  dispatched.length = 0;
});

describe('tool shim temporal alternative orchestration', () => {
  it('selects and dispatches the deterministic alternative without returning to the caller for replanning', async () => {
    const { executeTool } = await import('./tool-shim.js');
    const context: Record<string, unknown> = {
      temporalAction: { schema: 'failed-temporal-context' },
      temporalAlternativePlan: {
        workflow_id: 'wf:1',
        workflow_revision: 1,
        excluded_execution_keys: [],
        candidates: [{ candidate_action_id: 'placeholder' }],
      },
    };

    const result = await executeTool(
      { tool: 'search.hybrid', args: { query: 'resolveCanonicalCandidateId' } },
      context,
    );

    expect(result).toEqual({ ok: true, tool: 'rg_search', matches: ['hit:1'] });
    expect(boundaryCalls.map(({ call }) => call.tool)).toEqual(['search.hybrid', 'rg_search']);
    expect(selectionCalls).toHaveLength(1);
    expect(selectionCalls[0]?.plan.excluded_execution_keys).toContain('a'.repeat(64));
    expect(dispatched).toEqual([{ pattern: 'resolveCanonicalCandidateId' }]);
    expect(context.temporalAction).toEqual({ schema: 'selected-temporal-context' });
    expect(context.temporalAlternativeDepth).toBe(1);
  });

  it('preserves the typed SELECT_ALTERNATIVE short circuit when no alternative plan is supplied', async () => {
    const { executeTool } = await import('./tool-shim.js');
    const result = await executeTool(
      { tool: 'search.hybrid', args: { query: 'x' } },
      { temporalAction: { schema: 'failed-temporal-context' } },
    ) as any;

    expect(result.temporalDisposition).toBe('SELECT_ALTERNATIVE');
    expect(result.executionKey).toBe('a'.repeat(64));
    expect(dispatched).toHaveLength(0);
  });
});
