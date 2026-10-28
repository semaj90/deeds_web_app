#!/usr/bin/env python3
"""Validate .okf concept-gap YAML against its Draft 2020-12 schema."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
CONCEPTS_ROOT = ROOT / ".okf" / "concepts"
SCHEMA_PATH = ROOT / ".okf" / "schemas" / "okf-concept-gap-v1.schema.json"


class UniqueKeyLoader(yaml.SafeLoader):
    pass

UniqueKeyLoader.yaml_implicit_resolvers = {
    first: [(tag, regexp) for tag, regexp in resolvers if tag != "tag:yaml.org,2002:timestamp"]
    for first, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def _construct_unique_mapping(loader: UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False) -> dict:
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"duplicate key {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_unique_mapping)


def validate_document(document_text: str, validator: Draft202012Validator) -> list[str]:
    try:
        document = yaml.load(document_text, Loader=UniqueKeyLoader)
    except yaml.YAMLError as error:
        return [f"INVALID_YAML: {error}"]
    errors = []
    for error in validator.iter_errors(document):
        location = "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in error.absolute_path)
        errors.append(f"{location}: {error.message}")
    return errors


def validate(path: Path, validator: Draft202012Validator) -> list[str]:
    return [f"{path.name}{error}" for error in validate_document(path.read_text(encoding="utf-8"), validator)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report")
    args = parser.parse_args()
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    files = sorted(CONCEPTS_ROOT.glob("*.yaml"))
    total_errors = 0
    file_results = []
    for path in files:
        errors = validate(path, validator)
        status = "PASS" if not errors else "FAIL"
        print(f"{status}: {path.name}")
        for error in errors:
            print(f"  {error}")
        total_errors += len(errors)
        source_bytes = path.read_bytes()
        file_results.append({
            "path": path.relative_to(ROOT).as_posix(),
            "status": status,
            "errors": errors,
            "sourceByteLength": len(source_bytes),
            "sourceSha256": f"sha256:{hashlib.sha256(source_bytes).hexdigest()}",
        })
    print(f"\n{len(files)} files checked, {total_errors} errors")
    if args.report:
        report_path = Path(args.report).resolve()
        report_root = (ROOT / ".tmp" / "atlas").resolve()
        try:
            report_path.relative_to(report_root)
        except ValueError as error:
            raise ValueError("CONCEPT_GAP_REPORT_MUST_STAY_UNDER_TMP_ATLAS") from error
        schema_bytes = SCHEMA_PATH.read_bytes()
        body = {
            "schema": "atlas.okf-concept-gap-validation-receipt.v1",
            "profile": "Draft 2020-12 / atlas.okf-concept-gap.v1",
            "validator": "scripts/atlas/validate_okf_concept_gaps.py",
            "validatorVersions": {
                "python": platform.python_version(),
                "PyYAML": importlib.metadata.version("PyYAML"),
                "jsonschema": importlib.metadata.version("jsonschema"),
            },
            "schemaPath": SCHEMA_PATH.relative_to(ROOT).as_posix(),
            "schemaSha256": f"sha256:{hashlib.sha256(schema_bytes).hexdigest()}",
            "filesChecked": len(file_results),
            "errorCount": total_errors,
            "files": file_results,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
        digest_body = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
        body["receiptSha256"] = f"sha256:{hashlib.sha256(digest_body).hexdigest()}"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with report_path.open("x", encoding="utf-8", newline="\n") as report_file:
            json.dump(body, report_file, indent=2, sort_keys=True)
            report_file.write("\n")
        print(f"Receipt: {report_path.relative_to(ROOT).as_posix()}")
    return 1 if total_errors else 0


if __name__ == "__main__":
    sys.exit(main())
