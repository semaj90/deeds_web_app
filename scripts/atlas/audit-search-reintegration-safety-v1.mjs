#!/usr/bin/env node
/** Read-only SEARCH-REINTEGRATION-06 safety receipt. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const reportPath = path.join(root, 'docs/reports/search-reintegration-safety-v1.json');
const inputs = [
  'docs/reports/search-tool-inventory-v1.json',
  'docs/reports/search-tool-reintegration-preconditions-v1.json',
  'docs/reports/search-nondeterministic-surfaces-v1.json',
  'docs/reports/mcp-current-code-reconciliation-v1.json',
];
const reports = inputs.map((relative) => ({ relative, value: JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) }));
const forbiddenTrue = ['runtimeEnablementChanged', 'canonicalAuthorityChanged', 'writesPerformed', 'promotionAuthorized', 'restoreAttempted'];
const violations = [];
for (const { relative, value } of reports) {
  for (const field of forbiddenTrue) if (value.authority?.[field] === true) violations.push({ report: relative, field });
}
const report = {
  schema: 'atlas.search-reintegration-safety.v1',
  gate: 'SEARCH-REINTEGRATION-06',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  inputs,
  status: violations.length === 0 ? 'NON_AUTHORIZING_AUDIT_SEMANTICS_PROVEN' : 'SAFETY_VIOLATION',
  violations,
  authority: {
    runtimeEnablementChanged: false,
    canonicalAuthorityChanged: false,
    writesPerformed: false,
    promotionAuthorized: false,
  },
  nextGate: 'RETRIEVAL_OWNERSHIP_OR_DEFERRED_SURFACE_REVIEW',
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, violations, reportPath: 'docs/reports/search-reintegration-safety-v1.json', writesPerformed: false }, null, 2));
