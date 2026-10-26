import hashlib
import json

import pytest

from parent_atlas_ontology.language_catalog_v1 import build_catalog, validate_catalog


def _manifest():
    return json.dumps({"version": "1.2.3", "languages": {"typescript": {}, "python": {}}}).encode()


def test_catalog_is_deterministic_and_source_revision_bound():
    first = build_catalog(_manifest(), source_ref="wsl:/cache/manifest.json", python_version="3.14.6")
    second = build_catalog(_manifest(), source_ref="wsl:/cache/manifest.json", python_version="3.14.6")
    assert first == second
    assert first["source"]["manifestSha256"] == hashlib.sha256(_manifest()).hexdigest()
    assert [item["grammarId"] for item in first["entries"]] == ["python", "typescript"]
    validate_catalog(first)


def test_catalog_rejects_non_candidate_or_tampered_entries():
    catalog = build_catalog(_manifest(), source_ref="wsl:/cache/manifest.json", python_version="3.14.6")
    catalog["entries"][0]["qualification"] = "READY"
    with pytest.raises(ValueError, match="TREE_SITTER_CATALOG_PROMOTION_BLOCKED"):
        validate_catalog(catalog)


def test_catalog_rejects_duplicate_ids_case_insensitively():
    manifest = json.dumps({"version": "1", "languages": {"Python": {}, "python": {}}}).encode()
    with pytest.raises(ValueError, match="TREE_SITTER_GRAMMAR_ID_COLLISION"):
        build_catalog(manifest, source_ref="fixture", python_version="3.14")


def test_catalog_rejects_modified_checksum():
    catalog = build_catalog(_manifest(), source_ref="fixture", python_version="3.14")
    catalog["source"]["sourceRef"] = "different"
    with pytest.raises(ValueError, match="TREE_SITTER_CATALOG_CHECKSUM_MISMATCH"):
        validate_catalog(catalog)
