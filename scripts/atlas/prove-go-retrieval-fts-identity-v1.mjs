#!/usr/bin/env node

/**
 * Bounded live proof for the Go Retrieval PostgreSQL FTS identity envelope.
 * Read-only: it performs one health request and one bounded search request.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const baseUrl = process.env.GO_RETRIEVAL_URL ?? 'http://127.0.0.1:8100';
const reportPath = path.join(root, 'docs/reports/go-retrieval-fts-identity-v1.json');
const query = 'PostgreSQL source revision';

const report = {
  schema: 'atlas.go-retrieval-fts-identity.v1',
  generatedAt: new Date().toISOString(),
  mode: 'LIVE_READ_ONLY',
  baseUrl,
  query,
  limit: 3,
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
};

try {
  const healthResponse = await fetch(`${baseUrl}/health`);
  report.healthStatus = healthResponse.status;
  report.health = await healthResponse.json();

  const searchResponse = await fetch(`${baseUrl}/search/bm25`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: 3 }),
  });
  report.searchStatus = searchResponse.status;
  report.search = await searchResponse.json();

  const rows = Array.isArray(report.search.results) ? report.search.results : [];
  const requiredFields = [
    'id', 'source_ref', 'content_hash', 'workspace_revision', 'source_revision',
    'representation_revision', 'lineage_binding_checksum', 'lineage_producer_revision',
    'identity_status', 'identity_reason',
  ];
  const fieldCoverage = Object.fromEntries(requiredFields.map((field) => [
    field,
    rows.filter((row) => Object.hasOwn(row, field)).length,
  ]));
  const envelopePresent = rows.every((row) => requiredFields.every((field) => Object.hasOwn(row, field)));
  const failClosed = rows.every((row) => row.identity_status === 'PASS' || row.identity_status === 'REVIEW_REQUIRED');
  report.checks = {
    health: report.health?.status === 'healthy' ? 'PASS' : 'REVIEW_REQUIRED',
    boundedSearch: searchResponse.status === 200 ? 'PASS' : 'FAIL',
    identityFieldsPresent: envelopePresent ? 'PASS' : 'FAIL',
    failClosedStatus: failClosed ? 'PASS' : 'FAIL',
    responseIdentityStatus: report.search.identity_status ?? 'MISSING',
  };
  report.fieldCoverage = fieldCoverage;
  report.resultCount = rows.length;
  report.status = report.checks.health === 'PASS'
    && report.checks.boundedSearch === 'PASS'
    && report.checks.identityFieldsPresent === 'PASS'
    && report.checks.failClosedStatus === 'PASS'
    ? 'GO_RETRIEVAL_FTS_IDENTITY_PROVEN'
    : 'GO_RETRIEVAL_FTS_IDENTITY_REVIEW_REQUIRED';
} catch (error) {
  report.status = 'GO_RETRIEVAL_FTS_IDENTITY_UNAVAILABLE';
  report.error = String(error?.message ?? error);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, reportPath: 'docs/reports/go-retrieval-fts-identity-v1.json', writesPerformed: false }, null, 2));
process.exitCode = report.status === 'GO_RETRIEVAL_FTS_IDENTITY_PROVEN' ? 0 : 1;
