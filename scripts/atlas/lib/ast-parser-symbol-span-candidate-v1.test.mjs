import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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

test('loader strips exactly one terminal LF and verifies digest before returning parser input', () => {
  assert.equal(sourceBytes.length, fixture.source.byteLength);
  assert.equal(sourceBytes[sourceBytes.length - 1], 0x3b);
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'atlas-frozen-source-'));
  try {
    const artifactPath = path.join(temporaryRoot, 'source.ts');
    const artifact = readFileSync(path.join(root, fixture.sourceArtifact.path));
    writeFileSync(artifactPath, Buffer.concat([artifact, Buffer.from('\n')]));
    assert.throws(() => loadAstParserSymbolSpanCandidateSourceV1({
      ...fixture,
      sourceArtifact: { ...fixture.sourceArtifact, path: 'source.ts' },
    }, temporaryRoot), /FROZEN_SOURCE_BYTES_MISMATCH/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('loader preserves a source-owned terminal LF separately from the storage sentinel', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'atlas-frozen-source-'));
  const expectedSource = Buffer.from('export const value = 1;\n', 'utf8');
  const sourceDigest = createHash('sha256').update(expectedSource).digest('hex');
  const localFixture = {
    ...fixture,
    source: {
      ...fixture.source,
      sourceRevision: `sha256:${sourceDigest}`,
      sha256: sourceDigest,
      byteLength: expectedSource.length,
    },
    sourceArtifact: { ...fixture.sourceArtifact, path: 'source.ts' },
  };
  try {
    writeFileSync(path.join(temporaryRoot, 'source.ts'), Buffer.concat([expectedSource, Buffer.from('\n')]));
    assert.deepEqual(loadAstParserSymbolSpanCandidateSourceV1(localFixture, temporaryRoot), expectedSource);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('loader rejects CRLF and invalid UTF-8 instead of normalizing frozen evidence', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'atlas-frozen-source-'));
  const localFixture = {
    ...fixture,
    source: { ...fixture.source, byteLength: 1, sha256: createHash('sha256').update('x').digest('hex'), sourceRevision: `sha256:${createHash('sha256').update('x').digest('hex')}` },
    sourceArtifact: { ...fixture.sourceArtifact, path: 'source.ts' },
  };
  try {
    const artifactPath = path.join(temporaryRoot, 'source.ts');
    writeFileSync(artifactPath, Buffer.from('x\r\n'));
    assert.throws(() => loadAstParserSymbolSpanCandidateSourceV1(localFixture, temporaryRoot), /SOURCE_ARTIFACT_LINE_ENDING_INVALID/);
    writeFileSync(artifactPath, Buffer.from([0xff, 0x0a]));
    assert.throws(() => loadAstParserSymbolSpanCandidateSourceV1(localFixture, temporaryRoot), /SOURCE_ARTIFACT_UTF8_INVALID/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
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
