/**
 * Runs the existing read-only execution controller and atomically promotes
 * its staging reports after the controller process exits. This is a Windows
 * file-lock guard; it does not alter task state or controller decisions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const controller = path.join(root, 'scripts/atlas/audit-openspec-execution-controller-v1.mjs');
const reportsDir = path.join(root, 'docs/reports');
// Use a run-scoped directory. The shared `docs/reports/staging` directory is
// read by the SSR awareness projection and can be held open by a watcher while
// this process is refreshing the controller receipt. A unique staging root
// preserves atomic promotion without turning a transient sharing violation
// into a stale-controller result.
const stagingDir = path.join(reportsDir, 'staging', `.execution-controller-${process.pid}-${Date.now()}`);
const reportNames = [
  'openspec-execution-controller-v1.json',
  'openspec-actionable-work-v1.json',
  'openspec-waiting-dependencies-v1.json',
  'openspec-deferred-discoveries-v1.json',
  'openspec-dependency-cycles-v1.json',
  'openspec-agent-error-receipts-v1.json',
  'openspec-blocker-audit-v1.json',
];
const startedAt = Date.now();
fs.mkdirSync(stagingDir, { recursive: true });

const result = spawnSync(process.execPath, [controller, ...process.argv.slice(2)], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, ATLAS_OPENSPEC_REPORTS_DIR: stagingDir },
  stdio: 'inherit',
});

const promotion = [];
for (const name of reportNames) {
  const staged = path.join(stagingDir, name);
  const target = path.join(reportsDir, name);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  if (!fs.existsSync(staged)) {
    promotion.push({ name, status: 'STAGING_REPORT_MISSING' });
    continue;
  }
  if (fs.statSync(staged).mtimeMs < startedAt) {
    promotion.push({ name, status: 'STAGING_REPORT_STALE_NOT_PROMOTED' });
    continue;
  }
  try {
    fs.copyFileSync(staged, temporary);
    fs.renameSync(temporary, target);
    promotion.push({ name, status: 'PRIMARY_REPORT_ATOMICALLY_REFRESHED' });
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
    promotion.push({ name, status: 'PRIMARY_REPORT_REFRESH_FAILED', error: String(error?.message ?? error) });
  }
}

console.log(JSON.stringify({
  schema: 'atlas.openspec-execution-controller-atomic-runner.v1',
  controllerExitCode: result.status ?? 1,
  promotion,
  writesPerformed: false,
}, null, 2));

process.exitCode = result.status ?? 1;
