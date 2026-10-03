#!/usr/bin/env node
/** Read-only checksum and reciprocal-link smoke for canonical/replacement documents. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const registryPath = join(root, 'docs/reports/document-governance-registry-v1.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function verifyDocumentLinksV1(records, readSource) {
  const byId = new Map(records.map((record) => [record.documentId, record]));
  const selected = records.filter((record) => record.status === 'CANONICAL_CURRENT'
    || record.status === 'SUPERSEDED'
    || (record.supersededBy ?? []).length > 0);
  const failures = [];
  let replacementLinks = 0;

  const verifySource = (record) => {
    const bytes = readSource(record.path);
    if (bytes === null || bytes === undefined) failures.push(`DOCUMENT_SOURCE_MISSING:${record.documentId}`);
    else if (sha256(bytes) !== record.sha256) failures.push(`DOCUMENT_CHECKSUM_MISMATCH:${record.documentId}`);
  };

  for (const record of selected) {
    verifySource(record);
    for (const replacementId of record.supersededBy ?? []) {
      replacementLinks += 1;
      const replacement = byId.get(replacementId);
      if (!replacement) failures.push(`REPLACEMENT_TARGET_MISSING:${record.documentId}:${replacementId}`);
      else {
        if (!(replacement.supersedes ?? []).includes(record.documentId)) {
          failures.push(`REPLACEMENT_LINK_NOT_RECIPROCAL:${record.documentId}:${replacementId}`);
        }
        verifySource(replacement);
      }
    }
  }

  return {
    schema: 'atlas.document-governance-link-smoke.v1',
    status: failures.length ? 'BLOCKED_LINK_OR_SOURCE_FAILURE' : 'PROVEN_BOUNDED',
    canonicalDocumentsChecked: selected.filter((record) => record.status === 'CANONICAL_CURRENT').length,
    replacementDocumentsChecked: new Set(selected.filter((record) => record.status === 'SUPERSEDED')
      .flatMap((record) => record.supersededBy ?? [])).size,
    replacementLinksChecked: replacementLinks,
    failures: [...new Set(failures)].sort(),
    readOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    archiveApplied: false,
  };
}

if (process.argv[1]?.endsWith('document-governance-link-smoke-v1.mjs')) {
  const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : { records: [] };
  const result = verifyDocumentLinksV1(registry.records ?? [], (path) => {
    const absolute = join(root, path);
    return existsSync(absolute) ? readFileSync(absolute) : null;
  });
  console.log(`${result.status} canonical=${result.canonicalDocumentsChecked} replacementLinks=${result.replacementLinksChecked} failures=${result.failures.length}`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(failure);
    process.exitCode = 2;
  }
}
