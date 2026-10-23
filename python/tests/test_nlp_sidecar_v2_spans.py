import hashlib

from python.miniforge_nlp_sidecar import AstChunkRequest
from python.miniforge_nlp_sidecar_v2 import _native_ast_evidence, _span_matches_original


def test_terminal_newline_accepts_chunker_exclusive_end_line_convention():
    source = b"version: 1\nlanguage: yaml\n"

    assert _span_matches_original(
        source,
        0,
        len(source),
        content_bytes=source,
        reported_start_line=1,
        reported_end_line=3,
    )


def test_terminal_newline_line_convention_still_requires_exact_bytes():
    source = b"version: 1\nlanguage: yaml\n"

    assert not _span_matches_original(
        source,
        0,
        len(source),
        content_bytes=b"version: 1\nlanguage: bad\n",
        reported_start_line=1,
        reported_end_line=3,
    )


def test_terminal_newline_line_convention_does_not_apply_to_interior_spans():
    source = b"first: 1\nsecond: 2\n"
    end = len(b"first: 1\n")

    assert not _span_matches_original(
        source,
        0,
        end,
        content_bytes=source[:end],
        reported_start_line=1,
        reported_end_line=2,
    )


def test_matching_terminal_newline_end_line_remains_valid():
    source = b"version: 1\nlanguage: yaml\n"

    assert _span_matches_original(
        source,
        0,
        len(source),
        content_bytes=source,
        reported_start_line=1,
        reported_end_line=2,
    )


def test_yaml_chunker_terminal_newline_fixture_is_clean_and_span_exact():
    source = "version: 1\nlanguage: yaml\n"
    source_bytes = source.encode("utf-8")
    revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()

    result = _native_ast_evidence(
        AstChunkRequest(
            source=source,
            language="yaml",
            filePath="config.yaml",
            sourceRevision=revision,
        )
    )

    assert result.syntax_status == "CLEAN"
    assert result.scan_completeness == "COMPLETE"
    assert result.chunks
    for chunk in result.chunks:
        span = source_bytes[chunk.start_byte:chunk.end_byte]
        assert span
        span.decode("utf-8")


def test_clean_tree_sitter_fallbacks_emit_observations_without_upstream_ids():
    fixtures = [
        ("powershell", "fixture.ps1", "$Name = 'x'"),
        ("proto", "user.proto", 'syntax = "proto3"; message User { string id = 1; }'),
        ("bash", "build.sh", '#!/usr/bin/env bash\nset -e\necho "ok"'),
    ]

    for language, path, source in fixtures:
        source_bytes = source.encode("utf-8")
        revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
        result = _native_ast_evidence(
            AstChunkRequest(
                source=source,
                language=language,
                filePath=path,
                sourceRevision=revision,
            )
        )

        assert result.engine == "tree-sitter-language-pack"
        assert result.syntax_status == "CLEAN"
        assert result.scan_completeness == "COMPLETE"
        assert result.chunks
        for chunk in result.chunks:
            span = source_bytes[chunk.start_byte:chunk.end_byte]
            assert span
            span.decode("utf-8")
            assert chunk.upstream_node_id is None
            assert chunk.upstream_symbol_id is None
            assert chunk.upstream_chunk_id is None


def test_tree_sitter_fallback_abstains_when_syntax_has_errors():
    fixtures = [
        ("bash", "bad.sh", "if then\necho broken\nfi\n"),
        ("proto", "bad.proto", 'syntax = "proto3"; message { broken'),
        ("yaml", "bad.yaml", "a: [unterminated\n"),
    ]

    for language, path, source in fixtures:
        revision = "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest()
        result = _native_ast_evidence(
            AstChunkRequest(
                source=source,
                language=language,
                filePath=path,
                sourceRevision=revision,
            )
        )

        assert result.engine == "treesitter-chunker"
        assert result.syntax_status == "RECOVERED_WITH_ERRORS"
        assert result.scan_completeness == "PARTIAL_AST_FAILED"
        assert result.scan_failure == "NO_STRUCTURAL_CHUNKS"
        assert not result.chunks


def test_all_eight_new_language_routes_have_clean_v2_fixtures():
    fixtures = [
        ("sql", "fixture.sql", "CREATE TABLE items (id INTEGER PRIMARY KEY);"),
        ("powershell", "fixture.ps1", "$Name = 'x'"),
        ("proto", "user.proto", 'syntax = "proto3"; message User { string id = 1; }'),
        ("bash", "build.sh", '#!/usr/bin/env bash\nset -e\necho "ok"'),
        ("yaml", "config.yaml", "version: 1\nlanguage: yaml\n"),
        ("c", "main.c", "int main(void) { return 0; }"),
        ("cpp", "main.cpp", "int main() { return 0; }"),
        ("toml", "Cargo.toml", '[package]\nname = "demo"\nversion = "1.0"'),
    ]

    for language, path, source in fixtures:
        source_bytes = source.encode("utf-8")
        revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
        result = _native_ast_evidence(
            AstChunkRequest(
                source=source,
                language=language,
                filePath=path,
                sourceRevision=revision,
            )
        )

        assert result.syntax_status == "CLEAN", language
        assert result.scan_completeness == "COMPLETE", language
        assert result.chunks, language
        for chunk in result.chunks:
            span = source_bytes[chunk.start_byte:chunk.end_byte]
            assert span, language
            span.decode("utf-8")
