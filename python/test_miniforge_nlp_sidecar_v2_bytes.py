from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

import miniforge_nlp_sidecar_v2 as sidecar_v2


def test_parser_observation_counts_error_and_missing_nodes_over_exact_bytes():
    source_bytes = 'const λ = "😀";\r\n'.encode('utf-8')
    missing = SimpleNamespace(type='identifier', start_byte=0, end_byte=0, is_missing=True, children=[])
    error = SimpleNamespace(type='ERROR', start_byte=0, end_byte=1, is_missing=False, children=[missing])
    root = SimpleNamespace(type='program', start_byte=0, end_byte=len(source_bytes), has_error=True, is_missing=False, children=[error])
    observed = sidecar_v2._parser_observation(root, sidecar_v2._index_syntax_nodes(root), source_bytes)
    assert observed is not None
    assert observed.source_sha256 == hashlib.sha256(source_bytes).hexdigest()
    assert observed.utf8_byte_length == len(source_bytes)
    assert observed.root_has_error is True
    assert observed.error_node_count == 1
    assert observed.missing_node_count == 1
    assert observed.model_dump(by_alias=True)['schema'] == 'atlas.ast.parser-observation.v1'


def test_parser_observation_reports_observed_clean_tree_not_inferred_http_success():
    root = SimpleNamespace(type='program', start_byte=0, end_byte=0, has_error=False, is_missing=False, children=[])
    observed = sidecar_v2._parser_observation(root, sidecar_v2._index_syntax_nodes(root), b'')
    assert observed is not None
    assert observed.root_has_error is False
    assert observed.error_node_count == 0
    assert observed.missing_node_count == 0


def test_parser_observation_stays_unavailable_without_actual_tree_flags():
    assert sidecar_v2._parser_observation(None, {}, b'') is None
    assert sidecar_v2._parser_observation(SimpleNamespace(), {}, b'') is None
    root = SimpleNamespace(type='program', start_byte=0, end_byte=0, has_error=False, children=[])
    assert sidecar_v2._parser_observation(root, sidecar_v2._index_syntax_nodes(root), b'') is None


def test_raw_chunk_file_preserves_exact_utf8_bytes(monkeypatch):
    source = 'const alpha = "λ";\r\nconst beta = "漢字";\r\n'
    expected = source.encode('utf-8')
    observed: dict[str, object] = {}

    def fake_chunk_file(path: str, language: str, **kwargs):
        parser_bytes = Path(path).read_bytes()
        observed['bytes'] = parser_bytes
        observed['sha256'] = hashlib.sha256(parser_bytes).hexdigest()
        observed['language'] = language
        observed['identity_path'] = kwargs.get('identity_path')
        return []

    monkeypatch.setattr(
        sidecar_v2.legacy,
        'TREESITTER_CHUNKER_MODULE',
        SimpleNamespace(chunk_file=fake_chunk_file),
    )

    chunks, identity_path_preserved = sidecar_v2._raw_chunk_file(
        source,
        'typescript',
        'src/example.ts',
    )

    assert chunks == []
    assert identity_path_preserved is True
    assert observed['bytes'] == expected
    assert observed['sha256'] == hashlib.sha256(expected).hexdigest()
    assert observed['language'] == 'typescript'
    assert observed['identity_path'] == 'src/example.ts'


def test_raw_chunk_file_fallback_still_preserves_bytes(monkeypatch):
    source = 'const alpha = 1;\r\nconst beta = 2;\r\n'
    expected = source.encode('utf-8')
    calls: list[tuple[bytes, dict[str, object]]] = []

    def fake_chunk_file(path: str, language: str | None = None, **kwargs):
        parser_bytes = Path(path).read_bytes()
        calls.append((parser_bytes, kwargs))
        if 'identity_path' in kwargs:
            raise TypeError('identity_path unsupported')
        return []

    monkeypatch.setattr(
        sidecar_v2.legacy,
        'TREESITTER_CHUNKER_MODULE',
        SimpleNamespace(chunk_file=fake_chunk_file),
    )

    chunks, identity_path_preserved = sidecar_v2._raw_chunk_file(
        source,
        'typescript',
        'src/example.ts',
    )

    assert chunks == []
    assert identity_path_preserved is False
    assert len(calls) == 2
    assert all(parser_bytes == expected for parser_bytes, _ in calls)
