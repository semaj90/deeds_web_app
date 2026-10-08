from __future__ import annotations

from contextlib import nullcontext, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "atlas" / "prove-networkx-gnn-gpu-parity-v1.py"
SPEC = importlib.util.spec_from_file_location("atlas_gnn_gpu_parity_runner", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("GNN_GPU_PARITY_RUNNER_IMPORT_FAILED")
GPU_RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GPU_RUNNER)


class GnnGpuPreflightTests(unittest.TestCase):
    def _mock_slots_response(self, payload: object) -> None:
        response = MagicMock()
        response.read.return_value = json.dumps(payload).encode("utf-8")
        self.enterContext(patch("urllib.request.urlopen", return_value=nullcontext(response)))

    def test_all_slots_must_be_idle(self) -> None:
        self._mock_slots_response([{"id": 0, "is_processing": False}])
        self.assertEqual(GPU_RUNNER.llama_slots_idle("http://local.test/slots"), (True, "GPU_SLOT_IDLE"))

    def test_processing_slot_blocks_gpu(self) -> None:
        self._mock_slots_response([{"id": 0, "is_processing": False}, {"id": 1, "is_processing": True}])
        self.assertEqual(GPU_RUNNER.llama_slots_idle("http://local.test/slots"), (False, "GPU_SLOT_BUSY"))

    def test_invalid_slot_payload_fails_closed(self) -> None:
        self._mock_slots_response({"slots": []})
        self.assertEqual(GPU_RUNNER.llama_slots_idle("http://local.test/slots"), (False, "GPU_SLOT_STATUS_INVALID"))

    def test_unavailable_slot_endpoint_fails_closed(self) -> None:
        self.enterContext(patch("urllib.request.urlopen", side_effect=OSError("offline")))
        self.assertEqual(
            GPU_RUNNER.llama_slots_idle("http://local.test/slots"),
            (False, "GPU_SLOT_STATUS_UNAVAILABLE"),
        )

    def test_cli_requires_explicit_gpu_authorization(self) -> None:
        self.enterContext(patch("sys.argv", [str(SCRIPT_PATH)]))
        output = io.StringIO()
        with redirect_stdout(output):
            status = GPU_RUNNER.main()
        self.assertEqual(status, 2)
        self.assertEqual(json.loads(output.getvalue())["status"], "GPU_EXECUTION_NOT_AUTHORIZED")

    def test_cli_requires_slot_status_url_before_gpu_work(self) -> None:
        self.enterContext(patch("sys.argv", [
            str(SCRIPT_PATH), "--execute-gpu", "--operator-approved-idle",
        ]))
        self.enterContext(patch.dict(GPU_RUNNER.os.environ, {"ATLAS_LLAMA_SLOTS_URL": ""}))
        output = io.StringIO()
        with redirect_stdout(output):
            status = GPU_RUNNER.main()
        self.assertEqual(status, 4)
        self.assertEqual(json.loads(output.getvalue())["status"], "GPU_SLOT_STATUS_URL_REQUIRED")

    def test_memory_pressure_blocks_before_gpu_execution(self) -> None:
        self._mock_slots_response([{"id": 0, "is_processing": False}])
        self.enterContext(patch.object(
            GPU_RUNNER,
            "gpu_memory_snapshot",
            return_value={"deviceName": "fixture", "totalMemoryMiB": 8192, "usedMemoryMiB": 4097, "freeMemoryMiB": 4095},
        ))
        self.enterContext(patch("sys.argv", [
            str(SCRIPT_PATH), "--execute-gpu", "--operator-approved-idle",
            "--llama-slots-url", "http://local.test/slots",
        ]))
        output = io.StringIO()
        with redirect_stdout(output):
            status = GPU_RUNNER.main()
        result = json.loads(output.getvalue())
        self.assertEqual(status, 3)
        self.assertEqual(result["status"], "GPU_EXECUTION_BLOCKED_MEMORY_PRESSURE")
        self.assertFalse(result["gpuWorkStarted"])

    def test_busy_slot_blocks_before_memory_probe(self) -> None:
        self._mock_slots_response([{"id": 0, "is_processing": True}])
        self.enterContext(patch.object(
            GPU_RUNNER,
            "gpu_memory_snapshot",
            side_effect=AssertionError("memory probe must not run for a busy slot"),
        ))
        self.enterContext(patch("sys.argv", [
            str(SCRIPT_PATH), "--execute-gpu", "--operator-approved-idle",
            "--llama-slots-url", "http://local.test/slots",
        ]))
        output = io.StringIO()
        with redirect_stdout(output):
            status = GPU_RUNNER.main()
        result = json.loads(output.getvalue())
        self.assertEqual(status, 4)
        self.assertEqual(result["status"], "GPU_SLOT_BUSY")
        self.assertFalse(result["gpuWorkStarted"])


if __name__ == "__main__":
    unittest.main()
