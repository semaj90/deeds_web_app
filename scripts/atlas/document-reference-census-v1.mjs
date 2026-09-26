#!/usr/bin/env node
/** Read-only, exact-string reference census for explicitly superseded documents. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = process.cwd();
const registryPath = join(root, 'docs/reports/document-governance-registry-v1.json');
const outputFlag = process.argv.indexOf('--output');
const outputPath = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? resolve(root, process.argv[outputFlag + 1])
  : join(root, 'docs/reports/document-reference-census-v1.json');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function collectSupersededReferenceTargetsV1(records) {
  return records
    .filter((record) => record.status === 'SUPERSEDED' || (record.supersededBy ?? []).length > 0)
    .map((record) => {
      const values = [
        ['OLD_PATH', record.path],
        ['TITLE', record.title],
        ...(record.topicIds ?? []).map((value) => ['TOPIC_ID', value]),
        ['DOCUMENT_ID', record.documentId],
        ...(record.supersededBy ?? []).map((value) => ['SUPERSESSION_ID', value]),
      ];
      const seen = new Set();
      const identifiers = values
        .filter(([, value]) => typeof value === 'string' && value.trim().length >= 3)
        .map(([kind, value]) => ({ kind, value: value.trim() }))
        .filter(({ kind, value }) => {
          const key = `${kind}\0${value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { documentId: record.documentId, path: record.path, identifiers };
    });
}

export function buildDocumentReferenceCensusV1(records, searchExact) {
  const targets = collectSupersededReferenceTargetsV1(records);
  if (targets.length === 0) {
    return {
      schema: 'atlas.document-reference-census.v1',
      status: 'NO_SUPERSESSION_TARGETS',
      targetCount: 0,
      searchedIdentifierCount: 0,
      targets: [],
      searchScope: 'ripgrep exact strings over non-ignored repository text files; generated reports, graph snapshots, build outputs, dependencies, and .tmp excluded',
      readOnly: true,
      canonicalAuthority: false,
      writesPerformed: false,
      promotionAuthorized: false,
    };
  }

  let searchFailures = 0;
  const results = targets.map((target) => ({
    ...target,
    references: target.identifiers.map((identifier) => {
      const result = searchExact(identifier.value, target.path);
      if (!result.ok) searchFailures += 1;
      const files = (result.files ?? []).map((path) => path.replaceAll('\\', '/').replace(/^\.\//, ''))
        .filter((path) => path !== target.path);
      return { ...identifier, files, status: result.ok ? 'SCANNED' : 'SEARCH_FAILED' };
    }),
  }));
  return {
    schema: 'atlas.document-reference-census.v1',
    status: searchFailures ? 'BLOCKED_SEARCH_FAILURE' : 'PROVEN_BOUNDED',
    targetCount: targets.length,
    searchedIdentifierCount: targets.reduce((sum, target) => sum + target.identifiers.length, 0),
    searchFailures,
    targets: results,
    searchScope: 'ripgrep exact strings over non-ignored repository text files; generated reports, graph snapshots, build outputs, dependencies, and .tmp excluded',
    readOnly: true,
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
  };
}

function rgExact(value, excludedPath) {
  const args = [
    '--files-with-matches', '--fixed-strings', '--hidden',
    '--glob', '!**/.git/**', '--glob', '!**/node_modules/**', '--glob', '!**/.tmp/**',
    '--glob', '!docs/reports/**', '--glob', '!docs/graph/**', '--glob', '!**/dist/**',
    '--glob', '!**/build/**', '--glob', '!**/.svelte-kit/**', '--', value, '.',
  ];
  try {
    const stdout = execFileSync('rg', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, files: stdout.split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll('\\', '/').replace(/^\.\//, '')).filter((path) => path !== excludedPath) };
  } catch (error) {
    if (error.status === 1) return { ok: true, files: [] };
    return { ok: false, files: [], error: error.message };
  }
}

async function main() {
  const registryText = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : '';
  const registry = registryText ? JSON.parse(registryText) : { records: [] };
  const report = buildDocumentReferenceCensusV1(registry.records ?? [], rgExact);
  report.inputs = {
    registrySha256: registryText ? sha256(registryText) : null,
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`${report.status} targets=${report.targetCount} identifiers=${report.searchedIdentifierCount}`);
  console.log(`report=${outputPath}`);
  if (report.searchFailures) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
