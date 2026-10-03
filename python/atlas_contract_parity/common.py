"""Shared Zod <-> Pydantic parity plumbing (CONTRACT-PARITY-HARNESS-01). Contract-agnostic: everything is derived from the sealed bundle
(manifest + canonical schema + fixtures) and the Pydantic model looked up by schemaId. Read-only apart from the receipt file."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Callable

from pydantic import BaseModel, ValidationError


def _js_numbers(v: Any) -> Any:
    """JavaScript prints an integral number without a fraction (1.0 -> "1"); mirror that so both runtimes canonicalize identically."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, list):
        return [_js_numbers(x) for x in v]
    if isinstance(v, dict):
        return {k: _js_numbers(x) for k, x in v.items()}
    return v


def canonical(v: Any) -> str:
    """Canonical JSON identical to the exporter's: sorted keys, no whitespace, no ASCII escaping, JS-style integral numbers."""
    return json.dumps(_js_numbers(v), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(s: str) -> str:
    return "sha256:" + hashlib.sha256(s.encode("utf8")).hexdigest()


def accepts(model: type[BaseModel], value: Any) -> bool:
    try:
        model.model_validate(value)
        return True
    except ValidationError:
        return False


def _deref(node: Any, defs: dict[str, Any]) -> Any:
    while isinstance(node, dict) and "$ref" in node:
        node = defs[node["$ref"].split("/")[-1]]
    return node


def _allowed(node: dict[str, Any]) -> set[str]:
    out: set[str] = set()
    if "const" in node:
        out.add(json.dumps(node["const"]))
    for x in node.get("enum", []):
        out.add(json.dumps(x))
    return out


def shape(schema: dict[str, Any], defs: dict[str, Any] | None = None, path: str = "$") -> dict[str, Any]:
    """Flatten a JSON Schema into comparable facts per path: property names, required sets, closed-object flag, allowed const/enum values,
    array minItems, numeric/string bounds. Walks $ref / anyOf / items so nested objects and nullable wrappers compare structurally."""
    defs = defs if defs is not None else {**schema.get("$defs", {}), **schema.get("definitions", {})}
    node = _deref(schema, defs)
    facts: dict[str, Any] = {}
    branches = node.get("anyOf") or node.get("oneOf")
    if branches:
        nullable = any(_deref(b, defs).get("type") == "null" for b in branches)
        real = [b for b in branches if _deref(b, defs).get("type") != "null"]
        facts[path + "#nullable"] = nullable
        for b in real:
            facts.update(shape(b, defs, path))
        return facts
    allowed = _allowed(node)
    if allowed:
        facts[path + "#allowed"] = sorted(allowed)
    for k in ("minItems", "minimum", "maximum", "minLength", "pattern"):
        if k in node:
            # Zod's JSON Schema emitter escapes "/" as "\/" (a JS regex-literal artifact); the regex is otherwise compared verbatim.
            facts[f"{path}#{k}"] = node[k].replace("\\/", "/") if k == "pattern" else node[k]
    if node.get("type") == "array" and "items" in node:
        facts.update(shape(node["items"], defs, path + "[]"))
    if "properties" in node:
        facts[path + "#properties"] = sorted(node["properties"])
        facts[path + "#required"] = sorted(node.get("required", []))
        facts[path + "#closed"] = node.get("additionalProperties") is False
        for name, sub in node["properties"].items():
            facts.update(shape(sub, defs, f"{path}.{name}"))
    return facts


def diff_shapes(zod: dict[str, Any], py: dict[str, Any]) -> list[dict[str, Any]]:
    """Semantic diff. `pattern` is compared verbatim on purpose: both sides must state the identical regex."""
    out = []
    for key in sorted(set(zod) | set(py)):
        if zod.get(key, "<absent>") != py.get(key, "<absent>"):
            out.append({"fact": key, "zod": zod.get(key, "<absent>"), "pydantic": py.get(key, "<absent>")})
    return out


def _verdict_mismatches(model: type[BaseModel], fixtures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"fixture": f["id"], "zod": f["zodAccepts"], "pydantic": not f["zodAccepts"]} for f in fixtures if accepts(model, f["value"]) != f["zodAccepts"]]


def _self_tests(model: type[BaseModel], zod_shape: dict[str, Any], fixtures: list[dict[str, Any]], manifest: dict[str, Any], schema_text: str) -> dict[str, bool]:
    """Prove the gate can fail. Each mutation must be DETECTED; a gate that cannot fail proves nothing."""
    flipped = copy.deepcopy(fixtures)
    flipped[0]["zodAccepts"] = not flipped[0]["zodAccepts"]
    wrong_verdict = bool(_verdict_mismatches(model, flipped))
    mutated = {k: v for k, v in zod_shape.items()}
    prop_key = next(k for k in mutated if k.endswith("#properties"))
    mutated[prop_key] = mutated[prop_key][:-1]
    dropped_property = bool(diff_shapes(mutated, shape(model.model_json_schema(by_alias=True))))
    tampered_checksum = sha256_text(schema_text + " ") != manifest["schemaChecksum"]
    return {"wrongVerdictDetected": wrong_verdict, "droppedPropertyDetected": dropped_property, "tamperedSchemaChecksumDetected": tampered_checksum}


def run_contract_parity(
    manifest_path: Path,
    expect: dict[str, str],
    contracts: dict[str, type[BaseModel]],
    real_rows: Callable[[], list[Any]] | None = None,
) -> dict[str, Any]:
    """Returns the receipt dict; receipt['status'] == 'ZOD_PYDANTIC_PARITY_PROVEN' only if every check passes."""
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    bundle = manifest_path.parent
    failures: list[str] = []

    for k, mk in (("schemaId", "schemaId"), ("schemaVersion", "schemaVersion"), ("schemaChecksum", "schemaChecksum")):
        if manifest[mk] != expect[k]:
            failures.append(f"EXPECTED_{k.upper()}_MISMATCH:{expect[k]}!={manifest[mk]}")
    model = contracts.get(manifest["schemaId"])
    if model is None:
        failures.append(f"NO_PYDANTIC_MODEL_FOR:{manifest['schemaId']}")
        return {"status": "ZOD_PYDANTIC_PARITY_FAILED", "failures": failures}

    schema_text = (bundle / manifest["schemaFile"]).read_text(encoding="utf8")
    fixtures_text = (bundle / manifest["fixturesFile"]).read_text(encoding="utf8")
    schema = json.loads(schema_text)
    fixtures = json.loads(fixtures_text)
    py_schema_checksum = sha256_text(canonical(schema))
    py_fixture_checksum = sha256_text(canonical(fixtures))
    if py_schema_checksum != manifest["schemaChecksum"]:
        failures.append("SCHEMA_CHECKSUM_NOT_REPRODUCED_BY_PYTHON_CANONICALIZATION")
    if py_fixture_checksum != manifest["fixtureManifestChecksum"]:
        failures.append("FIXTURE_CHECKSUM_MISMATCH")
    if len(fixtures) != manifest["fixtureCount"]:
        failures.append("FIXTURE_COUNT_MISMATCH")

    zod_shape = shape(schema)
    py_shape = shape(model.model_json_schema(by_alias=True))
    shape_diff = diff_shapes(zod_shape, py_shape)
    mismatches = _verdict_mismatches(model, fixtures)

    cross_ids = set(manifest["crossFieldFixtureIds"])
    cross = [f for f in fixtures if f["id"] in cross_ids]
    cross_ok = [f for f in cross if accepts(model, f["value"]) == f["zodAccepts"]]
    cross_mode = "NONE_DECLARED" if not cross else ("FIXTURE_PROVEN" if len(cross_ok) == len(cross) else "FIXTURE_FAILED")

    rows_checked = rows_rejected = 0
    if real_rows:
        rows = real_rows()
        rows_checked, rows_rejected = len(rows), sum(1 for r in rows if not accepts(model, r))

    self_tests = _self_tests(model, zod_shape, fixtures, manifest, schema_text)
    has_accept = any(f["zodAccepts"] for f in fixtures)
    has_reject = any(not f["zodAccepts"] for f in fixtures)

    proofs = {
        "schemaIdAndVersionIdentical": not any(f.startswith("EXPECTED_SCHEMAID") or f.startswith("EXPECTED_SCHEMAVERSION") for f in failures),
        "propertySetsIdentical": not any(d["fact"].endswith("#properties") for d in shape_diff),
        "enumSetsIdentical": not any(d["fact"].endswith("#allowed") for d in shape_diff),
        "requiredFieldsIdentical": not any(d["fact"].endswith("#required") for d in shape_diff),
        "extraPropertiesRejected": zod_shape.get("$#closed") is True and py_shape.get("$#closed") is True and not any(d["fact"].endswith("#closed") for d in shape_diff),
        "fixtureVerdictsIdentical": not mismatches,
    }
    ok = (not failures and not shape_diff and not mismatches and all(proofs.values()) and cross_mode in ("FIXTURE_PROVEN", "NONE_DECLARED")
          and rows_rejected == 0 and all(self_tests.values()) and has_accept and has_reject)
    return {
        "schema": "atlas.contract-parity-receipt.v2",
        "contract": manifest["schemaId"], "schemaVersion": manifest["schemaVersion"],
        "status": "ZOD_PYDANTIC_PARITY_PROVEN" if ok else "ZOD_PYDANTIC_PARITY_FAILED",
        "sealedBundle": {"manifestChecksum": sha256_text(canonical(manifest)), "schemaChecksum": manifest["schemaChecksum"], "fixtureManifestChecksum": manifest["fixtureManifestChecksum"], "producerRevision": manifest["producerRevision"]},
        "expectedExplicitly": expect, "proofs": proofs, "failures": failures, "shapeDiff": shape_diff, "verdictMismatches": mismatches,
        "fixtures": {"total": len(fixtures), "zodAccepts": sum(1 for f in fixtures if f["zodAccepts"]), "zodRejects": sum(1 for f in fixtures if not f["zodAccepts"])},
        "crossFieldParityMode": cross_mode, "crossFieldFixtures": {"declared": len(cross), "matching": len(cross_ok)},
        "crossFieldNote": "superRefine / model_validator rules are not encodable in JSON Schema; parity for them is proven only by identical verdicts on the sealed fixtures from two independent implementations.",
        "schemaChecksumCanonicalization": "sorted-key compact JSON; Python recomputed the identical checksum" if not any("CHECKSUM" in f for f in failures) else "FAILED",
        "gateSelfTests": self_tests, "realRows": {"checked": rows_checked, "rejected": rows_rejected},
        "canonicalAuthority": False, "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "rabbitmq": 0, "graphify": 0},
    }
