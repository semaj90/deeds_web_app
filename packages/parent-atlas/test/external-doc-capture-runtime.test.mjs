import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveExternalDocCapture,
  externalDocPageCaptureSchema,
  sha256Text,
} from '../dist/index.js';

class MemoryStore {
  constructor() { this.objects = new Map(); }
  async putObject(input) {
    this.objects.set(`${input.bucket}/${input.objectKey}`, { ...input, bytes: new Uint8Array(input.bytes) });
    return { etag: `etag-${input.bytes.byteLength}` };
  }
  async getObject(input) {
    const row = this.objects.get(`${input.bucket}/${input.objectKey}`);
    if (!row) throw new Error('not found');
    return new Uint8Array(row.bytes);
  }
  async headObject(input) {
    const row = this.objects.get(`${input.bucket}/${input.objectKey}`);
    if (!row) throw new Error('not found');
    return { contentLength: row.bytes.byteLength, contentType: row.contentType, etag: `etag-${row.bytes.byteLength}` };
  }
}

function capture(overrides = {}) {
  return externalDocPageCaptureSchema.parse({
    capture_id: 'capture-1',
    source_id: 'qdrant',
    source_revision: 'docs-r1',
    requested_url: 'https://qdrant.tech/documentation/search/text-search/full-text-search/',
    resolved_url: 'https://qdrant.tech/documentation/search/text-search/full-text-search/',
    title: 'Full-Text Search',
    language: 'en',
    http_status: 200,
    fetched_at: '2026-08-19T20:00:00.000Z',
    markdown: '# Full-Text Search\n\nBM25 uses inverse document frequency.',
    raw_html: '<main><h1>Full-Text Search</h1><p>BM25 uses inverse document frequency.</p></main>',
    screenshot_bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    screenshot_media_type: 'image/png',
    outgoing_urls: ['https://qdrant.tech/documentation/manage-data/indexing/'],
    change_status: 'changed',
    ...overrides,
  });
}

test('capture archives text, raw source and screenshot as independently addressed objects', async () => {
  const store = new MemoryStore();
  const archived = await archiveExternalDocCapture({
    store,
    capture: capture(),
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'qdrant/full-text-search',
    parserRevision: 'firecrawl-v2-r1',
    producerRevision: 'test-r1',
  });

  assert.equal(archived.document_checksum, sha256Text(capture().markdown));
  assert.equal(archived.fetch_receipt.fetcher, 'FIRECRAWL_V2');
  assert.equal(archived.normalized_markdown_artifact.artifact_role, 'NORMALIZED_MARKDOWN');
  assert.equal(archived.raw_html_artifact.artifact_role, 'RAW_HTML');
  assert.equal(archived.screenshot_artifact.artifact_role, 'SCREENSHOT');
  assert.equal(store.objects.size, 3);
  assert.notEqual(archived.normalized_markdown_artifact.artifact.content_checksum, archived.raw_html_artifact.artifact.content_checksum);
  assert.notEqual(archived.screenshot_artifact.artifact.content_checksum, archived.normalized_markdown_artifact.artifact.content_checksum);
});

test('same normalized markdown retains document identity when only screenshot changes', async () => {
  const store = new MemoryStore();
  const first = await archiveExternalDocCapture({
    store,
    capture: capture(),
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'qdrant/full-text-search',
    parserRevision: 'firecrawl-v2-r1',
    producerRevision: 'test-r1',
  });
  const second = await archiveExternalDocCapture({
    store,
    capture: capture({
      capture_id: 'capture-2',
      screenshot_bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]),
    }),
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'qdrant/full-text-search',
    parserRevision: 'firecrawl-v2-r1',
    producerRevision: 'test-r1',
  });

  assert.equal(first.document_checksum, second.document_checksum);
  assert.equal(first.normalized_markdown_artifact.artifact.object_key, second.normalized_markdown_artifact.artifact.object_key);
  assert.notEqual(first.screenshot_artifact.artifact.object_key, second.screenshot_artifact.artifact.object_key);
  assert.notEqual(first.capture_checksum, second.capture_checksum);
});

test('capture refuses screenshot bytes without media type', () => {
  assert.throws(() => capture({ screenshot_media_type: null }));
});
