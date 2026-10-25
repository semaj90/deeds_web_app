#!/usr/bin/env python3
"""
test_cudf_pylibcudf_dlpack_msgpack_bitset_nibble_v1.py
------------------------------------------------------
Unit tests verifying:
1. MessagePack integer-tagged (`0..29`) `BYTEA` (`\\x...`) and 4-byte `varlena` round-trip with FP16 `latent_64` (128B) and FP32 `manifold_4d` (16B).
2. `AlignedBitsetBlobV1` (`ATLASBIT` 64-byte header + 64-byte padded `uint64` words), SHA-256 tamper rejection, Jaccard similarity, and Sparse Routing byte packer (`bit 7` active + `7-bit` shifter).
3. 4-bit Nibble packing (`high_nibble` `.okf` LUT code | `low_nibble` MBVH4 child mask) + UUIDv5 (`0x5`) version nibble check.
4. Gap A: Arrow `mmap[]` -> `cudf` + `pylibcudf` (`sort_by_key`) -> DLPack (`to_dlpack()` -> `torch.from_dlpack()`) -> PyTorch & XGBoost (`cuda:0`).
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path

import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_DIR = REPO_ROOT / "python"
SCRIPTS_ATLAS_DIR = REPO_ROOT / "scripts" / "atlas"
for p in (PYTHON_DIR, SCRIPTS_ATLAS_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from prove_cudf_pylibcudf_dlpack_msgpack_bitset_nibble_v1 import (  # noqa: E402
    HEADER_BYTES,
    create_aligned_bitset_blob_v1,
    pack_nibble_byte,
    run_gap_a_and_binary_codecs_proof,
    unpack_nibble_byte,
    verify_and_unpack_aligned_bitset_blob_v1,
)


class TestCudfPylibcudfDlpackMsgpackBitsetNibbleV1(unittest.TestCase):
    def test_end_to_end_gap_a_and_binary_codecs_proof(self) -> None:
        receipt = run_gap_a_and_binary_codecs_proof()
        self.assertEqual(
            receipt["schema"],
            "atlas.cudf-pylibcudf-dlpack-msgpack-bitset-nibble-receipt.v1",
        )
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])
        self.assertIsNotNone(datetime.fromisoformat(receipt["generatedAt"].replace("Z", "+00:00")))

        # 1. MessagePack BYTEA
        mp = receipt["msgpackByteaProof"]
        self.assertTrue(mp["identityFieldsPreserved"])
        self.assertLess(mp["msgpackBytes"], mp["jsonBytes"])
        self.assertEqual(mp["latent64Fp16Bytes"], 128)
        self.assertEqual(mp["manifold4dFp32Bytes"], 16)
        self.assertLess(mp["latent64Fp16MaxRoundTripError"], 1e-3)

        # 2. AlignedBitsetBlobV1 & Sparse Routing
        bs = receipt["alignedBitsetAndSparseRoutingProof"]
        self.assertEqual(bs["magic"], "ATLASBIT")
        self.assertTrue(bs["totalByteLengthDivisibleBy64"])
        self.assertTrue(bs["varlena4ByteOffsetHandled"])
        self.assertAlmostEqual(bs["jaccardSimilarityAB"], 0.5, places=6)
        self.assertEqual(bs["sparseRoutingBufferBytes"], 64)

        # 3. 4-Bit Nibble Encoding
        nb = receipt["nibbleEncodingProof"]
        self.assertTrue(nb["roundTripVerified"])
        self.assertEqual(nb["packedHex"], "6b148f")
        self.assertEqual(nb["uuidV5VersionNibbleCheck"]["versionNibbleInt"], 5)

        # 4. Gap A: cuDF / pylibcudf / DLPack / PyTorch / XGBoost
        gap_a = receipt["gapACudfPylibcudfDlpackProof"]
        self.assertTrue(gap_a["pythonVersion"])
        self.assertTrue(gap_a["torchVersion"])
        self.assertTrue(gap_a["xgboostVersion"])
        self.assertEqual(gap_a["dlpackTensorShape"], [3, 6])
        self.assertEqual(len(gap_a["pytorchCudaScores"]), 3)
        self.assertEqual(len(gap_a["xgboostCudaPreds"]), 3)
        if gap_a["cudfAvailable"]:
            self.assertEqual(
                gap_a["executionBackend"],
                "WSL2_RAPIDS_CUDF_PYLIBCUDF_DLPACK_CUDA0",
            )
            self.assertTrue(gap_a["zeroCopyGpuPointerShared"])
            self.assertEqual(gap_a["torchCudaVersion"], torch.version.cuda)
            self.assertEqual(gap_a["torchDlpackDevicePtr"], gap_a["cudfFirstColDevicePtr"])
            self.assertTrue(gap_a["cudaDeviceName"])

    def test_aligned_bitset_rejects_corrupted_payload(self) -> None:
        blob = bytearray(create_aligned_bitset_blob_v1(512, [1, 64, 128]))
        blob[HEADER_BYTES + 2] ^= 0xFF
        with self.assertRaises(ValueError) as ctx:
            verify_and_unpack_aligned_bitset_blob_v1(bytes(blob))
        self.assertIn("ALIGNED_BITSET_CHECKSUM_MISMATCH", str(ctx.exception))

    def test_nibble_pack_unpack_exhaustive_bounds(self) -> None:
        for hi in range(16):
            for lo in range(16):
                b = pack_nibble_byte(hi, lo)
                self.assertEqual(unpack_nibble_byte(b), (hi, lo))


if __name__ == "__main__":
    unittest.main()
