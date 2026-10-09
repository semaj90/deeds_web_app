import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('crawler resumes a verified partial page into an isolated scratch corpus without fetching', async () => {
  const scratchRoot = await mkdtemp(path.join(repoRoot, '.tmp/atlas/okf-crawl-resume-test-'));
  try {
    const outputRoot = path.join(scratchRoot, 'corpus');
    const sourceId = 'zod';
    const sourceRef = 'zod:zod-dev-index';
    const url = 'https://zod.dev/';
    const markdown = '# Zod fixture';
    const markdownPath = path.relative(repoRoot, path.join(outputRoot, 'raw', sourceId, 'zod-dev-index.md')).replaceAll('\\', '/');
    const rawPath = path.join(repoRoot, markdownPath);
    const sidecarPath = rawPath.replace(/\.md$/, '.json');
    const contentHash = crypto.createHash('sha256').update(markdown, 'utf8').digest('hex');
    const sidecar = {
      schema_version: 'okf.dev.corpus.v1',
      source_id: sourceId,
      source_ref: sourceRef,
      url,
      title: 'Zod fixture',
      domain_class: 'tool',
      focus_tags: ['fixture'],
      llm_synthesis: 'No model synthesis was run.',
      llm_output: { source: 'fixture', title: 'Zod fixture', markdown_excerpt: markdown, metadata: {} },
      kanban: { board: 'okf-dev', lane: 'tool', status: 'open' },
      taskboard: { task_id: 'okf-dev:zod:zod-dev-index', title: 'Zod fixture', status: 'open' },
      agentic_error_fixing: { symptom: 'fixture', likely_fix: 'none', validation: 'fixture' },
      canonical_api_recommendations: [],
      content_hash: contentHash,
      markdown_path: markdownPath,
      raw_path: markdownPath,
      fetched_at: '2026-10-09T00:00:00.000Z',
      metadata: { kind: 'official_docs', source_id: sourceId, source_title: 'Zod fixture', fetched_via: 'fixture' },
    };
    const manifestPath = path.join(scratchRoot, 'manifest.json');
    await mkdir(path.dirname(rawPath), { recursive: true });
    await writeFile(rawPath, markdown, { flag: 'wx' });
    await writeFile(sidecarPath, JSON.stringify(sidecar), { flag: 'wx' });
    await writeFile(manifestPath, JSON.stringify({ sources: [{
      source_id: sourceId,
      title: 'Zod fixture',
      domain_class: 'tool',
      kind: 'official_docs',
      focus_tags: ['fixture'],
      pages: [url],
    }] }), { flag: 'wx' });

    const tsxCli = path.join(repoRoot, 'sveltekit-frontend/node_modules/tsx/dist/cli.mjs');
    const crawler = path.join(repoRoot, 'scripts/docs-atlas/crawl-okf-dev-docs.mts');
    const stdout = execFileSync(process.execPath, [tsxCli, crawler, '--append', '--limit=1',
      `--source-id=${sourceId}`, `--manifest=${manifestPath}`, `--output-root=${outputRoot}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 30000,
    });

    const pointer = JSON.parse(await readFile(path.join(outputRoot, 'published-current.json'), 'utf8'));
    const publishedCorpusPath = path.join(outputRoot, pointer.generation_manifest.replace(/\\/g, '/').replace(/\/manifest\.json$/, '/corpus.jsonl'));
    const records = (await readFile(publishedCorpusPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    assert.match(stdout, /recovered verified partial page zod:zod-dev-index/);
    assert.doesNotMatch(stdout, /fetching|scraping/i);
    assert.equal(records.length, 1);
    assert.equal(records[0].source_ref, sourceRef);
    assert.equal(records[0].content_hash, contentHash);
    assert.equal(pointer.publication_status, 'PUBLISHED_READBACK_VERIFIED');
    assert.equal(await readFile(rawPath, 'utf8'), markdown);
  } finally {
    const scratchParent = path.resolve(repoRoot, '.tmp/atlas');
    const relativeScratch = path.relative(scratchParent, scratchRoot);
    if (!relativeScratch || relativeScratch.startsWith('..') || path.isAbsolute(relativeScratch)) {
      throw new Error('TEST_CLEANUP_PATH_OUTSIDE_ATLAS_SCRATCH');
    }
    await rm(scratchRoot, { recursive: true, force: true });
  }
});
