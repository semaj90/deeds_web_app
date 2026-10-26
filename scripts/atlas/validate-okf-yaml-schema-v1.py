from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from parent_atlas_ontology.okf_yaml_schema_validation_v1 import validate_paths


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only validation for a schema-bound OKF YAML document.")
    parser.add_argument("--document", type=Path, default=ROOT / ".okf/predicates/feature-relationships.yaml")
    parser.add_argument("--schema", type=Path, default=ROOT / ".okf/schemas/feature-relationships-v1.schema.json")
    args = parser.parse_args()
    result = validate_paths(args.document, args.schema)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if result["status"] == "VALID" else 1


if __name__ == "__main__":
    raise SystemExit(main())
