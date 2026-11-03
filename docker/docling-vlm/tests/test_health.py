import asyncio
import contextlib
import os
import unittest
from unittest.mock import patch

import httpx

import app_ornith


def _boom(*args, **kwargs):
    raise AssertionError("model loader must not run from a health probe")


class HealthEndpointTests(unittest.TestCase):
    """Liveness/readiness must never initialize Docling, Whisper or YOLOX."""

    def setUp(self):
        env = patch.dict(os.environ, {"PRELOAD_MODELS": "false"})
        env.start()
        self.addCleanup(env.stop)

    def _get(self, path):
        async def run():
            transport = httpx.ASGITransport(app=app_ornith.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.get(path)

        return asyncio.run(run())

    @contextlib.contextmanager
    def _patched(self, vlm=None, vlm_side_effect=None):
        """Patch the upstream probe and fail the test if any model loader runs."""
        with contextlib.ExitStack() as stack:
            if vlm_side_effect is not None:
                stack.enter_context(patch.object(app_ornith, "get_ornith_vlm_health", side_effect=vlm_side_effect))
            else:
                stack.enter_context(patch.object(app_ornith, "get_ornith_vlm_health", return_value=vlm))
            stack.enter_context(patch.object(app_ornith.legacy, "get_docling_parser", side_effect=_boom))
            stack.enter_context(patch.object(app_ornith.legacy, "get_whisper_model", side_effect=_boom))
            stack.enter_context(patch.object(app_ornith.legacy, "get_yolo_model", side_effect=_boom))
            yield

    def test_liveness_does_not_probe_upstream_or_load_models(self):
        with self._patched(vlm_side_effect=AssertionError("upstream probed")):
            response = self._get("/live")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "alive"})

    def test_readiness_reports_loaded_state_without_initializing_models(self):
        with self._patched(vlm={"healthy": True, "vision": True}):
            response = self._get("/ready")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "healthy")
        self.assertEqual(body["services"]["docling"], app_ornith.legacy.docling_parser is not None)
        self.assertEqual(body["services"]["whisper"], app_ornith.legacy.whisper_model is not None)
        self.assertEqual(body["services"]["yolo"], app_ornith.legacy.yolo_model is not None)

    def test_retained_health_route_does_not_load_models(self):
        with self._patched(vlm={"healthy": True, "vision": True}):
            response = self._get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")

    def test_readiness_returns_service_unavailable_when_vlm_is_not_ready(self):
        with self._patched(vlm={"healthy": False, "vision": False}):
            response = self._get("/ready")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["status"], "degraded")
        self.assertFalse(response.json()["services"]["vlm_ocr"])


if __name__ == "__main__":
    unittest.main()
