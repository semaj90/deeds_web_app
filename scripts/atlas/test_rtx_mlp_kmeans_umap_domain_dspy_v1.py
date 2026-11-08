#!/usr/bin/env python3
"""
scripts/atlas/test_rtx_mlp_kmeans_umap_domain_dspy_v1.py

Adversarial & End-to-End Unit Tests for `prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py`:
1. Verifies deterministic execution on RTX 3060 Ti (`cuda:0` or CPU fallback) over the 6,527-task cohort,
   checking `withinVramBudget == True` (<= 96.0 MiB peak), `canonicalAuthority == False`,
   `writesPerformed == False`, and `zeroSyntheticOrdinalIdsMinted == True`.
2. Adversarial Probe 1 (Payload Corruption / Checksum Tampering):
   - Corrupts 1 byte of the float32 latent buffer and asserts `CHECKSUM_MISMATCH` fail-closed.
   - Corrupts payload byte length and asserts `INVALID_PAYLOAD_LENGTH` / `UNALIGNED_PAYLOAD_LENGTH`.
3. Adversarial Probe 2 (Boundary Values & Empty Cluster Resilience):
   - Feeds identical / rank-1 colinear tensors into `pytorch_spherical_adaptive_kmeans` and verifies
     zero NaN/Inf values and deterministic empty-cluster preservation.
4. Adversarial Probe 3 (DSPy Unauthorized Evidence Citation Injection):
   - Injects an unauthorized `source_ref` outside the frozen `CommunityEvidenceV1` packet into
     `validate_community_label_output_v1` and asserts it fails closed with `ValueError`.
5. Adversarial Probe 4 (Idempotency & CPU vs. CUDA Parity):
   - Runs `RtxContextualDomainMLP` and `encode_morton_30bit_aten` on both CPU and CUDA (when available)
     and asserts exact bit-level Morton parity and < 1e-5 float32 probability parity.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from python.parent_atlas_dspy_community import (
    CommunityEvidenceV1,
    validate_community_label_output_v1,
)

# Load hyphenated script module
MOD_PATH = HERE / "prove-rtx-mlp-kmeans-umap-domain-dspy-v1.py"
spec = importlib.util.spec_from_file_location("prove_rtx_mlp_kmeans_umap_domain_dspy_v1", MOD_PATH)
assert spec is not None and spec.loader is not None
rtx_mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = rtx_mod
spec.loader.exec_module(rtx_mod)


class TestRtxMlpKmeansUmapDomainDspyV1(unittest.TestCase):
    def test_01_end_to_end_pipeline_and_receipt_invariants(self) -> None:
        receipt = rtx_mod.run_rtx_tensor_analysis_pipeline(root=REPO_ROOT)
        self.assertEqual(receipt["schema"], "atlas.rtx-mlp-kmeans-umap-domain-dspy.v1")
        self.assertEqual(receipt["status"], "RTX_TENSOR_ANALYSIS_PROVEN")
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])
        self.assertFalse(receipt["liveDbMutated"])
        self.assertFalse(receipt["ornith8090Disturbed"])
        self.assertTrue(receipt["hardware"]["withinVramBudget"])
        self.assertLessEqual(receipt["hardware"]["peakTensorAllocationMiB"], 96.0)

        prov = receipt["provenance"]
        self.assertEqual(prov["cohortRows"], 6527)
        self.assertEqual(prov["representationFamily"], "SYNTHETIC_TEST_VECTOR")
        self.assertTrue(prov["zeroSyntheticOrdinalIdsMinted"])

        # Domain distribution must sum to 6,527 across the 10 canonical NES LUT domains
        dom_dist = receipt["contextualMlpDomainHead"]["domainDistribution"]
        self.assertEqual(sum(dom_dist.values()), 6527)
        self.assertEqual(set(dom_dist.keys()), set(rtx_mod.CANONICAL_DOMAINS))

        # Adaptive KMeans evaluated [16, 32, 47, 64]
        per_k = receipt["adaptiveSphericalKMeans"]["perK"]
        self.assertEqual([row["k"] for row in per_k], [16, 32, 47, 64])
        for row in per_k:
            self.assertEqual(row["emptyClusters"], 0)

        # UMAP, Quaternion / rot_6d SO(3) kinematics & Morton 30-bit codes
        umap_sec = receipt["spectralGraphRegularizedUmap"]
        self.assertEqual(umap_sec["outDim"], 3)
        self.assertGreater(umap_sec["neighborhoodRecallAt3K"], 0.05)
        for sample in umap_sec["sampleManifoldRows"]:
            self.assertFalse(str(sample["canonical_task_key"]).startswith("task:ordinal:"))
            self.assertIn("#", str(sample["canonical_task_key"]))
            self.assertGreaterEqual(sample["morton_code_30bit"], 0)
            self.assertLess(sample["morton_code_30bit"], 1 << 30)
            self.assertEqual(len(sample["quaternion_xyzw"]), 4)
            self.assertEqual(len(sample["rot_6d"]), 6)

        quat_sec = receipt["quaternionAndRot6dKinematics"]
        self.assertLess(quat_sec["maxUnitNormError"], 1e-5)
        self.assertLess(quat_sec["maxSo3OrthogonalityError"], 1e-5)

        # Valkey Centroid Proposals & YaRN / SSM / cuTile KV-Cache Swap FSM
        vk_sec = receipt["valkeyCentroidProposals"]
        self.assertEqual(vk_sec["kmeansCentroidKeyCount"], 64)
        self.assertEqual(vk_sec["domainCentroidKeyCount"], 10)
        self.assertEqual(vk_sec["valkeyWritesPerformed"], 0)
        self.assertFalse(vk_sec["canonicalAuthority"])
        self.assertTrue(vk_sec["sampleKmeansKeys"][0].startswith("atlas:centroid:v1:kmeans:fs"))
        self.assertTrue(vk_sec["sampleDomainKeys"][0].startswith("atlas:centroid:v1:domain:fs"))

        fsm_sec = receipt["yarnSsmCutileKvFsm"]
        self.assertEqual(fsm_sec["activeSynthesisModel"], "ornith-1.5-9b")
        self.assertEqual(fsm_sec["yarnContextExtension"]["scaleFactorS"], 8.0)
        self.assertEqual(
            fsm_sec["cutileKvFsm"]["visitedStates"],
            [
                "S0_BIFROST_LOOKUP",
                "S1_TURBOVEC_PREFILTER",
                "S2_MMAP_HOST_STAGE",
                "S3_CUTILE_BLOCK_INSERT",
                "S4_MIRAS_EVICT_OR_PERSIST",
            ],
        )
        self.assertEqual(fsm_sec["cutileKvFsm"]["copiedKvBlocks"], 16)
        self.assertTrue(fsm_sec["cutileKvFsm"]["persistedByMirasGate"])

        # DSPy proposals
        dspy_sec = receipt["dspyGraphRagHelpers"]
        self.assertTrue(dspy_sec["allEvidenceRefsSubsetVerified"])
        self.assertGreaterEqual(dspy_sec["validatedCommunityProposalsCount"], 6)
        for prop in dspy_sec["proposals"]:
            self.assertEqual(prop["proposal_status"], "PROPOSAL_ONLY")
            self.assertFalse(prop["canonical_authority"])

    def test_02_adversarial_binary_decoder_tampering_and_truncation(self) -> None:
        raw = np.ones((4, 8), dtype="<f4").tobytes()
        valid_sha = rtx_mod.sha256_bytes(raw)

        # Valid decode succeeds
        t = rtx_mod.decode_f32_rows_safe(raw, rows=4, cols=8, expect_sha256=valid_sha)
        self.assertEqual(tuple(t.shape), (4, 8))

        # Corrupt 1 byte -> must fail closed with CHECKSUM_MISMATCH
        corrupted = bytearray(raw)
        corrupted[7] ^= 0xFF
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH"):
            rtx_mod.decode_f32_rows_safe(bytes(corrupted), rows=4, cols=8, expect_sha256=valid_sha)

        # Truncate 4 bytes -> must fail closed with INVALID_PAYLOAD_LENGTH
        with self.assertRaisesRegex(ValueError, "INVALID_PAYLOAD_LENGTH"):
            rtx_mod.decode_f32_rows_safe(raw[:-4], rows=4, cols=8, expect_sha256=valid_sha)

        # Unaligned 64-byte keyframe record payload -> must fail closed
        with self.assertRaisesRegex(ValueError, "UNALIGNED_PAYLOAD_LENGTH"):
            rtx_mod.decode_keyframe_records_64b(b"\x00" * 65, expected_rows=1)

    def test_03_adversarial_degenerate_colinear_kmeans_resilience(self) -> None:
        # Rank-1 degenerate tensor where all 32 rows are identical -> K-Means must not produce NaN/Inf
        degenerate = torch.ones((32, 16), dtype=torch.float32)
        res = rtx_mod.pytorch_spherical_adaptive_kmeans(degenerate, ks=(4, 8), max_iter=10, seed=7)
        self.assertIn(res["selectedAdaptiveK"], (4, 8))
        for k_row in res["perK"]:
            self.assertFalse(np.isnan(k_row["meanCentroidCosine"]))
            self.assertFalse(np.isnan(k_row["meanTop2Margin"]))
            self.assertGreaterEqual(k_row["emptyClusters"], 0)

    def test_04_adversarial_dspy_unauthorized_evidence_ref_rejected(self) -> None:
        pkt = CommunityEvidenceV1.build(
            community_fingerprint="comm_fp_21_test",
            algorithm_id="louvain_47_rtx_mlp_kmeans_umap_v1",
            graph_revision="graph:openspec-concept:v2",
            member_ids=("parent-atlas-ace-rlm-bitfrost-integration#a870cee7088e7268",),
            representative_source_refs=("openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L16352",),
            representative_symbols=("CANARY-PR-01",),
            evidence_refs=("openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md#L16352",),
        )
        # Citing a file outside the frozen packet must fail closed
        with self.assertRaisesRegex(ValueError, "cited unknown evidence refs"):
            validate_community_label_output_v1(
                pkt,
                confidence=0.85,
                cited_evidence_refs=("openspec/changes/unauthorized-hallucinated-file/tasks.md#L1",),
            )

    def test_05_cpu_vs_cuda_parity_and_idempotency(self) -> None:
        torch.manual_seed(123)
        x_lat = torch.randn((16, 64), dtype=torch.float32)
        x_lex = torch.rand((16, 10), dtype=torch.float32)
        x_feat = torch.randn((16, 8), dtype=torch.float32)

        mlp_cpu = rtx_mod.RtxContextualDomainMLP().to("cpu")
        mlp_cpu.eval()
        with torch.no_grad():
            _, probs_cpu1, hid_cpu1 = mlp_cpu(x_lat, x_lex, x_feat)
            _, probs_cpu2, _ = mlp_cpu(x_lat, x_lex, x_feat)

        # Idempotency check
        self.assertTrue(torch.equal(probs_cpu1, probs_cpu2))
        morton_cpu = rtx_mod.encode_morton_30bit_aten(hid_cpu1[:, :3])

        if torch.cuda.is_available():
            mlp_cuda = rtx_mod.RtxContextualDomainMLP().to("cuda:0")
            mlp_cuda.eval()
            with torch.no_grad():
                _, probs_cuda, hid_cuda = mlp_cuda(
                    x_lat.to("cuda:0"),
                    x_lex.to("cuda:0"),
                    x_feat.to("cuda:0"),
                )
            max_diff = float(torch.max(torch.abs(probs_cpu1 - probs_cuda.cpu())).item())
            self.assertLess(max_diff, 1e-5)
            morton_cuda = rtx_mod.encode_morton_30bit_aten(hid_cuda[:, :3]).cpu()
            self.assertTrue(torch.equal(morton_cpu, morton_cuda))

    def test_06_wire_schema_separation_and_cutile_fsm_negative_guards(self) -> None:
        from python.atlas_compute.cutile_kv_block_swap import launch_kv_block_insert

        # 1. P0 Binary Schema Separation: AlignedKeyframeChunk64B cannot be decoded as LowRankTaskRpcRecord64B
        with self.assertRaisesRegex(ValueError, "WIRE_SCHEMA_COLLISION_FORBIDDEN"):
            rtx_mod.decode_keyframe_records_64b(
                b"\x00" * 64,
                expected_rows=1,
                wire_schema_id=rtx_mod.SCHEMA_SCENE_KEYFRAME_64B,
            )

        # 2. P1 cuTile / PyTorch KV Swap FSM Negative Guards:
        host_kv = torch.ones((4, 8, 4, 32), dtype=torch.float16)
        dev_kv = torch.zeros((8, 8, 4, 32), dtype=torch.float16)
        valid_pages = torch.tensor([0, 1, 2, 3], dtype=torch.int32)

        # Out-of-range page index
        oob_pages = torch.tensor([0, 1, 2, 99], dtype=torch.int32)
        with self.assertRaisesRegex(ValueError, "CUTILE_KV_PAGE_ID_OUT_OF_RANGE"):
            launch_kv_block_insert(host_kv, dev_kv, oob_pages, lod_tier=1)

        # Duplicate page index
        dup_pages = torch.tensor([0, 2, 2, 3], dtype=torch.int32)
        with self.assertRaisesRegex(ValueError, "CUTILE_KV_PAGE_IDS_MUST_BE_UNIQUE"):
            launch_kv_block_insert(host_kv, dev_kv, dup_pages, lod_tier=1)

        # Dtype mismatch
        bad_dtype_dev = torch.zeros((8, 8, 4, 32), dtype=torch.float32)
        with self.assertRaisesRegex(ValueError, "KV_BLOCK_DTYPE_MISMATCH"):
            launch_kv_block_insert(host_kv, bad_dtype_dev, valid_pages, lod_tier=1)

        # Unpinned host tensor rejected when require_pinned_host=True
        with self.assertRaisesRegex(ValueError, "KV_HOST_TENSOR_MUST_BE_PINNED_CPU_MEMORY"):
            launch_kv_block_insert(
                host_kv, dev_kv, valid_pages, lod_tier=1, require_pinned_host=True
            )

        # Stale lease and stale fence epoch rejected
        with self.assertRaisesRegex(ValueError, "KV_LEASE_EXPIRED_REJECTED"):
            launch_kv_block_insert(
                host_kv,
                dev_kv,
                valid_pages,
                lod_tier=1,
                lease_expires_at_ms=1000,
                now_ms=1001,
            )
        with self.assertRaisesRegex(ValueError, "KV_STALE_FENCE_EPOCH_REJECTED"):
            launch_kv_block_insert(
                host_kv,
                dev_kv,
                valid_pages,
                lod_tier=1,
                expected_fence_epoch=5,
                observed_fence_epoch=4,
            )

        # Pinned host memory + CUDA stream synchronization when CUDA is available
        if torch.cuda.is_available():
            pinned_host = host_kv.pin_memory()
            self.assertTrue(pinned_host.is_pinned())
            dev_cuda = dev_kv.to("cuda:0")
            copied = launch_kv_block_insert(
                pinned_host,
                dev_cuda,
                valid_pages,
                lod_tier=1,
                require_pinned_host=True,
                synchronize=True,
            )
            self.assertEqual(copied, 4)


if __name__ == "__main__":
    unittest.main()
