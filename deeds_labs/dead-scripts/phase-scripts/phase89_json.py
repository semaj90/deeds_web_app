
"""
Phase 89: Robust JSON Loader (SIMD with Stdlib Fallback)
Ensures compatibility with Python 3.13 where pysimdjson might be missing.
"""
from __future__ import annotations
from typing import Any, Callable
import json
import sys

loads_bytes: Callable[[bytes], Any]
loads_str: Callable[[str], Any]
dumps: Callable[[Any], str]
SIMDJSON_ENABLED: bool = False
BACKEND: str = "stdlib"

# Try importing pysimdjson (which imports as simdjson)
# or orjson for speed if available, fallback to json
try:
    import simdjson # type: ignore
    _parser = simdjson.Parser()

    def loads_bytes(b: bytes) -> Any:
        try:
            return _parser.parse(b).as_dict()
        except ValueError:
            return json.loads(b)

    def loads_str(s: str) -> Any:
        return loads_bytes(s.encode("utf-8", errors="ignore"))

    def dumps(obj: Any) -> str:
        # simdjson is parser only, use stdlib dumps or orjson if mixed?
        # usually people use simdjson for read, and something else for write.
        # Let's fallback to json.dumps for safety unless orjson available
        return json.dumps(obj)

    SIMDJSON_ENABLED = True
    BACKEND = "simdjson"

except ImportError:
    try:
        import orjson # type: ignore

        def loads_bytes(b: bytes) -> Any:
            return orjson.loads(b)

        def loads_str(s: str) -> Any:
            return orjson.loads(s)

        def dumps(obj: Any) -> str:
            # orjson returns bytes, decode to str to match json.dumps interface
            return orjson.dumps(obj).decode('utf-8')

        SIMDJSON_ENABLED = True
        BACKEND = "orjson"

    except ImportError:
        # Standard library fallback
        def loads_bytes(b: bytes) -> Any:
            return json.loads(b)

        def loads_str(s: str) -> Any:
            return json.loads(s)

        def dumps(obj: Any) -> str:
            return json.dumps(obj)

        SIMDJSON_ENABLED = False
        BACKEND = "stdlib"

def status() -> str:
    return f"JSON Backend: {BACKEND}"

def get_speedup_estimate() -> float:
    if BACKEND == "simdjson": return 4.0
    if BACKEND == "orjson": return 5.0
    return 1.0
