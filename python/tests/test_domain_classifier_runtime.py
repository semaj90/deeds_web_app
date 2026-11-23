import unittest
import tempfile
from pathlib import Path

import joblib
import numpy as np
from sklearn.cluster import KMeans
from unittest.mock import patch

from atlas_domain_classifier_runtime import NumpyCentroidKMeans, cluster_distance_features
from python import miniforge_nlp_sidecar


class NumpyCentroidKMeansTests(unittest.TestCase):
    def test_distances_and_assignments_match_euclidean_centroids(self):
        model = NumpyCentroidKMeans(np.array([[0.0, 0.0], [3.0, 4.0]], dtype=np.float32))
        values = np.array([[0.0, 0.0], [3.0, 3.0], [1.5, 2.0]], dtype=np.float32)

        distances = model.transform(values)

        np.testing.assert_allclose(distances[0], [0.0, 5.0], atol=1e-6)
        np.testing.assert_allclose(distances[1], [np.sqrt(18.0), 1.0], atol=1e-6)
        np.testing.assert_array_equal(model.predict(values), [0, 1, 0])
        self.assertEqual(model.n_clusters, 2)

    def test_rejects_invalid_centroids_and_features(self):
        with self.assertRaises(ValueError):
            NumpyCentroidKMeans(np.empty((0, 2), dtype=np.float32))
        with self.assertRaises(ValueError):
            NumpyCentroidKMeans(np.array([[np.nan, 0.0]], dtype=np.float32))

        model = NumpyCentroidKMeans(np.array([[0.0, 0.0]], dtype=np.float32))
        with self.assertRaises(ValueError):
            model.transform(np.array([[1.0]], dtype=np.float32))
        with self.assertRaises(ValueError):
            model.transform(np.array([[np.inf, 1.0]], dtype=np.float32))

    def test_joblib_checkpoint_can_round_trip_portable_centroids(self):
        model = NumpyCentroidKMeans(np.array([[0.0, 0.0], [3.0, 4.0]], dtype=np.float32))
        with tempfile.TemporaryDirectory() as temporary_directory:
            checkpoint_path = Path(temporary_directory) / "checkpoint.joblib"
            joblib.dump({"kmeans": model}, checkpoint_path)
            restored = joblib.load(checkpoint_path)["kmeans"]

        np.testing.assert_allclose(restored.transform(np.array([[0.0, 0.0]], dtype=np.float32)), [[0.0, 5.0]])
        np.testing.assert_array_equal(restored.predict(np.array([[3.0, 4.0]], dtype=np.float32)), [1])

    def test_shared_feature_recipe_matches_sklearn_and_portable_centroids(self):
        values = np.array([[0.0, 0.0], [0.2, 0.1], [3.0, 4.0]], dtype=np.float32)
        sklearn_model = KMeans(n_clusters=2, init=np.array([[0.0, 0.0], [3.0, 4.0]]), n_init=1, random_state=7)
        sklearn_model.fit(values)
        portable_model = NumpyCentroidKMeans(sklearn_model.cluster_centers_)

        expected = cluster_distance_features(sklearn_model, values)
        actual = cluster_distance_features(portable_model, values)

        self.assertEqual(set(expected), set(actual))
        for key in expected:
            self.assertAlmostEqual(expected[key], actual[key], places=5)

    def test_shared_feature_count_uses_only_successfully_embedded_rows(self):
        model = NumpyCentroidKMeans(np.array([[0.0, 0.0], [3.0, 4.0]], dtype=np.float32))
        features = cluster_distance_features(model, np.array([[0.0, 0.0]], dtype=np.float32))
        self.assertEqual(features["chunk_count"], 1.0)

    def test_serving_feature_extraction_uses_successful_embedding_count(self):
        model = NumpyCentroidKMeans(np.array([[0.0, 0.0], [3.0, 4.0]], dtype=np.float32))
        with patch.object(miniforge_nlp_sidecar, "_fetch_ollama_embedding", side_effect=[[0.0, 0.0], None]):
            features = miniforge_nlp_sidecar._extract_cluster_features(
                "First sentence. Second sentence.", {"kmeans": model}
            )
        self.assertIsNotNone(features)
        self.assertEqual(features["chunk_count"], 1.0)

    def test_serving_loader_reads_portable_checkpoint_and_uses_shared_features(self):
        model = NumpyCentroidKMeans(np.array([[0.0, 0.0], [3.0, 4.0]], dtype=np.float32))
        with tempfile.TemporaryDirectory() as temporary_directory:
            checkpoint_path = Path(temporary_directory) / "checkpoint.joblib"
            joblib.dump({"kmeans": model, "labels": ["a", "b"], "model_revision": "fixture-v1"}, checkpoint_path)
            with (
                patch.object(miniforge_nlp_sidecar, "DOMAIN_CLASSIFIER_CHECKPOINT_PATH", checkpoint_path),
                patch.object(miniforge_nlp_sidecar, "_domain_classifier_checkpoint_loaded", False),
                patch.object(miniforge_nlp_sidecar, "_domain_classifier_checkpoint", None),
                patch.object(miniforge_nlp_sidecar, "_fetch_ollama_embedding", return_value=[0.0, 0.0]),
            ):
                loaded = miniforge_nlp_sidecar._load_domain_classifier_checkpoint()
                features = miniforge_nlp_sidecar._extract_cluster_features("One sentence.", loaded)

        self.assertEqual(loaded["model_revision"], "fixture-v1")
        self.assertEqual(features["chunk_count"], 1.0)
        self.assertEqual(features["cluster_mean_distance"], 0.0)


if __name__ == "__main__":
    unittest.main()
