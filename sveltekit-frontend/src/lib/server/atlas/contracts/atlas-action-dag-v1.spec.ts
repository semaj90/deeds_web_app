import { describe, it, expect } from 'vitest';
import {
  AtlasActionV1Schema,
  transitionAction,
  type AtlasActionV1,
} from './atlas-action-dag-v1';

describe('atlas-action-dag-v1 contract & FSM', () => {
  it('parses a valid action in PROPOSED state', () => {
    const raw = {
      actionId: 'act-001',
      requestId: 'req-123',
      kind: 'RUN_TESTS',
      dependsOn: ['act-000'],
      evidenceRefs: ['P992'],
      expectedSourceRevision: 'sha256:abcd1234',
      permission: 'EXECUTE_TESTS',
      idempotencyKey: 'sha256:idem9988',
      state: 'PROPOSED',
    };

    const action = AtlasActionV1Schema.parse(raw);
    expect(action.actionId).toBe('act-001');
    expect(action.state).toBe('PROPOSED');
    expect(action.canonicalAuthority).toBe(false);
  });

  it('rejects an action without evidence references', () => {
    const raw = {
      actionId: 'act-002',
      requestId: 'req-123',
      kind: 'EDIT_FILES',
      dependsOn: [],
      evidenceRefs: [], // Missing evidence
      expectedSourceRevision: 'sha256:abcd1234',
      permission: 'MUTATE_WORKSPACE',
      idempotencyKey: 'sha256:idem9988',
    };

    expect(() => AtlasActionV1Schema.parse(raw)).toThrow(
      /Action requires at least one qualified evidence reference/
    );
  });

  it('progresses through valid finite-state machine transitions: PROPOSED -> QUALIFIED -> QUEUED -> LEASED -> RUNNING -> VERIFIED', () => {
    let action: AtlasActionV1 = AtlasActionV1Schema.parse({
      actionId: 'act-003',
      requestId: 'req-123',
      kind: 'GENERATE_FILES',
      evidenceRefs: ['P992', 'S331'],
      expectedSourceRevision: 'sha256:rev1',
      permission: 'MUTATE_WORKSPACE',
      idempotencyKey: 'sha256:key1',
    });

    expect(action.state).toBe('PROPOSED');

    action = transitionAction(action, 'QUALIFIED', { reason: 'ContextManifest admitted' });
    expect(action.state).toBe('QUALIFIED');

    action = transitionAction(action, 'QUEUED', { reason: 'Placed in execution scheduler' });
    expect(action.state).toBe('QUEUED');

    action = transitionAction(action, 'LEASED', { reason: 'Worker thread claimed lease' });
    expect(action.state).toBe('LEASED');

    action = transitionAction(action, 'RUNNING', { reason: 'Worker executing task' });
    expect(action.state).toBe('RUNNING');

    action = transitionAction(action, 'VERIFIED', {
      receiptRef: 'docs/reports/act-003-receipt.json',
      reason: 'Typecheck and tests passed',
    });
    expect(action.state).toBe('VERIFIED');
    expect(action.history.length).toBe(5);
  });

  it('throws on illegal transition (e.g. PROPOSED directly to RUNNING without QUALIFIED/QUEUED/LEASED)', () => {
    const action: AtlasActionV1 = AtlasActionV1Schema.parse({
      actionId: 'act-004',
      requestId: 'req-123',
      kind: 'RUN_TESTS',
      evidenceRefs: ['P992'],
      expectedSourceRevision: 'sha256:rev1',
      permission: 'EXECUTE_TESTS',
      idempotencyKey: 'sha256:key2',
    });

    expect(() => transitionAction(action, 'RUNNING')).toThrow(/INVALID_ACTION_STATE_TRANSITION/);
  });
});
