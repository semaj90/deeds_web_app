from __future__ import annotations

from types import SimpleNamespace

import miniforge_nlp_sidecar_v2 as sidecar_v2


def test_declarator_kind_override_unit_cases():
    """Unit coverage for the byte-span heuristic itself, independent of the
    full _native_ast_evidence pipeline (see the end-to-end test below for
    that)."""

    override = sidecar_v2._declarator_kind_override

    assert override('variable_declarator', 'handleError = (event) => { console.log(event); }') == 'function_declarator'
    assert override('variable_declarator', 'handle = async ({ event }) => { return resolve(event); }') == 'function_declarator'
    assert override('variable_declarator', 'handleError = function (event) { console.log(event); }') == 'function_declarator'
    assert override('variable_declarator', 'count = 5') is None
    assert override('variable_declarator', 'config = { a: 1, b: 2 }') is None
    assert override('variable_declarator', 'callback = someOtherFn') is None
    assert override('interface_declaration', 'interface Foo { bar: () => void }') is None


def test_ast_evidence_byte_span_validator_rejects_invalid_and_duplicate_spans():
    chunk = sidecar_v2.AstEvidenceChunkV2(
        upstream_node_id='node:1', node_type='function_declaration', kind='function',
        start_byte=0, end_byte=4, start_line=1, start_column=0, end_line=1, end_column=4,
    )
    duplicate = chunk.model_copy()
    assert sidecar_v2.validate_ast_evidence_byte_spans([chunk, duplicate], b'test') == [
        {'index': 1, 'code': 'DUPLICATE_SPAN'}
    ]
    invalid_boundary = chunk.model_copy(update={'start_byte': 1, 'end_byte': 2})
    assert sidecar_v2.validate_ast_evidence_byte_spans([invalid_boundary], 'é'.encode('utf-8')) == [
        {'index': 0, 'code': 'SPAN_NOT_UTF8_BOUNDARY'}
    ]
    out_of_bounds = chunk.model_copy(update={'start_byte': 0, 'end_byte': 5})
    assert sidecar_v2.validate_ast_evidence_byte_spans([out_of_bounds], b'test') == [
        {'index': 0, 'code': 'SPAN_OUT_OF_BOUNDS'}
    ]
    malformed_utf8 = chunk.model_copy(update={'start_byte': 0, 'end_byte': 2})
    assert sidecar_v2.validate_ast_evidence_byte_spans([malformed_utf8], bytes([0xC0, 0xAF])) == [
        {'index': 0, 'code': 'SPAN_NOT_UTF8_BOUNDARY'}
    ]


def _run_single_chunk(monkeypatch, *, node_type: str, source: str, name: str):
    raw = SimpleNamespace(
        content=source,
        byte_start=0,
        byte_end=len(source.encode('utf-8')),
        start_line=1,
        end_line=1,
        node_type=node_type,
        symbol=name,
        name=name,
        node_id='node:x',
        file_id='file:example',
        symbol_id='symbol:x',
        chunk_id='chunk:x',
        parent_route=['module'],
        parent_context='module',
        metadata={},
    )
    monkeypatch.setattr(sidecar_v2.legacy, 'TREESITTER_CHUNKER_AVAILABLE', True)
    monkeypatch.setattr(sidecar_v2, '_raw_chunk_file', lambda *_args: ([raw], True))
    monkeypatch.setattr(sidecar_v2.legacy, '_syntax_diagnostics', lambda *_args: [])

    req = sidecar_v2.legacy.AstChunkRequest(
        source=source,
        language='typescript',
        filePath='src/example.ts',
        sourceRevision='sha256:test',
    )
    response = sidecar_v2._native_ast_evidence(req)
    assert len(response.chunks) == 1
    return response.chunks[0]


def test_native_ast_evidence_classifies_arrow_function_variable_declarator_as_function(monkeypatch):
    """Regression test for the SEMANTIC_KIND_MISMATCH class found in
    docs/reports/node-tree-sitter-provider-parity-corpus-v2.json: treesitter-
    chunker's own `kind` for a variable_declarator is a generic 'fragment'
    label that doesn't inspect the initializer, so
    `const handleError = (event) => {...}` was classified as a plain
    'fragment' -> 'VARIABLE' instead of 'function' -> 'FUNCTION'."""

    chunk = _run_single_chunk(
        monkeypatch,
        node_type='variable_declarator',
        source='handleError = (event) => { console.log(event); }',
        name='handleError',
    )
    assert chunk.kind == 'function'
    # node_type itself is left untouched -- only the derived `kind` classification changes.
    assert chunk.node_type == 'variable_declarator'


def test_native_ast_evidence_leaves_non_function_variable_declarator_as_fragment(monkeypatch):
    chunk = _run_single_chunk(
        monkeypatch,
        node_type='variable_declarator',
        source='count = 5',
        name='count',
    )
    assert chunk.kind == 'fragment'


def test_native_ast_evidence_derives_function_signature_and_ancestor_spans(monkeypatch):
    source = 'export function resolve(value: string): number { return value.length; }'
    chunk = _run_single_chunk(
        monkeypatch,
        node_type='function_declaration',
        source=source,
        name='resolve',
    )
    assert chunk.signature_text == 'function resolve(value: string): number '
    assert chunk.syntax_ancestry
    assert chunk.syntax_ancestry[-1]['node_type'] == 'export_statement'
    assert source.encode('utf-8')[chunk.syntax_ancestry[-1]['start_byte']:chunk.syntax_ancestry[-1]['end_byte']] == source.encode('utf-8')


def test_native_ast_evidence_leaves_signature_missing_when_parser_evidence_is_ambiguous(monkeypatch):
    source = 'function resolve() {} function resolve() {}'
    chunk = _run_single_chunk(
        monkeypatch,
        node_type='function_declaration',
        source=source,
        name='resolve',
    )
    assert chunk.signature_text is None
    assert chunk.syntax_ancestry == []
