import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coldArtifactHydrationRequestSchema,
  hydrateColdArtifact,
  sha256Text,
  uploadContentAddressedExternalArtifact,
} from '../dist/index.js';

class MemoryStore {
  constructor() {
    this.objects = new Map();
  }

  async putObject(input) {
    const key = `${input.bucket}/${input.objectKey}`;
    this.objects.set(key, {
      bytes: new Uint8Array(input.bytes),
      contentType: input.contentType,
      metadata: input.metadata ?? {},
    });
    return { etag: `etag:${input.bytes.byteLength}` };
  }

  async getObject(input) {
    const row = this.objects.get(`${input.bucket}/${input.objectKey}`);
    if (!row) throw new Error('not found');
    if (row.bytes.byteLength > input.maximumBytes) throw new Error('byte budget');
    return new Uint8Array(row.bytes);
  }

  async headObject(input) {
    const row = this.objects.get(`${input.bucket}/${input.objectKey}`);
    if (!row) throw new Error('not found');
    return {
      contentLength: row.bytes.byteLength,
      contentType: row.contentType,
      etag: `etag:${row.bytes.byteLength}`,
    };
  }
}

function requestFor(artifact, maximumBytes = artifact.artifact.content_length_bytes) {
  return coldArtifactHydrationRequestSchema.parse({
    request_id: `hydrate:${artifact.artifact.artifact_id}`,
    request_revision: 'hydrate-r1',
    reason: 'EXACT_SOURCE_PROMOTION',
    priority: 100,
    artifact_ref: artifact,
    expected_checksum: artifact.artifact.content_checksum,
    target: 'NVME_CONTENT_CACHE',
    maximum_bytes: maximumBytes,
    ttl_seconds: 600,
    queued_at_epoch_ms: 10,
  });
}

test('upload is content addressed and hydration verifies exact bytes', async () => {
  const store = new MemoryStore();
  const bytes = new TextEncoder().encode('# Qdrant\n\nBM25 uses IDF.');
  const artifact = await uploadContentAddressedExternalArtifact({
    store,
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'qdrant/docs',
    filename: 'normalized.md',
    bytes,
    contentType: 'text/markdown; charset=utf-8',
    artifactId: 'qdrant-page-r1-md',
    artifactRevision: 'qdrant-page-r1',
    artifactRole: 'NORMALIZED_MARKDOWN',
    sourceId: 'qdrant',
    sourceRevision: 'qdrant-r1',
    sourceUrl: 'https://qdrant.tech/documentation/',
    documentChecksum: sha256Text(new TextDecoder().decode(bytes)),
    indexableText: true,
    exactSourceEligible: true,
  });

  assert.match(artifact.artifact.object_key, /qdrant\/docs\/[a-f0-9]{2}\/[a-f0-9]{64}\/normalized\.md$/);
  assert.equal(artifact.artifact.content_checksum, sha256Text(new TextDecoder().decode(bytes)));

  const hydrated = await hydrateColdArtifact({
    store,
    request: requestFor(artifact),
    producerRevision: 'test-r1',
    completedAtEpochMs: 20,
  });
  assert.equal(hydrated.receipt.status, 'VERIFIED_READY');
  assert.deepEqual(hydrated.bytes, bytes);
  assert.equal(hydrated.receipt.observed_checksum, artifact.artifact.content_checksum);
});

test('same bytes resolve to same content-addressed storage path', async () => {
  const store = new MemoryStore();
  const common = {
    store,
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'firecrawl/docs',
    filename: 'raw.html',
    bytes: new TextEncoder().encode('<main>same</main>'),
    contentType: 'text/html',
    artifactRevision: 'page-r1',
    artifactRole: 'RAW_HTML',
    sourceId: 'firecrawl',
    sourceRevision: 'firecrawl-r1',
  };
  const first = await uploadContentAddressedExternalArtifact({ ...common, artifactId: 'first' });
  const second = await uploadContentAddressedExternalArtifact({ ...common, artifactId: 'second' });
  assert.equal(first.artifact.object_key, second.artifact.object_key);
  assert.equal(first.artifact.content_checksum, second.artifact.content_checksum);
});

test('tampered cold bytes fail checksum verification', async () => {
  const store = new MemoryStore();
  const artifact = await uploadContentAddressedExternalArtifact({
    store,
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'docs',
    filename: 'page.md',
    bytes: new TextEncoder().encode('trusted'),
    contentType: 'text/markdown',
    artifactId: 'artifact-1',
    artifactRevision: 'artifact-r1',
    artifactRole: 'NORMALIZED_MARKDOWN',
    sourceId: 'docs',
    sourceRevision: 'docs-r1',
  });
  const key = `${artifact.artifact.bucket}/${artifact.artifact.object_key}`;
  store.objects.get(key).bytes = new TextEncoder().encode('tampered');

  const hydrated = await hydrateColdArtifact({
    store,
    request: requestFor(artifact, 1024),
    producerRevision: 'test-r1',
  });
  assert.equal(hydrated.receipt.status, 'FAILED');
  assert.equal(hydrated.receipt.error_class, 'CHECKSUM_MISMATCH');
  assert.equal(hydrated.bytes, null);
});

test('missing cold object produces explicit S3 read failure receipt', async () => {
  const store = new MemoryStore();
  const artifact = await uploadContentAddressedExternalArtifact({
    store,
    endpointId: 'seaweed-local',
    bucket: 'atlas-docs',
    namespace: 'docs',
    filename: 'page.md',
    bytes: new TextEncoder().encode('temporary'),
    contentType: 'text/markdown',
    artifactId: 'artifact-2',
    artifactRevision: 'artifact-r1',
    artifactRole: 'NORMALIZED_MARKDOWN',
    sourceId: 'docs',
    sourceRevision: 'docs-r1',
  });
  store.objects.clear();

  const hydrated = await hydrateColdArtifact({
    store,
    request: requestFor(artifact),
    producerRevision: 'test-r1',
  });
  assert.equal(hydrated.receipt.status, 'FAILED');
  assert.equal(hydrated.receipt.error_class, 'S3_READ_FAILED');
});
