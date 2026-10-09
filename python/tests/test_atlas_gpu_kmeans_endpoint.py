import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".." / "services" / "atlas-gpu-8098"))

import app as gpu_executor_app  # noqa: E402


def test_kmeans_route_is_mounted_and_uses_existing_runtime(monkeypatch):
    captured = {}

    def fake_cluster(request):
        captured["request"] = request
        return {
            "schema": "atlas.latent64-kmeans-receipt.v2",
            "backend": "cuml.cluster.KMeans",
            "canonicalAuthority": False,
            "assignments": [],
        }

    monkeypatch.setattr(gpu_executor_app, "cluster_latent64", fake_cluster)
    lease = {
        "schema": "atlas.gpu-execution-lease.v1",
        "leaseId": "lease:kmeans:test",
        "leaseEpoch": 1,
        "budgetRevision": "budget:kmeans:test",
        "executor": "cuml",
        "requestedBytes": 1024,
        "activeReservedBytes": 0,
        "availableBytes": 4096,
        "admission": "ALLOW",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    payload = {
        "rows": [
            {
                "packetKey": "fixture:a",
                "sourceRevision": "fixture:source",
                "vector": [1.0] + [0.0] * 63,
            },
            {
                "packetKey": "fixture:b",
                "sourceRevision": "fixture:source",
                "vector": [0.0, 1.0] + [0.0] * 62,
            },
        ],
        "autoencoderRevision": "fixture:autoencoder",
        "nClusters": 2,
        "residencyLease": lease,
    }

    with TestClient(gpu_executor_app.app) as client:
        schema = client.get("/openapi.json").json()
        assert "/v1/semantic512/kmeans" in schema["paths"]
        response = client.post("/v1/semantic512/kmeans", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["backend"] == "cuml.cluster.KMeans"
    assert result["canonicalAuthority"] is False
    assert result["writes"] == {"postgres": False, "qdrant": False, "valkey": False}
    assert result["residency"]["status"] == "SHARED_LEASE_ACCEPTED"
    assert captured["request"].autoencoderRevision == "fixture:autoencoder"


def test_kmeans_route_rejects_wrong_residency_executor(monkeypatch):
    def unexpected_cluster(request):
        raise AssertionError("cluster runtime must not run with a mismatched lease")

    monkeypatch.setattr(gpu_executor_app, "cluster_latent64", unexpected_cluster)
    payload = {
        "rows": [
            {"packetKey": "fixture:a", "vector": [1.0] + [0.0] * 63},
            {"packetKey": "fixture:b", "vector": [0.0, 1.0] + [0.0] * 62},
        ],
        "autoencoderRevision": "fixture:autoencoder",
        "nClusters": 2,
        "residencyLease": {
            "schema": "atlas.gpu-execution-lease.v1",
            "leaseId": "lease:kmeans:test",
            "leaseEpoch": 1,
            "budgetRevision": "budget:kmeans:test",
            "executor": "cuvs",
            "requestedBytes": 1024,
            "activeReservedBytes": 0,
            "availableBytes": 4096,
            "admission": "ALLOW",
            "canonicalAuthority": False,
            "writesPerformed": False,
        },
    }

    with TestClient(gpu_executor_app.app) as client:
        response = client.post("/v1/semantic512/kmeans", json=payload)

    assert response.status_code == 428
    assert response.json()["detail"] == "GPU_RESIDENCY_EXECUTOR_MISMATCH:cuvs:cuml"
