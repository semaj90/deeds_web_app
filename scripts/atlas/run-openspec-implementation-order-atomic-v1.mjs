#!/usr/bin/env node

/** Run the read-only implementation-order audit through staging on Windows. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportsDir = path.join(root, 'docs', 'reports');
const stagingDir = path.join(reportsDir, 'staging');
const target = path.join(reportsDir, 'openspec-implementation-order-v1.json');
const staged = path.join(stagingDir, 'openspec-implementation-order-v1.json');
const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;

fs.mkdirSync(stagingDir, { recursive: true });
const result = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/atlas/audit-openspec-implementation-order-v1.mjs'), ...process.argv.slice(2)],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ATLAS_OPENSPEC_REPORTS_DIR: stagingDir },
    stdio: 'inherit',
  },
);

let promotion = 'STAGING_REPORT_MISSING';
if (fs.existsSync(staged)) {
  try {
    fs.copyFileSync(staged, temporary);
    fs.renameSync(temporary, target);
    promotion = 'PRIMARY_REPORT_ATOMICALLY_REFRESHED';
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
    promotion = `PRIMARY_REPORT_REFRESH_FAILED:${error?.message ?? error}`;
  }
}

console.log(JSON.stringify({
  schema: 'atlas.openspec-implementation-order-atomic-runner.v1',
  controllerExitCode: result.status ?? 1,
  promotion,
  writesPerformed: false,
  reportPath: target,
}, null, 2));
process.exitCode = result.status ?? 1;
