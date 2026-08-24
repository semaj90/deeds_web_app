#!/usr/bin/env python3
"""Read-only BeautifulSoup fetch adapter for the OKF docs crawler."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_external_docs import fetch_beautifulsoup  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: fetch-beautifulsoup.py URL"}))
        return 2
    try:
        result = fetch_beautifulsoup(sys.argv[1])
        print(json.dumps(result.to_dict(), ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001 - CLI boundary returns typed failure
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
