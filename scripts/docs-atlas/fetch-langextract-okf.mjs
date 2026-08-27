#!/usr/bin/env node

/**
 * Capture official LangExtract documentation into the derived OKF namespace.
 * Default mode is dry-run; --write creates only docs/.okf/langextract files.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT_ROOT = resolve(ROOT, 'docs/.okf/langextract');
const RAW_ROOT = resolve(OUTPUT_ROOT, 'raw');
const RECORDS_PATH = resolve(OUTPUT_ROOT, 'corpus.jsonl');
const MANIFEST_PATH = resolve(OUTPUT_ROOT, 'manifest.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/langextract-okf-fetch-v1.json');
const WRITE = process.argv.includes('--write');
const LIMIT = Math.max(1, Number.parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '5', 10) || 5);
const PYTHON = process.env.PYTHON_BIN || 'python';
const FETCHER = resolve(ROOT, 'scripts/docs-atlas/fetch-beautifulsoup.py');

const SOURCES = [
  { id: 'repository', url: 'https://github.com/google/langextract', title: 'LangExtract GitHub repository' },
  { id: 'readme', url: 'https://github.com/google/langextract/blob/main/README.md', title: 'LangExtract README' },
  { id: 'pyproject', url: 'https://github.com/google/langextract/blob/main/pyproject.toml', title: 'LangExtract package metadata' },
  { id: 'releases', url: 'https://github.com/google/langextract/releases', title: 'LangExtract releases' },
  { id: 'pypi', url: 'https://pypi.org/project/langextract/', title: 'LangExtract PyPI project' },
  { id: 'providers', url: 'https://github.com/google/langextract/blob/main/langextract/providers/README.md', title: 'LangExtract provider integrations' },
  { id: 'longer-text-example', url: 'https://github.com/google/langextract/blob/main/docs/examples/longer_text_example.md', title: 'LangExtract grounded long-document example' },
];

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

async function fetchPage(source) {
  const { stdout } = await execFileAsync(PYTHON, [FETCHER, source.url], {
    cwd: ROOT,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout.trim());
  if (payload.error) throw new Error(`${payload.error}:${payload.message || ''}`);
  const markdown = String(payload.markdown || '').trim();
  if (!markdown) throw new Error('EMPTY_MARKDOWN');
  return { ...source, markdown, resolved_url: String(payload.resolved_url || source.url), fetcher: String(payload.fetcher || 'BEAUTIFULSOUP_HTTP'), raw_checksum: String(payload.raw_checksum || ''), normalized_checksum: String(payload.normalized_checksum || sha256(markdown)), fetched_at: new Date().toISOString() };
}

const report = {
  schema: 'atlas.langextract-okf-fetch-receipt.v1',
  status: WRITE ? 'WRITE_REQUESTED' : 'DRY_RUN',
  output_namespace: 'docs/.okf/langextract',
  writes_performed: false,
  canonical_persistence_attempted: false,
  fetcher: 'BEAUTIFULSOUP_HTTP',
  requested: Math.min(LIMIT, SOURCES.length),
  fetched: 0,
  failed: 0,
  pages: [],
};

const pages = [];
for (const source of SOURCES.slice(0, LIMIT)) {
  try {
    const page = await fetchPage(source);
    pages.push(page);
    report.fetched += 1;
    report.pages.push({ source_id: page.id, url: page.url, status: 'FETCHED', content_hash: sha256(page.markdown) });
  } catch (error) {
    report.failed += 1;
    report.pages.push({ source_id: source.id, url: source.url, status: 'FAILED', error: error instanceof Error ? error.message : String(error) });
  }
}

if (WRITE && pages.length > 0) {
  await mkdir(RAW_ROOT, { recursive: true });
  const records = [];
  for (const page of pages) {
    const contentHash = sha256(page.markdown);
    const rawPath = resolve(RAW_ROOT, `${page.id}.md`);
    const record = {
      schema_version: 'atlas.langextract-okf-document.v1',
      source_id: `langextract:${page.id}`,
      source_ref: `docs/.okf/langextract/${page.id}`,
      source_url: page.resolved_url,
      source_revision: 'langextract:1.6.0',
      fetched_at: page.fetched_at,
      fetcher: page.fetcher,
      title: page.title,
      content_hash: contentHash,
      raw_checksum: page.raw_checksum || null,
      normalized_checksum: page.normalized_checksum,
      markdown_path: rawPath,
      authority_class: 'OFFICIAL_PRIMARY',
      canonical_authority: false,
      tags: ['langextract', 'official_docs', 'derived_okf'],
    };
    await writeFile(rawPath, page.markdown, 'utf8');
    await writeFile(`${rawPath}.json`, `${JSON.stringify({ ...record, url: page.url }, null, 2)}\n`, 'utf8');
    records.push(record);
  }
  await writeFile(RECORDS_PATH, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  await writeFile(MANIFEST_PATH, `${JSON.stringify({ schema: 'atlas.langextract-okf-manifest.v1', output_namespace: 'docs/.okf/langextract', source_revision: 'langextract:1.6.0', documents: records }, null, 2)}\n`, 'utf8');
  report.writes_performed = true;
  report.status = report.failed === 0 ? 'COMPLETE_DERIVED_CAPTURE' : 'PARTIAL_DERIVED_CAPTURE';
}

await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
