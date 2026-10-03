#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'docs/.okf/topics/langchain/corpus.json');
const CONFIG_ROOT = path.join(ROOT, 'docs/.okf/topics/langchain');

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length);
  const configArg = args.find((arg) => arg.startsWith('--config='))?.slice('--config='.length);
  if (!dirArg || args.some((arg) => !arg.startsWith('--dir=') && !arg.startsWith('--config='))) {
    throw new Error(
      'USAGE: node scripts/atlas/verify-langchain-doc-corpus-v1.mjs --dir=.tmp/atlas/langchain-doc-corpus-v1/<run> [--config=docs/.okf/topics/langchain/corpus.json]'
    );
  }
  const configPath = path.resolve(ROOT, configArg ?? DEFAULT_CONFIG_PATH);
  if (!within(CONFIG_ROOT, configPath)) throw new Error('CONFIG_OUTSIDE_LANGCHAIN_TOPIC_ROOT');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const dir = path.resolve(ROOT, dirArg);
  const allowedRoot = path.join(ROOT, '.tmp/atlas/langchain-doc-corpus-v1');
  if (!within(allowedRoot, dir)) throw new Error('ARTIFACT_DIR_OUTSIDE_ALLOWED_ROOT');
  const receipt = JSON.parse(await readFile(path.join(dir, 'receipt.json'), 'utf8'));
  if (
    receipt.schema !== 'atlas.langchain-doc-fetch-receipt.v1' ||
    receipt.corpusId !== config.corpusId
  ) {
    throw new Error('RECEIPT_SCHEMA_OR_CORPUS_MISMATCH');
  }
  if (receipt.writes?.postgres !== 0 || receipt.writes?.qdrant !== 0 || receipt.writes?.valkey !== 0) {
    throw new Error('RECEIPT_WRITE_INVARIANT_FAILED');
  }
  const manifestBytes = await readFile(path.join(dir, 'pages.jsonl'));
  if (sha256(manifestBytes) !== receipt.pagesManifestSha256) throw new Error('PAGES_MANIFEST_CHECKSUM_MISMATCH');
  const lines = manifestBytes.toString('utf8').split(/\r?\n/).filter(Boolean);
  const rows = lines.map((line) => JSON.parse(line));
  const seen = new Set();
  for (const row of rows) {
    if (row.status !== 'FETCHED' || row.canonicalAuthority !== false) throw new Error('PAGE_ROW_AUTHORITY_OR_STATUS_INVALID');
    if (seen.has(row.canonicalUrl)) throw new Error(`DUPLICATE_PAGE_URL:${row.canonicalUrl}`);
    seen.add(row.canonicalUrl);
    const section = config.sections.find((item) => item.id === row.sectionId);
    const url = new URL(row.canonicalUrl);
    if (
      !section ||
      url.origin !== config.authority ||
      !url.pathname.startsWith(section.allowedPathPrefix)
    ) {
      throw new Error(`PAGE_URL_OUTSIDE_SECTION:${row.canonicalUrl}`);
    }
    if (section.language && row.language !== section.language)
      throw new Error(`PAGE_LANGUAGE_MISMATCH:${row.canonicalUrl}`);
    const filePath = path.resolve(dir, row.artifactPath);
    if (!within(dir, filePath)) throw new Error('PAGE_ARTIFACT_PATH_ESCAPE');
    const bytes = await readFile(filePath);
    if (sha256(bytes) !== row.normalizedSha256 || bytes.length !== row.byteLength) {
      throw new Error(`PAGE_ARTIFACT_CHECKSUM_MISMATCH:${row.canonicalUrl}`);
    }
  }
  const failedCount = Array.isArray(receipt.failures) ? receipt.failures.length : -1;
  if (rows.length !== receipt.fetchedPageCount || failedCount !== receipt.failedPageCount
    || rows.length + failedCount !== receipt.discoveredUrlCount) {
    throw new Error('PAGE_CONSERVATION_MISMATCH');
  }
  const result = {
    status: failedCount === 0 ? 'ARTIFACT_COHORT_COMPLETE' : 'ARTIFACT_COHORT_PARTIAL',
    fetched: rows.length, failed: failedCount, discovered: receipt.discoveredUrlCount,
    pagesManifestSha256: receipt.pagesManifestSha256,
    canonicalAuthority: false, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failedCount > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
