import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coldArtifactHydrationReceiptSchema,
  coldArtifactHydrationRequestSchema,
  contentAddressedObjectKey,
  docCitationSnapshotSchema,
  externalDocArtifactRefSchema,
  externalDocsStorageSearchPolicySchema,
  legacyRepositoryArchiveManifestSchema,
  orderHydrationQueue,
} from '../dist/core/external-doc-cold-fabric.js';

const h = (char) => char.repeat(64);
const commit = 'e'.repeat(40);

function s3Artifact(overrides = {}) {
  return {
    artifact_id: 'artifact-1',
    artifact_revision: 'artifact-r1',
    backend: 'SEAWEEDFS_S3',
    endpoint_id: 'seaweed-local',
    bucket: 'atlas-docs',
    object_key: `qdrant/${h('a').slice(0, 2)}/${h('a')}/normalized.md`,
    content_checksum: h('a'),
    content_length_bytes: 1024,
    media_type: 'text/markdown',
    storage_class: 'COLD_ARCHIVE',
    ...overrides,
  };
}

function externalArtifact(overrides = {}) {
  return externalDocArtifactRefSchema.parse({
    artifact_role: 'NORMALIZED_MARKDOWN',
    source_id: 'qdrant',
    source_revision: 'qdrant-docs-r1',
    document_checksum: h('b'),
    source_url: 'https://qdrant.tech/documentation/',
    artifact: s3Artifact(),
    indexable_text: true,
    exact_source_eligible: true,
    ...overrides,
  });
}

test('content-addressed keys shard by checksum prefix and preserve checksum directory', () => {
  assert.equal(
    contentAddressedObjectKey({ namespace: 'qdrant', checksum: h('c'), filename: 'page.html' }),
    `qdrant/cc/${h('c')}/page.html`,
  );
});

test('screenshot artifacts require image media type', () => {
  assert.throws(() => externalDocArtifactRefSchema.parse({
    artifact_role: 'SCREENSHOT',
    source_id: 'firecrawl',
    source_revision: 'firecrawl-r1',
    document_checksum: h('d'),
    source_url: 'https://docs.firecrawl.dev/',
    artifact: s3Artifact({ media_type: 'text/html' }),
  }));
});

test('citation snapshots bind exact text span to optional visual evidence', () => {
  const screenshot = externalArtifact({
    artifact_role: 'SCREENSHOT',
    artifact: s3Artifact({
      artifact_id: 'shot-1',
      media_type: 'image/webp',
      object_key: `firecrawl/dd/${h('d')}/page.webp`,
      content_checksum: h('d'),
    }),
  });
  const citation = docCitationSnapshotSchema.parse({
    citation_id: 'citation-1',
    citation_revision: 'citation-r1',
    source_id: 'qdrant',
    source_revision: 'qdrant-docs-r1',
    source_url: 'https://qdrant.tech/documentation/',
    document_checksum: h('b'),
    heading_path: ['Documentation', 'Storage'],
    start_char: 10,
    end_char: 80,
    snippet_checksum: h('e'),
    fetch_receipt_id: 'fetch-1',
    authority_class: 'OFFICIAL_PRIMARY',
    screenshot_artifact: screenshot,
    screenshot_clip: { x: 10, y: 20, width: 300, height: 120 },
  });
  assert.equal(citation.exact_source_promotion_required, true);
});

test('hydration request refuses checksum aliases and undersized byte budgets', () => {
  const artifact = externalArtifact();
  assert.throws(() => coldArtifactHydrationRequestSchema.parse({
    request_id: 'hydrate-1',
    request_revision: 'hydrate-r1',
    reason: 'QUERY_FALLBACK',
    priority: 80,
    artifact_ref: artifact,
    expected_checksum: h('f'),
    target: 'NVME_CONTENT_CACHE',
    maximum_bytes: 2048,
    ttl_seconds: 300,
    queued_at_epoch_ms: 100,
  }));
  assert.throws(() => coldArtifactHydrationRequestSchema.parse({
    request_id: 'hydrate-2',
    request_revision: 'hydrate-r1',
    reason: 'QUERY_FALLBACK',
    priority: 80,
    artifact_ref: artifact,
    expected_checksum: h('a'),
    target: 'NVME_CONTENT_CACHE',
    maximum_bytes: 512,
    ttl_seconds: 300,
    queued_at_epoch_ms: 100,
  }));
});

test('verified hydration requires observed checksum equality', () => {
  assert.throws(() => coldArtifactHydrationReceiptSchema.parse({
    receipt_id: 'receipt-1',
    request_id: 'hydrate-1',
    request_revision: 'hydrate-r1',
    artifact_id: 'artifact-1',
    target: 'NVME_CONTENT_CACHE',
    expected_checksum: h('a'),
    observed_checksum: h('b'),
    hydrated_bytes: 1024,
    cache_key: `sha256/${h('a')}`,
    status: 'VERIFIED_READY',
    completed_at_epoch_ms: 200,
    producer_revision: 'test-r1',
  }));
});

test('hydration queue is deterministic: priority, age, then request id', () => {
  const artifact = externalArtifact();
  const make = (request_id, priority, queued_at_epoch_ms) => coldArtifactHydrationRequestSchema.parse({
    request_id,
    request_revision: 'hydrate-r1',
    reason: 'QUERY_FALLBACK',
    priority,
    artifact_ref: artifact,
    expected_checksum: h('a'),
    target: 'NVME_CONTENT_CACHE',
    maximum_bytes: 1024,
    ttl_seconds: 300,
    queued_at_epoch_ms,
  });
  assert.deepEqual(
    orderHydrationQueue([
      make('r3', 80, 20),
      make('r2', 90, 20),
      make('r1', 90, 10),
    ]).map((row) => row.request_id),
    ['r1', 'r2', 'r3'],
  );
});

test('storage policy keeps live Qdrant on local POSIX NVMe and BM25 as sparse owner', () => {
  const policy = externalDocsStorageSearchPolicySchema.parse({
    policy_revision: 'docs-storage-r1',
    manifest_root: 'docs/.okf',
    bulky_artifact_backend: 'SEAWEEDFS_S3',
    live_qdrant_storage: 'LOCAL_POSIX_NVME',
    qdrant_snapshot_backend: 'SEAWEEDFS_S3',
    production_sparse_owner: 'QDRANT_BM25_IDF',
    fallback_order: [
      'LOCAL_EXACT',
      'LEXICAL_BM25',
      'SEMANTIC',
      'NVME_CONTENT_CACHE',
      'SEAWEED_S3_HYDRATION',
      'WEB_DISCOVERY',
    ],
  });
  assert.deepEqual(policy.sparse_challengers, ['BM42_EXPERIMENTAL']);
  assert.equal(policy.qdrant_memory.quantized_vectors, 'PINNED');
  assert.equal(policy.qdrant_memory.dense_vectors, 'COLD');
});

test('legacy repository archive is on-demand evidence, never current worktree authority', () => {
  const archive = externalArtifact({
    artifact_role: 'REPOSITORY_ARCHIVE',
    source_id: 'deeds_lab',
    source_revision: commit,
    source_url: 'https://github.com/semaj90/deeds_lab',
    artifact: s3Artifact({
      artifact_id: 'deeds-lab-archive',
      object_key: `legacy/deeds_lab/${commit}/repo.tar.zst`,
      content_checksum: h('f'),
      content_length_bytes: 10_000,
      media_type: 'application/zstd',
    }),
  });
  const manifest = legacyRepositoryArchiveManifestSchema.parse({
    manifest_revision: 'deeds-lab-archive-r1',
    repository_full_name: 'semaj90/deeds_lab',
    repository_commit_sha: commit,
    source_revision: commit,
    okf_namespace: 'docs/.okf/legacy/deeds_lab',
    archive_artifact: archive,
    include_paths: ['**/*.ts', '**/*.md'],
    exclude_paths: ['node_modules/**', '.git/**'],
  });
  assert.equal(manifest.hydrate_on_demand, true);
  assert.equal(manifest.index_current_worktree_as_authority, false);
});
