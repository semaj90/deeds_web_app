from __future__ import annotations

import unittest
import json
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np


PACKAGE_ROOT = str(Path(__file__).resolve().parent.parent)

from parent_atlas_tensor.unified_residency_provider import UnifiedFeatureTileProvider


class UnifiedResidencyProviderTests(unittest.TestCase):
    @staticmethod
    def descriptor(key: str = "atlas:tile:0", **overrides: object) -> dict[str, object]:
        value: dict[str, object] = {
            "kind": "FEATURE_TILE", "residencyKey": key, "state": "EMPTY",
            "workspaceRevision": "workspace:r1", "sourceRevision": "source:r1",
            "representationRevision": "representation:r1", "featureRevision": "feature:r1",
            "modelRevision": "model:r1", "tokenizerRevision": "tokenizer:r1",
            "ropeRevision": "rope:r1", "candidateOrdinal": 0,
            "artifactChecksum": "sha256:artifact", "shape": [2, 4], "byteLength": 32,
        }
        value.update(overrides)
        return value

    def test_descriptor_load_returns_sanitized_receipt(self) -> None:
        matrix = np.arange(8, dtype=np.float32).reshape(2, 4)
        provider = UnifiedFeatureTileProvider(max_bytes=matrix.nbytes * 2, device="cpu")
        receipt = provider.load(self.descriptor(byteLength=matrix.nbytes), matrix)
        self.assertEqual(receipt["state"], "RESIDENT")
        self.assertFalse(receipt["rawPointerExposed"])
        self.assertFalse(receipt["writesPerformed"])
        self.assertNotIn("tensor", receipt)

    def test_control_json_is_separate_from_numeric_tile(self) -> None:
        matrix = np.arange(8, dtype=np.float32).reshape(2, 4)
        provider = UnifiedFeatureTileProvider(max_bytes=matrix.nbytes, device="cpu")
        receipt = provider.load_control_envelope(
            '{"kind":"FEATURE_TILE","residencyKey":"atlas:tile:json","state":"EMPTY","workspaceRevision":"workspace:r1","sourceRevision":"source:r1","representationRevision":"representation:r1","featureRevision":"feature:r1","modelRevision":"model:r1","tokenizerRevision":"tokenizer:r1","ropeRevision":"rope:r1","candidateOrdinal":0,"artifactChecksum":"sha256:artifact","shape":[2,4],"byteLength":32}',
            matrix,
        )
        self.assertEqual(receipt["residencyKey"], "atlas:tile:json")
        with self.assertRaisesRegex(ValueError, "UNIFIED_RESIDENCY_CONTROL_JSON_INVALID"):
            provider.load_control_envelope("not-json", matrix)

    def test_typed_buffer_handoff_is_separate_from_control_json(self) -> None:
        matrix = np.arange(8, dtype="<f4").reshape(2, 4)
        provider = UnifiedFeatureTileProvider(max_bytes=matrix.nbytes, device="cpu")
        control = json.dumps(self.descriptor(key="atlas:tile:buffer", byteLength=matrix.nbytes))
        receipt = provider.load_control_buffer(control, matrix.tobytes(order="C"))
        self.assertEqual(receipt["residencyKey"], "atlas:tile:buffer")
        self.assertFalse(receipt["rawPointerExposed"])
        with self.assertRaisesRegex(ValueError, "UNIFIED_RESIDENCY_TYPED_BUFFER_ALIGNMENT_INVALID"):
            provider.load_control_buffer(control, b"\x00")

    def test_length_framed_stdio_handoff_returns_sanitized_receipt(self) -> None:
        matrix = np.arange(8, dtype="<f4").reshape(2, 4)
        control = json.dumps(self.descriptor(key="atlas:tile:stdio", byteLength=matrix.nbytes)).encode()
        frame = struct.pack(">I", len(control)) + control + struct.pack(">Q", matrix.nbytes) + matrix.tobytes(order="C")
        process = subprocess.run(
            [sys.executable, "-m", "parent_atlas_tensor.unified_residency_stdio"],
            input=frame,
            capture_output=True,
            check=False,
            env={**__import__("os").environ, "PYTHONPATH": PACKAGE_ROOT},
        )
        self.assertEqual(process.returncode, 0, process.stderr.decode())
        receipt = json.loads(process.stdout)
        self.assertEqual(receipt["state"], "RESIDENT")
        self.assertFalse(receipt["rawPointerExposed"])
        self.assertFalse(receipt["writesPerformed"])
        self.assertNotIn("tensor", receipt)

    def test_length_framed_exact_cosine_returns_projection_result_only(self) -> None:
        matrix = np.arange(8, dtype="<f4").reshape(2, 4) + 1
        query = matrix[0]
        descriptor = self.descriptor(
            key="atlas:tile:cosine",
            shape=[2, 4],
            byteLength=matrix.nbytes,
            operation="EXACT_COSINE_V1",
            queryShape=[4],
            topK=1,
        )
        control = json.dumps(descriptor).encode()
        tile = matrix.tobytes(order="C")
        query_bytes = query.tobytes(order="C")
        frame = (
            struct.pack(">I", len(control)) + control
            + struct.pack(">Q", len(tile)) + tile
            + struct.pack(">Q", len(query_bytes)) + query_bytes
        )
        process = subprocess.run(
            [sys.executable, "-m", "parent_atlas_tensor.unified_residency_stdio"],
            input=frame,
            capture_output=True,
            check=False,
            env={**__import__("os").environ, "PYTHONPATH": PACKAGE_ROOT},
        )
        self.assertEqual(process.returncode, 0, process.stderr.decode())
        receipt = json.loads(process.stdout)
        self.assertEqual(receipt["operation"], "EXACT_COSINE_V1")
        self.assertEqual(receipt["indices"], [0])
        self.assertAlmostEqual(receipt["scores"][0], 1.0, places=5)
        self.assertFalse(receipt["writesPerformed"])
        self.assertNotIn("tensor", receipt)

    def test_mismatched_descriptor_fails_closed(self) -> None:
        matrix = np.zeros((2, 4), dtype=np.float32)
        provider = UnifiedFeatureTileProvider(max_bytes=matrix.nbytes, device="cpu")
        with self.assertRaisesRegex(ValueError, "UNIFIED_RESIDENCY_SHAPE_MISMATCH"):
            provider.load(self.descriptor(shape=[1, 8], byteLength=matrix.nbytes), matrix)

    def test_unsupported_dtype_fails_closed(self) -> None:
        matrix = np.ones((2, 4), dtype=np.float32)
        provider = UnifiedFeatureTileProvider(max_bytes=matrix.nbytes, device="cpu")
        with self.assertRaisesRegex(ValueError, "UNIFIED_RESIDENCY_DTYPE_UNSUPPORTED"):
            provider.load(self.descriptor(key="atlas:tile:f16", dtype="float16", byteLength=matrix.nbytes), matrix)

    def test_missing_revision_fails_closed(self) -> None:
        matrix = np.zeros((2, 4), dtype=np.float32)
        provider = UnifiedFeatureTileProvider(max_bytes=matrix.nbytes, device="cpu")
        with self.assertRaisesRegex(ValueError, "UNIFIED_RESIDENCY_WORKSPACEREVISION_REQUIRED"):
            provider.load(self.descriptor(workspaceRevision=""), matrix)


if __name__ == "__main__":
    unittest.main()
