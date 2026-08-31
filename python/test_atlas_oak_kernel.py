import sys

sys.path.insert(0, "python")

import atlas_oak_kernel as oak


def test_oak_health_does_not_expose_unconfigured_locator(monkeypatch):
    monkeypatch.delenv("ATLAS_OAK_ADAPTER", raising=False)
    monkeypatch.delenv("ATLAS_OAK_ADAPTER_TYPE", raising=False)

    health = oak.oak_health()

    assert health["adapterConfigured"] is False
    assert health["adapterType"] is None
    assert health["adapterFingerprint"] is None
    assert "adapterLocator" not in health


def test_oak_health_fingerprints_configured_locator(monkeypatch):
    locator = "postgresql://user:secret@db.example/atlas"
    monkeypatch.setenv("ATLAS_OAK_ADAPTER", locator)
    monkeypatch.setenv("ATLAS_OAK_ADAPTER_TYPE", "atlas-postgres")

    health = oak.oak_health()

    assert health["adapterConfigured"] is True
    assert health["adapterType"] == "atlas-postgres"
    assert len(health["adapterFingerprint"]) == 64
    assert locator not in str(health)
    assert "secret" not in str(health)
    assert "adapterLocator" not in health
