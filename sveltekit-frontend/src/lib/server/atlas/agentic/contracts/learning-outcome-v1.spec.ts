import { describe, expect, it } from 'vitest';
import { buildLearningOutcomeV1, buildOutcomeLedgerInsertV1, isTrainingEligible } from './learning-outcome-v1.js';
import { FakeAgentRuntimeAdapter } from './agent-runtime-adapter-v1.js';

const U1 = '4812677c-01a6-4d77-a6f2-d3840d400d11';
const U2 = 'c64be8ac-3847-4401-8341-69c9504e7cd0';
const base = { executionId: U2, toolName: 'kb.trace_search', transportResultClass: 'candidates', success: true, recoveryAttempted: false };
const validator = { passed: true, validatorRevision: 'tsc-v1' };

describe('LearningOutcomeV1', () => {
  it('leaves reward null without validator evidence', () => {
    const o = buildLearningOutcomeV1(base);
    expect(o.reward).toBeNull();
    expect(o.rewardStatus).toBe('UNDERIVED_NO_VALIDATOR');
    expect(o.resultClass).toBe('SUCCESS');
    expect(isTrainingEligible(o)).toBe(false);
  });
  it('keeps transport class separate from learning class', () => {
    const o = buildLearningOutcomeV1({ ...base, success: false, transportResultClass: 'tool_error' });
    expect(o.transportResultClass).toBe('tool_error');
    expect(o.resultClass).toBe('FAILURE');
  });
  it('derives RECOVERED only for a validated retry', () => {
    expect(buildLearningOutcomeV1({ ...base, retryOf: U1, validator }).resultClass).toBe('RECOVERED');
    expect(buildLearningOutcomeV1({ ...base, validator }).resultClass).toBe('SUCCESS');
  });
  it('derives a frozen-recipe reward with components', () => {
    const o = buildLearningOutcomeV1({ ...base, retryOf: U1, retryCount: 2, validator, taskCompleted: true, latencyMs: 15000 });
    expect(o.reward?.recipeRevision).toBe('learning-reward-v1');
    expect(o.reward?.components).toMatchObject({ validator: 1, taskCompleted: 1, successfulRepair: 1, retryCost: -0.2, latencyPenalty: -0.1 });
    expect(o.reward?.value).toBe(2.7);
  });
  it('penalises regression', () => {
    const o = buildLearningOutcomeV1({ ...base, validator: { passed: false, validatorRevision: 'tsc-v1' }, regressionIntroduced: true });
    expect(o.resultClass).toBe('REGRESSED');
    expect(o.reward?.value).toBe(-2);
  });
  it('is training-eligible only with task, repair id, validator, reward and evidence', () => {
    const o = buildLearningOutcomeV1({ ...base, taskId: 't1', repairAttemptId: 'r1', validator, evidenceRefs: ['src/a.ts'] });
    expect(isTrainingEligible(o)).toBe(true);
  });
});

describe('episode identity + runtime adapter (interface only)', () => {
  it('keeps taskId stable while runtime identities change across attempts', async () => {
    const adapter = new FakeAgentRuntimeAdapter();
    const mk = (n: number, retryOf: string | null) => ({ taskId: 'KANBAN-8421', executionId: `${U1.slice(0, -1)}${n}`, repairAttemptId: `r${n}`, retryOf, workflowRunId: 'wf-1', approvedMutationPlanId: 'plan-1', workspaceRevision: 'ws', objective: 'fix' });
    const h1 = await adapter.start(mk(1, null));
    const h2 = await adapter.start(mk(2, h1.executionId));
    expect(h1.taskId).toBe(h2.taskId);
    expect(h1.episode.agentSessionId).not.toBe(h2.episode.agentSessionId);
    const o1 = buildLearningOutcomeV1({ ...base, executionId: h1.executionId, success: false, transportResultClass: 'tool_error', taskId: h1.taskId, repairAttemptId: h1.repairAttemptId, episode: h1.episode });
    const o2 = buildLearningOutcomeV1({ ...base, executionId: h2.executionId, taskId: h2.taskId, repairAttemptId: h2.repairAttemptId, retryOf: h1.executionId, validator, episode: { ...h2.episode, validatorReceiptId: 'vr-1' } });
    expect(o1.resultClass).toBe('FAILURE');
    expect(o2.resultClass).toBe('RECOVERED');
    expect(o2.episode?.externalExecutionRef).toBe('fake-session-2');
    expect(o2.taskId).toBe('KANBAN-8421');
  });
  it('records events and rejects continuing a run that never started', async () => {
    const adapter = new FakeAgentRuntimeAdapter();
    const h = await adapter.start({ taskId: 't', executionId: U1, repairAttemptId: 'r', workflowRunId: 'wf', approvedMutationPlanId: 'p', workspaceRevision: 'w', objective: 'o' });
    await adapter.continue(h, 'hi');
    await adapter.cancel(h);
    const seen: string[] = [];
    for await (const e of adapter.events(h)) seen.push(e.kind);
    expect(seen).toEqual(['STARTED', 'MESSAGE', 'CANCELLED']);
    await expect(adapter.continue({ ...h, executionId: U2 }, 'x')).rejects.toThrow('AGENT_RUN_NOT_STARTED');
  });
  it('defaults episode to null when not supplied', () => {
    expect(buildLearningOutcomeV1(base).episode).toBeNull();
  });
});

describe('buildOutcomeLedgerInsertV1 (no INSERT executed)', () => {
  const outcome = buildLearningOutcomeV1(base);
  it('builds the exact row', () => {
    const row = buildOutcomeLedgerInsertV1({ traceId: U1, previousState: 'RETRIEVE', nextState: 'SYNTHESIZE', durationMs: 12.4, outcome });
    expect(row).toMatchObject({ trace_id: U1, execution_id: U2, result_class: 'candidates', final_outcome: 'success', total_duration_ms: 12, outcome_type: 'learning_outcome', reward: null });
    expect(row.metadata.learningOutcome.schema).toBe('atlas.learning-outcome.v1');
  });
  it('rejects non-UUID ids that a uuid column would reject', () => {
    expect(() => buildOutcomeLedgerInsertV1({ traceId: 'trace-abc', previousState: 'a', nextState: 'b', durationMs: 1, outcome })).toThrow('OUTCOME_LEDGER_TRACE_ID_NOT_UUID');
    expect(() => buildOutcomeLedgerInsertV1({ traceId: U1, previousState: 'a', nextState: 'b', durationMs: 1, outcome: { ...outcome, executionId: 'x' } })).toThrow('OUTCOME_LEDGER_EXECUTION_ID_NOT_UUID');
  });
});
