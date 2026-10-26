import os
import unittest
from types import SimpleNamespace

import miniforge_nlp_sidecar_v2 as sidecar_v2


class LangExtractRuntimeHealthTests(unittest.TestCase):
    def setUp(self):
        self.legacy = sidecar_v2.legacy
        self.original_available = self.legacy.LANGEXTRACT_AVAILABLE
        self.original_module = self.legacy.langextract
        self.original_runtime = os.environ.get("LANGEXTRACT_RUNTIME")
        self.legacy.LANGEXTRACT_AVAILABLE = True
        self.addCleanup(self.restore_runtime_state)

    def restore_runtime_state(self):
        self.legacy.LANGEXTRACT_AVAILABLE = self.original_available
        self.legacy.langextract = self.original_module
        if self.original_runtime is None:
            os.environ.pop("LANGEXTRACT_RUNTIME", None)
        else:
            os.environ["LANGEXTRACT_RUNTIME"] = self.original_runtime

    def health_runtime(self, requested, module):
        os.environ["LANGEXTRACT_RUNTIME"] = requested
        self.legacy.langextract = module
        return sidecar_v2.health()["imports"]["langextract"]

    def test_shim_request_and_active_runtime_match(self):
        result = self.health_runtime("shim", SimpleNamespace())

        self.assertEqual(result["requestedRuntime"], "shim")
        self.assertEqual(result["activeRuntime"], "shim")
        self.assertFalse(result["runtimeMismatch"])

    def test_official_request_reports_active_shim_mismatch(self):
        result = self.health_runtime("official", SimpleNamespace())

        self.assertEqual(result["requestedRuntime"], "official")
        self.assertEqual(result["activeRuntime"], "shim")
        self.assertTrue(result["runtimeMismatch"])

    def test_official_runtime_marker_matches_official_request(self):
        result = self.health_runtime("official", SimpleNamespace(__atlas_runtime_version__="1.0"))

        self.assertEqual(result["requestedRuntime"], "official")
        self.assertEqual(result["activeRuntime"], "official")
        self.assertFalse(result["runtimeMismatch"])

    def test_unrecognized_request_is_reported_as_mismatch(self):
        result = self.health_runtime("typo", SimpleNamespace())

        self.assertEqual(result["requestedRuntime"], "typo")
        self.assertEqual(result["activeRuntime"], "shim")
        self.assertTrue(result["runtimeMismatch"])


if __name__ == "__main__":
    unittest.main()
