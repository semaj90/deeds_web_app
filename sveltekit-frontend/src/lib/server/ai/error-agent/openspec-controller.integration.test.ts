import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runWorkflowLoopLangGraph } from './workflow-loop-langgraph.js';
import {
  readOpenSpecControllerReport,
  reconcileOpenSpecSelection,
  selectOpenSpecTask,
  type OpenSpecControllerSnapshot,
  type OpenSpecTaskSelection,
} from './openspec-controller.js';
import { buildErrorAgentRepairRequestV1, verifyErrorAgentRepairRequestV1 } from './repair-request.js';

const repoRoot = path.resolve(process.cwd(), '..');

function digest(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fixture(): OpenSpecControllerSnapshot {
  return {
    policy: 'RECOMMENDATION_ONLY_NO_LEDGER_OR_RUNTIME_MUTATION',
    completionEnvelopes: [{
      goalId: 'fixture-goal',
      revision: 'fixture-envelope-v1',
      requiredGates: [{ gateId: 'FIXTURE_GATE', status: 'PROVEN_CURRENT', receipt: 'fixture-receipt' }],
      explicitlyNotRequired: [],
      allowedChanges: ['fixture-change'],
      allowedFallbacks: [],
      scopeBudget: { maxNewBlockersPerAttempt: 0, maxNewOwners: 0, architectureExpansionAllowed: false },
      checksum: 'sha256:b5b634ab4930fc56200906674818b219edce07f74bc4fcbbc9bf8b86b2890f9d',
    }],
    allTasks: [{
      taskKey: 'fixture:actionable',
      change: 'fixture-change',
      line: 1,
      text: 'run a bounded fixture smoke',
      priority: 1,
      controller: { state: 'ACTIONABLE', requiredReceipts: [] },
    }],
    checksum: 'sha256:fixture-controller',
    reportPath: 'fixture',
    writesPerformed: false,
  };
}

describe('governed error-agent OpenSpec integration', () => {
  it('reads the current controller and keeps authority-gated work fail-closed', () => {
    const current = readOpenSpecControllerReport();
    expect(current.completionEnvelopes[0]?.scopeBudget).toEqual({
      maxNewBlockersPerAttempt: 0,
      maxNewOwners: 0,
      architectureExpansionAllowed: false,
    });
    expect(() => selectOpenSpecTask(current)).toThrow('OPENSPEC_COMPLETION_ENVELOPE_BLOCKED');
  });

  it('runs classify → repair → injected smoke → receipt without mutating the task ledger', async () => {
    const tasksPath = path.join(repoRoot, 'openspec/changes/parent-atlas-prefill-routing-residency-convergence/tasks.md');
    const before = digest(tasksPath);
    const controller = fixture();
    const selection: OpenSpecTaskSelection = selectOpenSpecTask(controller);
    const repairRequest = buildErrorAgentRepairRequestV1(selection, { requestId: 'repair:fixture' });
    expect(selection.repairRequest?.mode).toBe('PLAN_ONLY');
    expect(selection.repairRequest?.promotionAuthorized).toBe(false);
    const result = await runWorkflowLoopLangGraph({
      query: 'prove the bounded fixture smoke',
      hmmErrorClass: 'schema_mismatch',
      userId: 'fixture-user',
      selection,
      planOnly: true,
    }, {
      repair: async () => ({ ok: true, summary: 'fixture repair plan', suggestedFixes: ['run smoke'], touchedFiles: [] }),
      smoke: async () => ({ passed: true, command: 'fixture-smoke', outputSummary: 'read-only pass' }),
      log: async () => undefined,
    });
    const after = digest(tasksPath);
    expect(result.smoke.passed).toBe(true);
    expect(result.gan.promotionAuthorized).toBe(false);
    expect(result.gan.created).toBe(true);
    expect(result.gan.wired).toBe(true);
    expect(result.gan.proven).toBe(true);
    expect(repairRequest.mode).toBe('PLAN_ONLY');
    expect(verifyErrorAgentRepairRequestV1(repairRequest)).toBe(true);
    expect(reconcileOpenSpecSelection(selection, controller, result.smoke.passed)).toBe('REVIEW_REQUIRED');
    expect(after).toBe(before);
  });
});
