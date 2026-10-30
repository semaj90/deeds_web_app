import test from 'node:test';
import assert from 'node:assert/strict';
import { packetRegistryBackfillApplyBlocker, parsePacketRegistryBackfillArgs } from './packet-registry-backfill-cli-v1.mjs';

const executionId = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const workspaceRevision = `sha256:${'a'.repeat(64)}`;

test('defaults to a non-applying dry run', () => {
  assert.deepEqual(parsePacketRegistryBackfillArgs([]), {
    mode: 'dry-run',
    executionId: null,
    workspaceRevision: null,
  });
});

test('accepts explicit dry-run and rejects unknown or duplicate modes', () => {
  assert.equal(parsePacketRegistryBackfillArgs(['--dry-run']).mode, 'dry-run');
  assert.throws(() => parsePacketRegistryBackfillArgs(['--dry-run', '--apply']), /exactly one/);
  assert.throws(() => parsePacketRegistryBackfillArgs(['--force']), /Unsupported argument/);
});

test('requires execution and full workspace revision for apply mode', () => {
  assert.throws(() => parsePacketRegistryBackfillArgs(['--apply']), /execution-id/);
  assert.throws(() => parsePacketRegistryBackfillArgs([
    '--apply', `--execution-id=${executionId}`,
  ]), /workspace-revision/);
  assert.throws(() => parsePacketRegistryBackfillArgs([
    '--apply', '--execution-id=not-a-uuid', `--workspace-revision=${workspaceRevision}`,
  ]), /valid.*UUID/);
  assert.throws(() => parsePacketRegistryBackfillArgs([
    '--apply', `--execution-id=${executionId}`, '--workspace-revision=sha256:short',
  ]), /full.*sha256/);
});

test('a syntactically valid execution cannot bypass the unresolved authority gate', () => {
  const parsed = parsePacketRegistryBackfillArgs([
    '--apply', `--execution-id=${executionId}`, `--workspace-revision=${workspaceRevision}`,
  ]);
  assert.equal(parsed.mode, 'apply');
  assert.equal(packetRegistryBackfillApplyBlocker(), 'NO_CURRENT_PACKETKEYV2_EXECUTION_AUTHORITY');
});
