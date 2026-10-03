#!/usr/bin/env python3
"""Read-only inventory of distributions visible to this exact Python interpreter."""
import argparse
import importlib.metadata as metadata
import json
import platform
import sys
from datetime import datetime, timezone


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="optional new JSON report path; refuses overwrite")
    args = parser.parse_args()
    rows = []
    for dist in metadata.distributions():
        name = dist.metadata.get("Name")
        if not name:
            continue
        rows.append({"name": name, "version": dist.version})
    rows.sort(key=lambda row: (row["name"].casefold(), row["version"]))
    report = {
        "schema": "atlas.python-environment-package-inventory.v1",
        "canonicalAuthority": False,
        "asOfUTC": datetime.now(timezone.utc).isoformat(),
        "pythonExecutable": sys.executable,
        "pythonVersion": platform.python_version(),
        "platform": platform.platform(),
        "distributionCount": len(rows),
        "distributions": rows,
        "runtimeLoaded": "NOT_PROBED",
        "productionCalled": "NOT_PROBED",
        "datastoreWrites": 0,
    }
    payload = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        with open(args.output, "x", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
    else:
        print(payload, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
