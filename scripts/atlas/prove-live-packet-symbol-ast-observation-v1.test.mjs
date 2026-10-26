import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/atlas/prove-live-packet-symbol-ast-observation-v1.mts');

test('requires a workspace revision for source-specific symbol proofs', () => {
  const output = `.tmp/atlas/missing-workspace-proof-${process.pid}.json`;
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', script, output, '--source-ref', 'scripts/agent/ace-assembler-recommendations.mjs',
  ], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SOURCE_REF_REQUIRES_WORKSPACE_REVISION/);
  assert.equal(fs.existsSync(path.join(root, output)), false);
});
