#!/usr/bin/env python3
"""Read-only bounded Firecrawl v2 adapter for the local OKF docs capture."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_external_docs import fetch_firecrawl_v2  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: fetch-firecrawl.py URL"}))
        return 2
    key = os.environ.get("FIRECRAWL_API_KEY")
    if not key:
        print(json.dumps({"error": "FIRECRAWL_API_KEY_REQUIRED"}))
        return 1
    try:
        result = fetch_firecrawl_v2(sys.argv[1], api_key=key, timeout_seconds=60)
        print(json.dumps(result.to_dict(), ensure_ascii=True))
        return 0
    except Exception as exc:  # noqa: BLE001 - adapter boundary emits typed failures
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}, ensure_ascii=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
