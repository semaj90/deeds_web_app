from __future__ import annotations

from types import SimpleNamespace

import miniforge_nlp_sidecar_v2 as sidecar_v2


def test_native_ast_evidence_remaps_multiline_lf_relative_span_once(monkeypatch):
    """A remapped multiline CRLF span must not be interpreted as LF-relative twice."""

    source = (
        'const alpha = "λ";\r\n'
        'function beta() {\r\n'
        '  return "漢";\r\n'
        '}\r\n'
        'const omega = 1;\r\n'
    )
    normalized_source = source.replace('\r\n', '\n')
    content = 'function beta() {\n  return "漢";\n}'
    normalized_bytes = normalized_source.encode('utf-8')
    content_bytes = content.encode('utf-8')
    normalized_start = normalized_bytes.index(content_bytes)
    normalized_end = normalized_start + len(content_bytes)

    raw = SimpleNamespace(
        content=content,
        byte_start=normalized_start,
        byte_end=normalized_end,
        start_line=2,
        end_line=4,
        node_type='function_declaration',
        symbol='beta',
        name='beta',
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

    original_bytes = source.encode('utf-8')
    original_content = content.replace('\n', '\r\n').encode('utf-8')
    expected_start = original_bytes.index(original_content)
    expected_end = expected_start + len(original_content)

    assert response.error_tag is None
    assert len(response.chunks) == 1
    chunk = response.chunks[0]
    assert (chunk.start_byte, chunk.end_byte) == (expected_start, expected_end)
    assert original_bytes[chunk.start_byte : chunk.end_byte].replace(b'\r\n', b'\n') == content_bytes

    remap_diagnostics = [item for item in response.diagnostics if 'LF_' in item and 'REMAP' in item]
    assert len(remap_diagnostics) == 1
    assert not any(item.startswith('ChunkingError:') for item in response.diagnostics)
