import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AssertionResolutionV1 } from './assertion-registry.js';
import {
  deriveTestCaseKey,
  deriveTestCaseNominationId,
  testCaseNominationSchema,
  type TestCaseNominationV1,
  type TestCaseResolutionV1,
} from './test-case-registry.js';
import { testEvidencePayloadSchema, type TestEvidencePayloadV1 } from './evidence-entity-extractors.js';

const id = z.string().min(1);
const revision = z.string().min(1);

const vitestAssertionResultSchema = z.object({
  ancestorTitles: z.array(z.string()).default([]),
  fullName: z.string().min(1),
  status: z.enum(['passed', 'failed', 'pending', 'todo', 'skipped', 'disabled']).or(z.string().min(1)),
  title: z.string().min(1),
  duration: z.number().nonnegative().nullable().optional(),
  failureMessages: z.array(z.string()).default([]),
  location: z.object({ line: z.number().int().positive(), column: z.number().int().positive() }).nullable().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const vitestTestResultSchema = z.object({
  assertionResults: z.array(vitestAssertionResultSchema).default([]),
  startTime: z.number().int().nonnegative().optional(),
  endTime: z.number().int().nonnegative().optional(),
  status: z.string().min(1).optional(),
  message: z.string().optional(),
  name: z.string().min(1),
}).passthrough();

export const vitestJsonReportSchema = z.object({
  numTotalTestSuites: z.number().int().nonnegative().optional(),
  numPassedTestSuites: z.number().int().nonnegative().optional(),
  numFailedTestSuites: z.number().int().nonnegative().optional(),
  numPendingTestSuites: z.number().int().nonnegative().optional(),
  numTotalTests: z.number().int().nonnegative().optional(),
  numPassedTests: z.number().int().nonnegative().optional(),
  numFailedTests: z.number().int().nonnegative().optional(),
  numPendingTests: z.number().int().nonnegative().optional(),
  numTodoTests: z.number().int().nonnegative().optional(),
  startTime: z.number().int().nonnegative().optional(),
  success: z.boolean().optional(),
  testResults: z.array(vitestTestResultSchema),
}).passthrough();

export const testExecutionObservationSchema = z.object({
  schema: z.literal('atlas.test-execution-observation.v1').default('atlas.test-execution-observation.v1'),
  execution_receipt_id: id,
  test_key: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  run_revision: revision,
  framework: z.literal('vitest'),
  status: z.enum(['passed', 'failed', 'skipped', 'error']),
  duration_ms: z.number().nonnegative().nullable().optional(),
  failure_messages: z.array(z.string()).default([]),
  observed_at_ms: z.number().int().nonnegative().nullable().optional(),
  report_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
  canonical_test_identity_created: z.literal(false).default(false),
  canonical_runtime_receipt_identity_created: z.literal(true).default(true),
}).strict();

export const vitestCompilationReceiptSchema = z.object({
  schema: z.literal('atlas.vitest-compilation-receipt.v1').default('atlas.vitest-compilation-receipt.v1'),
  source_revision: revision,
  run_revision: revision,
  report_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  nomination_count: z.number().int().nonnegative(),
  execution_count: z.number().int().nonnegative(),
  passed_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  skipped_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  producer_revision: revision,
  canonical_test_identity_created: z.literal(false).default(false),
}).strict();

export type TestExecutionObservationV1 = z.infer<typeof testExecutionObservationSchema>;
export type VitestCompilationReceiptV1 = z.infer<typeof vitestCompilationReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function hash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizePath(value: string, repoRoot?: string): string {
  let normalized = value.replaceAll('\\', '/').normalize('NFC');
  if (repoRoot) {
    const root = repoRoot.replaceAll('\\', '/').replace(/\/+$/, '').normalize('NFC');
    if (normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) normalized = normalized.slice(root.length + 1);
  }
  return normalized.replace(/^\.\//, '');
}

function normalizeStatus(value: string): TestExecutionObservationV1['status'] {
  switch (value.toLowerCase()) {
    case 'passed': return 'passed';
    case 'failed': return 'failed';
    case 'pending':
    case 'todo':
    case 'skipped':
    case 'disabled': return 'skipped';
    default: return 'error';
  }
}

export function compileVitestJsonReport(input: { report: unknown; source_revision: string; run_revision: string; producer_revision: string; repo_root?: string }): {
  nominations: TestCaseNominationV1[];
  executions: TestExecutionObservationV1[];
  receipt: VitestCompilationReceiptV1;
} {
  const report = vitestJsonReportSchema.parse(input.report);
  const reportChecksum = hash(report);
  const nominations: TestCaseNominationV1[] = [];
  const executions: TestExecutionObservationV1[] = [];
  const seen = new Set<string>();

  for (const fileResult of report.testResults) {
    const sourceRef = normalizePath(fileResult.name, input.repo_root);
    for (const assertion of fileResult.assertionResults) {
      const suitePath = assertion.ancestorTitles.map((value) => value.trim()).filter(Boolean);
      const testKey = deriveTestCaseKey({ framework: 'vitest', source_ref: sourceRef, suite_path: suitePath, title: assertion.title });
      if (seen.has(testKey)) throw new Error(`VITEST_TEST_KEY_COLLISION:${sourceRef}:${assertion.fullName}`);
      seen.add(testKey);

      const definitionHash = hash({ source_ref: sourceRef, suite_path: suitePath, title: assertion.title, full_name: assertion.fullName, location: assertion.location ?? null });
      nominations.push(testCaseNominationSchema.parse({
        nomination_id: deriveTestCaseNominationId({ test_key: testKey, source_revision: input.source_revision, definition_hash: definitionHash }),
        test_key: testKey,
        identity_status: 'nominated',
        framework: 'vitest',
        source_ref: sourceRef,
        source_revision: input.source_revision,
        suite_path: suitePath,
        title: assertion.title,
        full_name: assertion.fullName.trim(),
        line: assertion.location?.line ?? null,
        column: assertion.location?.column ?? null,
        definition_hash: definitionHash,
        extractor_revision: input.producer_revision,
        canonical_authority: false,
      }));

      const status = normalizeStatus(String(assertion.status));
      executions.push(testExecutionObservationSchema.parse({
        execution_receipt_id: `test-receipt:${hash([input.run_revision, testKey, status, assertion.duration ?? null, assertion.failureMessages, reportChecksum]).slice(0, 40)}`,
        test_key: testKey,
        source_ref: sourceRef,
        source_revision: input.source_revision,
        run_revision: input.run_revision,
        framework: 'vitest',
        status,
        duration_ms: assertion.duration ?? null,
        failure_messages: assertion.failureMessages,
        observed_at_ms: fileResult.endTime ?? fileResult.startTime ?? report.startTime ?? null,
        report_checksum: reportChecksum,
        producer_revision: input.producer_revision,
        canonical_test_identity_created: false,
        canonical_runtime_receipt_identity_created: true,
      }));
    }
  }

  const counts = { passed: 0, failed: 0, skipped: 0, error: 0 };
  for (const execution of executions) counts[execution.status] += 1;
  return {
    nominations,
    executions,
    receipt: vitestCompilationReceiptSchema.parse({
      source_revision: input.source_revision,
      run_revision: input.run_revision,
      report_checksum: reportChecksum,
      nomination_count: nominations.length,
      execution_count: executions.length,
      passed_count: counts.passed,
      failed_count: counts.failed,
      skipped_count: counts.skipped,
      error_count: counts.error,
      producer_revision: input.producer_revision,
      canonical_test_identity_created: false,
    }),
  };
}

/**
 * Join one runner observation to an already-canonical test registry resolution
 * and, when available, independently canonicalized static assertion identities.
 */
export function promoteVitestExecutionToTestEvidence(input: {
  nomination: TestCaseNominationV1;
  resolution: TestCaseResolutionV1;
  execution: TestExecutionObservationV1;
  assertion_resolutions?: AssertionResolutionV1[];
}): TestEvidencePayloadV1 {
  if (input.resolution.status !== 'canonical' || !input.resolution.stable_test_id) throw new Error(`TEST_EVIDENCE_REQUIRES_CANONICAL_TEST:${input.nomination.nomination_id}`);
  if (input.nomination.nomination_id !== input.resolution.nomination_id) throw new Error('TEST_EVIDENCE_RESOLUTION_NOMINATION_MISMATCH');
  if (input.nomination.test_key !== input.execution.test_key || input.nomination.test_key !== input.resolution.test_key) throw new Error('TEST_EVIDENCE_TEST_KEY_MISMATCH');

  const assertions = (input.assertion_resolutions ?? []).map((assertion) => {
    if (assertion.status !== 'canonical' || !assertion.stable_assertion_id) throw new Error(`TEST_EVIDENCE_ASSERTION_NOT_CANONICAL:${assertion.nomination_id}`);
    return { assertion_id: assertion.stable_assertion_id, identity_status: 'canonical' as const };
  });

  return testEvidencePayloadSchema.parse({
    schema: 'atlas.test-evidence.v1',
    test_revision: input.nomination.source_revision,
    test_id: input.resolution.stable_test_id,
    identity_status: 'canonical',
    assertions,
    runtime_receipt: { receipt_id: input.execution.execution_receipt_id, identity_status: 'canonical', status: input.execution.status },
  });
}

export function describeVitestTestEvidenceCompiler(): string {
  return [
    'Vitest JSON reporter output is the execution-status authority for Vitest tests.',
    'Reporter assertionResults rows are test-case results, not individual expect/assert calls.',
    'Static assertions are independently owned by the assertion registry and may be attached only after canonical assertion resolution.',
    'Line and column are version provenance and do not participate in the cross-revision test_key.',
    'Execution receipt IDs remain separate from static test and assertion identity.',
  ].join(' ');
}
