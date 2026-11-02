from __future__ import annotations

import unittest
from unittest.mock import patch

import numpy as np

import miniforge_nlp_sidecar as sidecar


class _Classifier:
    classes_ = np.array(["legal", "software"])

    def predict_proba(self, _features: np.ndarray) -> np.ndarray:
        return np.array([[0.19, 0.81]])


class ClassifierPassContractTests(unittest.TestCase):
    def test_probability_maps_are_artifacts_and_feature_values_are_numeric(self) -> None:
        checkpoint = {
            "labels": ["legal", "software"],
            "nb": _Classifier(),
            "lr": _Classifier(),
            "model_revision": "fixture-model-v1",
        }
        cluster_features = {
            "cluster_mean_distance": 0.25,
            "cluster_distance_std": 0.0,
            "cluster_diversity": 0.5,
            "chunk_count": 2.0,
        }

        with (
            patch.object(sidecar, "_load_domain_classifier_checkpoint", return_value=checkpoint),
            patch.object(sidecar, "_extract_cluster_features", return_value=cluster_features),
        ):
            backend, features, artifacts, warnings = sidecar._classify_domain_pass("fixture text")

        self.assertEqual(backend, "sklearn-lr")
        self.assertEqual(warnings, [])
        self.assertTrue(all(isinstance(value, (int, float)) for value in features.values()))
        self.assertEqual(artifacts["model_revision"], "fixture-model-v1")
        self.assertEqual(artifacts["naive_bayes_domain_probabilities"], {"legal": 0.19, "software": 0.81})
        self.assertEqual(artifacts["logistic_regression_domain_probabilities"], {"legal": 0.19, "software": 0.81})


if __name__ == "__main__":
    unittest.main()
