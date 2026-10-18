import importlib.util
import tempfile
import unittest
from pathlib import Path

import numpy as np


MODULE_PATH = Path(__file__).parent / "lib" / "xgb_resumable_fit_v1.py"
SPEC = importlib.util.spec_from_file_location("xgb_resumable_fit_v1", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ResumableXgbFitTests(unittest.TestCase):
    def test_centroid_ids_are_encoded_as_categories_not_ordered_scalars(self):
        cosines = np.asarray([[0.9, 0.7, 0.5], [0.8, 0.6, 0.4]], dtype=np.float32)
        ids = np.asarray([[3, 1, 0], [1, 3, 2]], dtype=np.int32)
        features = MODULE.build_centroid_features(cosines, ids, cluster_count=4)
        np.testing.assert_array_equal(features[:, :3], cosines)
        np.testing.assert_allclose(features[:, 3], [0.2, 0.2], rtol=1e-6, atol=1e-7)
        np.testing.assert_array_equal(features[:, 4:], [[0, 0, 0, 1], [0, 1, 0, 0]])

    def test_centroid_feature_builder_rejects_out_of_range_ids(self):
        with self.assertRaisesRegex(ValueError, "outside declared cluster range"):
            MODULE.build_centroid_features(np.asarray([[0.9, 0.7]]), np.asarray([[4, 1]]), cluster_count=4)

    @classmethod
    def setUpClass(cls):
        try:
            import xgboost
        except ImportError as exc:
            raise unittest.SkipTest("xgboost is not installed in this Python environment") from exc
        cls.xgb = xgboost

    def setUp(self):
        self.features = np.asarray([[0, 0], [0, 1], [1, 0], [1, 1], [0.2, 0.1], [0.9, 0.8]], dtype=np.float32)
        self.labels = np.asarray([0, 0, 1, 1, 0, 1], dtype=np.int32)
        self.params = {"objective": "binary:logistic", "max_depth": 2, "eta": 0.3, "tree_method": "hist", "nthread": 1, "seed": 7}
        self.temp = tempfile.TemporaryDirectory()
        self.checkpoint = Path(self.temp.name) / "model.json"

    def tearDown(self):
        self.temp.cleanup()

    def test_resumes_from_existing_round_checkpoint(self):
        callback_type = self.xgb.callback.TrainingCallback
        original = MODULE.fit_resumable
        features = self.features
        labels = self.labels
        params = self.params
        xgb = self.xgb
        checkpoint = self.checkpoint

        class StopAfterFirstInterval(callback_type):
            def after_iteration(self, model, epoch, evals_log):
                done = int(model.num_boosted_rounds())
                if done == 3:
                    model.set_attr(atlas_resume_fingerprint=MODULE._fingerprint(
                        features, labels, params, 6, xgb.__version__
                    ))
                    temporary = checkpoint.with_name("model.tmp.json")
                    model.save_model(str(temporary))
                    temporary.replace(checkpoint)
                    raise RuntimeError("SIMULATED_INTERRUPTION")
                return False

        matrix = self.xgb.DMatrix(features, label=labels)
        with self.assertRaisesRegex(RuntimeError, "SIMULATED_INTERRUPTION"):
            self.xgb.train(self.params, matrix, num_boost_round=6, callbacks=[StopAfterFirstInterval()])
        booster, receipt = original(self.xgb, self.features, self.labels, self.checkpoint, self.params, rounds=6, interval=3)
        self.assertEqual(receipt["status"], "RESUMED")
        self.assertEqual(booster.num_boosted_rounds(), 6)
        _, complete = original(self.xgb, self.features, self.labels, self.checkpoint, self.params, rounds=6, interval=3)
        self.assertEqual(complete["status"], "RESUMED_COMPLETE")

    def test_rejects_checkpoint_for_different_input(self):
        MODULE.fit_resumable(self.xgb, self.features, self.labels, self.checkpoint, self.params, rounds=3, interval=3)
        changed = self.features.copy()
        changed[0, 0] = 0.5
        with self.assertRaisesRegex(ValueError, "XGBOOST_CHECKPOINT_INPUT_MISMATCH"):
            MODULE.fit_resumable(self.xgb, changed, self.labels, self.checkpoint, self.params, rounds=3, interval=3)


if __name__ == "__main__":
    unittest.main()
