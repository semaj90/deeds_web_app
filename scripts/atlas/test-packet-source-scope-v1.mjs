#!/usr/bin/env node

/** Read-only contract test for the per-folder packet-scope census. */
import fs from 'node:fs';
import path from 'node:path';

const reportPath = path.join(process.cwd(), 'docs/reports/packet-source-scope-v1.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const allowedRecommendations = new Set([
  'KEEP_IF_SOURCE_QUALIFIED',
  'EXCLUDE_NON_SOURCE_REVIEW',
  'EXTERNAL_REFERENCE_REVIEW',
  'REVIEW_VENDOR_OR_PROJECTION',
  'REVIEW_TOP_LEVEL',
]);

const rows = Array.isArray(report.rows) ? report.rows : [];
const packetSum = rows.reduce((sum, row) => sum + Number(row.packetCount ?? 0), 0);
expect(report.status === 'OPERATOR_FOLDER_DISPOSITION_REQUIRED', 'operator disposition must remain required');
expect(report.policy?.operatorDispositionRequired === true, 'operator disposition policy missing');
expect(report.policy?.noAutomaticFolderPromotion === true, 'automatic folder promotion must remain disabled');
expect(packetSum === Number(report.totals?.packetRows ?? -1), 'folder packet counts do not reconcile');
expect(rows.every((row) => row.operatorDisposition === null), 'a folder received an automatic disposition');
expect(rows.every((row) => allowedRecommendations.has(row.recommendation)), 'unknown advisory recommendation present');
expect(Number(report.totals?.exactAdmittedBindingMatches ?? 0) <= Number(report.totals?.packetRows ?? 0), 'binding match count exceeds packet count');
expect(report.canonicalAuthority === false && report.writesPerformed === false, 'read-only invariant failed');

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', checks: 8, folderCount: rows.length, packetRows: report.totals.packetRows, writesPerformed: false }, null, 2));
}
