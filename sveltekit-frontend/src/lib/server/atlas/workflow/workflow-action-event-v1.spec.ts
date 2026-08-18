import { describe, expect, it } from 'vitest';
import {
  validateWorkflowActionEvent,
  workflowProgressFraction,
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
