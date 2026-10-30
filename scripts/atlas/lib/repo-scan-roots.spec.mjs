import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipIndexPath } from './repo-scan-roots.mjs';

test('excludes generated report corpora by default while retaining normal docs', () => {
  assert.equal(shouldSkipIndexPath('docs/reports'), true);
  assert.equal(shouldSkipIndexPath('docs/reports/openspec-evidence/receipt.json'), true);
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/docs/reports/graph-probe.json'), true);
  assert.equal(shouldSkipIndexPath('docs/architecture/retrieval.md'), false);
});

test('excludes derived graph outputs, model assets, and Graphify GDS artifacts', () => {
  assert.equal(shouldSkipIndexPath('docs/graph/codebase-graph.json'), true);
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/docs/graph/deep-import-graph.json'), true);
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/static/models/embeddinggemma/tokenizer.json'), true);
  assert.equal(shouldSkipIndexPath('scripts/memory/graphify/gds/latest.json'), true);
  assert.equal(shouldSkipIndexPath('docs/architecture/retrieval.md'), false);
});

test('keeps uploaded case material out of repository code indexing', () => {
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/uploads/audio/test-audio.json'), true);
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/uploads/transcriptions/transcript.md'), true);
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/src/lib/components/evidence/Upload.svelte'), false);
});

test('allows an explicit report opt-in without bypassing other ignore rules', () => {
  assert.equal(shouldSkipIndexPath('docs\\reports\\receipt.json', { includeDocReports: true }), false);
  assert.equal(shouldSkipIndexPath('docs/reports/.generated/receipt.json', { includeDocReports: true }), true);
  assert.equal(shouldSkipIndexPath('sveltekit-frontend/node_modules/pkg/index.js', { includeDocReports: true }), true);
});
