import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveProposalOutputDirV1 } from './proposal-output-dir-v1.mjs';

const root = path.resolve('C:/workspace/atlas-test');

test('uses the existing output owner by default and scopes overrides to .tmp/atlas', () => {
  assert.equal(resolveProposalOutputDirV1(root), path.join(root, 'scripts/atlas/out'));
  assert.equal(resolveProposalOutputDirV1(root, '.tmp/atlas/proposals/run-1'), path.join(root, '.tmp/atlas/proposals/run-1'));
  assert.throws(() => resolveProposalOutputDirV1(root, 'scripts/atlas/out'), /PROPOSAL_OUTPUT_DIR_OUTSIDE_TMP_ATLAS/);
  assert.throws(() => resolveProposalOutputDirV1(root, '.tmp/atlas/../../scripts/atlas/out'), /PROPOSAL_OUTPUT_DIR_OUTSIDE_TMP_ATLAS/);
  assert.throws(() => resolveProposalOutputDirV1(root, ''), /PROPOSAL_OUTPUT_DIR_INVALID/);
});
