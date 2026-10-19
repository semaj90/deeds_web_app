import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  parseVitestJsonReport,
  normalizeSourceRef,
  normalizeTestStatus,
  computeExecutionReceiptId,
  verifyAndParseVitestExecution,
  type VitestJsonReport,
  type VitestExecutionEvent,
} from './test-receipt-ingest-v1.js';

describe('test-receipt-ingest-v1 (RECEIPT-OWNER-01 & Verification Boundary)', () => {
  const samplePassReport: VitestJsonReport = {
    numTotalTestSuites: 1,
    numPassedTestSuites: 1,
    numTotalTests: 2,
    numPassedTests: 2,
    numFailedTests: 0,
    testResults: [
      {
        name: 'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\server\\agent\\patch-tournament.spec.ts',
        status: 'passed',
        assertionResults: [
          {
            ancestorTitles: ['patch-tournament'],
            title: 'allows verified checks',
            status: 'passed',
            duration: 10,
            failureMessages: [],
          },
          {
            ancestorTitles: ['patch-tournament'],
            title: 'rejects unbacked checks',
            status: 'passed',
            duration: 5,
            failureMessages: [],
          },
        ],
      },
    ],
  };

  const sampleFailReport: VitestJsonReport = {
    numTotalTestSuites: 1,
    numPassedTestSuites: 0,
    numTotalTests: 2,
    numPassedTests: 1,
    numFailedTests: 1,
    testResults: [
      {
        name: 'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\server\\agent\\patch-tournament.spec.ts',
        status: 'failed',
        assertionResults: [
          {
            ancestorTitles: ['patch-tournament'],
            title: 'allows verified checks',
            status: 'passed',
            duration: 10,
            failureMessages: [],
          },
          {
            ancestorTitles: ['patch-tournament'],
            title: 'rejects unbacked checks',
            status: 'failed',
            duration: 6,
            failureMessages: ['AssertionError: expected false to be true'],
          },
        ],
      },
    ],
  };

  const passStdout = JSON.stringify(samplePassReport);
  const passStdoutHash = createHash('sha256').update(passStdout, 'utf8').digest('hex');

  const failStdout = JSON.stringify(sampleFailReport);
  const failStdoutHash = createHash('sha256').update(failStdout, 'utf8').digest('hex');

  it('normalizes various source ref formats to workspace-relative path', () => {
    expect(normalizeSourceRef('C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\test.ts')).toBe('src/test.ts');
    expect(normalizeSourceRef('sveltekit-frontend/src/lib/server/agent/patch-tournament.spec.ts')).toBe('src/lib/server/agent/patch-tournament.spec.ts');
    expect(normalizeSourceRef('/src/lib/foo.spec.ts')).toBe('src/lib/foo.spec.ts');
  });

  it('normalizes status variants accurately', () => {
    expect(normalizeTestStatus('passed')).toBe('passed');
    expect(normalizeTestStatus('PASS')).toBe('passed');
    expect(normalizeTestStatus('failed')).toBe('failed');
    expect(normalizeTestStatus('skipped')).toBe('skipped');
    expect(normalizeTestStatus('pending')).toBe('skipped');
    expect(normalizeTestStatus('todo')).toBe('skipped');
    expect(normalizeTestStatus('something_else')).toBe('error');
  });

  it('produces deterministic executionReceiptId', () => {
    const id1 = computeExecutionReceiptId('rev-123', 'test::suite1', 'sha256:abc');
    const id2 = computeExecutionReceiptId('rev-123', 'test::suite1', 'sha256:abc');
    const id3 = computeExecutionReceiptId('rev-456', 'test::suite1', 'sha256:abc');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toHaveLength(32);
  });

  it('case 1: verified pass (exit code 0, matching hash, 0 failures)', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-pass-101',
      command: 'npx vitest run src/lib/server/agent/patch-tournament.spec.ts --reporter=json',
      exitCode: 0,
      timedOut: false,
      rawStdout: passStdout,
      stdoutHash: passStdoutHash,
      workspaceRevision: 'ws-rev-canonical-101',
      sourceRevision: 'src-rev-404',
      producerRevision: 'vitest@3.2.7',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event, 'ws-rev-canonical-101');
    expect(outcome.qualified).toBe(true);
    expect(outcome.verificationStatus).toBe('VERIFIED_PASS');
    expect(outcome.isTrainable).toBe(true);
    expect(outcome.totalTests).toBe(2);
    expect(outcome.passedTests).toBe(2);
    expect(outcome.failedTests).toBe(0);
    expect(outcome.receipts).toHaveLength(2);
    expect(outcome.receipts[0].status).toBe('passed');
  });

  it('case 2: verified fail (exit code 1, matching hash, authentic failure recorded)', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-fail-102',
      command: 'npx vitest run src/lib/server/agent/patch-tournament.spec.ts --reporter=json',
      exitCode: 1,
      timedOut: false,
      rawStdout: failStdout,
      stdoutHash: failStdoutHash,
      workspaceRevision: 'ws-rev-canonical-101',
      producerRevision: 'vitest@3.2.7',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event, 'ws-rev-canonical-101');
    expect(outcome.qualified).toBe(true);
    expect(outcome.verificationStatus).toBe('VERIFIED_FAIL');
    expect(outcome.isTrainable).toBe(true); // Authentic failure is a qualified training negative
    expect(outcome.failedTests).toBe(1);
    expect(outcome.receipts[1].status).toBe('failed');
    expect(outcome.receipts[1].failureMessages).toEqual(['AssertionError: expected false to be true']);
  });

  it('case 3: malformed receipt (invalid JSON stdout)', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-malformed-103',
      command: 'npx vitest run test.spec.ts --reporter=json',
      exitCode: 1,
      timedOut: false,
      rawStdout: '{"corrupted": true, broken',
      workspaceRevision: 'ws-rev-canonical-101',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event);
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('UNKNOWN');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('MALFORMED_JSON_REPORT');
  });

  it('case 4: missing tool event or command', () => {
    const outcomeMissingEvent = verifyAndParseVitestExecution({
      toolEventId: '',
      command: 'npx vitest run',
      exitCode: 0,
      rawStdout: passStdout,
      workspaceRevision: 'ws-1',
    });
    expect(outcomeMissingEvent.qualified).toBe(false);
    expect(outcomeMissingEvent.rejectionReason).toBe('MISSING_TOOL_EVENT');
    expect(outcomeMissingEvent.isTrainable).toBe(false);

    const outcomeMissingCmd = verifyAndParseVitestExecution({
      toolEventId: 'event-1',
      command: '   ',
      exitCode: 0,
      rawStdout: passStdout,
      workspaceRevision: 'ws-1',
    });
    expect(outcomeMissingCmd.qualified).toBe(false);
    expect(outcomeMissingCmd.rejectionReason).toBe('MISSING_COMMAND');
    expect(outcomeMissingCmd.isTrainable).toBe(false);
  });

  it('case 5: digest mismatch (claimed stdoutHash differs from sha256(rawStdout))', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-tampered-105',
      command: 'npx vitest run test.spec.ts --reporter=json',
      exitCode: 0,
      timedOut: false,
      rawStdout: passStdout,
      stdoutHash: '0000000000000000000000000000000000000000000000000000000000000000', // Forged hash
      workspaceRevision: 'ws-rev-canonical-101',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event);
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('FABRICATED');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('DIGEST_MISMATCH');
  });

  it('case 6: stale workspace revision mismatch', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-stale-106',
      command: 'npx vitest run test.spec.ts --reporter=json',
      exitCode: 0,
      timedOut: false,
      rawStdout: passStdout,
      workspaceRevision: 'ws-historical-old-rev',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event, 'ws-current-active-rev');
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('UNKNOWN');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('STALE_WORKSPACE_REVISION');
  });

  it('case 7: fabricated / simulated outcome is strictly excluded from training', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-sim-107',
      command: 'simulate vitest',
      exitCode: 0,
      timedOut: false,
      rawStdout: passStdout,
      stdoutHash: passStdoutHash,
      workspaceRevision: 'ws-rev-canonical-101',
      isSimulated: true, // Simulated!
    };

    const outcome = verifyAndParseVitestExecution(event, 'ws-rev-canonical-101');
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('FABRICATED');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('RECEIPT_EXPLICITLY_SIMULATED');
  });

  it('case 8: nonzero exit code claiming 0 failures is rejected as contradiction', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-contradict-108',
      command: 'npx vitest run test.spec.ts --reporter=json',
      exitCode: 2, // Nonzero exit code
      timedOut: false,
      rawStdout: passStdout, // But claims all passed!
      stdoutHash: passStdoutHash,
      workspaceRevision: 'ws-rev-canonical-101',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event, 'ws-rev-canonical-101');
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('FABRICATED');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('NONZERO_EXIT_CODE_CONTRADICTION');
  });

  it('case 9: missing execution event leaves report PARSED_UNVERIFIED', () => {
    const outcome = verifyAndParseVitestExecution(null);
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('PARSED_UNVERIFIED');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('MISSING_EXECUTION_EVENT');
  });

  it('case 10: command mismatch rejects execution association', () => {
    const event: VitestExecutionEvent = {
      toolEventId: 'event-mismatch-110',
      command: 'npx vitest run other.spec.ts --reporter=json', // Running different file!
      exitCode: 0,
      timedOut: false,
      rawStdout: passStdout,
      stdoutHash: passStdoutHash,
      workspaceRevision: 'ws-rev-canonical-101',
      isSimulated: false,
    };

    const outcome = verifyAndParseVitestExecution(event, {
      expectedWorkspaceRevision: 'ws-rev-canonical-101',
      expectedCommand: 'npx vitest run patch-tournament.spec.ts --reporter=json',
    });
    expect(outcome.qualified).toBe(false);
    expect(outcome.verificationStatus).toBe('PARSED_UNVERIFIED');
    expect(outcome.isTrainable).toBe(false);
    expect(outcome.rejectionReason).toBe('COMMAND_MISMATCH');
  });
});
