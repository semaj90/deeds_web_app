from __future__ import annotations

import ast
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = (ROOT / "python", ROOT / "scripts" / "atlas")
GRAPH_CONSTRUCTORS = {"Graph", "DiGraph", "MultiGraph", "MultiDiGraph"}
SERIALIZATION_APIS = {"node_link_data", "node_link_graph"}
EXCLUDED_PARTS = {"__pycache__", ".venv", "node_modules", "site-packages"}


def _stable_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def collect_networkx_calls(source: str, source_ref: str) -> list[dict[str, object]]:
    tree = ast.parse(source, filename=source_ref)
    module_aliases: dict[str, str] = {}
    function_aliases: dict[str, str] = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "networkx" or alias.name.startswith("networkx."):
                    local_name = alias.asname or alias.name.split(".", 1)[0]
                    module_aliases[local_name] = alias.name if alias.asname else "networkx"
        elif isinstance(node, ast.ImportFrom) and node.module and (
            node.module == "networkx" or node.module.startswith("networkx.")
        ):
            for alias in node.names:
                function_aliases[alias.asname or alias.name] = alias.name

    calls: list[dict[str, object]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
            base_name = node.func.value.id
            module_name = module_aliases.get(base_name)
            if module_name and module_name.startswith("networkx"):
                calls.append({"api": node.func.attr, "line": node.lineno, "sourceRef": source_ref})
        elif isinstance(node.func, ast.Name) and node.func.id in function_aliases:
            calls.append({"api": function_aliases[node.func.id], "line": node.lineno, "sourceRef": source_ref})

    return sorted(calls, key=lambda item: (str(item["sourceRef"]), int(item["line"]), str(item["api"])))


def read_source_inventory() -> tuple[list[dict[str, str]], list[dict[str, object]], str]:
    files: list[dict[str, str]] = []
    calls: list[dict[str, object]] = []
    for scan_root in SCAN_ROOTS:
        for path in sorted(scan_root.rglob("*.py")):
            relative_parts = path.relative_to(ROOT).parts
            if any(part in EXCLUDED_PARTS or part.startswith(".") for part in relative_parts):
                continue
            payload = path.read_bytes()
            source_ref = path.relative_to(ROOT).as_posix()
            files.append({"sourceRef": source_ref, "sha256": hashlib.sha256(payload).hexdigest()})
            calls.extend(collect_networkx_calls(payload.decode("utf-8-sig"), source_ref))
    input_checksum = f"sha256:{hashlib.sha256(_stable_json(files)).hexdigest()}"
    return files, calls, input_checksum


def read_cugraph_backend_info() -> dict[str, object]:
    try:
        backend_info_entries = importlib.metadata.entry_points(group="networkx.backend_info")
        cugraph_entry = next((entry for entry in backend_info_entries if entry.name == "cugraph"), None)
        if cugraph_entry is None:
            return {"status": "UNAVAILABLE", "reason": "NX_CUGRAPH_BACKEND_INFO_ENTRYPOINT_MISSING"}
        backend_info = cugraph_entry.load()()
        functions = backend_info.get("functions") if isinstance(backend_info, dict) else None
        if not isinstance(functions, dict) or not all(isinstance(name, str) for name in functions):
            return {"status": "UNAVAILABLE", "reason": "NX_CUGRAPH_BACKEND_INFO_INVALID"}
        try:
            version = importlib.metadata.version("nx-cugraph")
        except importlib.metadata.PackageNotFoundError:
            version = None
        return {
            "status": "AVAILABLE",
            "backendName": backend_info.get("backend_name"),
            "packageVersion": version,
            "declaredFunctions": sorted(functions),
        }
    except Exception as error:
        return {"status": "UNAVAILABLE", "reason": f"NX_CUGRAPH_BACKEND_INFO_ERROR:{type(error).__name__}"}


def classify_calls(calls: list[dict[str, object]], declared_functions: set[str] | None) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = {}
    for call in calls:
        grouped.setdefault(str(call["api"]), []).append(call)

    records: list[dict[str, object]] = []
    for api in sorted(grouped):
        if api in GRAPH_CONSTRUCTORS:
            status = "GRAPH_CONSTRUCTION_NOT_ACCELERATION_CLASSIFIED"
        elif api in SERIALIZATION_APIS:
            status = "SERIALIZATION_CPU_PATH"
        elif declared_functions is None:
            status = "BACKEND_CAPABILITY_UNAVAILABLE"
        elif api in declared_functions:
            status = "NX_CUGRAPH_API_DECLARED_PARITY_UNVERIFIED"
        else:
            status = "CPU_FALLBACK_REQUIRED_FOR_NX_CUGRAPH_26_6"
        records.append({"api": api, "status": status, "callSites": grouped[api]})
    return records


def build_report() -> dict[str, object]:
    source_files, calls, input_checksum = read_source_inventory()
    backend_info = read_cugraph_backend_info()
    declared_functions = (
        set(backend_info["declaredFunctions"])
        if backend_info.get("status") == "AVAILABLE"
        else None
    )
    api_records = classify_calls(calls, declared_functions)
    try:
        networkx_version = importlib.metadata.version("networkx")
    except importlib.metadata.PackageNotFoundError:
        networkx_version = None
    return {
        "schema": "atlas.networkx-cugraph-capability-census.v1",
        "status": "STATIC_CAPABILITY_CENSUS_COMPLETE",
        "proofScope": "SOURCE_CALLS_AND_BACKEND_METADATA_ONLY",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceInputChecksum": input_checksum,
        "sourceFileCount": len(source_files),
        "networkxVersion": networkx_version,
        "cugraphBackendInfo": backend_info,
        "apiRecords": api_records,
        "callSiteCount": len(calls),
        "graphExecutionPerformed": False,
        "gpuExecutionPerformed": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def write_report(report: dict[str, object]) -> Path:
    output_directory = ROOT / ".tmp" / "atlas"
    output_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output_path = output_directory / f"networkx-cugraph-capability-census-v1-{timestamp}.json"
    report["receiptChecksum"] = f"sha256:{hashlib.sha256(_stable_json(report)).hexdigest()}"
    output_path.write_bytes(_stable_json(report) + b"\n")
    readback = json.loads(output_path.read_text(encoding="utf-8"))
    expected_checksum = readback.pop("receiptChecksum")
    actual_checksum = f"sha256:{hashlib.sha256(_stable_json(readback)).hexdigest()}"
    if actual_checksum != expected_checksum:
        raise RuntimeError("NETWORKX_CUGRAPH_CENSUS_READBACK_MISMATCH")
    return output_path


def main() -> int:
    report = build_report()
    output_path = write_report(report)
    summary = {
        "status": report["status"],
        "backendInfoStatus": report["cugraphBackendInfo"]["status"],
        "backendVersion": report["cugraphBackendInfo"].get("packageVersion"),
        "callSiteCount": report["callSiteCount"],
        "apiRecords": report["apiRecords"],
        "receipt": str(output_path.relative_to(ROOT)),
        "receiptChecksum": report["receiptChecksum"],
        "graphExecutionPerformed": False,
        "gpuExecutionPerformed": False,
        "writesPerformed": False,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
