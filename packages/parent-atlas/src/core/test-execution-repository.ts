import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { TestCaseResolutionV1 } from './test-case-registry.js';
import { testExecutionObservationSchema, type TestExecutionObservationV1 } from './vitest-test-evidence-compiler.js';

const id = z.string().min(1);
const revision = z.string().min(1);

export const testExecutionReadbackReceiptSchema = z.object({
  schema: z.literal('atlas.test-execution-readback-receipt.v1').default('atlas.test-execution-readback-receipt.v1'),
  execution_receipt_id: id,
  stable_test_id: id.nullable(),
  run_revision: revision,
  status: z.enum(['passed', 'failed', 'skipped', 'error']),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
}).strict();

export type TestExecutionReadbackReceiptV1 = z.infer<typeof testExecutionReadbackReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function canonicalStableTestId(
  observation: TestExecutionObservationV1,
  resolution?: TestCaseResolutionV1,
): string | null {
  if (!resolution || resolution.status !== 'canonical' || !resolution.stable_test_id) return null;
  if (resolution.test_key !== observation.test_key) {
    throw new Error(`TEST_EXECUTION_RESOLUTION_KEY_MISMATCH:${observation.execution_receipt_id}`);
  }
  return resolution.stable_test_id;
}

/**
 * Stores runner-owned execution observations immutably. Unresolved test
 * nominations are still valid execution provenance, but stable_test_id remains
 * null until the test registry resolves the nomination.
 */
export function createTestExecutionRepository(pool: Pool) {
  return {
    async persist(input: {
      observation: TestExecutionObservationV1;
      resolution?: TestCaseResolutionV1;
      producer_revision: string;
    }): Promise<TestExecutionReadbackReceiptV1> {
      const observation = testExecutionObservationSchema.parse(input.observation);
      const stableTestId = canonicalStableTestId(observation, input.resolution);
      await pool.query(`
        INSERT INTO atlas_test_execution_receipts (
          execution_receipt_id, stable_test_id, test_key, run_revision,
          source_ref, source_revision, framework, status, duration_ms,
          failure_messages, report_checksum, observed_at_ms, producer_revision
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
        ON CONFLICT (execution_receipt_id) DO NOTHING
      `, [
        observation.execution_receipt_id,
        stableTestId,
        observation.test_key,
        observation.run_revision,
        observation.source_ref,
        observation.source_revision,
        observation.framework,
        observation.status,
        observation.duration_ms ?? null,
        JSON.stringify(observation.failure_messages),
        observation.report_checksum,
        observation.observed_at_ms ?? null,
        input.producer_revision,
      ]);
      return this.readback({ execution_receipt_id: observation.execution_receipt_id, producer_revision: input.producer_revision, expected: observation, expected_stable_test_id: stableTestId });
    },

    async readback(input: {
      execution_receipt_id: string;
      producer_revision: string;
      expected?: TestExecutionObservationV1;
      expected_stable_test_id?: string | null;
    }): Promise<TestExecutionReadbackReceiptV1> {
      const result = await pool.query<{
        execution_receipt_id: string;
        stable_test_id: string | null;
        test_key: string;
        run_revision: string;
        source_ref: string;
        source_revision: string;
        framework: string;
        status: 'passed' | 'failed' | 'skipped' | 'error';
        duration_ms: number | null;
        failure_messages: string[];
        report_checksum: string;
        observed_at_ms: string | number | null;
        producer_revision: string;
      }>(`
        SELECT execution_receipt_id, stable_test_id, test_key, run_revision,
               source_ref, source_revision, framework, status, duration_ms,
               failure_messages, report_checksum, observed_at_ms, producer_revision
        FROM atlas_test_execution_receipts
        WHERE execution_receipt_id = $1
      `, [input.execution_receipt_id]);
      if (result.rowCount !== 1) throw new Error(`TEST_EXECUTION_READBACK_MISSING:${input.execution_receipt_id}`);
      const row = result.rows[0]!;
      if (input.expected) {
        const expected = input.expected;
        const mismatch = row.test_key !== expected.test_key
          || row.run_revision !== expected.run_revision
          || row.source_ref !== expected.source_ref
          || row.source_revision !== expected.source_revision
          || row.framework !== expected.framework
          || row.status !== expected.status
          || row.report_checksum !== expected.report_checksum
          || row.stable_test_id !== (input.expected_stable_test_id ?? null);
        if (mismatch) throw new Error(`TEST_EXECUTION_IMMUTABILITY_CONFLICT:${input.execution_receipt_id}`);
      }
      return testExecutionReadbackReceiptSchema.parse({
        execution_receipt_id: row.execution_receipt_id,
        stable_test_id: row.stable_test_id,
        run_revision: row.run_revision,
        status: row.status,
        checksum: checksum(row),
        producer_revision: input.producer_revision,
      });
    },
  };
}

export function describeTestExecutionRepository(): string {
  return [
    'Runner-owned execution receipts are append-only identities keyed by execution_receipt_id.',
    'Unresolved tests may store execution provenance with stable_test_id=NULL.',
    'Canonical test evidence is emitted only after a registry resolution joins the execution receipt to stable_test_id.',
    'A repeated receipt ID with conflicting content fails readback immutability verification.',
  ].join(' ');
}
