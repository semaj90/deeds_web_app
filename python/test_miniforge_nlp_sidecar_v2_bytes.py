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
