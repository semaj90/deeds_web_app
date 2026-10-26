import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(root, 'scripts/atlas/audit-current-graphify-source-bridge-reconciliation-v1.mjs');

test('refuses an execution revision that does not match the admitted snapshot', () => {
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
  const unrelatedRevision = `sha256:${'0'.repeat(64)}`;
  assert.notEqual(unrelatedRevision, admission.workspaceRevision);

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--execution-id',
    'read-only-revision-binding-test',
    '--workspace-revision',
    unrelatedRevision,
  ], { cwd: root, encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /CURRENT_GRAPHIFY_SOURCE_BRIDGE_REVISION_DOES_NOT_MATCH_ADMITTED_SNAPSHOT/);
});
