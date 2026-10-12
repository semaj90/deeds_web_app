import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qualifySymbolTocRowV1, verifySymbolTocAgainstSourceBindingV1, verifySymbolTocExactReaderReadbackV1, verifySymbolTocSourceBytesV1 } from './symbol-toc-row-qualification-v1.mjs';

const revision = `sha256:${'a'.repeat(64)}`;
const symbol = {
  symbol_version_id: 'version:one', stable_symbol_id: 'stable:one', packet_key: 'packet:one',
  source_ref: 'src/a.ts', source_revision: revision, workspace_revision: revision,
  symbol_kind: 'function', qualified_name: 'module.run', byte_start: '5', byte_end: '20',
};
const candidate = {
  packetKey: 'packet:one', sourceRef: 'src/a.ts', sourceRevision: revision,
  workspaceRevision: revision, candidateOrdinal: 0,
};

test('qualifies an exact revision-bound symbol projection row without admitting evidence', () => {
  const result = qualifySymbolTocRowV1({ symbol, candidate });
  assert.equal(result.status, 'PROJECTION_CANDIDATE_NOT_ADMITTED');
  assert.equal(result.row.candidateOrdinal, 0);
  assert.equal(result.row.byteStart, 5);
});

test('blocks import snippets masquerading as function names', () => {
  const result = qualifySymbolTocRowV1({ symbol: { ...symbol, qualified_name: "import { x } from 'x'" }, candidate });
  assert.deepEqual(result, { status: 'BLOCKED', reason: 'QUALIFIED_NAME_NOT_DECLARATION' });
});

test('blocks cross-packet and stale revision joins', () => {
  assert.equal(qualifySymbolTocRowV1({ symbol, candidate: { ...candidate, packetKey: 'packet:other' } }).reason, 'CANDIDATE_IDENTITY_MISMATCH');
  assert.equal(qualifySymbolTocRowV1({ symbol, candidate: { ...candidate, sourceRevision: `sha256:${'b'.repeat(64)}` } }).reason, 'SOURCE_OR_WORKSPACE_REVISION_MISMATCH');
});

test('blocks missing ordinals, invalid spans, and unsupported kinds', () => {
  assert.equal(qualifySymbolTocRowV1({ symbol, candidate: { ...candidate, candidateOrdinal: null } }).reason, 'CANDIDATE_ORDINAL_UNAVAILABLE');
  assert.equal(qualifySymbolTocRowV1({ symbol: { ...symbol, byte_end: '5' }, candidate }).reason, 'SYMBOL_BYTE_SPAN_INVALID');
  assert.equal(qualifySymbolTocRowV1({ symbol: { ...symbol, byte_start: null }, candidate }).reason, 'SYMBOL_BYTE_SPAN_INVALID');
  assert.equal(qualifySymbolTocRowV1({ symbol: { ...symbol, symbol_kind: 'import' }, candidate }).reason, 'UNSUPPORTED_STRUCTURAL_SYMBOL_KIND');
});

test('matches source bytes and a multibyte-safe symbol span without admitting evidence', () => {
  const source = Buffer.from('const café = "☕";\nfunction run() { return "✅"; }\n', 'utf8');
  const symbolText = 'function run() { return "✅"; }';
  const byteStart = Buffer.byteLength('const café = "☕";\n', 'utf8');
  const byteEnd = byteStart + Buffer.byteLength(symbolText, 'utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  const result = verifySymbolTocSourceBytesV1({
    symbol: { ...symbol, source_revision: sourceRevision, byte_start: String(byteStart), byte_end: String(byteEnd) },
    candidate: { ...candidate, sourceRevision },
    sourceBytes: source,
  });

  assert.equal(result.status, 'BYTE_IDENTITY_MATCH_NOT_ADMITTED');
  assert.equal(result.sourceBindingAuthority, 'NOT_VERIFIED');
  assert.equal(result.row.byteStart, byteStart);
  assert.equal(result.row.byteEnd, byteEnd);
  assert.equal(result.spanChecksum, `sha256:${createHash('sha256').update(source.subarray(byteStart, byteEnd)).digest('hex')}`);
});

test('source-byte verification blocks missing and stale bytes', () => {
  assert.equal(verifySymbolTocSourceBytesV1({ symbol, candidate, sourceBytes: null }).reason, 'SOURCE_BYTES_REQUIRED');
  assert.equal(verifySymbolTocSourceBytesV1({ symbol, candidate, sourceBytes: Buffer.from('stale') }).reason, 'SOURCE_BYTES_REVISION_MISMATCH');
});

test('source-byte verification rejects invalid UTF-8 and spans cutting a multibyte sequence', () => {
  const source = Buffer.from('function run() { return "✅"; }', 'utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  const bound = { ...symbol, source_revision: sourceRevision };
  const boundCandidate = { ...candidate, sourceRevision };
  const split = verifySymbolTocSourceBytesV1({
    symbol: { ...bound, byte_start: String(source.indexOf(0xe2) + 1), byte_end: String(source.length) },
    candidate: boundCandidate,
    sourceBytes: source,
  });
  assert.equal(split.reason, 'SYMBOL_SPAN_NOT_UTF8_BOUNDARY');

  const invalid = Buffer.from([0xff, 0x66, 0x6f, 0x6f]);
  const invalidRevision = `sha256:${createHash('sha256').update(invalid).digest('hex')}`;
  const malformed = verifySymbolTocSourceBytesV1({
    symbol: { ...symbol, source_revision: invalidRevision, byte_start: '0', byte_end: '2' },
    candidate: { ...candidate, sourceRevision: invalidRevision },
    sourceBytes: invalid,
  });
  assert.equal(malformed.reason, 'SOURCE_BYTES_INVALID_UTF8');
});

test('canonical binding bridge requires exact context and remains non-admitted', () => {
  const source = Buffer.from('function run() {}', 'utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  const boundSymbol = { ...symbol, source_revision: sourceRevision, byte_start: '0', byte_end: String(source.length) };
  const boundCandidate = { ...candidate, sourceRevision };
  const sourceBinding = {
    sourceRevision,
    contentDigest: sourceRevision,
    byteLength: source.length,
    bindingChecksum: `sha256:${'c'.repeat(64)}`,
  };
  const input = {
    symbol: boundSymbol,
    candidate: boundCandidate,
    sourceBytes: source,
    sourceBinding,
    bindingContext: { sourceRef: candidate.sourceRef, workspaceRevision: candidate.workspaceRevision },
  };

  const result = verifySymbolTocAgainstSourceBindingV1(input);
  assert.equal(result.status, 'SOURCE_BINDING_AND_SPAN_MATCH_NOT_ADMITTED');
  assert.equal(result.sourceBindingAuthority, 'RESOLVED_BINDING_BYTES_MATCHED_NOT_AUTHORITY');
  assert.equal(verifySymbolTocAgainstSourceBindingV1({ ...input, bindingContext: { ...input.bindingContext, sourceRef: 'src/other.ts' } }).reason, 'CANONICAL_SOURCE_BINDING_MISMATCH');
  assert.equal(verifySymbolTocAgainstSourceBindingV1({ ...input, sourceBinding: { ...sourceBinding, sourceRevision: revision } }).reason, 'CANONICAL_SOURCE_BINDING_MISMATCH');
  assert.equal(verifySymbolTocAgainstSourceBindingV1({ ...input, sourceBytes: Buffer.from('stale') }).reason, 'BLOCKED_DIGEST_MISMATCH');
});

test('exact source-reader readback must match full-file and exact-span digests', () => {
  const source = Buffer.from('function run() {}', 'utf8');
  const sourceRevision = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  const spanChecksum = `sha256:${createHash('sha256').update(source).digest('hex')}`;
  const input = {
    symbol: { ...symbol, source_revision: sourceRevision, byte_start: '0', byte_end: String(source.length) },
    candidate: { ...candidate, sourceRevision },
    sourceBytes: source,
    readerResult: {
      file_found: true,
      file_sha256: sourceRevision.slice('sha256:'.length),
      file_byte_length: source.length,
      span_found: true,
      span_sha256: spanChecksum.slice('sha256:'.length),
      span_byte_length: source.length,
      span_utf8_valid: true,
      evidence_ref: 'workspace-bytes:src/a.ts:0-17',
    },
  };

  assert.equal(verifySymbolTocExactReaderReadbackV1(input).status, 'EXACT_SOURCE_READER_MATCH_NOT_ADMITTED');
  assert.equal(verifySymbolTocExactReaderReadbackV1({ ...input, readerResult: { ...input.readerResult, span_sha256: '0'.repeat(64) } }).reason, 'EXACT_SOURCE_READER_SPAN_MISMATCH');
  assert.equal(verifySymbolTocExactReaderReadbackV1({ ...input, readerResult: { ...input.readerResult, span_utf8_valid: false } }).reason, 'EXACT_SOURCE_READER_SPAN_MISMATCH');
  assert.equal(verifySymbolTocExactReaderReadbackV1({ ...input, readerResult: { ...input.readerResult, file_sha256: '0'.repeat(64) } }).reason, 'EXACT_SOURCE_READER_REVISION_MISMATCH');
  assert.equal(verifySymbolTocExactReaderReadbackV1({ ...input, readerResult: { ...input.readerResult, file_found: false } }).reason, 'EXACT_SOURCE_READER_READBACK_UNAVAILABLE');
});
