"""Zod <-> Pydantic parity runner (generic; supersedes the slice-1 runner, whose receipt stays as history).
No "latest" resolution: the sealed manifest path AND the expected schema id / version / checksum are all required.
usage: python run_parity.py --manifest <bundle/manifest.json> --schema-id ID --schema-version V --schema-checksum sha256:.. --out <new receipt.json>
                           [--real-rows <json file with a top-level "rows" array>]
Exit 0 only if every proof and gate self-test passes. The receipt is written with exclusive-create (never overwritten)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from atlas_contract_parity.common import run_contract_parity  # noqa: E402
from atlas_contract_parity.registry import PYDANTIC_CONTRACTS  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--schema-id", required=True)
    ap.add_argument("--schema-version", required=True)
    ap.add_argument("--schema-checksum", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--real-rows", default=None)
    a = ap.parse_args()
    rows = (lambda: json.loads(Path(a.real_rows).read_text(encoding="utf8"))["rows"]) if a.real_rows else None
    receipt = run_contract_parity(
        Path(a.manifest),
        {"schemaId": a.schema_id, "schemaVersion": a.schema_version, "schemaChecksum": a.schema_checksum},
        PYDANTIC_CONTRACTS, rows,
    )
    body = json.dumps(receipt, indent=2)
    with open(a.out, "x", encoding="utf8") as fh:  # immutable: refuse to overwrite an existing receipt
        fh.write(body)
    print(body)
    return 0 if receipt["status"] == "ZOD_PYDANTIC_PARITY_PROVEN" else 2


if __name__ == "__main__":
    sys.exit(main())
