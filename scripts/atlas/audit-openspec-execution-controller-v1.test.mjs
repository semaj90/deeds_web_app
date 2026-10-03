import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const controller = path.join(root, 'scripts/atlas/audit-openspec-execution-controller-v1.mjs');

test('controller reads the explicit workboard and writes only to the configured report directory', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-openspec-controller-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const reportsDir = path.join(tempRoot, 'reports');
  const workboardPath = path.join(tempRoot, 'input', 'openspec-workboard-v1.json');
  const sharedReportPath = path.join(root, 'docs/reports/openspec-execution-controller-v1.json');
  const sharedReportBefore = fs.existsSync(sharedReportPath) ? fs.readFileSync(sharedReportPath) : null;
  fs.mkdirSync(path.dirname(workboardPath), { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(workboardPath, JSON.stringify({
    schema: 'atlas.openspec.workboard.v1',
    taskInventory: [{
      taskKey: 'fixture-change:1',
      change: 'fixture-change',
      line: 1,
      text: 'bounded controller path test',
      state: 'OPEN',
      executionState: 'ACTIONABLE',
      priority: 1,
    }],
  }));

  const result = spawnSync(process.execPath, [controller], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ATLAS_OPENSPEC_REPORTS_DIR: reportsDir,
      ATLAS_OPENSPEC_WORKBOARD_PATH: workboardPath,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(path.join(reportsDir, 'openspec-execution-controller-v1.json'), 'utf8'));
  assert.equal(report.summary.totalTasks, 1);
  assert.equal(report.summary.actionable, 1);
  assert.equal(report.allTasks[0].taskKey, 'fixture-change:1');
  assert.equal(report.source, path.relative(root, workboardPath).split(path.sep).join('/'));
  const sharedReportAfter = fs.existsSync(sharedReportPath) ? fs.readFileSync(sharedReportPath) : null;
  assert.deepEqual(sharedReportAfter, sharedReportBefore, 'isolated controller run must not touch the shared report');
});
