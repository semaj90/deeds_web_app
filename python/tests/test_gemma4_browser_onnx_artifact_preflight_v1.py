import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "atlas" / "verify-gemma4-browser-onnx-artifact-v1.py"
SPEC = importlib.util.spec_from_file_location("gemma4_browser_onnx_artifact_preflight_v1", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExternalDataReferenceTests(unittest.TestCase):
    def test_accepts_complete_in_bounds_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            graph_dir = root / "onnx"
            graph_dir.mkdir()
            (graph_dir / "weights.bin").write_bytes(b"0123456789")
            result = MODULE.verify_external_reference(root, graph_dir / "model.onnx", {"location": "weights.bin", "offset": "2", "length": "8"})
            self.assertEqual(result["status"], "VALID")

    def test_rejects_missing_external_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            result = MODULE.verify_external_reference(root, root / "model.onnx", {"location": "missing.bin", "offset": "0", "length": "1"})
            self.assertEqual(result["status"], "EXTERNAL_DATA_MISSING")

    def test_rejects_out_of_bounds_range(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "weights.bin").write_bytes(b"1234")
            result = MODULE.verify_external_reference(root, root / "model.onnx", {"location": "weights.bin", "offset": "3", "length": "2"})
            self.assertEqual(result["status"], "EXTERNAL_DATA_RANGE_OUT_OF_BOUNDS")

    def test_rejects_path_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "models"
            root.mkdir()
            result = MODULE.verify_external_reference(root, root / "model.onnx", {"location": "../outside.bin", "offset": "0", "length": "1"})
            self.assertEqual(result["status"], "PATH_ESCAPES_MODEL_ROOT")


if __name__ == "__main__":
    unittest.main()
