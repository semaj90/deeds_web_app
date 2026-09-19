import { describe, expect, it } from 'vitest';
import {
  fromCanonicalWorkflowActionEvent,
  toCanonicalWorkflowActionEvent,
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

  it('accepts optional run-receipt accounting metadata', () => {
    const value = event({
      tokensUsed: 42,
      filesEdited: ['scripts/atlas/example.mjs'],
      openspecChange: 'parent-atlas-agentic-run-receipt-binding',
    });
    expect(validateWorkflowActionEvent(value).ok).toBe(true);
  });

  it('rejects invalid run-receipt accounting metadata', () => {
    const result = validateWorkflowActionEvent(event({
      tokensUsed: 1.5,
      filesEdited: [''],
      openspecChange: '../unsafe',
    }));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'tokensUsed must be a non-negative integer',
      'filesEdited entries must be non-empty strings',
      'openspecChange must be a non-empty safe change name',
    ]));
  });
});

describe('WorkflowActionEventV1 -- canonical adapter round-trip (WORKFLOW-ACTION-SCHEMA-OWNER-01)', () => {
  it('round-trips every field the UI/Kanban layer actually reads', () => {
    const original = event({
      target: { canonicalId: 'candidate-42', resource: 'src/lib/foo.ts' },
      tokensUsed: 42,
      filesEdited: ['src/lib/foo.ts'],
      openspecChange: 'parent-atlas-agentic-run-receipt-binding',
    });

    const canonical = toCanonicalWorkflowActionEvent(original, { producerRevision: 'rev-ui-1' });
    expect(canonical.schema).toBe('atlas.workflow-action.v1');
    expect(canonical.producerRevision).toBe('rev-ui-1');
    expect(canonical.state).toBe(original.state);
    expect(canonical.operation).toBe(original.operation);
    expect(canonical.progress).toEqual(original.progress);
    expect(canonical.visual).toEqual(original.visual);
    expect(canonical.canonicalIds).toEqual(['candidate-42']);
    expect(canonical.metadata).toMatchObject({
      tokensUsed: 42,
      filesEdited: ['src/lib/foo.ts'],
      openspecChange: 'parent-atlas-agentic-run-receipt-binding',
    });

    const roundTripped = fromCanonicalWorkflowActionEvent(canonical, { emittedAt: original.emittedAt });
    expect(roundTripped.workflowId).toBe(original.workflowId);
    expect(roundTripped.workflowRevision).toBe(original.workflowRevision);
    expect(roundTripped.sequence).toBe(original.sequence);
    expect(roundTripped.actionId).toBe(original.actionId);
    expect(roundTripped.dagNodeId).toBe(original.dagNodeId);
    expect(roundTripped.attempt).toBe(original.attempt);
    expect(roundTripped.lane).toBe(original.lane);
    expect(roundTripped.transport).toBe(original.transport);
    expect(roundTripped.kind).toBe(original.kind);
    expect(roundTripped.state).toBe(original.state);
    expect(roundTripped.operation).toBe(original.operation);
    expect(roundTripped.progress).toEqual(original.progress);
    expect(roundTripped.target).toEqual(original.target);
    expect(roundTripped.visual).toEqual(original.visual);
    expect(roundTripped.tokensUsed).toBe(original.tokensUsed);
    expect(roundTripped.filesEdited).toEqual(original.filesEdited);
    expect(roundTripped.openspecChange).toBe(original.openspecChange);
    expect(roundTripped.emittedAt).toBe(original.emittedAt);
  });

  it('throws rather than silently drop a canonical-only kind this local shape cannot represent', () => {
    const canonical = toCanonicalWorkflowActionEvent(event(), { producerRevision: 'rev-ui-1' });
    const unrepresentable = { ...canonical, kind: 'suspended' as const };
    expect(() => fromCanonicalWorkflowActionEvent(unrepresentable, { emittedAt: '2026-09-14T00:00:00.000Z' }))
      .toThrow(/WORKFLOW_ACTION_EVENT_KIND_NOT_REPRESENTABLE_IN_UI_SHAPE/);
  });

  it('throws rather than silently drop a canonical-only transport (mcp) this local shape cannot represent', () => {
    const canonical = toCanonicalWorkflowActionEvent(event(), { producerRevision: 'rev-ui-1' });
    const unrepresentable = { ...canonical, transport: 'mcp' as const };
    expect(() => fromCanonicalWorkflowActionEvent(unrepresentable, { emittedAt: '2026-09-14T00:00:00.000Z' }))
      .toThrow(/WORKFLOW_ACTION_EVENT_TRANSPORT_NOT_REPRESENTABLE_IN_UI_SHAPE/);
  });
});
