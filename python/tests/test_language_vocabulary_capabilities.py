import hashlib
import json

import pytest

from python.miniforge_nlp_sidecar import AstChunkRequest, _ast_evidence, _resolve_ast_language, capabilities, get_parser


def test_capabilities_expose_sidecar_languages_from_the_runtime_mapping():
    report = capabilities()
    ast = report["ast"]
    vocabularies = {item["namespace"]: item for item in ast["languageVocabularies"]}
    bindings = ast["languageBindings"]

    assert set(vocabularies) == {"FILE_EXTENSION", "SIDECAR_LANGUAGE"}
    extensions = vocabularies["FILE_EXTENSION"]["labels"]
    languages = vocabularies["SIDECAR_LANGUAGE"]["labels"]
    assert ".tsx" in extensions
    assert ".svelte" in extensions
    assert "typescript" in languages
    assert "svelte" in languages
    assert {binding["fromLabel"]: binding["toLabel"] for binding in bindings}[".tsx"] == "tsx"
    assert {binding["fromLabel"]: binding["toLabel"] for binding in bindings}[".svelte"] == "svelte"
    assert all(binding["authorityRevision"] == vocabularies["FILE_EXTENSION"]["sourceRevision"] for binding in bindings)
    assert all(binding["evidenceRefs"] for binding in bindings)

    revision = vocabularies["FILE_EXTENSION"]["sourceRevision"]
    pairs = sorted(zip(extensions, [binding["toLabel"] for binding in bindings]))
    expected = "sha256:" + hashlib.sha256(
        json.dumps(pairs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert revision == expected


def test_svelte_extension_resolves_only_to_svelte_parser():
    assert _resolve_ast_language("svelte", "src/Example.svelte") == ("svelte", None)
    language, error = _resolve_ast_language("typescript", "src/Example.svelte")
    assert language == "typescript"
    assert error is not None and "does not match" in error


def test_additional_repository_parser_routes_match_their_declared_language():
    expected = {
        ".sql": "sql",
        ".ps1": "powershell",
        ".psm1": "powershell",
        ".psd1": "powershell",
        ".proto": "proto",
        ".sh": "bash",
        ".bash": "bash",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".cmake": "cmake",
        ".lua": "lua",
        ".comp": "glsl",
        ".glsl": "glsl",
        ".c": "c",
        ".cc": "cpp",
        ".cpp": "cpp",
        ".cxx": "cpp",
        ".hh": "cpp",
        ".hpp": "cpp",
        ".cu": "cpp",
        ".toml": "toml",
    }
    bindings = {binding["fromLabel"]: binding["toLabel"] for binding in capabilities()["ast"]["languageBindings"]}
    assert {extension: bindings.get(extension) for extension in expected} == expected
    for extension, language in expected.items():
        assert _resolve_ast_language(language, f"fixture{extension}") == (language, None)


def test_ambiguous_h_headers_require_explicit_c_or_cpp_language():
    assert _resolve_ast_language("c", "include/shared.h") == ("c", None)
    assert _resolve_ast_language("cpp", "include/shared.h") == ("cpp", None)
    language, error = _resolve_ast_language("python", "include/shared.h")
    assert language == "python"
    assert error is not None and "unsupported file extension '.h'" in error


@pytest.mark.skipif(get_parser is None, reason="Tree-sitter language pack is unavailable")
def test_ambiguous_h_cpp_override_produces_complete_ast_with_exact_byte_spans():
    source = "#pragma once\nstruct AtlasHeader { int value; };\n"
    source_bytes = source.encode("utf-8")
    revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
    evidence = _ast_evidence(AstChunkRequest(
        source=source,
        language="cpp",
        file_path="include/shared.h",
        source_ref="include/shared.h",
        source_revision=revision,
    ))
    assert evidence.scan_completeness == "COMPLETE"
    assert evidence.syntax_status == "CLEAN"
    assert evidence.source_revision == revision
    assert evidence.chunks
    assert all(0 <= chunk.start_byte < chunk.end_byte <= len(source_bytes) for chunk in evidence.chunks)


def test_cpp_linkage_block_function_prototype_is_emitted_with_original_span():
    source = '#define ATLAS_API\nextern "C" {\nATLAS_API int atlasGemm(int value);\n}\n'
    source_bytes = source.encode("utf-8")
    revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
    evidence = _ast_evidence(AstChunkRequest(
        source=source,
        language="cpp",
        file_path="include/atlas.h",
        source_ref="include/atlas.h",
        source_revision=revision,
    ))
    matches = [chunk for chunk in evidence.chunks if chunk.name == "atlasGemm"]
    assert len(matches) == 1
    chunk = matches[0]
    assert chunk.node_type == "function_declaration"
    assert source_bytes[chunk.start_byte:chunk.end_byte] == b"ATLAS_API int atlasGemm(int value);"
    assert evidence.source_revision == revision


@pytest.mark.skipif(get_parser is None, reason="Tree-sitter language pack is unavailable")
def test_additional_repository_grammars_parse_clean_minimal_fixtures():
    fixtures = {
        "sql": "select id from users where active = true;",
        "powershell": "$Name = 'x'",
        "proto": 'syntax = "proto3"; message User { string id = 1; }',
        "bash": '#!/usr/bin/env bash\nset -e\necho "ok"',
        "yaml": "version: 1\nlanguage: yaml\n",
        "cmake": "cmake_minimum_required(VERSION 3.20)\nproject(atlas LANGUAGES C CXX)\n",
        "lua": "local function add(a, b) return a + b end\n",
        "glsl": "#version 450\nvoid main() {}\n",
        "c": "int main(void) { return 0; }",
        "cpp": "int main() { return 0; }",
        "toml": '[package]\nname = "demo"\nversion = "1.0"',
    }
    for language, source in fixtures.items():
        root = get_parser(language).parse(source.encode("utf-8")).root_node
        assert not root.has_error, f"{language} minimal fixture produced a syntax error"


@pytest.mark.skipif(get_parser is None, reason="Tree-sitter language pack is unavailable")
def test_additional_repository_languages_emit_complete_ast_chunks_with_exact_byte_spans():
    fixtures = {
        "sql": ("select id from users where active = true;", "query.sql"),
        "powershell": ("$Name = 'x'", "script.ps1"),
        "proto": ('syntax = "proto3"; message User { string id = 1; }', "user.proto"),
        "bash": ('#!/usr/bin/env bash\nset -e\necho "ok"', "build.sh"),
        "yaml": ("version: 1\nlanguage: yaml\n", "config.yaml"),
        "cmake": ("cmake_minimum_required(VERSION 3.20)\nproject(atlas LANGUAGES C CXX)\n", "CMakeLists.cmake"),
        "lua": ("local function add(a, b) return a + b end\n", "worker.lua"),
        "glsl": ("#version 450\nvoid main() {}\n", "compute.comp"),
        "c": ("int main(void) { return 0; }", "main.c"),
        "cpp": ("int main() { return 0; }", "main.cpp"),
        "toml": ('[package]\nname = "demo"\nversion = "1.0"', "Cargo.toml"),
    }
    for language, (source, path) in fixtures.items():
        source_bytes = source.encode("utf-8")
        revision = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
        evidence = _ast_evidence(AstChunkRequest(
            source=source, language=language, filePath=path, sourceRevision=revision,
        ))
        assert evidence.syntax_status == "CLEAN", f"{language} fixture was not syntax-clean"
        assert evidence.scan_completeness == "COMPLETE", f"{language} AST scan was incomplete"
        assert evidence.chunks, f"{language} produced no AST chunks"
        for chunk in evidence.chunks:
            assert 0 <= chunk.start_byte < chunk.end_byte <= len(source_bytes)
            source_bytes[chunk.start_byte:chunk.end_byte].decode("utf-8")
