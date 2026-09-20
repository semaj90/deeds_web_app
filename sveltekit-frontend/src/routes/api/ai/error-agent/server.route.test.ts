// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runWorkflowLoopLangGraph: vi.fn(),
  controller: {
    allTasks: [{ taskKey: 'action:2', change: 'safe-contract', line: 2, text: 'add deterministic receipt test', priority: 20, controller: { state: 'ACTIONABLE' } }],
    completionEnvelopes: [{
      goalId: 'fixture-goal',
      revision: 'controller-v1',
      requiredGates: [{ gateId: 'FIXTURE_GATE', status: 'PROVEN_CURRENT' }],
      explicitlyNotRequired: [],
      allowedFallbacks: [],
      scopeBudget: { maxNewBlockersPerAttempt: 0, maxNewOwners: 0, architectureExpansionAllowed: false },
    }],
    checksum: 'sha256:controller',
    reportPath: 'fixture',
    writesPerformed: false,
  },
  selection: {
    taskKey: 'action:2',
    change: 'safe-contract',
    line: 2,
    text: 'add deterministic receipt test',
    priority: 20,
    controllerState: 'ACTIONABLE',
    blockerKey: null,
    requiredReceipts: [],
    smokeProfile: 'controller-report',
    completionEnvelopeRevision: 'controller-v1',
    controllerReportChecksum: 'sha256:controller',
    selectionReason: 'fixture',
    evidenceHash: 'sha256:evidence',
  },
}));

vi.mock('$lib/server/ai/error-agent/workflow-loop-langgraph.js', () => ({
  runWorkflowLoopLangGraph: (...args: unknown[]) => mocks.runWorkflowLoopLangGraph(...args),
}));

vi.mock('$lib/server/ai/error-agent/openspec-controller.js', () => ({
  readOpenSpecControllerReport: () => mocks.controller,
  selectOpenSpecTask: () => mocks.selection,
  failureFingerprint: () => 'sha256:fingerprint',
  retrySuppressed: () => false,
  runAllowlistedSmokeProfile: async () => ({ profile: 'controller-report', passed: true, command: 'fixture-smoke', outputSummary: 'ok', writesPerformed: false }),
  reconcileOpenSpecSelection: () => 'REVIEW_REQUIRED',
}));

describe('/api/ai/error-agent', () => {
  beforeEach(() => {
    mocks.runWorkflowLoopLangGraph.mockReset();
    mocks.runWorkflowLoopLangGraph.mockResolvedValue({
      runId: 'run-1',
      status: 'repaired',
      classification: {
        hmmErrorClass: 'schema_mismatch',
        riskScore: 0.9,
        severity: 'high',
        lane: 'schema',
        rationale: 'classified',
      },
      taskInput: {
        taskId: 'case-99',
        query: 'repair schema mismatch',
        hmmErrorClass: 'schema_mismatch',
        caseId: 'case-99',
        userId: 'user-1',
        targetPath: 'src/file.ts',
        workspaceRevision: 'workspace-1',
        modelRevision: 'model-1',
        sourceRefs: ['src/file.ts'],
      },
      scaffold: {
        scaffoldId: 'scaffold:run-1',
        taskId: 'case-99',
        policyVersion: 'atlas.error-agent.scaffold.v1',
        selectedPackets: ['file:src/file.ts'],
        toolPlan: [{ tool: 'repair', purpose: 'repair' }],
        contextBudget: 1000,
        cacheHints: ['lane:schema'],
        createdAt: '2026-08-13T00:00:00.000Z',
      },
      executionReceipt: {
        receiptId: 'receipt:scaffold:run-1',
        scaffoldId: 'scaffold:run-1',
        taskId: 'case-99',
        startedAt: '2026-08-13T00:00:00.000Z',
        finishedAt: '2026-08-13T00:00:01.000Z',
        status: 'SUCCESS',
        outputs: { packetKeys: ['src/file.ts'], evidenceRefs: ['file:src/file.ts'], logs: ['ok'] },
        verifier: { schemaValid: true, provenanceValid: true, identityStable: true, replayStable: true },
      },
      deterministicVerdict: {
        receiptId: 'receipt:scaffold:run-1',
        reward: 0.85,
        reasons: ['lane:schema'],
        blockedBy: [],
      },
      policyUpdate: {
        policyVersion: 'atlas.error-agent.scaffold.v1',
        scaffoldId: 'scaffold:run-1',
        receiptId: 'receipt:scaffold:run-1',
        advantage: 0.35,
        stalenessWeight: 1,
        accepted: true,
      },
      repair: { ok: true, summary: 'fixed', suggestedFixes: ['patch'], touchedFiles: ['src/file.ts'] },
      smoke: { passed: true, command: 'npm test', outputSummary: 'ok' },
      logged: true,
    });
  });

  it('returns stable unauthorized JSON without a session or explicit dev bypass', async () => {
    const { POST } = await import('./+server.js');
    const response = await POST({ request: new Request('http://localhost/api/ai/error-agent', { method: 'POST', body: '{}' }), locals: {} } as any);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, result: null, selection: null, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a body userId that differs from the authenticated session', async () => {
    const { POST } = await import('./+server.js');
    const response = await POST({
      request: new Request('http://localhost/api/ai/error-agent', { method: 'POST', body: JSON.stringify({ query: 'x', hmmErrorClass: 'unknown', userId: 'other' }) }),
      locals: { user: { id: 'session-user' } },
    } as any);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: 'USER_ID_MISMATCH' } });
  });

  it('passes workstation provenance fields through to the workflow loop', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/ai/error-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'repair schema mismatch',
        hmmErrorClass: 'schema_mismatch',
        caseId: 'case-99',
        targetPath: 'src/file.ts',
        workspaceRevision: 'workspace-1',
        modelRevision: 'model-1',
        sourceRefs: ['src/file.ts'],
      }),
    });

    const response = await POST({ request, locals: { user: { id: '99' } } } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.scaffold.scaffoldId).toBe('scaffold:run-1');
    expect(body.result.taskInput.workspaceRevision).toBe('workspace-1');
    expect(body.result.executionReceipt.status).toBe('SUCCESS');
    expect(mocks.runWorkflowLoopLangGraph).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkflowLoopLangGraph.mock.calls[0][0]).toMatchObject({
      query: 'repair schema mismatch',
      hmmErrorClass: 'schema_mismatch',
      caseId: 'case-99',
      targetPath: 'src/file.ts',
      workspaceRevision: 'workspace-1',
      modelRevision: 'model-1',
      sourceRefs: ['src/file.ts'],
      userId: '99',
    });
  });
});
