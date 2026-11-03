import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestExecutionRepository } from '../dist/core/test-execution-repository.js';

const observation = {
  execution_receipt_id: 'receipt:unresolved-fixture',
  test_key: 'test-key:observed',
  source_ref: 'src/example.spec.ts',
  source_revision: 'source-rev-1',
  run_revision: 'run-rev-1',
  framework: 'vitest',
  status: 'passed',
  failure_messages: [],
  report_checksum: 'a'.repeat(64),
  producer_revision: 'producer-rev-1',
};

test('canonical resolution with another test key fails before SQL', async () => {
  let queries = 0;
  const repository = createTestExecutionRepository({
    query: async () => { queries += 1; throw new Error('unexpected SQL'); },
  });

  await assert.rejects(
    repository.persist({
      observation,
      resolution: { status: 'canonical', stable_test_id: 'test:canonical', test_key: 'test-key:other' },
      producer_revision: 'producer-rev-1',
    }),
    /TEST_EXECUTION_RESOLUTION_KEY_MISMATCH/,
  );
  assert.equal(queries, 0);
});

test('unresolved execution receipt is persisted and read back with a null stable ID', async () => {
  const calls = [];
  const row = {
    execution_receipt_id: observation.execution_receipt_id,
    stable_test_id: null,
    test_key: observation.test_key,
    run_revision: observation.run_revision,
    source_ref: observation.source_ref,
    source_revision: observation.source_revision,
    framework: observation.framework,
    status: observation.status,
    duration_ms: null,
    failure_messages: [],
    report_checksum: observation.report_checksum,
    observed_at_ms: null,
    producer_revision: 'producer-rev-1',
  };
  const repository = createTestExecutionRepository({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO atlas_test_execution_receipts')) return { rows: [], rowCount: 1 };
      if (sql.includes('FROM atlas_test_execution_receipts WHERE execution_receipt_id=$1')) return { rows: [row], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const receipt = await repository.persist({
    observation,
    resolution: { status: 'unresolved', test_key: observation.test_key },
    producer_revision: 'producer-rev-1',
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].params[1], null);
  assert.equal(receipt.stable_test_id, null);
});
