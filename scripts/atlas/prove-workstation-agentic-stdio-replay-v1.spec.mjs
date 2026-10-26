import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCHEMA_REPLAY_RECEIPT_V1,
  ALLOWLISTED_TOOLS,
  runAgenticStdioReplay,
} from './prove-workstation-agentic-stdio-replay-v1.mjs';

test('ALLOWLISTED_TOOLS rejects path traversal', () => {
  assert.throws(
    () => ALLOWLISTED_TOOLS.read_file.validateParams({ path: '../secret.env' }),
    /SECURITY_VIOLATION/
  );
});

test('ALLOWLISTED_TOOLS validates read_file params', () => {
  assert.throws(
    () => ALLOWLISTED_TOOLS.read_file.validateParams({}),
    /INVALID_PARAMS/
  );
  const p = ALLOWLISTED_TOOLS.read_file.validateParams({ path: 'package.json' });
  assert.equal(p.path, 'package.json');
});

test('ALLOWLISTED_TOOLS validates find_source_refs params', () => {
  assert.throws(
    () => ALLOWLISTED_TOOLS.find_source_refs.validateParams({ query: '' }),
    /INVALID_PARAMS/
  );
  const p = ALLOWLISTED_TOOLS.find_source_refs.validateParams({ query: 'writer' });
  assert.equal(p.query, 'writer');
});

test('runAgenticStdioReplay executes synthetic case without mutations', async () => {
  const receipt = await runAgenticStdioReplay();
  assert.equal(receipt.schema, SCHEMA_REPLAY_RECEIPT_V1);
  assert.equal(receipt.gate, 'WORKSTATION-AGENTIC-STDIO-REPLAY-01');
  assert.equal(receipt.proposedRepairPlan.automaticRepairsAllowed, false);
  assert.equal(receipt.proposedRepairPlan.mutationAllowed, false);
  assert.equal(receipt.constraints.writesPerformed, false);
  assert.equal(receipt.constraints.automaticRepairsProhibited, true);
  assert.equal(receipt.toolReceipts.length, 2);
  assert.ok(receipt.receiptChecksum.startsWith('sha256:'));
});
