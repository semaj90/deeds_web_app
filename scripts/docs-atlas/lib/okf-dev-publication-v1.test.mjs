import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  publishOkfDevCorpusGenerationV1,
  resolveOkfDevPublishedCorpusV1,
  writeOkfCrawlFailureReceiptV1,
} from './okf-dev-publication-v1.mjs';

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const validateEntry = (value) => {
  assert.equal(value.schema_version, 'okf.dev.corpus.v1');
  for (const field of ['source_id', 'source_ref', 'url', 'content_hash', 'markdown_path']) {
    assert.equal(typeof value[field], 'string');
  }
  return value;
};

async function fixturePage(root, sourceId, slug, url, markdown = `# ${slug}`) {
  const relativePath = `raw/${sourceId}/${slug}.md`;
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const contentHash = hash(Buffer.from(markdown, 'utf8'));
  const entry = {
    schema_version: 'okf.dev.corpus.v1', source_id: sourceId, source_ref: `${sourceId}:${slug}`, url,
    title: slug, content_hash: contentHash, markdown_path: relativePath,
  };
  await writeFile(absolutePath, markdown, { flag: 'wx' });
  await writeFile(absolutePath.replace(/\.md$/, '.json'), JSON.stringify({ ...entry, raw_path: relativePath }), { flag: 'wx' });
  return { source_id: sourceId, source_ref: entry.source_ref, url, markdown_path: relativePath, entry };
}

async function withRoot(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-okf-publication-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

function publicationInput(root, runId, pages) {
  const entries = pages.map((page) => page.entry);
  return {
    output_root: root,
    run_id: runId,
    demand_snapshot_checksum: `sha256:${'a'.repeat(64)}`,
    allowlist_checksum: `sha256:${'b'.repeat(64)}`,
    selected_count: pages.length,
    allowed_pages: pages.map(({ source_id, url }) => ({ source_id, url })),
    pages,
    entries,
    index_markdown: '# Test corpus',
    summary: { records: entries.length },
    validate_entry: validateEntry,
  };
}

test('publishes and independently reads back a complete multi-page generation', async () => withRoot(async (root) => {
  const pages = [
    await fixturePage(root, 'zod', 'api', 'https://zod.dev/api'),
    await fixturePage(root, 'valkey', 'json', 'https://valkey.io/topics/json/'),
  ];
  const receipt = await publishOkfDevCorpusGenerationV1(publicationInput(root, 'run-multi', pages));
  const current = resolveOkfDevPublishedCorpusV1(root);
  assert.equal(receipt.publication_status, 'PUBLISHED_READBACK_VERIFIED');
  assert.deepEqual(receipt.counts, { selected: 2, staged: 2, validated: 2, published: 2, corpus_total: 2, failed: 0 });
  assert.equal(receipt.canonical_authority, false);
  assert.equal(receipt.writes_performed, true);
  assert.equal(current.pointer.run_id, 'run-multi');
  const corpus = (await readFile(current.corpusPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(corpus.length, 2);
  assert.equal(current.generation.page_readbacks.length, 2);
}));

test('requires readback for every row, including retained rows outside the current fetch allowlist', async () => withRoot(async (root) => {
  const selectedPage = await fixturePage(root, 'zod', 'api', 'https://zod.dev/api');
  const retainedPage = await fixturePage(root, 'valkey', 'json', 'https://valkey.io/topics/json/');
  const input = publicationInput(root, 'run-retained', [selectedPage]);
  input.entries = [selectedPage.entry, retainedPage.entry];
  input.retained_pages = [retainedPage];
  const receipt = await publishOkfDevCorpusGenerationV1(input);
  const current = resolveOkfDevPublishedCorpusV1(root);
  assert.deepEqual(receipt.counts, { selected: 1, staged: 1, validated: 2, published: 2, corpus_total: 2, failed: 0 });
  assert.equal(current.generation.page_readbacks.length, 2);

  const brokenRoot = await mkdtemp(path.join(os.tmpdir(), 'atlas-okf-retained-missing-'));
  try {
    const staged = await fixturePage(brokenRoot, 'zod', 'api', 'https://zod.dev/api');
    const missing = await fixturePage(brokenRoot, 'valkey', 'json', 'https://valkey.io/topics/json/');
    await import('node:fs/promises').then(({ unlink }) => unlink(path.join(brokenRoot, missing.markdown_path)));
    const brokenInput = publicationInput(brokenRoot, 'run-retained-missing', [staged]);
    brokenInput.entries = [staged.entry, missing.entry];
    brokenInput.retained_pages = [missing];
    await assert.rejects(publishOkfDevCorpusGenerationV1(brokenInput));
    assert.equal(resolveOkfDevPublishedCorpusV1(brokenRoot), null);
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(brokenRoot, { recursive: true, force: true });
  }
}));

test('rejects publishing entries without matching page readbacks', async () => withRoot(async (root) => {
  const page = await fixturePage(root, 'zod', 'api', 'https://zod.dev/api');
  const input = publicationInput(root, 'run-unverified-entry', [page]);
  input.pages = [];
  input.allowed_pages = [];
  await assert.rejects(publishOkfDevCorpusGenerationV1(input), /PUBLICATION_ENTRY_WITHOUT_VERIFIED_PAGE/);
  assert.equal(resolveOkfDevPublishedCorpusV1(root), null);
}));

test('normalizes contained legacy absolute artifact paths in the published generation', async () => withRoot(async (root) => {
  const page = await fixturePage(root, 'firecrawl', 'intro', 'https://docs.firecrawl.dev/intro');
  const absolutePath = path.resolve(root, page.markdown_path);
  page.markdown_path = absolutePath;
  page.entry.markdown_path = absolutePath;
  const sidecarPath = absolutePath.replace(/\.md$/i, '.json');
  const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
  sidecar.markdown_path = absolutePath;
  await writeFile(sidecarPath, JSON.stringify(sidecar));

  const receipt = await publishOkfDevCorpusGenerationV1(publicationInput(root, 'run-legacy-absolute-path', [page]));
  const current = resolveOkfDevPublishedCorpusV1(root);
  const [publishedEntry] = (await readFile(current.corpusPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(receipt.publication_status, 'PUBLISHED_READBACK_VERIFIED');
  assert.equal(publishedEntry.markdown_path, 'raw/firecrawl/intro.md');
}));

test('rejects wrong identity, changed URL, stale hash, duplicate page, and malformed sidecar before pointer publication', async (t) => {
  const cases = [
    ['wrong source identity', (page) => { page.entry.source_id = 'other'; }],
    ['changed URL', (page) => { page.url = 'https://zod.dev/changed'; }],
    ['stale content hash', (page) => { page.entry.content_hash = '0'.repeat(64); }],
    ['malformed sidecar', (page) => { page.malformed = true; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => withRoot(async (root) => {
    const page = await fixturePage(root, 'zod', 'api', 'https://zod.dev/api');
    if (name === 'malformed sidecar') await writeFile(path.join(root, page.markdown_path.replace(/\.md$/, '.json')), '{bad json');
    else mutate(page);
    await assert.rejects(publishOkfDevCorpusGenerationV1(publicationInput(root, `bad-${name.replaceAll(' ', '-')}`, [page])));
    assert.equal(resolveOkfDevPublishedCorpusV1(root), null);
  }));

  await t.test('duplicate page', () => withRoot(async (root) => {
    const page = await fixturePage(root, 'zod', 'api', 'https://zod.dev/api');
    await assert.rejects(publishOkfDevCorpusGenerationV1(publicationInput(root, 'bad-duplicate', [page, page])), /PUBLICATION_DUPLICATE_ENTRY/);
    assert.equal(resolveOkfDevPublishedCorpusV1(root), null);
  }));
});

test('failed attempt writes a read-back-verified failure receipt and preserves the prior publication', async () => withRoot(async (root) => {
  const page = await fixturePage(root, 'zod', 'api', 'https://zod.dev/api');
  await publishOkfDevCorpusGenerationV1(publicationInput(root, 'run-good', [page]));
  const priorPointer = await readFile(path.join(root, 'published-current.json'), 'utf8');
  await mkdir(path.join(root, '.publications', 'run-interrupted-stage'), { recursive: true });
  const failure = await writeOkfCrawlFailureReceiptV1({
    receipt_root: path.join(root, 'failures'), run_id: 'run-interrupted', selected_count: 2, staged_count: 1,
    failed_count: 1, failed_items: [{ url: 'https://valkey.io/topics/json/', category: 'FETCH_FAILED' }],
    error_category: 'PARTIAL_FETCH_FAILURE',
  });
  assert.equal(failure.receipt.publication_status, 'FAILED_NOT_PUBLISHED');
  assert.equal(failure.receipt.canonical_authority, false);
  assert.equal(failure.receipt.writes_performed, true);
  assert.equal(failure.receipt.persistent_store_writes_performed, false);
  assert.equal(JSON.parse(await readFile(failure.path, 'utf8')).counts.published, 0);
  assert.equal(await readFile(path.join(root, 'published-current.json'), 'utf8'), priorPointer);
  const retryPage = await fixturePage(root, 'valkey', 'json', 'https://valkey.io/topics/json/');
  const retry = await publishOkfDevCorpusGenerationV1(publicationInput(root, 'run-retry', [retryPage]));
  assert.equal(retry.publication_status, 'PUBLISHED_READBACK_VERIFIED');
  assert.equal(resolveOkfDevPublishedCorpusV1(root).pointer.run_id, 'run-retry');
}));

test('rejects a modified generation during independent pointer readback', async () => withRoot(async (root) => {
  const page = await fixturePage(root, 'zod', 'api', 'https://zod.dev/api');
  await publishOkfDevCorpusGenerationV1(publicationInput(root, 'run-tamper', [page]));
  const current = resolveOkfDevPublishedCorpusV1(root);
  await writeFile(current.corpusPath, 'tampered');
  assert.throws(() => resolveOkfDevPublishedCorpusV1(root), /PUBLICATION_ARTIFACT_CHECKSUM_MISMATCH:corpus\.jsonl/);
}));
