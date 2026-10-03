import hashlib
import json

from python.miniforge_nlp_sidecar import capabilities


def test_capabilities_expose_sidecar_languages_from_the_runtime_mapping():
    report = capabilities()
    ast = report["ast"]
    vocabularies = {item["namespace"]: item for item in ast["languageVocabularies"]}
    bindings = ast["languageBindings"]

    assert set(vocabularies) == {"FILE_EXTENSION", "SIDECAR_LANGUAGE"}
    extensions = vocabularies["FILE_EXTENSION"]["labels"]
    languages = vocabularies["SIDECAR_LANGUAGE"]["labels"]
    assert ".tsx" in extensions
    assert "typescript" in languages
    assert {binding["fromLabel"]: binding["toLabel"] for binding in bindings}[".tsx"] == "tsx"
    assert all(binding["authorityRevision"] == vocabularies["FILE_EXTENSION"]["sourceRevision"] for binding in bindings)
    assert all(binding["evidenceRefs"] for binding in bindings)

    revision = vocabularies["FILE_EXTENSION"]["sourceRevision"]
    pairs = sorted(zip(extensions, [binding["toLabel"] for binding in bindings]))
    expected = "sha256:" + hashlib.sha256(
        json.dumps(pairs, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert revision == expected
