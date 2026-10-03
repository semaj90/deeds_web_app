import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPosTextEvidenceV1 } from '../dist/core/pos-text-evidence-v1.js';

const source = Buffer.from('// 🙂 cache invalidation policy', 'utf8');
const start = Buffer.byteLength('// 🙂 ', 'utf8');
const end = source.byteLength;
const base = {
  source_ref: 'repo:src/cache.ts',
  source_revision: 'sha256:source-1',
  workspace_revision: 'sha256:workspace-1',
  source_bytes: source,
  region_kind: 'COMMENT',
  region_start_byte: start,
  region_end_byte: end,
  provider: 'spacy',
  provider_revision: 'spacy:3.8.7;model:en_core_web_sm:3.8.0',
  coordinate_basis: 'UTF8_BYTES',
  tokens: [{ text: 'cache', lemma: 'cache', pos: 'NOUN', tag: 'NN', dependency: 'compound', start_byte: start, end_byte: start + 5 }],
};

test('POS evidence binds exact source bytes, UTF-8 token span, provider and revisions', () => {
  const evidence = buildPosTextEvidenceV1(base);
  assert.equal(evidence.tokens[0].text, 'cache');
  assert.equal(evidence.identity.workspace_revision, 'sha256:workspace-1');
  assert.equal(evidence.canonical_authority, false);
  assert.match(evidence.region_digest, /^[a-f0-9]{64}$/);
});

test('rejects token coordinates that do not ground to the original bytes', () => {
  assert.throws(() => buildPosTextEvidenceV1({
    ...base,
    tokens: [{ ...base.tokens[0], start_byte: start + 1 }],
  }), /POS_TOKEN_TEXT_SPAN_MISMATCH/);
});

test('rejects token outside caller-identified text region', () => {
  assert.throws(() => buildPosTextEvidenceV1({
    ...base,
    tokens: [{ ...base.tokens[0], start_byte: 0, end_byte: 5, text: '// 🙂' }],
  }), /POS_TOKEN_OUTSIDE_GROUNDED_REGION/);
});

test('rejects mutable provider aliases and unsupported coordinate bases', () => {
  assert.throws(() => buildPosTextEvidenceV1({ ...base, provider_revision: 'latest' }), /POS_PROVIDER_REVISION_NOT_IMMUTABLE/);
  assert.throws(() => buildPosTextEvidenceV1({ ...base, coordinate_basis: 'CHARACTERS' }), /POS_COORDINATE_BASIS_UNSUPPORTED/);
});
