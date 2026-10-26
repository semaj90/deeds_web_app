import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyIndexedChunkReuseV1, resolveReusableIndexedChunkIdsV1 } from './indexed-chunk-reuse-v1.mjs';

const expected = (id, content = 'content-a', file = 'file-a') => ({
  qdrant_id: id,
  content_hash: content,
  file_hash: file,
});
const stored = (id, content = 'content-a', file = 'file-a') => ({
  qdrant_id: id,
  content_hash: content,
  file_content_hash: file,
});

test('reuses only exact chunk and whole-file hash matches', () => {
  assert.deepEqual(
    [...resolveReusableIndexedChunkIdsV1([expected('same')], [stored('same')])],
    ['same'],
  );
});

test('reindexes the same projection ID when chunk content changes', () => {
  assert.equal(resolveReusableIndexedChunkIdsV1([expected('same', 'new')], [stored('same')]).size, 0);
});

test('reindexes unchanged chunks when source file revision changes', () => {
  assert.equal(resolveReusableIndexedChunkIdsV1([expected('same', 'content-a', 'file-b')], [stored('same')]).size, 0);
});

test('reindexes an exact chunk when its verified diagnostic span is missing or stale', () => {
  const span = {
    status: 'BYTE_MATCH_NOT_ADMITTED',
    sourceRef: 'src/a.ts',
    sourceRevision: 'sha256:source',
    startByte: 4,
    endByte: 12,
    spanSha256: 'sha256:span',
  };
  const chunk = { ...expected('same'), metadata: { source_span: span } };
  assert.equal(resolveReusableIndexedChunkIdsV1([chunk], [stored('same')]).size, 0);
  assert.deepEqual(
    [...resolveReusableIndexedChunkIdsV1([chunk], [{ ...stored('same'), metadata: { source_span: span } }])],
    ['same'],
  );
});

test('ambiguous duplicate stored or expected identities are never reusable', () => {
  assert.equal(resolveReusableIndexedChunkIdsV1([expected('same')], [stored('same'), stored('same')]).size, 0);
  assert.equal(resolveReusableIndexedChunkIdsV1([expected('same'), expected('same')], [stored('same')]).size, 0);
});

test('missing hash fields and missing stored rows are never reusable', () => {
  assert.equal(resolveReusableIndexedChunkIdsV1([{ ...expected('same'), file_hash: null }], [stored('same')]).size, 0);
  assert.equal(resolveReusableIndexedChunkIdsV1([expected('missing')], []).size, 0);
});

test('reports deterministic non-reuse reasons without exposing chunk contents', () => {
  const cases = [
    [expected('missing'), [], 'STORED_ROW_MISSING'],
    [expected('changed', 'expected'), [stored('changed', 'stored')], 'CHUNK_CONTENT_HASH_MISMATCH'],
    [expected('file-changed', 'content-a', 'expected-file'), [stored('file-changed')], 'SOURCE_FILE_HASH_MISMATCH'],
    [{ ...expected('no-hash'), content_hash: null }, [stored('no-hash')], 'EXPECTED_HASH_UNAVAILABLE'],
  ];
  for (const [chunk, rows, status] of cases) {
    assert.deepEqual(classifyIndexedChunkReuseV1([chunk], rows), [{
      qdrant_id: chunk.qdrant_id,
      status,
      reusable: false,
    }]);
  }
});

test('unchanged hashes cannot hide absent or stale row revisions', () => {
  const sourceRevision = `sha256:${'a'.repeat(64)}`;
  const workspaceRevision = `sha256:${'b'.repeat(64)}`;
  const chunk = { ...expected('same'), source_revision: sourceRevision, workspace_revision: workspaceRevision };
  for (const source of [undefined, null, 'old-source']) {
    const result = classifyIndexedChunkReuseV1([chunk], [{ ...stored('same'), source_revision: source }]);
    assert.equal(result[0].status, 'SOURCE_REVISION_MISMATCH');
    assert.equal(result[0].reusable, false);
  }
  for (const workspace of [undefined, null, 'old-workspace']) {
    const result = classifyIndexedChunkReuseV1([chunk], [{
      ...stored('same'), source_revision: sourceRevision, workspace_revision: workspace,
    }]);
    assert.equal(result[0].status, 'WORKSPACE_REVISION_MISMATCH');
    assert.equal(result[0].reusable, false);
  }
  assert.equal(classifyIndexedChunkReuseV1([chunk], [{
    ...stored('same'), source_revision: sourceRevision, workspace_revision: workspaceRevision,
  }])[0].reusable, true);
});

test('projection IDs cannot qualify as canonical packet keys through a hash-only skip', () => {
  const result = classifyIndexedChunkReuseV1([expected('same')], [{
    ...stored('same'), metadata: { packet_key: 'same' },
  }]);
  assert.equal(result[0].status, 'PROJECTION_ID_MISLABELED_AS_PACKET_KEY');
  assert.equal(result[0].reusable, false);
});

test('the existing index writer reads row revisions and keeps unresolved packet identity null', () => {
  const source = readFileSync(new URL('../index-full-repo-for-search.mjs', import.meta.url), 'utf8');
  assert.match(source, /SELECT qdrant_id, content_hash, file_content_hash, source_revision, workspace_revision, metadata/);
  assert.doesNotMatch(source, /packet_key:\s*(?:qdrantId|chunk\.qdrant_id)/);
  assert.match(source, /packet_key:\s*null,\s*qdrant_id:\s*qdrantId/);
  assert.match(source, /packet_key:\s*null,\s*qdrant_id:\s*chunk\.qdrant_id/);
  assert.match(source, /metadata\s*= EXCLUDED\.metadata \|\| CASE/);
  assert.match(source, /jsonb_build_object\('packet_key', codebase_chunk_index\.metadata->'packet_key'\)/);
});
