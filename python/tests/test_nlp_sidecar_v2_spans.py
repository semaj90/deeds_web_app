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


def test_v2_cpp_macro_function_declarations_keep_exact_original_spans():
    source = """#define ATLAS_GEMM_API
extern "C" {
ATLAS_GEMM_API int atlasGemm(int value);
ATLAS_GEMM_API int atlasGemmCpuF32(float value);
}
"""
    source_bytes = source.encode("utf-8")
    revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()

    result = _native_ast_evidence(
        AstChunkRequest(
            source=source,
            language="cpp",
            filePath="gemm_contract.h",
            sourceRevision=revision,
        )
    )

    declarations = [chunk for chunk in result.chunks if chunk.name in {"atlasGemm", "atlasGemmCpuF32"}]
    assert {chunk.name for chunk in declarations} == {"atlasGemm", "atlasGemmCpuF32"}
    assert len(declarations) == 2
    assert result.scan_completeness == "COMPLETE"
    assert result.syntax_status == "RECOVERED_WITH_ERRORS"
    expected = {
        "atlasGemm": "ATLAS_GEMM_API int atlasGemm(int value);",
        "atlasGemmCpuF32": "ATLAS_GEMM_API int atlasGemmCpuF32(float value);",
    }
    for chunk in declarations:
        assert source_bytes[chunk.start_byte:chunk.end_byte].decode("utf-8").strip() == expected[chunk.name]
        assert chunk.upstream_symbol_id is None
        assert chunk.upstream_node_id is None


def test_v2_cpp_include_emits_exact_unresolved_import_observation():
    source = '#include "local/header.h"\nint run() { return 0; }\n'
    source_bytes = source.encode("utf-8")
    revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()

    result = _native_ast_evidence(
        AstChunkRequest(
            source=source,
            language="cpp",
            filePath="src/run.cpp",
            sourceRevision=revision,
        )
    )

    includes = [chunk for chunk in result.chunks if "local/header.h" in chunk.imports]
    assert len(includes) == 1
    include = includes[0]
    assert source_bytes[include.start_byte:include.end_byte] == b'#include "local/header.h"\n'
    assert include.kind == "import"
    edge = next(edge for edge in result.edges if edge.type == "IMPORTS" and edge.to_evidence_key == "local/header.h")
    assert edge.resolved is False
    assert edge.resolution == "syntax_only"
