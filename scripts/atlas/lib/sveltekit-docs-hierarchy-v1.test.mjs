import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSveltekitDocsHierarchyV1 } from './sveltekit-docs-hierarchy-v1.mjs';

test('maps pages through pinned GitHub source metadata, not repeated chunk headings', () => {
  const report = buildSveltekitDocsHierarchyV1({
    rawFiles: [{ path: 'docs/raw/svelte.dev-docs-kit-load.md', text: '# Loading data\nText' }],
    metadataFiles: [{
      resolved_url: 'https://svelte.dev/docs/kit/load',
      outgoing_urls: ['https://github.com/sveltejs/kit/edit/main/documentation/docs/20-core-concepts/20-load.md'],
    }],
    chunkRows: [{ source_url: 'https://svelte.dev/docs/kit/load', chunk_id: 'load:0', heading_path: ['Getting started'] }],
  });
  assert.equal(report.status, 'HIERARCHY_MAPPED_WITH_COHORT_LIMITS');
  assert.equal(report.pages[0].status, 'MAPPED_FROM_PINNED_SOURCE_METADATA');
  assert.equal(report.pages[0].section, 'Core concepts');
  assert.equal(report.pages[0].title, 'Loading data');
  assert.equal(report.datastoreWritesCommitted, 0);
});

test('keeps missing source metadata unresolved and reports reference-only URLs', () => {
  const report = buildSveltekitDocsHierarchyV1({
    rawFiles: [{ path: 'raw/svelte.dev-docs-kit-hooks.md', text: '# Hooks\nText' }],
    metadataFiles: [{
      resolved_url: 'https://svelte.dev/docs/kit/hooks',
      outgoing_urls: ['https://svelte.dev/docs/kit/$app-state'],
    }],
    chunkRows: [{ source_url: 'https://svelte.dev/docs/kit/hooks', chunk_id: 'hooks:0', heading_path: ['Advanced'] }],
  });
  assert.equal(report.pages[0].status, 'UNRESOLVED');
  assert.equal(report.navGroups.find(group => group.name === 'Advanced').status, 'NO_PINNED_PAGE_IN_COHORT');
  assert.deepEqual(report.referenceOnlyUnpinnedLinks.map(item => item.url), ['https://svelte.dev/docs/kit/$app-state']);
  assert.equal(report.status, 'HIERARCHY_PARTIAL');
});
