import hashlib
import json

from python.miniforge_nlp_sidecar import _resolve_ast_language, capabilities


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
