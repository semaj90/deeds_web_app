from __future__ import annotations

import importlib.util
import unittest

from parent_atlas_tensor.gpu_resident_executor import (
    CandidateFeatureGpuExecutor,
    _f32_le,
    _sha256,
    _u16_le,
    _u8,
    _verify_pack,
)


def make_pack() -> dict:
    logical_rows = 2
    physical_rows = 32
    feature_count = 12
    values = [0.0] * (physical_rows * feature_count)
    presence = [0] * (physical_rows * feature_count)
    for feature in range(feature_count):
        values[feature] = float(feature + 1)
        values[feature_count + feature] = float((feature + 1) * 10)
        presence[feature] = 1
        presence[feature_count + feature] = 1
    valid = [1, 1] + [0] * (physical_rows - 2)
    lanes = [3, 5] + [0] * (physical_rows - 2)
    degraded = [0, 1] + [0] * (physical_rows - 2)
    return {
        "schema": "atlas.candidate-feature-gpu-pack.v1",
        "candidateSnapshotRevision": "candidate:r1",
        "ordinalMapChecksum": "1" * 64,
        "featureSnapshotChecksum": "2" * 64,
        "workspaceRevision": "workspace:r1",
        "featureRevision": "feature:r1",
        "columnarChecksum": "3" * 64,
        "logicalRows": logical_rows,
        "physicalRows": physical_rows,
        "paddingRows": physical_rows - logical_rows,
        "rowAlignment": 32,
        "featureCount": feature_count,
        "featureNames": [
            "semanticRelevance", "lexicalRelevance", "astAffinity", "graphAuthority",
            "personalizedPageRank", "communityAffinity", "manifold4OrientationSimilarity",
            "crossEncoderRawScore", "crossEncoderCalibratedScore", "domainAffinity",
            "executionUtility", "memoryUtility",
        ],
        "featureValues": values,
        "featurePresence": presence,
        "validMask": valid,
        "laneMaskU16": lanes,
        "degradedIdentity": degraded,
        "featureValuesChecksum": _sha256(_f32_le(values)),
        "featurePresenceChecksum": _sha256(_u8(presence)),
        "validMaskChecksum": _sha256(_u8(valid)),
        "laneMaskChecksum": _sha256(_u16_le(lanes)),
        "degradedIdentityChecksum": _sha256(_u8(degraded)),
        "gpuPackChecksum": "4" * 64,
        "byteOrder": "little-endian",
        "featureDtype": "float32",
        "presenceDtype": "uint8",
        "validMaskDtype": "uint8",
        "laneMaskSourceDtype": "uint16",
        "paddingPolicy": "ZERO_INVALID_MASKED_V1",
        "logicalOrdinalEqualsPhysicalRowForValidPrefix": True,
        "paddedRowsCarryIdentity": False,
        "gpuResident": False,
        "identityAuthority": False,
        "canonicalOwnerChanged": False,
        "producerRevision": "gpu-pack:test:v1",
    }


class GpuResidentExecutorContractTests(unittest.TestCase):
    def test_source_pack_checksum_validation_is_fail_closed(self):
        pack = make_pack()
        _verify_pack(pack)
        pack["featureValuesChecksum"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "GPU_RESIDENCY_SOURCE_CHECKSUM_MISMATCH"):
            _verify_pack(pack)

    def test_duplicate_lease_is_rejected_before_replacing_resident_buffers(self):
        if importlib.util.find_spec("torch") is None:
            self.skipTest("PyTorch unavailable")
        import torch
        if not torch.cuda.is_available():
            self.skipTest("CUDA unavailable")
        executor = CandidateFeatureGpuExecutor(device_id=0, producer_revision="gpu-residency:test:v1")
        pack = make_pack()
        executor.materialize(pack, lease_id="lease:test:duplicate", ttl_seconds=10)
        with self.assertRaisesRegex(ValueError, "GPU_RESIDENCY_LEASE_ALREADY_EXISTS"):
            executor.materialize(pack, lease_id="lease:test:duplicate", ttl_seconds=10)
        executor.release("lease:test:duplicate")

    def test_real_cuda_materialize_gather_release_lifecycle(self):
        if importlib.util.find_spec("torch") is None:
            self.skipTest("PyTorch unavailable")
        import torch
        if not torch.cuda.is_available():
            self.skipTest("CUDA unavailable")

        executor = CandidateFeatureGpuExecutor(device_id=0, producer_revision="gpu-residency:test:v1")
        pack = make_pack()
        observation = executor.materialize(
            pack,
            lease_id="lease:test:cuda",
            ttl_seconds=10,
            pinned_host=True,
        )
        self.assertTrue(observation["gpuExecutionObserved"])
        self.assertFalse(observation["ipcExported"])
        self.assertEqual(observation["hostStagingMode"], "PINNED_ASYNC")
        self.assertEqual(len(observation["buffers"]), 5)
        self.assertTrue(all(buffer["deviceAllocationObserved"] for buffer in observation["buffers"]))
        self.assertTrue(all(buffer["readbackVerified"] for buffer in observation["buffers"]))

        gathered = executor.gather("lease:test:cuda", [1, 0])
        self.assertEqual(gathered["selectedOrdinals"], [1, 0])
        self.assertEqual(gathered["laneMaskI32"], [5, 3])
        self.assertEqual(gathered["degradedIdentity"], [1, 0])
        self.assertEqual(gathered["featureValues"][:12], [float((i + 1) * 10) for i in range(12)])

        released = executor.release("lease:test:cuda")
        self.assertEqual(released["leaseId"], "lease:test:cuda")
        self.assertFalse(executor.has_active_lease("lease:test:cuda"))
        with self.assertRaisesRegex(KeyError, "GPU_RESIDENCY_LEASE_NOT_FOUND"):
            executor.gather("lease:test:cuda", [0])


if __name__ == "__main__":
    unittest.main()
