from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from ast_grep_py import SgRoot


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "docs/.okf/registries/orf-ast-feature-registry-proposal-v1.json"
FIXTURES = {
    "class_declaration": "class SampleClass { method() {} }",
    "function_declaration": "function sampleFunction() {}",
    "generator_function_declaration": "function* sampleGenerator() {}",
    "method_definition": "class SampleClass { sampleMethod() {} }",
    "interface_declaration": "interface SampleInterface {}",
    "type_alias_declaration": "type SampleAlias = string;",
    "variable_declarator": "const sampleVariable = 1;",
    "enum_declaration": "enum SampleEnum { Member }",
}


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def ast_kinds(source: str) -> list[str]:
    root = SgRoot(source, "typescript").root()
    found: list[str] = []
    pending = [root]
    while pending:
        node = pending.pop()
        found.append(node.kind())
        pending.extend(reversed(node.children()))
    return found


def build_mapping_proof(artifact: dict[str, Any]) -> dict[str, Any]:
    if artifact.get("status") != "PROPOSAL_ONLY_REQUIRES_REVIEW":
        raise ValueError("REGISTRY_NOT_PROPOSAL_ONLY")
    if artifact.get("runtime_eligible") is not False or artifact.get("canonical_authority") is not False:
        raise ValueError("REGISTRY_AUTHORITY_BOUNDARY_INVALID")

    mappings = artifact.get("ast_grep_mappings")
    if not isinstance(mappings, list) or not mappings:
        raise ValueError("AST_GREP_MAPPINGS_MISSING")
    mapping_by_kind: dict[str, str] = {}
    for mapping in mappings:
        feature_id = mapping.get("feature_id")
        kinds = mapping.get("ast_kinds")
        if not isinstance(feature_id, str) or not isinstance(kinds, list):
            raise ValueError("AST_GREP_MAPPING_INVALID")
        for kind in kinds:
            if not isinstance(kind, str) or kind in mapping_by_kind:
                raise ValueError("AST_GREP_KIND_DUPLICATE_OR_INVALID")
            mapping_by_kind[kind] = feature_id

    parser_results = []
    for kind, source in FIXTURES.items():
        kinds = ast_kinds(source)
        if kinds.count(kind) != 1:
            raise ValueError(f"AST_GREP_FIXTURE_KIND_COUNT_INVALID:{kind}:{kinds.count(kind)}")
        feature_id = mapping_by_kind.get(kind)
        if kind == "enum_declaration" and feature_id is not None:
            raise ValueError("ENUM_MUST_REMAIN_UNMAPPED")
        if kind != "enum_declaration" and feature_id is None:
            raise ValueError(f"AST_GREP_KIND_UNMAPPED:{kind}")
        parser_results.append({
            "ast_kind": kind,
            "feature_id": feature_id,
            "fixture_source_sha256": sha256(source.encode("utf-8")),
            "parsed_kind_count": kinds.count(kind),
        })

    return {
        "schema": "atlas.orf-ast-grep-mapping-proof.v1",
        "status": "FIXTURE_PARSER_MAPPING_PROVEN",
        "parser": {
            "package": "ast-grep-py",
            "version": version("ast-grep-py"),
            "language": "typescript",
        },
        "registry_revision": artifact["registry"]["registry_revision"],
        "registry_checksum": artifact["registry"]["registry_checksum"],
        "proposal_revision": artifact["proposal_revision"],
        "proposal_checksum": artifact["proposal_checksum"],
        "mapping_results": parser_results,
        "enum_policy": "UNMAPPED_FAIL_CLOSED",
        "review_state": "REVIEW_REQUIRED",
        "runtime_eligible": False,
        "canonical_authority": False,
        "writes_performed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output_path = (ROOT / args.output).resolve()
    scratch_root = (ROOT / ".tmp/atlas").resolve()
    if scratch_root not in output_path.parents:
        raise ValueError("OUTPUT_MUST_BE_UNDER_TMP_ATLAS")

    subprocess.run(
        ["npx.cmd" if os.name == "nt" else "npx", "tsx", "scripts/atlas/verify-orf-ast-feature-registry-review-artifact-v1.mts"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    artifact_bytes = ARTIFACT.read_bytes()
    artifact = json.loads(artifact_bytes)
    proof = build_mapping_proof(artifact)
    proof["artifact_sha256"] = sha256(artifact_bytes)
    proof_bytes = (json.dumps(proof, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    proof["proof_checksum"] = sha256(proof_bytes.rstrip(b"\n"))
    serialized = (json.dumps(proof, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("xb") as output:
        output.write(serialized)
    readback = json.loads(output_path.read_bytes())
    checksum = readback.pop("proof_checksum")
    readback_bytes = (json.dumps(readback, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    if sha256(readback_bytes.rstrip(b"\n")) != checksum:
        raise ValueError("PROOF_READBACK_CHECKSUM_MISMATCH")
    print(json.dumps({
        "status": proof["status"],
        "mappingCount": len(proof["mapping_results"]),
        "enumPolicy": proof["enum_policy"],
        "reviewState": proof["review_state"],
        "runtimeEligible": proof["runtime_eligible"],
        "independentReadback": "MATCH",
        "writesPerformed": False,
        "output": str(output_path.relative_to(ROOT)).replace("\\", "/"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
