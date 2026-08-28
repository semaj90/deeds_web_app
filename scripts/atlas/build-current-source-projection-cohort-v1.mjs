#!/usr/bin/env node

/** Build a read-only cohort from namespace and byte-integrity evidence. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const comparisonPath = path.join(root, 'docs/reports/source-manifest-projection-comparison-v1.json');
const scopePath = path.join(root, 'docs/reports/source-scope-reconciliation-v1.json');
const reportPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const comparison = JSON.parse(fs.readFileSync(comparisonPath, 'utf8'));
const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));

const rows = (comparison.records ?? []).map((row) => {
  const namespace = row.namespace?.classification ?? 'UNCLASSIFIED';
  const byteExact = row.classification === 'EXACT_FILE_BYTES';
  const eligible = namespace === 'EXACT_CURRENT' && byteExact;
  return {
    relativePath: row.relativePath,
    sourceRootAuthority: row.sourceRootAuthority,
    namespaceClassification: namespace,
    hashClassification: row.classification,
    filesystemHash: row.filesystemHash ?? null,
    eligibleCurrentSource: eligible,
    admissionReason: eligible ? 'EXACT_NAMESPACE_AND_FILE_BYTES' : 'DIAGNOSTIC_ONLY',
  };
});

const counts = rows.reduce((result, row) => {
  result.total += 1;
  result[`${row.namespaceClassification}_NAMESPACE`] = (result[`${row.namespaceClassification}_NAMESPACE`] ?? 0) + 1;
  result[`${row.hashClassification}_HASH`] = (result[`${row.hashClassification}_HASH`] ?? 0) + 1;
  if (row.eligibleCurrentSource) result.eligibleCurrentSources += 1;
  return result;
}, { total: 0, eligibleCurrentSources: 0 });

const report = {
  schema: 'atlas.current-source-projection-cohort.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_COHORT_PLANNING',
  inputs: {
    comparison: { path: path.relative(root, comparisonPath).replaceAll('\\', '/'), reportStatus: comparison.status ?? null },
    scope: { path: path.relative(root, scopePath).replaceAll('\\', '/'), manifestChecksum: scope.denominator?.manifestChecksum ?? null },
  },
  counts,
  cohort: rows.filter((row) => row.eligibleCurrentSource),
  diagnosticCounts: {
    namespaceExactButHashNotExact: rows.filter((row) => row.namespaceClassification === 'EXACT_CURRENT' && !row.eligibleCurrentSource).length,
    unresolvedNamespace: rows.filter((row) => row.namespaceClassification === 'UNRESOLVED').length,
    excluded: rows.filter((row) => row.namespaceClassification === 'EXCLUDED').length,
  },
  canonicalAuthority: false,
  postgresWrites: false,
  qdrantWrites: false,
  graphifyWrites: false,
  relationshipWrites: false,
  status: counts.eligibleCurrentSources > 0 ? 'CURRENT_SOURCE_COHORT_READY_FOR_PROJECTION_REVIEW' : 'CURRENT_SOURCE_COHORT_EMPTY',
  nextGate: 'SOURCE_PROJECTION_REVISION_REVIEW_REQUIRED',
};
report.cohortChecksum = crypto.createHash('sha256').update(JSON.stringify(report.cohort)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts, cohortChecksum: report.cohortChecksum, reportPath: 'docs/reports/current-source-projection-cohort-v1.json' }, null, 2));
