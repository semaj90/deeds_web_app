import { describe, expect, it } from 'vitest';
import { validateWorkflowDag, type WorkflowDagPlanV1 } from './workflow-dag.js';

const budget = {
  maxNodes: 12,
  maxEdges: 16,
  maxDepth: 8,
  maxWidth: 4,
  maxCompute: 20,
  maxToolCalls: 8,
  maxContextTokens: 4096,
  maxGpuBytes: 1024,
  maxElapsedMs: 500,
};

const plan = (nodes: WorkflowDagPlanV1['nodes']): WorkflowDagPlanV1 => ({
  schema: 'atlas.workflow-dag-plan.v1',
  workflowRevision: 7,
  nodes,
  budget,
});

describe('WorkflowDagPlanV1', () => {
  it('admits an acyclic forward-only repair chain', () => {
    const receipt = validateWorkflowDag(plan([
      { id: 'PATCH', cost: { toolCalls: 1 } },
      { id: 'VERIFY_0', dependencies: ['PATCH'], logicalActionId: 'VERIFY', attempt: 0 },
      { id: 'REPAIR_1', dependencies: ['VERIFY_0'], logicalActionId: 'REPAIR', attempt: 1 },
      { id: 'VERIFY_1', dependencies: ['REPAIR_1'], logicalActionId: 'VERIFY', attempt: 1 },
    ]));

    expect(receipt.admissible).toBe(true);
    expect(receipt.topologicalOrder).toEqual(['PATCH', 'VERIFY_0', 'REPAIR_1', 'VERIFY_1']);
    expect(receipt.metrics.depth).toBe(4);
    expect(receipt.retryLineage.VERIFY.map((row) => row.attempt)).toEqual([0, 1]);
  });

  it('rejects cycles', () => {
    const receipt = validateWorkflowDag(plan([
      { id: 'A', dependencies: ['B'] },
      { id: 'B', dependencies: ['A'] },
    ]));
    expect(receipt.admissible).toBe(false);
    expect(receipt.cycleNodes).toEqual(['A', 'B']);
    expect(receipt.violations).toContain('cycle_or_invalid_dependency_graph');
  });

  it('rejects missing dependencies', () => {
    const receipt = validateWorkflowDag(plan([{ id: 'VERIFY', dependencies: ['PATCH'] }]));
    expect(receipt.admissible).toBe(false);
    expect(receipt.missingDependencies).toEqual(['PATCH']);
  });

  it('rejects self and duplicate dependencies as malformed input', () => {
    expect(() => validateWorkflowDag(plan([{ id: 'A', dependencies: ['A'] }]))).toThrow(/self dependency/);
    expect(() => validateWorkflowDag(plan([
      { id: 'A' },
      { id: 'B', dependencies: ['A', 'A'] },
    ]))).toThrow(/duplicate dependencies/);
  });

  it('enforces width and tool budgets', () => {
    const receipt = validateWorkflowDag({
      ...plan([
        { id: 'A', cost: { toolCalls: 1 } },
        { id: 'B', cost: { toolCalls: 1 } },
        { id: 'C', cost: { toolCalls: 1 } },
      ]),
      budget: { ...budget, maxWidth: 2, maxToolCalls: 2 },
    });
    expect(receipt.admissible).toBe(false);
    expect(receipt.violations).toContain('width_budget_exceeded');
    expect(receipt.violations).toContain('toolCalls_budget_exceeded');
  });
});
