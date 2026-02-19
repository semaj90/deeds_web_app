"""
SIMD JSON Accelerator Client for FastMCP and Phase 72 Topology Brain
Standardizes on SIMD_JSON_ACCEL_URL environment variable
"""

import os
import httpx
from typing import Any, Dict, Optional
import asyncio


class SimdJsonAccelClient:
    """Client for SIMD JSON Accelerator service with environment-based URL discovery"""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 2.0):
        """
        Initialize SIMD JSON Accelerator client

        Args:
            base_url: Override default URL (defaults to SIMD_JSON_ACCEL_URL env or http://127.0.0.1:8103)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url or os.getenv(
            "SIMD_JSON_ACCEL_URL", "http://127.0.0.1:8103"
        ).rstrip('/')
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        """Async context manager entry"""
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self._client:
            await self._client.aclose()

    async def health_check(self) -> Dict[str, Any]:
        """
        Check if SIMD service is healthy

        Returns:
            Health status dict
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.get(f"{self.base_url}/health")
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPError as e:
                return {
                    "status": "error",
                    "message": str(e),
                    "url": self.base_url
                }

    async def parse(
        self,
        json_payload: Dict[str, Any],
        method: str = "simdjson"
    ) -> Dict[str, Any]:
        """
        Parse JSON using SIMD-optimized parser

        Args:
            json_payload: JSON object to parse
            method: Parsing method ("simdjson", "sonic", or "tokens")

        Returns:
            Parsed result with tokens and metadata
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/parse",
                json={
                    "json": json.dumps(json_payload) if isinstance(json_payload, dict) else json_payload,
                    "method": method
                }
            )
            resp.raise_for_status()
            return resp.json()

    async def parse_text(self, json_text: str, method: str = "simdjson") -> Dict[str, Any]:
        """
        Parse JSON text using SIMD-optimized parser

        Args:
            json_text: Raw JSON string
            method: Parsing method ("simdjson", "sonic", or "tokens")

        Returns:
            Parsed result with tokens and metadata
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/parse",
                json={
                    "json": json_text,
                    "method": method
                }
            )
            resp.raise_for_status()
            return resp.json()


# Synchronous wrapper for compatibility
class SimdJsonAccelClientSync:
    """Synchronous wrapper around async SIMD client"""

    def __init__(self, base_url: Optional[str] = None, timeout: float = 2.0):
        self.client = SimdJsonAccelClient(base_url, timeout)

    def health_check(self) -> Dict[str, Any]:
        """Synchronous health check"""
        return asyncio.run(self.client.health_check())

    def parse(self, json_payload: Dict[str, Any], method: str = "simdjson") -> Dict[str, Any]:
        """Synchronous parse"""
        return asyncio.run(self.client.parse(json_payload, method))

    def parse_text(self, json_text: str, method: str = "simdjson") -> Dict[str, Any]:
        """Synchronous parse text"""
        return asyncio.run(self.client.parse_text(json_text, method))


# Example usage
if __name__ == "__main__":
    async def main():
        async with SimdJsonAccelClient() as client:
            # Health check
            health = await client.health_check()
            print(f"Health: {health}")

            # Parse example
            test_json = {"error": "TS2304", "message": "Cannot find name 'CardTitle'"}
            result = await client.parse(test_json)
            print(f"Parse result: {result}")

    asyncio.run(main())
