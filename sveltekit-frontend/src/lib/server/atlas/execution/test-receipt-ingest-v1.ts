import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AtlasTestExecutionReceiptRow } from '../../db/schema/atlas-test-intelligence.js';

export const TEST_RECEIPT_INGEST_SCHEMA = 'atlas.test-receipt-ingest.v1' as const;

export const VitestAssertionResultSchema = z.object({
  ancestorTitles: z.array(z.string()).default([]),
  fullName: z.string().optional(),
  title: z.string().min(1),
  status: z.string(), // 'passed', 'failed', 'skipped', 'pending', 'todo', 'disabled'
  duration: z.number().nullable().optional(),
  failureMessages: z.array(z.string()).default([]),
});
export type VitestAssertionResult = z.infer<typeof VitestAssertionResultSchema>;

export const VitestFileResultSchema = z.object({
  name: z.string().min(1), // Absolute or relative file path
  status: z.string().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  assertionResults: z.array(VitestAssertionResultSchema).default([]),
});
export type VitestFileResult = z.infer<typeof VitestFileResultSchema>;

export const VitestJsonReportSchema = z.object({
  numTotalTestSuites: z.number().optional(),
  numPassedTestSuites: z.number().optional(),
  numFailedTestSuites: z.number().optional(),
  numTotalTests: z.number().optional(),
  numPassedTests: z.number().optional(),
  numFailedTests: z.number().optional(),
  testResults: z.array(VitestFileResultSchema),
  success: z.boolean().optional(),
  startTime: z.number().optional(),
});
export type VitestJsonReport = z.infer<typeof VitestJsonReportSchema>;

export const VitestExecutionEventSchema = z.object({
  toolEventId: z.string().min(1),
  command: z.string().min(1),
  exitCode: z.number().int(),
  timedOut: z.boolean().default(false),
  rawStdout: z.string(),
  stdoutHash: z.string().regex(/^(sha256:)?[a-f0-9]{64}$/i).optional(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().optional(),
  producerRevision: z.string().optional(),
  isSimulated: z.boolean().default(false),
});
export type VitestExecutionEvent = z.infer<typeof VitestExecutionEventSchema>;

export type ReceiptRejectionReason =
  | 'MISSING_EXECUTION_EVENT'
  | 'MISSING_TOOL_EVENT'
  | 'MISSING_COMMAND'
  | 'COMMAND_MISMATCH'
  | 'DIGEST_MISMATCH'
  | 'STALE_WORKSPACE_REVISION'
  | 'TIMED_OUT_PROCESS'
  | 'NONZERO_EXIT_CODE_CONTRADICTION'
  | 'MALFORMED_JSON_REPORT'
  | 'RECEIPT_EXPLICITLY_SIMULATED';

export interface ReceiptVerificationOutcome {
  qualified: boolean;
  verificationStatus: 'VERIFIED_PASS' | 'VERIFIED_FAIL' | 'PARSED_UNVERIFIED' | 'FABRICATED' | 'UNKNOWN';
  isTrainable: boolean;
  rejectionReason?: ReceiptRejectionReason;
  reportChecksum?: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  receipts: AtlasTestExecutionReceiptRow[];
}

export interface ParseVitestOptions {
  runRevision: string;
  sourceRevision?: string;
  producerRevision?: string;
  workspaceRoot?: string;
}

export interface IngestReceiptsResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  reportChecksum: string;
  receipts: AtlasTestExecutionReceiptRow[];
}

/**
 * Normalizes an absolute or complex path to a repository-relative source ref.
 */
export function normalizeSourceRef(filePath: string, workspaceRoot?: string): string {
  let normalized = filePath.replace(/\\/g, '/');

  if (workspaceRoot) {
    const rootNorm = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '');
    if (normalized.startsWith(rootNorm)) {
      normalized = normalized.slice(rootNorm.length);
    }
  }

  // Strip common workstation prefix variants
  normalized = normalized.replace(/^[a-zA-Z]:\/.*?\/deeds-web-app\//, '');
  normalized = normalized.replace(/^sveltekit-frontend\//, '');
  normalized = normalized.replace(/^\/+/, '');

  return normalized;
}

/**
 * Normalizes Vitest status values into PostgreSQL enum:
 * 'passed' | 'failed' | 'skipped' | 'error'
 */
export function normalizeTestStatus(rawStatus: string): 'passed' | 'failed' | 'skipped' | 'error' {
  const s = rawStatus.toLowerCase();
  if (s === 'passed' || s === 'pass') return 'passed';
  if (s === 'failed' || s === 'fail') return 'failed';
  if (s === 'skipped' || s === 'pending' || s === 'todo' || s === 'disabled') return 'skipped';
  return 'error';
}

/**
 * Deterministic receipt ID generation binding run revision, test key, and report checksum.
 */
export function computeExecutionReceiptId(
  runRevision: string,
  testKey: string,
  reportChecksum: string
): string {
  return createHash('sha256')
    .update(`${runRevision}:${testKey}:${reportChecksum}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/**
 * Parses a Vitest JSON report string or object into canonical Atlas test execution receipt rows.
 * Pure function: calculates cryptographic report checksum and guarantees non-empty provenance.
 */
export function parseVitestJsonReport(
  rawInput: string | VitestJsonReport,
  options: ParseVitestOptions
): IngestReceiptsResult {
  const rawString = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
  const reportChecksum = createHash('sha256').update(rawString, 'utf8').digest('hex');

  const parsed = typeof rawInput === 'string'
    ? JSON.parse(rawInput)
    : rawInput;

  const validated = VitestJsonReportSchema.parse(parsed);

  const producerRevision = options.producerRevision ?? 'vitest@3.2.7';
  const defaultSourceRevision = options.sourceRevision ?? reportChecksum.slice(0, 16);
  const observedAtMs = Date.now();

  const receipts: AtlasTestExecutionReceiptRow[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const fileResult of validated.testResults) {
    const sourceRef = normalizeSourceRef(fileResult.name, options.workspaceRoot);

    for (const test of fileResult.assertionResults) {
      const status = normalizeTestStatus(test.status);
      if (status === 'passed') passed++;
      else if (status === 'failed' || status === 'error') failed++;
      else if (status === 'skipped') skipped++;

      const fullName = test.fullName || [...test.ancestorTitles, test.title].join(' > ');
      const testKey = `${sourceRef}::${fullName}`;

      const executionReceiptId = computeExecutionReceiptId(
        options.runRevision,
        testKey,
        reportChecksum
      );

      const receipt: AtlasTestExecutionReceiptRow = {
        executionReceiptId,
        stableTestId: null, // Linked optionally to atlas_test_registry
        testKey,
        runRevision: options.runRevision,
        sourceRef,
        sourceRevision: defaultSourceRevision,
        framework: 'vitest',
        status,
        durationMs: test.duration ?? null,
        failureMessages: test.failureMessages ?? [],
        reportChecksum,
        observedAtMs,
        producerRevision,
        createdAt: new Date(),
      };

      receipts.push(receipt);
    }
  }

  return {
    total: receipts.length,
    passed,
    failed,
    skipped,
    reportChecksum,
    receipts,
  };
}

export interface VerifyVitestExecutionOptions {
  expectedWorkspaceRevision?: string;
  expectedCommand?: string;
}

/**
 * Pure verification boundary (RECEIPT-OWNER-01).
 * Validates actual vitest tool execution events against exit code, hash provenance,
 * workspace revision, and report structure.
 * Rejects fabricated, simulated, or corrupted execution results from model training.
 */
export function verifyAndParseVitestExecution(
  eventInput: unknown,
  optionsOrWorkspaceRevision?: string | VerifyVitestExecutionOptions
): ReceiptVerificationOutcome {
  const options: VerifyVitestExecutionOptions =
    typeof optionsOrWorkspaceRevision === 'string'
      ? { expectedWorkspaceRevision: optionsOrWorkspaceRevision }
      : (optionsOrWorkspaceRevision ?? {});

  if (!eventInput || typeof eventInput !== 'object') {
    return {
      qualified: false,
      verificationStatus: 'PARSED_UNVERIFIED',
      isTrainable: false,
      rejectionReason: 'MISSING_EXECUTION_EVENT',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  const eventResult = VitestExecutionEventSchema.safeParse(eventInput);
  if (!eventResult.success) {
    return {
      qualified: false,
      verificationStatus: 'PARSED_UNVERIFIED',
      isTrainable: false,
      rejectionReason: 'MISSING_TOOL_EVENT',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  const event = eventResult.data;

  // 1. Missing tool event or command
  if (!event.toolEventId.trim()) {
    return {
      qualified: false,
      verificationStatus: 'PARSED_UNVERIFIED',
      isTrainable: false,
      rejectionReason: 'MISSING_TOOL_EVENT',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  if (!event.command.trim()) {
    return {
      qualified: false,
      verificationStatus: 'PARSED_UNVERIFIED',
      isTrainable: false,
      rejectionReason: 'MISSING_COMMAND',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  // Check command mismatch if expected command provided
  if (options.expectedCommand && event.command.trim() !== options.expectedCommand.trim()) {
    return {
      qualified: false,
      verificationStatus: 'PARSED_UNVERIFIED',
      isTrainable: false,
      rejectionReason: 'COMMAND_MISMATCH',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  // 2. Simulated flag rejection
  if (event.isSimulated) {
    return {
      qualified: false,
      verificationStatus: 'FABRICATED',
      isTrainable: false,
      rejectionReason: 'RECEIPT_EXPLICITLY_SIMULATED',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  // 3. Stale workspace revision check
  if (options.expectedWorkspaceRevision && event.workspaceRevision !== options.expectedWorkspaceRevision) {
    return {
      qualified: false,
      verificationStatus: 'UNKNOWN',
      isTrainable: false,
      rejectionReason: 'STALE_WORKSPACE_REVISION',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  // 4. Digest mismatch check
  const actualHash = createHash('sha256').update(event.rawStdout, 'utf8').digest('hex');
  if (event.stdoutHash) {
    const cleanExpectedHash = event.stdoutHash.replace(/^sha256:/i, '').toLowerCase();
    if (actualHash.toLowerCase() !== cleanExpectedHash) {
      return {
        qualified: false,
        verificationStatus: 'FABRICATED',
        isTrainable: false,
        rejectionReason: 'DIGEST_MISMATCH',
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        receipts: [],
      };
    }
  }

  // 5. Timed out process check
  if (event.timedOut) {
    return {
      qualified: false,
      verificationStatus: 'VERIFIED_FAIL',
      isTrainable: false, // Timed out processes cannot serve as trainable trajectories
      rejectionReason: 'TIMED_OUT_PROCESS',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  // 6. JSON report parsing and validation
  let parsedReport: IngestReceiptsResult;
  try {
    parsedReport = parseVitestJsonReport(event.rawStdout, {
      runRevision: event.toolEventId,
      sourceRevision: event.sourceRevision ?? event.workspaceRevision,
      producerRevision: event.producerRevision ?? 'vitest@3.2.7',
    });
  } catch (_err) {
    return {
      qualified: false,
      verificationStatus: 'UNKNOWN',
      isTrainable: false,
      rejectionReason: 'MALFORMED_JSON_REPORT',
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      receipts: [],
    };
  }

  // 7. Exit code contradiction checks
  if (event.exitCode !== 0 && parsedReport.failed === 0) {
    // Nonzero exit code claiming 0 failures is a contradiction
    return {
      qualified: false,
      verificationStatus: 'FABRICATED',
      isTrainable: false,
      rejectionReason: 'NONZERO_EXIT_CODE_CONTRADICTION',
      reportChecksum: parsedReport.reportChecksum,
      totalTests: parsedReport.total,
      passedTests: parsedReport.passed,
      failedTests: parsedReport.failed,
      skippedTests: parsedReport.skipped,
      receipts: parsedReport.receipts,
    };
  }

  if (event.exitCode === 0 && parsedReport.failed > 0) {
    // Exit code 0 claiming failures
    return {
      qualified: false,
      verificationStatus: 'FABRICATED',
      isTrainable: false,
      rejectionReason: 'NONZERO_EXIT_CODE_CONTRADICTION',
      reportChecksum: parsedReport.reportChecksum,
      totalTests: parsedReport.total,
      passedTests: parsedReport.passed,
      failedTests: parsedReport.failed,
      skippedTests: parsedReport.skipped,
      receipts: parsedReport.receipts,
    };
  }

  // 8. Verified verdicts
  if (event.exitCode === 0 && parsedReport.failed === 0 && parsedReport.passed > 0) {
    return {
      qualified: true,
      verificationStatus: 'VERIFIED_PASS',
      isTrainable: true,
      reportChecksum: parsedReport.reportChecksum,
      totalTests: parsedReport.total,
      passedTests: parsedReport.passed,
      failedTests: 0,
      skippedTests: parsedReport.skipped,
      receipts: parsedReport.receipts,
    };
  }

  // Verified failure with authentic nonzero exit code and genuine recorded failures
  if (event.exitCode !== 0 && parsedReport.failed > 0) {
    return {
      qualified: true,
      verificationStatus: 'VERIFIED_FAIL',
      isTrainable: true, // Grounded negative example
      reportChecksum: parsedReport.reportChecksum,
      totalTests: parsedReport.total,
      passedTests: parsedReport.passed,
      failedTests: parsedReport.failed,
      skippedTests: parsedReport.skipped,
      receipts: parsedReport.receipts,
    };
  }

  return {
    qualified: false,
    verificationStatus: 'UNKNOWN',
    isTrainable: false,
    totalTests: parsedReport.total,
    passedTests: parsedReport.passed,
    failedTests: parsedReport.failed,
    skippedTests: parsedReport.skipped,
    receipts: parsedReport.receipts,
  };
}

/**
 * Persists test execution receipts to PostgreSQL using client or connection pool.
 */
export async function persistTestExecutionReceipts(
  pgClientOrPool: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> },
  receipts: AtlasTestExecutionReceiptRow[]
): Promise<{ insertedCount: number }> {
  if (receipts.length === 0) {
    return { insertedCount: 0 };
  }

  let insertedCount = 0;
  const insertSql = `
    INSERT INTO atlas_test_execution_receipts (
      execution_receipt_id,
      stable_test_id,
      test_key,
      run_revision,
      source_ref,
      source_revision,
      framework,
      status,
      duration_ms,
      failure_messages,
      report_checksum,
      observed_at_ms,
      producer_revision,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14
    )
    ON CONFLICT (execution_receipt_id) DO NOTHING;
  `;

  for (const r of receipts) {
    const res = await pgClientOrPool.query(insertSql, [
      r.executionReceiptId,
      r.stableTestId,
      r.testKey,
      r.runRevision,
      r.sourceRef,
      r.sourceRevision,
      r.framework,
      r.status,
      r.durationMs,
      JSON.stringify(r.failureMessages),
      r.reportChecksum,
      r.observedAtMs,
      r.producerRevision,
      r.createdAt,
    ]);
    if (res.rowCount && res.rowCount > 0) {
      insertedCount += res.rowCount;
    }
  }

  return { insertedCount };
}
