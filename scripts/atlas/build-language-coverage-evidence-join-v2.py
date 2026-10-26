#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from parent_atlas_ontology.language_coverage_v1 import build_language_coverage_evidence_join_v2


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Join checksummed parser fixture evidence to a language inventory")
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--fixture-receipt", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    inventory_path = args.inventory.resolve(strict=True)
    fixture_paths = [path.resolve(strict=True) for path in args.fixture_receipt]
    output = args.output.resolve()
    tmp_root = (root / ".tmp" / "atlas").resolve()
    try:
        output.relative_to(tmp_root)
    except ValueError as error:
        raise ValueError("OUTPUT_MUST_BE_UNDER_TMP_ATLAS") from error
    if output.exists():
        raise FileExistsError(f"OUTPUT_ALREADY_EXISTS:{output}")
    receipts = [read_json(path) for path in fixture_paths]
    result = build_language_coverage_evidence_join_v2(
        read_json(inventory_path),
        receipts,
        repository_root=root,
        inventory_path=inventory_path.relative_to(root).as_posix(),
        parser_fixture_receipt_paths=[path.relative_to(root).as_posix() for path in fixture_paths],
    )
    output.parent.mkdir(parents=True, exist_ok=False)
    with output.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "path": output.relative_to(root).as_posix(),
        "joinSha256": result["joinSha256"],
        "fixtureReceiptSha256s": result["parserFixtureReceiptSha256s"],
        "coverageCounts": result["coverageCounts"],
        "status": result["authority"],
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
