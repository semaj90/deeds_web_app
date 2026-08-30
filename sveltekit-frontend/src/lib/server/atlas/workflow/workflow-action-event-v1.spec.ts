import { describe, expect, it } from 'vitest';
import {
  validateWorkflowActionEvent,
  workflowProgressFraction,
  type WorkflowActionEventDraftV1,
  type WorkflowActionEventV1
} from './workflow-action-event-v1.js';

function event(overrides: Partial<WorkflowActionEventV1> = {}): WorkflowActionEventV1 {
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: 'wf-1',
    workflowRevision: 9,
    sequence: 44,
    actionId: 'action-ast-1',
    dagNodeId: 'node-ast-1',
    attempt: 1,
    lane: 'ast',
    transport: 'local',
    kind: 'progress',
    state: 'running',
    operation: 'materialize AST evidence',
    progress: {
      completedUnits: 38,
      totalUnits: 100,
      etaMs: 12000,
      confidence: 0.8
    },
    emittedAt: '2026-08-18T19:00:00.000Z',
    visual: {
      station: 'error-bay',
      animation: 'Inspect',
      fx: 'repair-sparks'
    },
    ...overrides
  };
}

describe('WorkflowActionEventV1', () => {
  it('accepts operational truth with optional visual decoration', () => {
    const result = validateWorkflowActionEvent(event());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts bounded agent/OpenSpec telemetry without changing event identity', () => {
    const value = event({
      lane: 'a2a',
      kind: 'completed',
      state: 'succeeded',
      tokensUsed: 12_480,
      filesEdited: ['src/lib/server/ace/context-assembler.ts', 'src/lib/server/cache/ace-top-retrieval-cache.ts'],
      openspecChange: 'parent-atlas-ace-bitfrost-cache-correctness',
      finishedAt: '2026-08-18T19:00:03.000Z'
    });
    expect(validateWorkflowActionEvent(value)).toEqual({ ok: true, errors: [] });
  });

  it('keeps new telemetry fields available on WorkflowActionEventDraftV1', () => {
    const draft: WorkflowActionEventDraftV1 = {
      workflowId: 'wf-draft',
      actionId: 'action-draft',
      dagNodeId: 'node-draft',
      attempt: 1,
      lane: 'acp',
      kind: 'completed',
      state: 'succeeded',
      operation: 'bounded agent task',
      tokensUsed: 42,
      filesEdited: ['src/lib/example.ts'],
      openspecChange: 'parent-atlas-agentic-run-receipt-binding'
    };
    expect(draft.tokensUsed).toBe(42);
    expect(draft.filesEdited).toEqual(['src/lib/example.ts']);
  });

  it('rejects invalid telemetry values', () => {
    const result = validateWorkflowActionEvent(event({
      tokensUsed: -1,
      filesEdited: [' src/bad.ts'],
      openspecChange: ' bad-change '
    }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('tokensUsed must be a non-negative integer');
    expect(result.errors).toContain('filesEdited entries must be non-empty trimmed strings');
    expect(result.errors).toContain('openspecChange must be a non-empty trimmed string');
  });

  it('remains valid without a visual projection', () => {
    const value = event();
    delete value.visual;
    expect(validateWorkflowActionEvent(value).ok).toBe(true);
  });

  it('rejects impossible progress', () => {
    const result = validateWorkflowActionEvent(event({
      progress: { completedUnits: 101, totalUnits: 100 }
    }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('progress.completedUnits must not exceed progress.totalUnits');
  });

  it('derives progress from units when fraction is absent', () => {
    expect(workflowProgressFraction(event())).toBeCloseTo(0.38);
  });

  it('treats succeeded without progress payload as complete', () => {
    expect(workflowProgressFraction(event({ state: 'succeeded', progress: undefined }))).toBe(1);
  });

  it('does not manufacture progress for an unmeasured running action', () => {
    expect(workflowProgressFraction(event({ state: 'running', progress: undefined }))).toBeNull();
  });
});
