import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildSveltekitDocsCorpusManifestV1 } from './sveltekit-docs-corpus-manifest-v1.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const raw = (name, bytes) => ({ path: `docs/.okf/pinned/sveltekit/raw/svelte.dev-docs-kit-${name}.md`, bytes: Buffer.from(bytes) });
const chunk = (id, page) => ({ chunk_id: id, source_url: `https://svelte.dev/docs/kit/${page}`, document_checksum: digest(page) });

test('builds a deterministic sorted manifest and verifies page coverage', () => {
  const chunks = Buffer.from(`${JSON.stringify(chunk('a', 'load'))}\n${JSON.stringify(chunk('b', 'hooks'))}\n`);
  const first = buildSveltekitDocsCorpusManifestV1({ rawFiles: [raw('hooks', 'h'), raw('load', 'l')], chunksFileBytes: chunks });
  const reversed = buildSveltekitDocsCorpusManifestV1({ rawFiles: [raw('load', 'l'), raw('hooks', 'h')], chunksFileBytes: chunks });
  assert.equal(first.status, 'MANIFEST_VALID');
  assert.deepEqual(first.files.map(file => file.page), ['hooks', 'load']);
  assert.equal(first.corpusSha256, reversed.corpusSha256);
  assert.deepEqual(first.coverage, { rawPageCount: 2, chunkPageCount: 2, missingFromChunks: [], missingFromRaw: [] });
  assert.equal(first.datastoreWritesCommitted, 0);
});

test('reports rather than guesses raw and chunk page mismatches', () => {
  const manifest = buildSveltekitDocsCorpusManifestV1({ rawFiles: [raw('load', 'l'), raw('hooks', 'h')],
    chunksFileBytes: Buffer.from(`${JSON.stringify(chunk('a', 'load'))}\n${JSON.stringify(chunk('c', 'form-actions'))}\n`) });
  assert.equal(manifest.status, 'PAGE_COVERAGE_MISMATCH');
  assert.deepEqual(manifest.coverage.missingFromChunks, ['hooks']);
  assert.deepEqual(manifest.coverage.missingFromRaw, ['form-actions']);
});

test('rejects malformed JSONL, out-of-scope URLs, and duplicate raw pages', () => {
  assert.throws(() => buildSveltekitDocsCorpusManifestV1({ rawFiles: [raw('load', 'l')], chunksFileBytes: Buffer.from('{bad}\n') }), /CHUNKS_JSONL_INVALID/);
  assert.throws(() => buildSveltekitDocsCorpusManifestV1({ rawFiles: [raw('load', 'l')], chunksFileBytes: Buffer.from(`${JSON.stringify({ ...chunk('a', 'load'), source_url: 'https://evil.example/docs/kit/load' })}\n`) }), /CHUNK_URL_OUT_OF_SCOPE/);
  assert.throws(() => buildSveltekitDocsCorpusManifestV1({ rawFiles: [raw('load', 'a'), raw('load', 'b')], chunksFileBytes: Buffer.from('') }), /RAW_PAGE_DUPLICATE/);
});
