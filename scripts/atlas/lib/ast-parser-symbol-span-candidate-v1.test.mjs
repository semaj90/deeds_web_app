import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadAstParserSymbolSpanCandidateSourceV1,
  verifyAstParserSymbolSpanCandidateV1,
} from './ast-parser-symbol-span-candidate-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixture = JSON.parse(readFileSync(path.join(root, 'scripts/atlas/fixtures/ast-parser-symbol-span-match-candidate-v1.json'), 'utf8'));
const sourceBytes = loadAstParserSymbolSpanCandidateSourceV1(fixture, root);
const parserResponse = {
  source_revision: fixture.source.sourceRevision,
  scan_completeness: 'COMPLETE',
  syntax_status: 'CLEAN',
  chunks: [{
    kind: 'function',
    name: fixture.symbolCandidate.qualifiedName,
    node_type: 'function_declaration',
    start_byte: fixture.symbolCandidate.byteStart,
    end_byte: fixture.symbolCandidate.byteEnd,
  }],
};

test('verifies the frozen source bytes and exact parser span without granting authority', () => {
  assert.deepEqual(verifyAstParserSymbolSpanCandidateV1(fixture, sourceBytes, parserResponse), {
    status: 'PARSER_SYMBOL_SPAN_MATCH_VERIFIED',
    canonicalAuthority: false,
    sourceRef: 'packages/atlas-core/src/cli.ts',
    sourceRevision: fixture.source.sourceRevision,
    symbolVersionId: fixture.symbolCandidate.symbolVersionId,
    qualifiedName: 'main',
    byteStart: 302,
    byteEnd: 2366,
    exactMatchCount: 1,
  });
});

test('rejects current or corrupted bytes substituted for the frozen source', () => {
  const corrupted = Buffer.from(sourceBytes);
  corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => verifyAstParserSymbolSpanCandidateV1(fixture, corrupted, parserResponse), /FROZEN_SOURCE_BYTES_MISMATCH/);
});

test('rejects parser revision drift and duplicate matching chunks', () => {
  assert.throws(() => verifyAstParserSymbolSpanCandidateV1(fixture, sourceBytes, {
    ...parserResponse,
    source_revision: 'sha256:' + '0'.repeat(64),
  }), /PARSER_SOURCE_REVISION_MISMATCH/);
  assert.throws(() => verifyAstParserSymbolSpanCandidateV1(fixture, sourceBytes, {
    ...parserResponse,
    chunks: [...parserResponse.chunks, ...parserResponse.chunks],
  }), /EXACT_SYMBOL_SPAN_MATCH_COUNT_INVALID/);
});

test('rejects incomplete parser output and authority promotion', () => {
  assert.throws(() => verifyAstParserSymbolSpanCandidateV1(fixture, sourceBytes, {
    ...parserResponse,
    scan_completeness: 'PARTIAL',
  }), /PARSER_SCAN_INCOMPLETE/);
  assert.throws(() => verifyAstParserSymbolSpanCandidateV1({ ...fixture, canonicalAuthority: true }, sourceBytes, parserResponse), /FIXTURE_AUTHORITY_FLAGS_INVALID/);
});
