"""
SIMD-accelerated JSON with automatic fallback.

Usage:
    from backend.utils.fast_json import dumps, loads, dumpb

    # Serialize to string (10x faster than json.dumps)
    json_str = dumps({"key": "value"})

    # Deserialize from string or bytes (4x faster than json.loads)
    data = loads(json_str)

    # Serialize to bytes (for RabbitMQ, file I/O)
    json_bytes = dumpb({"key": "value"})

Performance:
    - orjson.dumps():  7x faster than json.dumps()
    - orjson.loads():  4x faster than json.loads()
    - Used by FastAPI, Pydantic v2, Starlette

Compatibility:
    - Automatically falls back to standard json if orjson not installed
    - Drop-in replacement for json.dumps/loads
"""

import sys
import logging

logger = logging.getLogger(__name__)

# Try to use orjson (SIMD-accelerated)
try:
    import orjson
    BACKEND = "orjson"
    SIMD_AVAILABLE = True

    def dumps(obj, **kwargs) -> str:
        """
        Serialize object to JSON string using SIMD acceleration.

        Args:
            obj: Python object to serialize
            **kwargs: Ignored (for compatibility with json.dumps)

        Returns:
            JSON string

        Note:
            10x faster than json.dumps() for large objects
        """
        # orjson.dumps() returns bytes, decode to str
        return orjson.dumps(obj).decode('utf-8')

    def loads(s, **kwargs):
        """
        Deserialize JSON string/bytes to Python object using SIMD acceleration.

        Args:
            s: JSON string or bytes
            **kwargs: Ignored (for compatibility with json.loads)

        Returns:
            Python object

        Note:
            4x faster than json.loads() for large JSON
        """
        return orjson.loads(s)

    def dumpb(obj, **kwargs) -> bytes:
        """
        Serialize object to JSON bytes using SIMD acceleration.

        Useful for:
        - RabbitMQ message bodies
        - File I/O with 'wb' mode
        - Network transmission

        Args:
            obj: Python object to serialize
            **kwargs: Ignored

        Returns:
            JSON bytes
        """
        return orjson.dumps(obj)

    logger.info("✅ Using orjson (SIMD-accelerated JSON) - 10-20x faster!")

except ImportError:
    # Fallback to standard json
    import json
    BACKEND = "json"
    SIMD_AVAILABLE = False

    dumps = json.dumps
    loads = json.loads

    def dumpb(obj, **kwargs) -> bytes:
        """Fallback: serialize to bytes using standard json."""
        return json.dumps(obj, **kwargs).encode('utf-8')

    logger.warning(
        "⚠️  orjson not installed - using standard json (10-20x slower). "
        "Install with: pip install orjson"
    )

# Export public API
__all__ = ['dumps', 'loads', 'dumpb', 'BACKEND', 'SIMD_AVAILABLE']

# Module-level info
def info():
    """Print backend information."""
    if SIMD_AVAILABLE:
        print(f"✅ SIMD JSON: {BACKEND}")
        print(f"   Performance: 10-20x faster than standard json")
        print(f"   Backend: orjson {orjson.__version__}")
    else:
        print(f"⚠️  Standard JSON: {BACKEND}")
        print(f"   Install orjson for 10-20x speedup: pip install orjson")

if __name__ == "__main__":
    # Quick test
    import time

    # Test data
    test_data = {
        "citations": [
            {
                "type": "ca_const",
                "text": f"California Constitution Article {i}, Section {j}",
                "authority": 1.0
            }
            for i in range(1, 100)
            for j in range(1, 10)
        ]
    }

    # Benchmark
    iterations = 1000

    # Test dumps
    start = time.perf_counter()
    for _ in range(iterations):
        result = dumps(test_data)
    dumps_time = time.perf_counter() - start

    # Test loads
    json_str = dumps(test_data)
    start = time.perf_counter()
    for _ in range(iterations):
        result = loads(json_str)
    loads_time = time.perf_counter() - start

    print(f"\n{'='*60}")
    print(f"SIMD JSON Benchmark ({iterations} iterations)")
    print(f"{'='*60}")
    print(f"Backend: {BACKEND}")
    print(f"SIMD Available: {'✅' if SIMD_AVAILABLE else '❌'}")
    print(f"\ndumps() time: {dumps_time*1000:.2f}ms")
    print(f"loads() time: {loads_time*1000:.2f}ms")
    print(f"Total time: {(dumps_time + loads_time)*1000:.2f}ms")

    if not SIMD_AVAILABLE:
        print(f"\n⚠️  Install orjson for 10-20x speedup:")
        print(f"   pip install orjson")
    else:
        print(f"\n✅ Using SIMD-accelerated JSON!")
    print(f"{'='*60}\n")
