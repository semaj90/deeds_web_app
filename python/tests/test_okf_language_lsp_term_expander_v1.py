"""Tests for OKF language/LSP extension detection, unknowns, and expanded OBO generation."""
from __future__ import annotations

from pathlib import Path

from oaklib import get_adapter

from atlas_graph_runtime.okf_language_lsp_term_expander_v1 import (
    build_expanded_domain_and_language_obo_v1,
    classify_terms_with_unknowns_v1,
    detect_file_extension_language_v1,
    load_okf_language_profiles_v1,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
LANG_DIR = REPO_ROOT / ".okf" / "languages"


def test_detect_extension_and_unknowns() -> None:
    profiles = load_okf_language_profiles_v1(LANG_DIR)
    assert len(profiles) >= 20

    ts_hit = detect_file_extension_language_v1("src/lib/stores/app.svelte.ts", profiles)
    assert ts_hit["status"] == "KNOWN_LANGUAGE"
    assert ts_hit["language"] == "typescript"
    assert ts_hit["matchedExtension"] == ".svelte.ts"

    for ext_path, expected_lang, expected_ext in (("src/native/kernel.cu", "cuda_cpp", ".cu"), ("kernel.cuh", "cuda_cpp", ".cuh"), ("kernel.ptx", "ptx", ".ptx")):
        cuda_hit = detect_file_extension_language_v1(ext_path, profiles)
        assert cuda_hit["status"] == "KNOWN_LANGUAGE"
        assert cuda_hit["language"] == expected_lang
        assert cuda_hit["matchedExtension"] == expected_ext

    unk_hit = detect_file_extension_language_v1("weird/file.xyz_unknown", profiles)
    assert unk_hit["status"] == "UNKNOWN_EXTENSION"
    assert unk_hit["potentialUnknown"] == ".xyz_unknown"

    split = classify_terms_with_unknowns_v1(
        ["typescript", "postgresql", "brand_new_token"],
        {"typescript", "postgresql"},
    )
    assert split["matchedTerms"] == ["typescript", "postgresql"]
    assert split["potentialUnknowns"] == ["brand_new_token"]


def test_build_and_load_expanded_obo_in_oaklib_and_sidecar(tmp_path, monkeypatch) -> None:
    output = tmp_path / "atlas-domain-and-language-terms-v1.obo"
    receipt = build_expanded_domain_and_language_obo_v1(
        languages_dir=LANG_DIR,
        out_path=output,
    )
    assert receipt["domainCount"] == 17
    assert receipt["languageCount"] >= 20
    assert receipt["totalTerms"] > 80

    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(output.parent))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", output.name)
    from miniforge_nlp_sidecar_v2 import (
        OaklibLabelSearchRequestV1,
        _configured_oaklib_resource,
        oaklib_label_search,
    )

    resolved, digest = _configured_oaklib_resource()
    assert resolved == output.resolve()
    assert digest.startswith("sha256:")

    adapter = get_adapter(f"pronto:{output}")
    entities = set(adapter.entities())
    assert "ATLASDOM:database.postgresql" in entities
    assert "ATLASLANG:typescript" in entities
    assert "ATLASLANG:cuda_cpp" in entities
    assert "ATLASISA:ptx" in entities
    assert "ATLASEXT:svelte.ts" in entities
    assert "ATLASEXT:ptx" in entities
    result = oaklib_label_search(OaklibLabelSearchRequestV1(terms=[".cu", "PTX Virtual ISA", "missing-test-term"]))
    response = result.model_dump(mode="json", by_alias=True)
    assert response["ontologyRevision"] == digest
    assert response["status"] == "PROPOSAL_ONLY"
    ptx_matches = next(item for item in response["matches"] if item["searchText"] == "PTX Virtual ISA")
    assert "ATLASISA:ptx" in ptx_matches["externalIds"]
    assert response["canonicalAuthority"] is False
    matches = {row["searchText"]: row["externalIds"] for row in response["matches"]}
    assert matches[".cu"] == ["ATLASEXT:cu"]
    assert matches["missing-test-term"] == []
