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
    }, {
      taskKey: 'fixture-change:2',
      change: 'fixture-change',
      line: 2,
      text: 'checked task without an admitted task-bound receipt',
      state: 'DONE',
      executionState: 'DONE',
      priority: 2,
    }, {
      taskKey: 'fixture-change:3',
      change: 'fixture-change',
      line: 3,
      text: 'depends on checked task',
      state: 'OPEN',
      executionState: 'ACTIONABLE',
      dependsOnTaskIds: ['fixture-change:2'],
      priority: 3,
    }, {
      taskKey: 'fixture-change:4',
      change: 'fixture-change',
      line: 4,
      text: 'depends on absent task',
      state: 'OPEN',
      executionState: 'ACTIONABLE',
      dependsOnTaskIds: ['missing-change:1'],
      priority: 4,
    }, {
      taskKey: 'fixture-change:5',
      change: 'fixture-change',
      line: 5,
      text: 'cyclic prerequisite A',
      state: 'OPEN',
      executionState: 'ACTIONABLE',
      dependsOnTaskIds: ['fixture-change:6'],
      priority: 5,
    }, {
      taskKey: 'fixture-change:6',
      change: 'fixture-change',
      line: 6,
      text: 'cyclic prerequisite B',
      state: 'OPEN',
      executionState: 'ACTIONABLE',
      dependsOnTaskIds: ['fixture-change:5'],
      priority: 6,
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
  assert.equal(report.summary.totalTasks, 6);
  assert.equal(report.summary.actionable, 1);
  assert.equal(report.summary.waiting, 4);
  assert.equal(report.summary.proven, 0);
  assert.equal(report.summary.invariants, 0);
  assert.equal(report.summary.checkedUnverified, 1);
  assert.equal(report.allTasks[0].taskKey, 'fixture-change:1');
  assert.equal(report.allTasks[1].controller.state, 'CHECKED_UNVERIFIED');
  assert.equal(report.checkedUnverifiedTasks[0].taskKey, 'fixture-change:2');
  assert.equal(report.allTasks[2].controller.state, 'WAITING_ON_DEPENDENCY');
  assert.deepEqual(report.allTasks[2].dependencyReadiness.unprovenTaskKeys, ['fixture-change:2']);
  assert.equal(report.allTasks[2].dependencyReadiness.ready, false);
  assert.equal(report.allTasks[3].controller.state, 'WAITING_ON_DEPENDENCY');
  assert.deepEqual(report.allTasks[3].dependencyReadiness.unresolvedTaskKeys, ['missing-change:1']);
  assert.equal(report.allTasks[4].dependencyReadiness.cyclic, true);
  assert.equal(report.allTasks[5].dependencyReadiness.cyclic, true);
  assert.equal(report.dependencyGraph.status, 'DECLARED_DEPENDENCIES_UNRESOLVED');
  assert.equal(report.dependencyGraph.declaredEdgeCount, 4);
  assert.equal(report.dependencyGraph.unresolvedEdgeCount, 1);
  assert.equal(report.dependencyGraph.cycles.length, 1);
  assert.equal(report.dependencyGraph.receiptAdmission, 'NO_TASK_BOUND_VERIFIED_RECEIPTS_ADMITTED');
  assert.equal(report.source, path.relative(root, workboardPath).split(path.sep).join('/'));
  assert.equal(report.sourceMode, 'EXPLICIT_SNAPSHOT_PATH');
  assert.equal(fs.existsSync(path.join(reportsDir, 'staging')), false, 'fresh report directories must not use fallback staging');
  assert.equal(JSON.parse(result.stdout).reportWriteFailures.length, 0);
  const sharedReportAfter = fs.existsSync(sharedReportPath) ? fs.readFileSync(sharedReportPath) : null;
  assert.deepEqual(sharedReportAfter, sharedReportBefore, 'isolated controller run must not touch the shared report');
});

test('controller defaults to a fresh read-only OpenSpec task snapshot', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-openspec-controller-fresh-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const reportsDir = path.join(tempRoot, 'reports');
  const result = spawnSync(process.execPath, [controller], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ATLAS_OPENSPEC_REPORTS_DIR: reportsDir,
      ATLAS_OPENSPEC_WORKBOARD_PATH: '',
    },
    timeout: 120_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(path.join(reportsDir, 'openspec-execution-controller-v1.json'), 'utf8'));
  assert.equal(report.sourceMode, 'FRESH_READ_ONLY_TASK_SNAPSHOT');
  assert.notEqual(report.source, 'docs/reports/openspec-workboard-v1.json');
  assert.ok(report.summary.totalTasks > 0);
  assert.equal(report.summary.checkedUnverified + report.summary.proven + report.summary.actionable
    + report.summary.waiting + report.summary.deferred + report.summary.invariants, report.summary.totalTasks);
});
