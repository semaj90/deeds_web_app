import { describe, expect, it } from 'vitest';
import {
  RESIDENCY_STATES,
  residencyTransitionToWorkflowAction,
  type ResidencyTransitionV1,
} from './workflow-action-adapters.js';

const identity = { runId: 'run:1', workflowId: 'wf:1', workflowRevision: 1, actionId: 'act:1', dagNodeId: 'node:1', attempt: 1 };
const base: ResidencyTransitionV1 = { sequence: 0, state: 'QUEUED', executor: 'CPU', materializationId: 'mat:1', generation: 3 };
const map = (t: Partial<ResidencyTransitionV1>) =>
  residencyTransitionToWorkflowAction({ identity, transition: { ...base, ...t }, producer_revision: 'test:v1' });

describe('residencyTransitionToWorkflowAction', () => {
  it('keeps the residency state lossless in metadata for every state', () => {
    RESIDENCY_STATES.forEach((state, i) => {
      const ev = map({
        state,
        sequence: i,
        receiptId: state === 'RELEASED' ? 'rcpt:1' : undefined,
        reasonCode: state === 'FAILED' || state === 'BLOCKED' ? 'X' : undefined,
      });
      expect(ev.metadata.residency_state).toBe(state);
      expect(ev.sequence).toBe(i);
    });
  });

  it('maps CUDA to the gpu lane and CPU to tool', () => {
    expect(map({ executor: 'CUDA' }).lane).toBe('gpu');
    expect(map({ executor: 'CPU' }).lane).toBe('tool');
  });

  it('requires receiptId on RELEASED and reasonCode on FAILED', () => {
    expect(() => map({ state: 'RELEASED' })).toThrow();
    expect(() => map({ state: 'FAILED' })).toThrow();
    expect(map({ state: 'FAILED', reasonCode: 'GPU_OOM' }).errorCode).toBe('GPU_OOM');
  });

  it('never exposes materializationId as a canonical resource', () => {
    const ev = map({ packetKey: 'pk:1' });
    expect(ev.resourceRefs.map((r) => r.resource_id)).toEqual(['pk:1']);
    expect(ev.metadata.materialization_id).toBe('mat:1');
  });
});
