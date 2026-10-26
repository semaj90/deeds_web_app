import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareFunctionNativeAstReadbackV1 } from './function-native-source-alignment-v1.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const sourceBytes = Buffer.from('export function greet() { return "世界"; }\r\n');
  const symbol = {
    symbolVersionId: 'symbol-version:fixture', packetKey: 'packet:fixture',
    sourceRef: 'src/greet.ts', language: 'typescript', sourceRevision: `sha256:${hash(sourceBytes)}`,
    workspaceRevision: `sha256:${'a'.repeat(64)}`, qualifiedName: 'export_statement::function_declaration::greet',
    upstreamNodeId: 'native-node', upstreamSymbolId: 'native-symbol', startByte: 7, endByte: sourceBytes.length - 2,
  };
  const evidence = {
    schema: 'atlas.ast.evidence.v1', language: 'typescript', engine: 'treesitter-chunker', engine_version: '4.0.0',
    syntax_status: 'CLEAN', error_tag: null, file_path: symbol.sourceRef, source_revision: symbol.sourceRevision,
    diagnostics: ['CONSILIENCY_LF_BYTE_SPAN_REMAPPED: native offsets mapped to original bytes'],
    chunks: [{ start_byte: symbol.startByte, end_byte: symbol.endByte, name: 'greet',
      node_type: 'function_declaration', kind: 'function', parent_route: ['export_statement', 'function_declaration'],
      upstream_node_id: 'native-node', upstream_symbol_id: 'native-symbol', upstream_file_id: 'native-file' }],
  };
  return { symbol, sourceBytes, evidence };
}

test('binds the native IDs and original CRLF UTF-8 span without returning source text', () => {
  const input = fixture();
  const result = compareFunctionNativeAstReadbackV1(input);
  assert.equal(result.status, 'SOURCE_NATIVE_AST_ALIGNED');
  assert.equal(result.spanSha256, hash(input.sourceBytes.subarray(input.symbol.startByte, input.symbol.endByte)));
  assert.equal(JSON.stringify(result).includes('世界'), false);
});

test('rejects modified bytes and stale native source revisions', () => {
  const changed = fixture();
  changed.sourceBytes[0] = 120;
  assert.equal(compareFunctionNativeAstReadbackV1(changed).reason, 'SOURCE_HASH_MISMATCH');
  const stale = fixture();
  stale.evidence.source_revision = `sha256:${'b'.repeat(64)}`;
  assert.equal(compareFunctionNativeAstReadbackV1(stale).reason, 'NATIVE_SOURCE_BINDING_MISMATCH');
});

test('rejects ambiguous spans before accepting an ID match', () => {
  const input = fixture();
  input.evidence.chunks.push({ ...input.evidence.chunks[0], upstream_node_id: 'another-node' });
  assert.equal(compareFunctionNativeAstReadbackV1(input).reason, 'NATIVE_SPAN_AMBIGUOUS');
});

test('rejects wrong node, symbol, name, path, and parser provenance', () => {
  for (const field of ['upstream_node_id', 'upstream_symbol_id', 'name']) {
    const input = fixture();
    input.evidence.chunks[0][field] = 'different';
    assert.equal(compareFunctionNativeAstReadbackV1(input).reason, 'NATIVE_SYMBOL_IDENTITY_MISMATCH');
  }
  const wrongPath = fixture();
  wrongPath.evidence.file_path = 'temp/random.ts';
  assert.equal(compareFunctionNativeAstReadbackV1(wrongPath).reason, 'NATIVE_SOURCE_BINDING_MISMATCH');
  const wrongLanguage = fixture();
  wrongLanguage.evidence.language = 'python';
  assert.equal(compareFunctionNativeAstReadbackV1(wrongLanguage).reason, 'NATIVE_SOURCE_BINDING_MISMATCH');
  const unproven = fixture();
  unproven.evidence.diagnostics.push('CONSILIENCY_IDENTITY_PATH_UNPROVEN');
  assert.equal(compareFunctionNativeAstReadbackV1(unproven).reason, 'NATIVE_IDENTITY_PATH_UNPROVEN');
  const parser = fixture();
  parser.evidence.engine = 'regex';
  assert.equal(compareFunctionNativeAstReadbackV1(parser).reason, 'NATIVE_PARSER_PROVENANCE_INVALID');
});

test('rejects an offset inside a multibyte character and unsafe integer offsets', () => {
  const split = fixture();
  split.symbol.endByte = split.sourceBytes.indexOf(Buffer.from('世')) + 1;
  assert.equal(compareFunctionNativeAstReadbackV1(split).reason, 'UTF8_SPAN_INVALID');
  const unsafe = fixture();
  unsafe.symbol.endByte = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(compareFunctionNativeAstReadbackV1(unsafe).reason, 'SOURCE_SPAN_INVALID');
});
