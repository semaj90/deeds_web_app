import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pca_svd_representation_baseline_v1 import fetch_rows, fit_pca_projection


class FakeCursor:
    description = [("id",), ("content_embedding",)]

    def __init__(self):
        self.query = ""

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def execute(self, query, params):
        self.query = query

    def fetchall(self):
        return []


class FakeConnection:
    def __init__(self):
        self.fake_cursor = FakeCursor()

    def cursor(self):
        return self.fake_cursor


def test_semantic_cohort_does_not_require_autoencoder_latents():
    connection = FakeConnection()

    assert fetch_rows(connection, 512) == []
    assert "content_embedding IS NOT NULL" in connection.fake_cursor.query
    assert "latent_256 IS NOT NULL" not in connection.fake_cursor.query


def test_latent_cohort_is_explicitly_filtered():
    connection = FakeConnection()

    assert fetch_rows(connection, 64, require_latents=True) == []
    assert "latent_256 IS NOT NULL" in connection.fake_cursor.query


def test_projection_rejects_components_above_sample_rank():
    vectors = np.ones((20, 768), dtype=np.float32)

    with pytest.raises(ValueError, match="exceeds matrix capacity 20"):
        fit_pca_projection(vectors, 512, seed=42)


def test_projection_preserves_requested_component_dimension():
    vectors = np.random.default_rng(42).normal(size=(32, 16)).astype(np.float32)

    projected = fit_pca_projection(vectors, 8, seed=42)

    assert projected.shape == (32, 8)


@pytest.mark.parametrize("dim", [0, -1, 17])
def test_projection_rejects_invalid_component_dimensions(dim):
    vectors = np.ones((32, 16), dtype=np.float32)

    with pytest.raises(ValueError):
        fit_pca_projection(vectors, dim, seed=42)
