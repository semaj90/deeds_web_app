from __future__ import annotations

from types import SimpleNamespace

from atlas_treesitter_span_compat import resolve_chunk_byte_span


def test_correct_explicit_crlf_span_stays_original() -> None:
    source = 'const alpha = "λ";\r\nconst beta = 2;\r\n'
    content = 'const beta = 2;'
    source_bytes = source.encode('utf-8')
    content_bytes = content.encode('utf-8')
    start = source_bytes.index(content_bytes)
    end = start + len(content_bytes)

    result = resolve_chunk_byte_span(
        source,
        SimpleNamespace(content=content),
        start,
        end,
    )

    assert result.mode == 'ORIGINAL_UTF8'
    assert result.verified is True
    assert (result.start_byte, result.end_byte) == (start, end)


def test_lf_relative_span_is_remapped_to_original_crlf_bytes() -> None:
    source = 'const alpha = 1;\r\nconst beta = 2;\r\n'
    normalized = source.replace('\r\n', '\n').encode('utf-8')
    content = 'const beta = 2;'
    content_bytes = content.encode('utf-8')
    normalized_start = normalized.index(content_bytes)
    normalized_end = normalized_start + len(content_bytes)

    result = resolve_chunk_byte_span(
        source,
        {'content': content},
        normalized_start,
        normalized_end,
    )

    original = source.encode('utf-8')
    assert result.mode == 'LF_COMPAT_REMAPPED'
    assert result.verified is True
    assert original[result.start_byte : result.end_byte].replace(b'\r\n', b'\n') == content_bytes
    assert result.start_byte == normalized_start + 1


def test_multibyte_utf8_and_crlf_remap_in_bytes_not_characters() -> None:
    source = 'const alpha = "λ";\r\nconst beta = "漢字";\r\n'
    normalized = source.replace('\r\n', '\n').encode('utf-8')
    content = 'const beta = "漢字";'
    content_bytes = content.encode('utf-8')
    normalized_start = normalized.index(content_bytes)
    normalized_end = normalized_start + len(content_bytes)

    result = resolve_chunk_byte_span(
        source,
        SimpleNamespace(content=content),
        normalized_start,
        normalized_end,
    )

    original = source.encode('utf-8')
    assert result.mode == 'LF_COMPAT_REMAPPED'
    assert result.verified is True
    assert original[result.start_byte : result.end_byte].replace(b'\r\n', b'\n') == content_bytes
    assert result.start_byte == normalized_start + 1


def test_unrelated_bad_span_is_not_repaired_just_because_crlf_exists() -> None:
    source = 'const alpha = 1;\r\nconst beta = 2;\r\n'

    result = resolve_chunk_byte_span(
        source,
        SimpleNamespace(content='not present anywhere'),
        0,
        7,
    )

    assert result.mode == 'INVALID'
    assert result.verified is False


def test_missing_chunk_content_preserves_span_but_does_not_claim_verification() -> None:
    source = 'const alpha = 1;\r\n'

    result = resolve_chunk_byte_span(source, SimpleNamespace(), 0, 5)

    assert result.mode == 'CONTENT_UNAVAILABLE'
    assert result.verified is False
    assert (result.start_byte, result.end_byte) == (0, 5)
