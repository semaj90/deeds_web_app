import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSymbolSpanDiagnosticV1, compareCurrentNominationSpanV1 } from './symbol-span-diagnostic-v1.mjs';

const base = {
  stored: {
    packetKey: 'packet:1', symbolVersionId: 'symbol:1', sourceRef: 'src/a.ts',
    sourceRevision: 'sha256:source', name: 'run', start: 0, end: 0,
    producerRevision: null, coordinateEncoding: null, nodeKind: null, spanSemantic: null,
  },
  observed: { name: 'run', start: 0, end: 0, grammarId: 'ts', nodeKind: 'method_definition', producerRevision: 'ast:v1' },
  sourceBytes: Buffer.alloc(0),
  sourceText: '',
};

test('detects exact UTF-8 byte span match', () => {
  const sourceText = 'function run() {}';
  const bytes = Buffer.from(sourceText);
  const result = buildSymbolSpanDiagnosticV1({
    ...base,
    stored: { ...base.stored, start: 0, end: bytes.length, nodeKind: 'function_declaration', spanSemantic: 'DECLARATION_NODE' },
    observed: { ...base.observed, start: 0, end: bytes.length },
    sourceText, sourceBytes: bytes,
  });
  assert.equal(result.verdict, 'EXACT_MATCH');
});

test('identifies a UTF-16-to-UTF-8 coordinate explanation without changing spans', () => {
  const sourceText = '// 🐉\nfunction run() {}';
  const bytes = Buffer.from(sourceText);
  const utf16Start = sourceText.indexOf('function');
  const utf16End = sourceText.length;
  const observedStart = Buffer.byteLength(sourceText.slice(0, utf16Start));
  const observedEnd = bytes.length;
  const result = buildSymbolSpanDiagnosticV1({
    ...base,
    stored: { ...base.stored, start: utf16Start, end: utf16End },
    observed: { ...base.observed, start: observedStart, end: observedEnd },
    sourceText, sourceBytes: bytes,
  });
  assert.equal(result.verdict, 'COORDINATE_ENCODING_MISMATCH');
  assert.deepEqual(result.comparison.convertedStoredSpan, { startByte: observedStart, endByte: observedEnd });
  assert.equal(result.stored.start, utf16Start);
});

test('classifies overlapping same-name spans as boundary differences, not exact matches', () => {
  const sourceText = '  function run() {}';
  const bytes = Buffer.from(sourceText);
  const result = buildSymbolSpanDiagnosticV1({
    ...base,
    stored: { ...base.stored, start: 0, end: bytes.length, nodeKind: 'function_declaration', spanSemantic: 'DECLARATION_NODE' },
    observed: { ...base.observed, start: 2, end: bytes.length, nodeKind: 'function_declaration' },
    sourceText, sourceBytes: bytes,
  });
  assert.equal(result.verdict, 'NODE_BOUNDARY_MISMATCH');
  assert.equal(result.comparison.intervalRelation, 'STORED_CONTAINS_OBSERVED');
});

test('recognizes a qualified-name suffix without confusing it with span equality', () => {
  const sourceText = 'class Atlas { run() {} }';
  const bytes = Buffer.from(sourceText);
  const result = buildSymbolSpanDiagnosticV1({
    ...base,
    stored: { ...base.stored, name: 'Atlas.run', start: 14, end: bytes.length - 2 },
    observed: { ...base.observed, name: 'run', start: 14, end: bytes.length - 2 },
    sourceText, sourceBytes: bytes,
  });
  assert.equal(result.comparison.sameName, true);
  assert.equal(result.verdict, 'EXACT_MATCH');
});

test('compares current scratch nominations without treating them as authority', () => {
  const result = compareCurrentNominationSpanV1({
    stored: {
      sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', name: 'run',
      start: 4, end: 20, nominationId: 'nomination:old',
    },
    observed: { start: 8, end: 24 },
    nominationRows: [{
      source_ref: 'src/a.ts', source_revision: 'sha256:source', qualified_name: 'run',
      byte_start: 8, byte_end: 24, nomination_id: 'nomination:current',
      extractor: 'ast_grep', extractor_revision: 'ast-grep:v1',
    }],
  });
  assert.equal(result.authority, 'DIAGNOSTIC_ONLY');
  assert.equal(result.status, 'CURRENT_ARTIFACT_MATCHES_OBSERVED_NOT_STORED');
  assert.equal(result.currentRows[0]?.nominationIdMatchesStored, false);
});
