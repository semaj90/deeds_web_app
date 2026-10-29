#!/usr/bin/env python3
"""Validate the proposal-only repository capability classification profile."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_ontology.repository_capability_profile_v1 import validate_profile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profile",
        type=Path,
        default=ROOT / ".okf/domains/repository-capability-classification-v1.yaml",
    )
    result = validate_profile(parser.parse_args().profile)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if result["status"] == "VALID" else 1


if __name__ == "__main__":
    raise SystemExit(main())
