#!/usr/bin/env node
/**
 * Execute the existing read-only fabric audit and enforce its receipt verdict.
 * The audit intentionally writes a local report but historically exited zero
 * for NOT_SAFE_TO_PROJECT; this wrapper makes that verdict an actual gate.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const reportPath = resolve(root, 'docs/reports', `atlas-canonical-projection-fabric-audit-${new Date().toISOString().slice(0, 10)}.json`);

execFileSync(process.execPath, [resolve(root, 'scripts/atlas/audit-canonical-projection-fabric.mjs')], {
  cwd: root,
  stdio: 'inherit',
  timeout: 10 * 60 * 1000,
});

if (!existsSync(reportPath)) {
  throw new Error(`GRAPHIFY_PROMOTION_ADMISSION_REPORT_MISSING:${reportPath}`);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (report.overall_verdict !== 'SAFE_TO_PROJECT') {
  throw new Error(`GRAPHIFY_PROMOTION_ADMISSION_BLOCKED:${report.overall_verdict ?? 'MISSING_VERDICT'}`);
}

console.log('GRAPHIFY_PROMOTION_ADMISSION_PROVEN');
