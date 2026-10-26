import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function loadAstParserSymbolSpanCandidateSourceV1(fixture, repositoryRoot) {
  if (fixture?.sourceArtifact?.storageEncoding !== 'UTF8_LF_WITH_ONE_TERMINAL_LF_STRIPPED') {
    throw new Error('SOURCE_ARTIFACT_ENCODING_UNSUPPORTED');
  }
  const source = fixture.source;
  if (!source || !digestPattern.test(source.sourceRevision)
    || source.sha256 !== source.sourceRevision.slice('sha256:'.length)
    || !Number.isSafeInteger(source.byteLength) || source.byteLength < 0) {
    throw new Error('FIXTURE_SOURCE_DIGEST_INVALID');
  }
  const artifactPath = path.resolve(repositoryRoot, fixture.sourceArtifact.path);
  if (!artifactPath.startsWith(`${path.resolve(repositoryRoot)}${path.sep}`)) {
    throw new Error('SOURCE_ARTIFACT_PATH_OUTSIDE_REPOSITORY');
  }
  const artifactBytes = readFileSync(artifactPath);
  let artifactText;
  try {
    artifactText = new TextDecoder('utf-8', { fatal: true }).decode(artifactBytes);
  } catch {
    throw new Error('SOURCE_ARTIFACT_UTF8_INVALID');
  }
  if (artifactText.includes('\r')) throw new Error('SOURCE_ARTIFACT_LINE_ENDING_INVALID');
  if (!artifactText.endsWith('\n')) throw new Error('SOURCE_ARTIFACT_TERMINAL_LF_MISSING');
  const sourceBytes = artifactBytes.subarray(0, artifactBytes.length - 1);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    throw new Error('SOURCE_ARTIFACT_UTF8_INVALID');
  }
  const actualDigest = createHash('sha256').update(sourceBytes).digest('hex');
  if (sourceBytes.length !== source.byteLength || actualDigest !== source.sha256) {
    throw new Error('FROZEN_SOURCE_BYTES_MISMATCH');
  }
  return sourceBytes;
}

export function verifyAstParserSymbolSpanCandidateV1(fixture, sourceBytes, parserResponse) {
  if (fixture?.schema !== 'atlas.ast-parser-symbol-span-match-candidate.v1') throw new Error('FIXTURE_SCHEMA_INVALID');
  if (fixture.status !== 'SNAPSHOT_BOUND_AST_SYMBOL_SPAN_MATCH_CANDIDATE'
    || fixture.canonicalAuthority !== false || fixture.writesPerformed !== false) {
    throw new Error('FIXTURE_AUTHORITY_FLAGS_INVALID');
  }

  const source = fixture.source;
  const symbol = fixture.symbolCandidate;
  if (!source || !symbol || !Buffer.isBuffer(sourceBytes)) throw new Error('FIXTURE_SOURCE_INPUT_INVALID');
  if (!digestPattern.test(source.sourceRevision) || source.sha256 !== source.sourceRevision.slice('sha256:'.length)) {
    throw new Error('FIXTURE_SOURCE_DIGEST_INVALID');
  }

  const actualDigest = createHash('sha256').update(sourceBytes).digest('hex');
  if (sourceBytes.length !== source.byteLength || actualDigest !== source.sha256) {
    throw new Error('FROZEN_SOURCE_BYTES_MISMATCH');
  }
  if (!Number.isSafeInteger(symbol.byteStart) || !Number.isSafeInteger(symbol.byteEnd)
    || symbol.byteStart < 0 || symbol.byteEnd <= symbol.byteStart || symbol.byteEnd > sourceBytes.length) {
    throw new Error('SYMBOL_SPAN_INVALID');
  }

  const parserSourceRevision = parserResponse?.source_revision ?? parserResponse?.sourceRevision;
  if (parserSourceRevision !== source.sourceRevision) throw new Error('PARSER_SOURCE_REVISION_MISMATCH');
  if ((parserResponse.scan_completeness ?? parserResponse.scanCompleteness) !== 'COMPLETE') {
    throw new Error('PARSER_SCAN_INCOMPLETE');
  }
  if ((parserResponse.syntax_status ?? parserResponse.syntaxStatus) !== 'CLEAN') {
    throw new Error('PARSER_SYNTAX_NOT_CLEAN');
  }

  const chunks = parserResponse.chunks;
  if (!Array.isArray(chunks)) throw new Error('PARSER_CHUNKS_MISSING');
  const exactMatches = chunks.filter(chunk => chunk?.name === symbol.qualifiedName
    && (chunk.start_byte ?? chunk.startByte) === symbol.byteStart
    && (chunk.end_byte ?? chunk.endByte) === symbol.byteEnd);
  if (exactMatches.length !== 1) throw new Error('EXACT_SYMBOL_SPAN_MATCH_COUNT_INVALID');

  return {
    status: 'PARSER_SYMBOL_SPAN_MATCH_VERIFIED',
    canonicalAuthority: false,
    sourceRef: source.sourceRef,
    sourceRevision: source.sourceRevision,
    symbolVersionId: symbol.symbolVersionId,
    qualifiedName: symbol.qualifiedName,
    byteStart: symbol.byteStart,
    byteEnd: symbol.byteEnd,
    exactMatchCount: exactMatches.length,
  };
}
