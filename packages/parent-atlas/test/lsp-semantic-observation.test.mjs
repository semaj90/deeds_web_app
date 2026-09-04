import test from 'node:test';
import assert from 'node:assert/strict';

import { alignLspTargetByteRanges, decodeUtf8Strict, lspRangeToUtf8ByteRange, lspSemanticObservationSchema, synthesizeLspStructuralReference, verifyLspSourceByteSpan, verifyLspUtf8ByteSpan } from '../dist/core/lsp-semantic-observation.js';
import { createHash } from 'node:crypto';

const fact = {
  schema: 'atlas.structural-reference-fact.v1', reference_id: 'ref:call-1', reference_kind: 'call',
  source_ref: 'src/a.ts', source_revision: 'sha256:source-a', workspace_revision: 'sha256:workspace-a',
  upstream_source_node_id: 'node:source', upstream_target_node_id: 'node:target', upstream_chunk_id: 'chunk:source',
  target_text: 'authorizeCase', resolution_status: 'unresolved', captures: {}, evidence_refs: ['evidence:xref'],
  extractor: 'treesitter_chunker', extractor_revision: 'treesitter-chunker:test',
};

const observation = {
  observation_id: 'lsp:definition:1', reference_id: 'ref:call-1', source_ref: 'src/a.ts', source_tree_node_id: null, source_revision: 'sha256:source-a',
  workspace_revision: 'sha256:workspace-a', server_id: 'typescript-language-server', server_revision: 'tsls:test',
  project_revision: 'tsconfig:test', project_config_checksum: `sha256:${'a'.repeat(64)}`, capability_checksum: `sha256:${'b'.repeat(64)}`, position_encoding: 'utf-16',
  operation: 'DEFINITION', source_range: { start: { line: 3, character: 10 }, end: { line: 3, character: 23 } },
  target_uri: 'file:///workspace/src/auth.ts', target_source_ref: 'src/auth.ts', target_range: { start: { line: 8, character: 16 }, end: { line: 8, character: 29 } },
  target_text: 'authorizeCase', target_upstream_node_id: null, result_status: 'resolved', evidence_refs: ['evidence:lsp'], canonical_authority: false,
  checksum: `sha256:${'c'.repeat(64)}`,
};

test('LSP enriches an unresolved structural fact without canonical authority', () => {
  const result = synthesizeLspStructuralReference(fact, observation, 'lsp-adapter:test');
  assert.equal(result.resolution_status, 'resolved');
  assert.equal(result.resolution_basis, 'lsp_definition');
  assert.equal(result.canonical_authority, false);
  assert.deepEqual(result.evidence_refs, ['evidence:lsp', 'evidence:xref']);
});

test('LSP results cannot cross source or workspace revisions', () => {
  assert.throws(() => synthesizeLspStructuralReference(fact, { ...observation, source_revision: 'sha256:other' }, 'lsp:test'), /LSP_SOURCE_REVISION_MISMATCH/);
  assert.throws(() => synthesizeLspStructuralReference(fact, { ...observation, workspace_revision: 'sha256:other' }, 'lsp:test'), /LSP_WORKSPACE_REVISION_MISMATCH/);
});

test('LSP position encoding maps Unicode ranges to UTF-8 bytes', () => {
  const source = 'alpha\nλ😀target';
  const range = { start: { line: 1, character: 3 }, end: { line: 1, character: 9 } };
  assert.deepEqual(lspRangeToUtf8ByteRange(source, range, 'utf-16'), { byte_start: 12, byte_end: 18 });
  assert.deepEqual(lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 6 }, end: { line: 1, character: 12 } }, 'utf-8'), { byte_start: 12, byte_end: 18 });
  assert.throws(() => lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 3 }, end: { line: 1, character: 3 } }, 'utf-8'), /LSP_POSITION_SPLITS_CODE_POINT/);
  assert.throws(() => lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 2 }, end: { line: 1, character: 2 } }, 'utf-16'), /LSP_POSITION_SPLITS_CODE_POINT/);
});

test('LSP key/value alignment preserves source identity and negotiated encoding', () => {
  const parsed = lspSemanticObservationSchema.parse(observation);
  const alignment = {
    sourceRef: parsed.source_ref,
    sourceRevision: parsed.source_revision,
    workspaceRevision: parsed.workspace_revision,
    serverRevision: parsed.server_revision,
    capabilityChecksum: parsed.capability_checksum,
    positionEncoding: parsed.position_encoding,
    targetSourceRef: parsed.target_source_ref,
  };

  assert.deepEqual(alignment, {
    sourceRef: 'src/a.ts',
    sourceRevision: 'sha256:source-a',
    workspaceRevision: 'sha256:workspace-a',
    serverRevision: 'tsls:test',
    capabilityChecksum: `sha256:${'b'.repeat(64)}`,
    positionEncoding: 'utf-16',
    targetSourceRef: 'src/auth.ts',
  });
  assert.equal(parsed.canonical_authority, false);
});

test('LSP UTF-8 output span is validated against exact source bytes', () => {
  const sourceBuffer = Buffer.from('const λ = "😀";\n', 'utf8');
  const start = sourceBuffer.indexOf(Buffer.from('😀', 'utf8'));
  const end = start + Buffer.byteLength('😀', 'utf8');
  assert.deepEqual(verifyLspUtf8ByteSpan(sourceBuffer, { byte_start: start, byte_end: end, expected_text: '😀' }), {
    byte_start: start,
    byte_end: end,
    text: '😀',
  });
  assert.throws(() => verifyLspUtf8ByteSpan(sourceBuffer, { byte_start: start, byte_end: end, expected_text: '😃' }), /LSP_BYTE_SPAN_TEXT_MISMATCH/);
  assert.throws(() => verifyLspUtf8ByteSpan(sourceBuffer, { byte_start: start + 1, byte_end: end, expected_text: '😀' }), /LSP_BYTE_SPAN_SPLITS_UTF8_SEQUENCE/);
});

test('LSP coordinate codec preserves CRLF and UTF-32 byte alignment', () => {
  const source = 'a\r\nλ😀';
  assert.deepEqual(lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 1 }, end: { line: 1, character: 3 } }, 'utf-16'), {
    byte_start: 5,
    byte_end: 9,
  });
  assert.deepEqual(lspRangeToUtf8ByteRange(source, { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } }, 'utf-32'), {
    byte_start: 5,
    byte_end: 9,
  });
});

test('LSP target range alignment requires an exact target source revision', () => {
  const aligned = alignLspTargetByteRanges({
    target_source_ref: 'src/target.ts',
    target_source_revision: 'sha256:target',
    source_text: 'const λ = "😀";\n',
    position_encoding: 'utf-16',
    target_range: { start: { line: 0, character: 8 }, end: { line: 0, character: 10 } },
    target_selection_range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
  });
  assert.deepEqual(aligned.target_byte_range, { byte_start: 9, byte_end: 11 });
  assert.deepEqual(aligned.target_selection_byte_range, { byte_start: 9, byte_end: 10 });
  assert.equal(aligned.canonical_authority, false);
});

test('decodeUtf8Strict fails closed on invalid/truncated UTF-8 instead of substituting U+FFFD', () => {
  const emoji = Buffer.from('😀', 'utf8');
  assert.equal(decodeUtf8Strict(emoji), '😀');
  // Truncated multibyte sequence — Buffer.toString('utf8') would silently return a U+FFFD string;
  // this must throw instead.
  assert.throws(() => decodeUtf8Strict(emoji.subarray(0, 1)), /SOURCE_BYTES_INVALID_UTF8/);
  assert.throws(() => decodeUtf8Strict(emoji.subarray(1)), /SOURCE_BYTES_INVALID_UTF8/);
});

test('verifyLspSourceByteSpan proves the full LSP-SOURCE-BYTE-SPAN-VERIFY-01 chain: fatal decode ' +
  '+ content checksum + range codec + exact byte slice + text evidence', () => {
  const sourceBuffer = Buffer.from('const λ = "😀"; // 漢字\n', 'utf8');
  const sourceContentChecksum = `sha256:${createHash('sha256').update(sourceBuffer).digest('hex')}`;
  const emojiStart = sourceBuffer.indexOf(Buffer.from('😀', 'utf8'));

  // Build the LSP range for the emoji via the existing byte->position inverse isn't exposed here,
  // so hand-derive the utf-16 position: "const λ = \"" is 11 UTF-16 code units before the emoji
  // (λ is a single UTF-16 code unit; 😀 is a surrogate pair, i.e. 2 UTF-16 code units).
  const lspRange = { start: { line: 0, character: 11 }, end: { line: 0, character: 13 } };

  const verified = verifyLspSourceByteSpan({
    sourceBytes: sourceBuffer,
    sourceRef: 'src/a.ts',
    sourceRevision: sourceContentChecksum,
    sourceContentChecksum,
    lspRange,
    positionEncoding: 'utf-16',
    expectedText: '😀',
  });

  assert.equal(verified.json_rpc_content_encoding, 'utf-8');
  assert.equal(verified.lsp_position_encoding, 'utf-16');
  assert.equal(verified.atlas_coordinate_space, 'UTF8_BYTES');
  assert.equal(verified.source_content_checksum, sourceContentChecksum);
  assert.deepEqual(verified.byte_range, {
    byte_start: emojiStart,
    byte_end: emojiStart + Buffer.byteLength('😀', 'utf8'),
  });
  assert.equal(verified.canonical_authority, false);
  assert.equal(verified.writes_performed, false);

  // Wrong checksum — must fail closed, never silently proceed with unverified bytes.
  assert.throws(
    () => verifyLspSourceByteSpan({
      sourceBytes: sourceBuffer,
      sourceRef: 'src/a.ts',
      sourceRevision: sourceContentChecksum,
      sourceContentChecksum: `sha256:${'0'.repeat(64)}`,
      lspRange,
      positionEncoding: 'utf-16',
    }),
    /SOURCE_CONTENT_CHECKSUM_MISMATCH/,
  );

  // Wrong expected text — must fail closed.
  assert.throws(
    () => verifyLspSourceByteSpan({
      sourceBytes: sourceBuffer,
      sourceRef: 'src/a.ts',
      sourceRevision: sourceContentChecksum,
      sourceContentChecksum,
      lspRange,
      positionEncoding: 'utf-16',
      expectedText: '😃',
    }),
    /SOURCE_SPAN_TEXT_MISMATCH/,
  );

  // A source buffer with invalid UTF-8 must fail closed at the whole-source decode step, before
  // any coordinate math runs.
  const invalidUtf8 = Buffer.concat([sourceBuffer, Buffer.from([0xff, 0xfe])]);
  assert.throws(
    () => verifyLspSourceByteSpan({
      sourceBytes: invalidUtf8,
      sourceRef: 'src/a.ts',
      sourceRevision: sourceContentChecksum,
      sourceContentChecksum: `sha256:${createHash('sha256').update(invalidUtf8).digest('hex')}`,
      lspRange,
      positionEncoding: 'utf-16',
    }),
    /SOURCE_BYTES_INVALID_UTF8/,
  );

  // sourceRevision may legitimately differ from sourceContentChecksum (a future path-scoped
  // revision scheme) — the function must not require them to match.
  const pathScoped = verifyLspSourceByteSpan({
    sourceBytes: sourceBuffer,
    sourceRef: 'src/a.ts',
    sourceRevision: 'gitsrc:v1:deadbeef',
    sourceContentChecksum,
    lspRange,
    positionEncoding: 'utf-16',
  });
  assert.equal(pathScoped.source_revision, 'gitsrc:v1:deadbeef');
  assert.equal(pathScoped.source_content_checksum, sourceContentChecksum);
});

test('verifyLspSourceByteSpan accepts an empty (zero-width) LSP range', () => {
  const sourceBuffer = Buffer.from('const x = 1;\n', 'utf8');
  const sourceContentChecksum = `sha256:${createHash('sha256').update(sourceBuffer).digest('hex')}`;
  const verified = verifyLspSourceByteSpan({
    sourceBytes: sourceBuffer,
    sourceRef: 'src/a.ts',
    sourceRevision: sourceContentChecksum,
    sourceContentChecksum,
    lspRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 6 } },
    positionEncoding: 'utf-16',
  });
  assert.equal(verified.byte_range.byte_start, verified.byte_range.byte_end);
});
