// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1 } from '@deeds/parent-atlas/core/adaptive-dag-plan-v1';
import {
  executeOak2026AdaptiveDagV1,
  type Oak2026DagActionHandlerV1,
} from './oak2026-adaptive-dag-execution-adapter-v1.js';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

function makePlan() {
  return buildAdaptiveDagPlanV1({
    planId: 'oak:test-plan',
    queryId: 'query:test',
    dagRevision: 'kernel:v1',
    plannerRevision: 'planner:v1',
    classificationRevision: 'classifier:v1',
    actions: [
      {
        actionId: 'oak:test-plan:fetch',
        actionKind: 'FETCH_POSTGRES',
        parentActionIds: [],
        inputArtifactRefs: ['evidence:seed'],
        inputChecksum: HEX_A,
        parameterArtifactRef: null,
        parameterChecksum: HEX_B,
        outputContract: 'atlas.test.rows.v1',
        mutationPolicy: 'READ_ONLY',
        timeoutMs: 30_000,
        failurePolicy: 'FAIL_CLOSED',
      },
      {
        actionId: 'oak:test-plan:context',
        actionKind: 'BUILD_CONTEXT',
        parentActionIds: ['oak:test-plan:fetch'],
        inputArtifactRefs: ['evidence:seed'],
        inputChecksum: HEX_B,
        parameterArtifactRef: null,
        parameterChecksum: HEX_A,
        outputContract: 'atlas.test.context.v1',
        mutationPolicy: 'READ_ONLY',
        timeoutMs: 30_000,
        failurePolicy: 'FAIL_CLOSED',
      },
    ],
  });
}

function handlers(options?: { reportWrite?: boolean }): Oak2026DagActionHandlerV1[] {
  return [
    {
      actionKind: 'FETCH_POSTGRES',
      resourceClass: 'IO',
      outputContract: 'atlas.test.rows.v1',
      execute: async ({ action }) => ({
        value: { rows: [action.actionId] },
        groundedEvidence: [{ evidenceKind: 'postgres-row', evidenceRef: 'evidence:row:1' }],
        writesPerformed: options?.reportWrite ?? false,
      }),
    },
    {
      actionKind: 'BUILD_CONTEXT',
      resourceClass: 'CPU_LIGHT',
      outputContract: 'atlas.test.context.v1',
      execute: async () => ({
        value: { context: 'bounded' },
        groundedEvidence: [{ evidenceKind: 'context-item', evidenceRef: 'evidence:context:1' }],
        writesPerformed: false,
      }),
    },
  ];
}

const context = {
  kernelRevision: 'kernel:v1',
  bindingChecksum: HEX_A,
  programRevision: 'program:v1',
  executionMode: 'SHADOW' as const,
};

describe('Oak2026AdaptiveDagExecutionAdapterV1', () => {
  it('delegates a grounded read-only plan to the bounded executor', async () => {
    const first = await executeOak2026AdaptiveDagV1({
      plan: makePlan(),
      manifestState: 'DRAFT',
      context,
      handlers: handlers(),
    });
    const second = await executeOak2026AdaptiveDagV1({
      plan: makePlan(),
      manifestState: 'DRAFT',
      context,
      handlers: handlers(),
    });

    expect(first.executionMode).toBe('SHADOW');
    expect(first.actions.map((action) => action.status)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    expect(first.actions.every((action) => action.groundedEvidence.length > 0)).toBe(true);
    expect(first.writesPerformed).toBe(false);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.deterministicExecutionChecksum).toBe(second.deterministicExecutionChecksum);
  });

  it('fails closed when an action handler is not registered', async () => {
    await expect(executeOak2026AdaptiveDagV1({
      plan: makePlan(),
      manifestState: 'DRAFT',
      context,
      handlers: handlers().filter((handler) => handler.actionKind !== 'BUILD_CONTEXT'),
    })).rejects.toThrow('OAK_EXECUTOR_HANDLER_NOT_REGISTERED:BUILD_CONTEXT');
  });

  it('rejects a handler that reports writes in shadow mode', async () => {
    await expect(executeOak2026AdaptiveDagV1({
      plan: makePlan(),
      manifestState: 'DRAFT',
      context,
      handlers: handlers({ reportWrite: true }),
    })).rejects.toThrow('OAK_SHADOW_HANDLER_REPORTED_WRITE:oak:test-plan:fetch');
  });
});
