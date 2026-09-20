import { describe, expect, it } from 'vitest';
import {
  classifyFailure,
  failureFingerprint,
  reconcileRepairRequestAgainstCurrentController,
  reconcileOpenSpecSelection,
  retrySuppressed,
  runAllowlistedSmokeProfile,
  selectOpenSpecTask,
  type OpenSpecControllerSnapshot,
} from './openspec-controller.js';
import { buildErrorAgentRepairRequestV1 } from './repair-request.js';

function snapshot(): OpenSpecControllerSnapshot {
  return {
    policy: { revision: 'controller-v1' },
    completionEnvelopes: [{
      goalId: 'fixture-goal',
      revision: 'controller-v1',
      requiredGates: [{ gateId: 'FIXTURE_GATE', status: 'PROVEN_CURRENT', receipt: 'fixture-receipt' }],
      explicitlyNotRequired: [],
      allowedChanges: ['safe-contract', 'parent-atlas-nlp-sidecar-feature-compiler'],
      allowedFallbacks: [],
      scopeBudget: { maxNewBlockersPerAttempt: 0, maxNewOwners: 0, architectureExpansionAllowed: false },
      checksum: 'sha256:5a3250da417d936e848a515760af258cbedc44107206e2d2319622a86ea24582',
    }],
    allTasks: [
      { taskKey: 'wait:1', change: 'lineage', line: 1, text: 'apply canonical migration', priority: 1, controller: { state: 'WAITING_ON_AUTHORITY' } },
      { taskKey: 'action:2', change: 'safe-contract', line: 2, text: 'add deterministic receipt test', priority: 20, controller: { state: 'ACTIONABLE' } },
      { taskKey: 'action:3', change: 'safe-contract', line: 3, text: 'run fixture replay', priority: 21, controller: { state: 'ACTIONABLE', requiredReceipts: ['FIXTURE_REPLAY_PROVEN'] } },
      { taskKey: 'review:4', change: 'review', line: 4, text: 'canonical live readback', priority: 2, controller: { state: 'ACTIONABLE' } },
    ],
    checksum: 'sha256:controller',
    reportPath: 'fixture',
    writesPerformed: false,
  };
}

describe('OpenSpec controller adapter', () => {
  it('uses the full controller task set instead of a capped actionable sample', () => {
    const current = snapshot();
    const selection = selectOpenSpecTask(current);
    expect(selection.taskKey).toBe('action:2');
    expect(current.allTasks).toHaveLength(4);
  });

  it('selects ACTIONABLE tasks only and rejects authority-review text', () => {
    const current = snapshot();
    expect(() => selectOpenSpecTask(current, { taskKey: 'wait:1' })).toThrow('OPENSPEC_TASK_NOT_ACTIONABLE');
    expect(() => selectOpenSpecTask(current, { taskKey: 'review:4' })).toThrow('OPENSPEC_TASK_NOT_ACTIONABLE');
    expect(selectOpenSpecTask(current, { taskKey: 'action:3' }).requiredReceipts).toEqual(['FIXTURE_REPLAY_PROVEN']);
  });

  it('rejects an actionable task outside the envelope scope', () => {
    const current = snapshot();
    const outOfScope = {
      ...current,
      allTasks: [{ ...current.allTasks[0], taskKey: 'other:1', change: 'unrelated-change' }],
    };
    expect(() => selectOpenSpecTask(outOfScope)).toThrow('OPENSPEC_NO_ACTIONABLE_TASK');
  });

  it('binds NLP owners to the named read-only classification smoke profile', () => {
    const current = snapshot();
    const nlp = {
      ...current,
      allTasks: [{
        taskKey: 'nlp:1',
        change: 'parent-atlas-nlp-sidecar-feature-compiler',
        line: 1,
        text: 'run the bounded NLP sidecar proof',
        priority: 1,
        controller: { state: 'ACTIONABLE' },
      }],
    };
    expect(selectOpenSpecTask(nlp).smokeProfile).toBe('nlp-classification-readiness');
  });

  it('executes the NLP profile only through the server-side allowlist', async () => {
    const result = await runAllowlistedSmokeProfile('nlp-classification-readiness', {
      change: 'parent-atlas-nlp-sidecar-feature-compiler',
      timeoutMs: 120_000,
    });
    expect(result.passed).toBe(true);
    expect(result.command).toContain('audit-nlp-agentic-error-readiness-v1.mjs');
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects stale controller checksums', () => {
    expect(() => selectOpenSpecTask(snapshot(), { controllerReportChecksum: 'sha256:old' })).toThrow('OPENSPEC_CONTROLLER_REPORT_STALE');
  });

  it('rejects a stale or unproven completion envelope before task selection', () => {
    const blocked = {
      ...snapshot(),
      completionEnvelopes: [{
        ...snapshot().completionEnvelopes[0],
        requiredGates: [{ gateId: 'FIXTURE_GATE', status: 'WAITING_ON_AUTHORITY' }],
        allowedChanges: ['safe-contract', 'parent-atlas-nlp-sidecar-feature-compiler'],
      }],
    };
    expect(() => selectOpenSpecTask(blocked)).toThrow('OPENSPEC_COMPLETION_ENVELOPE_BLOCKED');
    expect(() => selectOpenSpecTask(snapshot(), { completionEnvelopeRevision: 'old-revision' })).toThrow('OPENSPEC_COMPLETION_ENVELOPE_STALE');
  });

  it('suppresses a retry when the fingerprint is unchanged', () => {
    const fingerprint = failureFingerprint({ taskKey: 'action:2', gate: 'safe-contract', blocker: 'NONE', controllerReportChecksum: 'sha256:a' });
    expect(retrySuppressed(fingerprint, fingerprint)).toBe(true);
    expect(retrySuppressed('sha256:other', fingerprint)).toBe(false);
  });

  it('classifies B0 through B3 without allowing advisory lanes to mutate state', () => {
    expect(classifyFailure({ requiredByEnvelope: true })).toBe('B0');
    expect(classifyFailure({ requiredByEnvelope: true, dependencyOwner: true })).toBe('B1');
    expect(classifyFailure({ requiredByEnvelope: true, admittedFallback: true })).toBe('B2');
    expect(classifyFailure({ requiredByEnvelope: false })).toBe('B3');
  });

  it('reconciles a successful smoke as review until the controller proves it', () => {
    const current = snapshot();
    const selection = selectOpenSpecTask(current, { taskKey: 'action:2' });
    expect(reconcileOpenSpecSelection(selection, current, true)).toBe('REVIEW_REQUIRED');
    const proven = { ...current, allTasks: current.allTasks.map((task) => task.taskKey === 'action:2' ? { ...task, controller: { state: 'PROVEN' } } : task) };
    expect(reconcileOpenSpecSelection(selection, proven, true)).toBe('PROVEN_CURRENT');
  });

  it('reports the current envelope blocker for a worker request without inventing task authority', () => {
    const current = snapshot();
    const blocked = {
      ...current,
      completionEnvelopes: [{
        ...current.completionEnvelopes[0],
        requiredGates: [{ gateId: 'LINEAGE', status: 'WAITING_ON_DEPENDENCY' }],
        allowedChanges: ['safe-contract', 'parent-atlas-nlp-sidecar-feature-compiler'],
      }],
    };
    const request = buildErrorAgentRepairRequestV1({
      taskKey: 'fixture:worker',
      change: 'parent-atlas-agentic-completion',
      completionEnvelopeRevision: 'controller-v1',
      controllerReportChecksum: blocked.checksum,
      blockerKey: null,
      requiredReceipts: [],
      smokeProfile: 'controller-report',
    }, { requestId: 'repair:fixture:worker' });
    expect(reconcileRepairRequestAgainstCurrentController(request, blocked, true)).toBe('WAITING_ON_DEPENDENCY');
  });
});
