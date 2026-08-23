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
