"""Verify local OBO ontology satisfies miniforge_nlp_sidecar_v2 and oaklib pronto adapter."""
from __future__ import annotations

from pathlib import Path

from oaklib import get_adapter

REPO_ROOT = Path(__file__).resolve().parents[2]
OBO_ROOT = REPO_ROOT / ".okf" / "ontologies"
OBO_FILE = "atlas-domain-taxonomy-v1.obo"


def test_local_domain_taxonomy_obo_loads_in_oaklib_and_sidecar(monkeypatch) -> None:
    obo_path = OBO_ROOT / OBO_FILE
    assert obo_path.is_file()

    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(OBO_ROOT))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", OBO_FILE)

    from miniforge_nlp_sidecar_v2 import _configured_oaklib_resource

    resolved_path, digest = _configured_oaklib_resource()
    assert resolved_path == obo_path.resolve()
    assert digest.startswith("sha256:") and len(digest) == 71

    adapter = get_adapter(f"pronto:{obo_path}")
    entities = list(adapter.entities())
    assert "ATLASDOM:database.postgresql" in entities
    assert "ATLASDOM:database" in entities
    ancestors = set(adapter.ancestors("ATLASDOM:database.postgresql"))
    assert "ATLASDOM:database" in ancestors
