from pathlib import Path
from tempfile import TemporaryDirectory

import yaml

from audit_okf_manifest_coverage_v1 import audit_okf_manifest


def write_fixture(root: Path, manifest: dict) -> None:
    okf = root / ".okf"
    okf.mkdir(parents=True, exist_ok=True)
    (okf / "manifest.yaml").write_text(yaml.safe_dump(manifest, sort_keys=False), encoding="utf-8")


def test_declared_schema_and_catalog_references_resolve() -> None:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        okf = root / ".okf"
        (okf / "languages").mkdir(parents=True)
        (okf / "schemas").mkdir()
        (okf / "languages" / "python.yaml").write_text("name: Python\n", encoding="utf-8")
        (okf / "languages" / "catalog.json").write_text("{}\n", encoding="utf-8")
        (okf / "schemas" / "catalog.schema.json").write_text("{}\n", encoding="utf-8")
        write_fixture(root, {"registries": {"languages": {
            "path": "languages/",
            "schemas": ["python.yaml"],
            "candidateCatalogs": [{"path": "languages/catalog.json", "schema": "../schemas/catalog.schema.json"}],
        }}})

        result = audit_okf_manifest(root)

        assert result["status"] == "OKF_MANIFEST_REFERENCES_PROVEN"
        assert result["declaredReferenceCount"] == 3
        assert result["resolvedReferenceCount"] == 3
        assert result["unsafeReferences"] == []
        assert result["unregisteredStructuredFiles"] == []


def test_missing_and_unlisted_files_are_reported_without_claiming_authority() -> None:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        domains = root / ".okf" / "domains"
        domains.mkdir(parents=True)
        (domains / "extra.yaml").write_text("name: extra\n", encoding="utf-8")
        write_fixture(root, {"registries": {"domains": {"path": "domains/", "schemas": ["missing.yaml"]}}})

        result = audit_okf_manifest(root)

        assert result["status"] == "OKF_MANIFEST_REFERENCES_STALE"
        assert result["missingReferences"][0]["path"] == "domains/missing.yaml"
        assert result["additionalStructuredFiles"] == ["domains/extra.yaml"]
        assert result["canonicalAuthority"] is False
        assert result["writesPerformed"] is False


def test_references_escaping_okf_root_fail_closed() -> None:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        write_fixture(root, {"registries": {"domains": {"path": "../outside", "schemas": []}}})

        result = audit_okf_manifest(root)

        assert result["status"] == "OKF_MANIFEST_REFERENCES_STALE"
        assert result["unsafeReferences"][0]["reason"] == "PATH_ESCAPES_OKF_ROOT"
        assert result["writesPerformed"] is False


def test_structured_files_outside_registry_paths_are_reported() -> None:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        okf = root / ".okf"
        (okf / "languages").mkdir(parents=True)
        (okf / "languages" / "python.yaml").write_text("name: Python\n", encoding="utf-8")
        (okf / "pipelines").mkdir()
        (okf / "pipelines" / "extract.yaml").write_text("name: extract\n", encoding="utf-8")
        write_fixture(root, {"registries": {"languages": {"path": "languages/", "schemas": ["python.yaml"]}}})

        result = audit_okf_manifest(root)

        assert result["status"] == "OKF_MANIFEST_REFERENCES_STALE"
        assert result["unregisteredStructuredFiles"] == ["pipelines/extract.yaml"]


def test_duplicate_yaml_manifest_keys_are_rejected() -> None:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        okf = root / ".okf"
        okf.mkdir()
        (okf / "manifest.yaml").write_text("registries: {}\nregistries: {}\n", encoding="utf-8")

        result = audit_okf_manifest(root)

        assert result["status"] == "OKF_MANIFEST_INVALID_YAML"
        assert "duplicate key" in result["errors"][0]
