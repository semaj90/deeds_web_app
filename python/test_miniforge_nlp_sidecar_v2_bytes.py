from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

import miniforge_nlp_sidecar_v2 as sidecar_v2


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


def test_native_ast_evidence_remaps_lf_relative_span_to_original_bytes(monkeypatch):
    source = 'const alpha = "λ";\r\nconst beta = "漢字";\r\n'
    normalized = source.replace('\r\n', '\n').encode('utf-8')
    content = 'const beta = "漢字";'
    content_bytes = content.encode('utf-8')
    normalized_start = normalized.index(content_bytes)
    normalized_end = normalized_start + len(content_bytes)
    raw = SimpleNamespace(
        content=content,
        byte_start=normalized_start,
        byte_end=normalized_end,
        node_type='lexical_declaration',
        symbol='beta',
        node_id='node:beta',
        file_id='file:example',
        symbol_id='symbol:beta',
        chunk_id='chunk:beta',
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
    chunk = response.chunks[0]
    original = source.encode('utf-8')
    assert chunk.start_byte == normalized_start + 1
    assert original[chunk.start_byte : chunk.end_byte].replace(b'\r\n', b'\n') == content_bytes
    assert any('CONSILIENCY_LF_BYTE_SPAN_REMAPPED' in item for item in response.diagnostics)
    assert response.error_tag is None
def test_valid_original_crlf_span_is_not_remapped():
    source = 'const alpha = "λ";\r\nconst beta = "漢字";\r\n'
    source_bytes = source.encode('utf-8')
    content = 'const beta = "漢字";'.encode('utf-8')
    start = source_bytes.index(content)
    end = start + len(content)

    resolved = sidecar_v2._resolve_original_chunk_span(
        source,
        start,
        end,
        content_bytes=content,
        reported_start_line=2,
        reported_end_line=2,
    )

    assert resolved == (start, end, None)


def test_lf_normalized_offsets_remap_to_original_crlf_bytes_with_multibyte_text():
    source = (
        'const alpha = "λ";\r\n'
        'function beta() {\r\n'
        '  return "漢";\r\n'
        '}\r\n'
    )
    normalized = source.replace('\r\n', '\n')
    normalized_content = 'function beta() {\n  return "漢";\n}'.encode('utf-8')
    normalized_bytes = normalized.encode('utf-8')
    start = normalized_bytes.index(normalized_content)
    end = start + len(normalized_content)

    original_content = 'function beta() {\r\n  return "漢";\r\n}'.encode('utf-8')
    source_bytes = source.encode('utf-8')
    expected_start = source_bytes.index(original_content)
    expected_end = expected_start + len(original_content)

    resolved = sidecar_v2._resolve_original_chunk_span(
        source,
        start,
        end,
        content_bytes=normalized_content,
        reported_start_line=2,
        reported_end_line=4,
    )

    assert resolved == (
        expected_start,
        expected_end,
        'CONSILIENCY_LF_OFFSET_REMAP',
    )
    assert source_bytes[expected_start:expected_end].replace(b'\r\n', b'\n') == normalized_content


def test_lf_boundary_map_handles_mixed_newlines_and_utf8_bytes():
    source_bytes = 'a\nβ\r\nc\r\nd'.encode('utf-8')
    normalized_bytes = source_bytes.replace(b'\r\n', b'\n')
    boundary_map = sidecar_v2._lf_boundary_to_original_map(source_bytes)

    assert len(boundary_map) == len(normalized_bytes) + 1
    for normalized_offset, original_offset in enumerate(boundary_map):
        assert source_bytes[:original_offset].replace(b'\r\n', b'\n') == normalized_bytes[:normalized_offset]


def test_lf_offset_remap_rejects_wrong_reported_line_coordinates():
    source = 'alpha\r\nbeta\r\ngamma\r\n'
    normalized = source.replace('\r\n', '\n').encode('utf-8')
    content = b'beta'
    start = normalized.index(content)
    end = start + len(content)

    resolved = sidecar_v2._resolve_original_chunk_span(
        source,
        start,
        end,
        content_bytes=content,
        reported_start_line=99,
        reported_end_line=99,
    )

    assert resolved is None


def test_invalid_non_crlf_span_fails_closed_without_remap():
    source = 'alpha\nbeta\ngamma\n'

    resolved = sidecar_v2._resolve_original_chunk_span(
        source,
        0,
        5,
        content_bytes=b'wrong',
        reported_start_line=1,
        reported_end_line=1,
    )

    assert resolved is None


def test_successful_lf_offset_remap_is_advisory_not_syntax_error():
    diagnostics = ['CONSILIENCY_LF_OFFSET_REMAP:chunk-1:10-20->11-22']
    assert sidecar_v2._diagnostics_have_errors(diagnostics) is False


def test_real_chunking_error_still_marks_diagnostics_as_error():
    diagnostics = [
        'CONSILIENCY_LF_OFFSET_REMAP:chunk-1:10-20->11-22',
        'ChunkingError: CONSILIENCY_BYTE_SPAN_INVALID:chunk-2: explicit byte span does not reproduce original request bytes',
    ]
    assert sidecar_v2._diagnostics_have_errors(diagnostics) is True
