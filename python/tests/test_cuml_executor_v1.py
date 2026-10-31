import unittest
import numpy as np

from atlas_graph_runtime.cuml_executor import (
    is_cuml_available,
    cuml_kmeans_fit_predict,
    cuml_umap_transform,
)

class TestCuMLExecutorV1(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        self.features = np.random.randn(100, 16).astype(np.float32)

    def test_kmeans_execution_parity(self):
        result = cuml_kmeans_fit_predict(self.features, n_clusters=4, random_state=42)
        self.assertEqual(len(result.labels), 100)
        self.assertEqual(result.n_clusters, 4)
        self.assertTrue("KMeans" in result.backend)
        self.assertIsNotNone(result.inertia)
        unique_labels = np.unique(result.labels)
        self.assertTrue(len(unique_labels) <= 4)

    def test_umap_execution_parity(self):
        result = cuml_umap_transform(self.features, n_components=2, n_neighbors=5, random_state=42)
        self.assertEqual(result.embedding.shape, (100, 2))
        self.assertEqual(result.n_components, 2)
        self.assertTrue("UMAP" in result.backend or "TruncatedSVD" in result.backend)

    def test_empty_or_invalid_inputs(self):
        with self.assertRaises(ValueError):
            cuml_kmeans_fit_predict(np.zeros((0, 16)))
        with self.assertRaises(ValueError):
            cuml_kmeans_fit_predict(np.zeros((10, 16, 2)))

if __name__ == '__main__':
    unittest.main()
