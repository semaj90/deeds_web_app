import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySelectedGraphifyAuthorityReadbackV1 } from './selected-graphify-authority-readback-v1.mjs';

const input = {
  executionId: '01a1763a-4355-71d7-9b81-2c7a1814a41f',
  workspaceId: '625743d2-092b-4fa8-abe0-9dc094920c80',
  workspaceRevision: 'sha256:current',
};
const row = (overrides = {}) => ({
  execution_id: input.executionId,
  workspace_id: input.workspaceId,
  workspace_revision: input.workspaceRevision,
  authority_state: 'SELECTED',
  selected_at: new Date('2026-10-30T02:44:08.461Z'),
  selected_by: 'operator',
  selection_receipt: 'operator-receipt:owner-decision',
  canonical_authority: false,
  ...overrides,
});

test('requires the exact selected authority row, revision, operator, and receipt', () => {
  assert.equal(verifySelectedGraphifyAuthorityReadbackV1({ ...input, rows: [row()] }), true);
});

test('does not treat the legacy execution boolean as current selection', () => {
  assert.equal(verifySelectedGraphifyAuthorityReadbackV1({
    ...input,
    executionId: '74d50c86-8194-45ea-8c3d-61aab737ef83',
    rows: [row({
      execution_id: '74d50c86-8194-45ea-8c3d-61aab737ef83',
      authority_state: 'LEGACY_IMPORTED',
      canonical_authority: true,
    })],
  }), false);
});

test('rejects another workspace revision or an incomplete receipt', () => {
  assert.equal(verifySelectedGraphifyAuthorityReadbackV1({ ...input, rows: [row({ workspace_revision: 'sha256:stale' })] }), false);
  assert.equal(verifySelectedGraphifyAuthorityReadbackV1({ ...input, rows: [row({ selection_receipt: ' ' })] }), false);
});

test('rejects ambiguous authority readback', () => {
  assert.equal(verifySelectedGraphifyAuthorityReadbackV1({ ...input, rows: [row(), row()] }), false);
});
