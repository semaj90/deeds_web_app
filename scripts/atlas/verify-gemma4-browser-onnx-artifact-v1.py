from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any


def verify_external_reference(model_root: Path, graph_path: Path, entry: dict[str, str]) -> dict[str, Any]:
    root = model_root.resolve()
    graph = graph_path.resolve()
    location = entry.get("location", "")
    try:
        offset = int(entry.get("offset", "0"))
        length = int(entry.get("length", ""))
    except (TypeError, ValueError):
        return {"location": location or None, "status": "INVALID_RANGE_METADATA"}
    if not location or offset < 0 or length <= 0:
        return {"location": location or None, "status": "INVALID_RANGE_METADATA"}
    target = (graph.parent / location).resolve()
    if target != root and root not in target.parents:
        return {"location": location, "status": "PATH_ESCAPES_MODEL_ROOT"}
    if not target.is_file():
        return {"location": location, "status": "EXTERNAL_DATA_MISSING", "requiredEnd": offset + length}
    size = target.stat().st_size
    return {
        "location": location,
        "status": "VALID" if offset + length <= size else "EXTERNAL_DATA_RANGE_OUT_OF_BOUNDS",
        "offset": offset,
        "length": length,
        "requiredEnd": offset + length,
        "fileBytes": size,
    }


def inspect_graph(onnx_module: Any, model_root: Path, graph_path: Path) -> dict[str, Any]:
    model = onnx_module.load_model(str(graph_path), load_external_data=False)
    by_location: dict[str, list[dict[str, str]]] = {}
    for tensor in model.graph.initializer:
        if tensor.data_location != onnx_module.TensorProto.EXTERNAL:
            continue
        entry = {item.key: item.value for item in tensor.external_data}
        by_location.setdefault(entry.get("location", ""), []).append(entry)
    references = []
    for location, entries in sorted(by_location.items()):
        checks = [verify_external_reference(model_root, graph_path, entry) for entry in entries]
        states = {check["status"] for check in checks}
        references.append({
            "location": location or None,
            "tensorCount": len(entries),
            "status": "VALID" if states == {"VALID"} else "INVALID",
            "failureStates": sorted(states - {"VALID"}),
            "fileBytes": next((check.get("fileBytes") for check in checks if check.get("fileBytes") is not None), None),
            "maxRequiredEnd": max((check.get("requiredEnd", 0) for check in checks), default=0),
        })
    return {
        "graph": graph_path.relative_to(model_root).as_posix(),
        "initializerCount": len(model.graph.initializer),
        "externalReferences": references,
        "status": "VALID" if all(item["status"] == "VALID" for item in references) else "INVALID",
    }


def build_report(model_root: Path, onnx_module: Any) -> dict[str, Any]:
    root = model_root.resolve()
    graphs = sorted(root.rglob("*.onnx"))
    results = [inspect_graph(onnx_module, root, graph) for graph in graphs]
    return {
        "schema": "atlas.gemma4-browser-onnx-artifact-preflight.v1",
        "modelRoot": str(root),
        "onnxVersion": onnx_module.__version__,
        "graphs": results,
        "graphCount": len(results),
        "validGraphCount": sum(result["status"] == "VALID" for result in results),
        "status": "PASS" if results and all(result["status"] == "VALID" for result in results) else "REJECTED",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default="sveltekit-frontend/static/gemma4_e2b_onnx")
    parser.add_argument("--output", default=".tmp/atlas/gemma4-browser-onnx-artifact-preflight-v1.json")
    args = parser.parse_args()
    try:
        import onnx
    except ImportError:
        print(json.dumps({"status": "DEPENDENCY_UNAVAILABLE", "dependency": "onnx", "installed": False}))
        return 2

    repo_root = Path(__file__).resolve().parents[2]
    model_root = (repo_root / args.model_dir).resolve()
    output = (repo_root / args.output).resolve()
    allowed_root = (repo_root / ".tmp" / "atlas").resolve()
    if output == allowed_root or allowed_root not in output.parents:
        raise ValueError("OUTPUT_MUST_REMAIN_UNDER_TMP_ATLAS")
    if not model_root.is_dir():
        raise FileNotFoundError("MODEL_DIRECTORY_NOT_FOUND")

    report = build_report(model_root, onnx)
    serialized = json.dumps(report, sort_keys=True, separators=(",", ":")).encode("utf-8")
    report["reportSha256"] = hashlib.sha256(serialized).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f"{output.name}.{os.getpid()}.tmp")
    with temporary.open("xb") as stream:
        stream.write(json.dumps(report, indent=2).encode("utf-8") + b"\n")
    os.replace(temporary, output)
    print(json.dumps({"output": str(output.relative_to(repo_root)), "status": report["status"], "graphCount": report["graphCount"], "validGraphCount": report["validGraphCount"], "reportSha256": report["reportSha256"]}, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
