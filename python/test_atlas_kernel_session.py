from __future__ import annotations

import unittest

from atlas_kernel_session import (
    AtlasKernelWorker,
    KernelArtifactHandle,
    KernelRequest,
    KernelResponse,
    canonical_json_checksum,
    probe_kernel_runtime,
)


class AtlasKernelSessionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.worker = AtlasKernelWorker(
            session_id="kernel:1",
            session_revision="kernel-r1",
            workspace_revision="workspace-r1",
            source_snapshot_revision="source-r1",
        )
        self.worker.register_artifact(
            KernelArtifactHandle(
                artifact_id="semantic:1",
                storage_ref="/snapshots/semantic.arrow",
                content_format="ARROW_IPC_FILE",
                access_mode="MMAP_READONLY",
                content_checksum_sha256="a" * 64,
                row_identity_checksum="b" * 64,
            )
        )

    def request(self, **overrides):
        values = dict(
            request_id="request:1",
            kind="RETRIEVE",
            session_id="kernel:1",
            session_revision="kernel-r1",
            workspace_revision="workspace-r1",
            source_snapshot_revision="source-r1",
            ace_graph_id="graph:1",
            ace_graph_revision="graph-r1",
            input_artifact_ids=["semantic:1"],
        )
        values.update(overrides)
        return KernelRequest(**values)

    def test_namespace_persists_across_python_executions(self) -> None:
        self.worker.execute_python("counter = 40")
        value = self.worker.execute_python("counter += 2", namespace_key="counter")
        self.assertEqual(value, 42)

    def test_dispatch_rejects_workspace_revision_drift(self) -> None:
        response = self.worker.dispatch(self.request(workspace_revision="workspace-r2"))
        self.assertEqual(response.status, "REJECTED")
        self.assertEqual(response.error_code, "KERNEL_WORKSPACE_REVISION_MISMATCH")

    def test_dispatch_rejects_unknown_artifact(self) -> None:
        response = self.worker.dispatch(self.request(input_artifact_ids=["missing:artifact"]))
        self.assertEqual(response.status, "REJECTED")
        self.assertTrue(response.error_code.startswith("KERNEL_UNKNOWN_ARTIFACT"))

    def test_patch_proposal_requires_claim_verification(self) -> None:
        response = self.worker.dispatch(self.request(
            kind="PROPOSE_PATCH",
            mutation_intent="PROPOSE_ONLY",
            claim_verification_receipt_ids=[],
        ))
        self.assertEqual(response.status, "REJECTED")
        self.assertEqual(response.error_code, "KERNEL_PATCH_REQUIRES_VERIFIED_CLAIM")

    def test_registered_handler_cannot_return_canonical_authority(self) -> None:
        def handler(request):
            return KernelResponse(
                request_id=request.request_id,
                session_id=request.session_id,
                status="COMPLETED",
                canonical_authority=True,
                payload={"ids": ["candidate:a"]},
            )

        self.worker.register_handler("RETRIEVE", handler)
        response = self.worker.dispatch(self.request())
        self.assertEqual(response.status, "COMPLETED")
        self.assertFalse(response.canonical_authority)

    def test_runtime_probe_records_python_abi(self) -> None:
        runtime = probe_kernel_runtime()
        self.assertTrue(runtime["python_abi"])
        self.assertIn("free_threaded_build", runtime)
        self.assertIn("gil_enabled", runtime)

    def test_logical_checksum_is_map_order_independent(self) -> None:
        left = canonical_json_checksum({"a": 1, "b": [2, 3]})
        right = canonical_json_checksum({"b": [2, 3], "a": 1})
        self.assertEqual(left, right)


if __name__ == "__main__":
    unittest.main()
