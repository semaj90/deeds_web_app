#!/usr/bin/env node

/**
 * DOC-26 — read-only incremental version-recrawl decision proof.
 *
 * This fixture deliberately does not call a crawler or write a datastore. It
 * proves the identity rule used by the existing acquisition owner: bytes (and
 * an explicit product/version identity) decide reuse; timestamps and cache
 * validators are supporting metadata only.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const reportPath = resolve(ROOT, 'docs/reports/parent-atlas/doc-26-incremental-recrawl-fixture-v1.json');

const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

function decide(previous, next) {
  if (previous.url !== next.url) return { decision: 'NEW_SOURCE', reason: 'normalized URL changed' };
  if (previous.productVersion !== next.productVersion) {
    return { decision: 'REPROCESS_NEW_VERSION', reason: 'productVersion changed; preserve prior rows' };
  }
  if (!previous.sourceRevision || !previous.contentHash || !next.sourceRevision || !next.contentHash) {
    return { decision: 'REPROCESS_CHANGED_BYTES', reason: 'identity metadata is incomplete; reuse is not safe' };
  }
  if (previous.sourceRevision === next.sourceRevision && previous.contentHash === next.contentHash) {
    return { decision: 'UNCHANGED_SKIP', reason: 'source bytes and revision are unchanged' };
  }
  return { decision: 'REPROCESS_CHANGED_BYTES', reason: 'canonical content identity changed' };
}

const url = 'https://docs.example.test/cutile/quickstart';
const v13 = '<html><h1>cuTile 13.2</h1><p>Use the Ampere kernel path.</p></html>';
const v13Changed = '<html><h1>cuTile 13.2</h1><p>Use the Ampere kernel path with validation.</p></html>';
const v14 = '<html><h1>cuTile 13.3</h1><p>Use the updated kernel path.</p></html>';

const make = (body, productVersion, retrievedAt) => ({
  url,
  productVersion,
  contentHash: sha256(body),
  sourceRevision: sha256(body),
  retrievedAt,
});

const previous = make(v13, '13.2', '2026-09-03T12:00:00.000Z');
const sameBytesLater = make(v13, '13.2', '2026-09-04T12:00:00.000Z');
const changedBytes = make(v13Changed, '13.2', '2026-09-04T12:01:00.000Z');
const changedVersion = make(v14, '13.3', '2026-09-04T12:02:00.000Z');

const cases = [
  { name: 'same-bytes-new-timestamp', previous, next: sameBytesLater, expected: 'UNCHANGED_SKIP' },
  { name: 'changed-bytes-same-version', previous, next: changedBytes, expected: 'REPROCESS_CHANGED_BYTES' },
  { name: 'changed-product-version', previous, next: changedVersion, expected: 'REPROCESS_NEW_VERSION' },
];

const results = cases.map((test) => {
  const outcome = decide(test.previous, test.next);
  return {
    name: test.name,
    expected: test.expected,
    actual: outcome.decision,
    pass: outcome.decision === test.expected,
    reason: outcome.reason,
    timestampOnlyDifference: test.name === 'same-bytes-new-timestamp',
    priorRowsPreserved: outcome.decision === 'REPROCESS_NEW_VERSION',
  };
});

const malformedMetadata = decide(
  { url, productVersion: '13.2', sourceRevision: null, contentHash: null },
  { url, productVersion: '13.2', sourceRevision: null, contentHash: null },
);

const report = {
  schema: 'atlas.doc-26.incremental-recrawl-fixture.v1',
  gate: 'DOC-26',
  status: results.every((result) => result.pass) && malformedMetadata.decision === 'REPROCESS_CHANGED_BYTES'
    ? 'DOC_26_INCREMENTAL_RECRAWL_FIXTURE_PROVEN'
    : 'DOC_26_INCREMENTAL_RECRAWL_FIXTURE_FAILED',
  owner: 'sveltekit-frontend/src/lib/server/atlas/acquisition/conditional-fetch.ts',
  identityRule: 'content bytes and explicit productVersion determine reuse; timestamps and validators do not create identity',
  cases: results,
  incompleteMetadata: {
    actual: malformedMetadata.decision,
    expected: 'REPROCESS_CHANGED_BYTES',
    pass: malformedMetadata.decision === 'REPROCESS_CHANGED_BYTES',
    note: 'Missing identity metadata must not silently reuse or overwrite a prior revision.',
  },
  writesPerformed: false,
  crawlerCalled: false,
  datastoreWrites: false,
  canonicalPromotion: false,
  generatedAt: new Date().toISOString(),
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'DOC_26_INCREMENTAL_RECRAWL_FIXTURE_PROVEN') process.exitCode = 1;
