import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';

const checksum = 'a'.repeat(64);

function action(actionId: string, parentActionIds: string[] = []) {
  return {
    actionId,
    actionKind: 'FETCH_POSTGRES' as const,
    parentActionIds,
    inputArtifactRefs: ['artifact:query'],
    inputChecksum: checksum,
    parameterArtifactRef: null,
    parameterChecksum: null,
    outputContract: 'atlas.typed-evidence-envelope.v1',
    mutationPolicy: 'READ_ONLY' as const,
    timeoutMs: 1000,
    failurePolicy: 'FAIL_CLOSED' as const,
  };
}

describe('AdaptiveDagPlanV1', () => {
  it('builds a checksum-sealed bounded plan', () => {
    const plan = buildAdaptiveDagPlanV1({
      planId: 'plan:1',
      queryId: 'query:1',
      dagRevision: 'dag:v1',
      plannerRevision: 'planner:v1',
      classificationRevision: 'classification:v1',
      actions: [action('action:1'), action('action:2', ['action:1'])],
    });
    expect(plan.canonicalAuthority).toBe(false);
    expect(plan.planChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects undeclared dependencies and self-dependencies', () => {
    expect(() => buildAdaptiveDagPlanV1({
      planId: 'plan:2', queryId: 'query:2', dagRevision: 'dag:v1', plannerRevision: 'planner:v1', classificationRevision: 'classification:v1',
      actions: [action('action:1', ['missing:1']), action('action:2', ['action:2'])],
    })).toThrow();
  });

  it('rejects mutation by synthesis', () => {
    expect(() => buildAdaptiveDagPlanV1({
      planId: 'plan:3', queryId: 'query:3', dagRevision: 'dag:v1', plannerRevision: 'planner:v1', classificationRevision: 'classification:v1',
      actions: [{ ...action('action:1'), actionKind: 'SYNTHESIZE', mutationPolicy: 'MUTATES_WITH_RECEIPT' }],
    })).toThrow();
  });
});
