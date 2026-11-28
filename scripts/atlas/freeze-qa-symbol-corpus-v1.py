"""Freeze the existing QA route plan and stream its bound workboard into a local index."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import ijson
import jsonschema
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_graph_runtime.okf_language_lsp_term_expander_v1 import (  # noqa: E402
    detect_file_extension_language_v1,
    load_okf_language_profiles_v1,
)

OBO = ROOT / ".okf/ontologies/atlas-domain-and-language-terms-v1.obo"
PROFILES = ROOT / ".okf/languages"
SCHEMA = ROOT / "docs/.okf/schemas/frozen-symbol-corpus-v1.schema.json"
ROW_GROUP = 512
TASK_SCHEMA = pa.schema([
    ("taskKey", pa.string()), ("logicalTaskKey", pa.string()), ("stableKey", pa.string()),
    ("state", pa.string()), ("source", pa.string()), ("line", pa.int64()),
    ("blockHash", pa.string()), ("sourceFileSha256", pa.string()), ("text", pa.string()),
    ("claimTruncated", pa.bool_()),
])


def digest(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    with path.open("rb") as handle:
        return "sha256:" + hashlib.file_digest(handle, "sha256").hexdigest()


def source_path(relative: str, *, under: Path = ROOT) -> Path:
    path = (ROOT / relative).resolve()
    if Path(relative).is_absolute() or not path.is_relative_to(under):
        raise ValueError("SOURCE_PATH_OUTSIDE_SCOPE")
    return path


def freeze_symbols(plan: dict, plan_bytes: bytes, workboard_sha: str, head: str) -> dict:
    task = plan.get("taskRef") or {}
    if (plan.get("schema") != "atlas.all-routes-qa-feature-review-receipt.v1"
            or plan.get("canonicalAuthority") is not False or plan.get("gitHead") != head
            or task.get("logicalTaskKey") != plan.get("task")
            or task.get("status") != "CAPTURE_ASSERTED_SOURCE_CURRENT_LINK"
            or task.get("workboardSnapshotSha256") != workboard_sha):
        raise ValueError("ROUTE_PLAN_TASK_BINDING_INVALID")
    if file_digest(source_path(task["sourceRef"], under=ROOT / "openspec")) != task["sourceFileSha256"]:
        raise ValueError("TASK_SOURCE_BYTES_CHANGED")

    obo_bytes = OBO.read_bytes()
    ontology_ids = set(re.findall(r"^id: (\S+)\s*$", obo_bytes.decode("utf-8"), re.MULTILINE))
    terms = ["ATLASLANG:typescript", "ATLASDOM:frontend.sveltekit"]
    if not set(terms) <= ontology_ids:
        raise ValueError("OBO_TERM_UNRESOLVED")
    profiles = load_okf_language_profiles_v1(PROFILES)
    symbols = []
    seen = set()
    for key, role in (("fixtureCohort", "FIXTURE_ROUTE"), ("existingControls", "EXISTING_CONTROL")):
        for item in plan[key]:
            identity = item["method"], item["route"]
            if identity in seen:
                raise ValueError("DUPLICATE_SYMBOL_ROUTE")
            seen.add(identity)
            language = detect_file_extension_language_v1(item["file"], profiles)
            if language["language"] != "typescript":
                raise ValueError("SYMBOL_LANGUAGE_UNRESOLVED")
            source = source_path(item["file"], under=ROOT / "sveltekit-frontend/src/routes").read_bytes()
            if digest(source) != item["sourceSha256"]:
                raise ValueError(f"SYMBOL_SOURCE_BYTES_CHANGED:{item['file']}")
            ast = item["astObservation"]
            begin, end = ast["startByte"], ast["endByte"]
            if ast["symbol"] != identity[0] or not 0 <= begin < end <= len(source):
                raise ValueError("SYMBOL_SPAN_INVALID")
            span = source[begin:end]
            span.decode("utf-8", errors="strict")
            if digest(span) != ast["spanSha256"]:
                raise ValueError("SYMBOL_SPAN_CHECKSUM_MISMATCH")
            symbols.append({
                "role": role, "route": identity[1], "method": identity[0], "featureLabel": item["label"],
                "file": item["file"], "sourceSha256": item["sourceSha256"], "startByte": begin,
                "endByte": end, "spanSha256": ast["spanSha256"], "parser": ast["parser"],
                "languageId": language["language"], "lspStatus": "NOT_OBSERVED", "proposedOboIds": terms,
            })
    result = {
        "schema": "atlas.frozen-symbol-corpus.v1", "status": "PROPOSAL_ONLY", "canonicalAuthority": False,
        "workspaceRevision": None, "trainingEligible": False,
        "inputs": {"routePlanSha256": digest(plan_bytes), "workboardSha256": workboard_sha,
                   "ontologySha256": digest(obo_bytes), "languageProfileSha256": file_digest(PROFILES / "typescript.yaml")},
        "taskRef": {key: task[key] for key in ("logicalTaskKey", "sourceRef", "sourceFileSha256", "taskRevision")},
        "symbols": symbols,
    }
    jsonschema.Draft202012Validator(json.loads(SCHEMA.read_bytes())).validate(result)
    return result


def write_task_index(snapshot: Path, out: Path, task_ref: dict) -> tuple[int, int]:
    with snapshot.open("rb") as handle:
        if next(ijson.items(handle, "schema"), None) != "atlas.openspec.workboard-task-snapshot.v1":
            raise ValueError("COMPACT_WORKBOARD_REQUIRED")
    with snapshot.open("rb") as handle:
        source_hashes = next(ijson.items(handle, "sourceFileHashes"), {})

    batch = []
    count = matches = groups = 0
    with snapshot.open("rb") as handle, pq.ParquetWriter(out, TASK_SCHEMA, compression="zstd") as writer:
        for task in ijson.items(handle, "tasks.item"):
            source_hash = source_hashes.get(task["source"])
            row = {field: task.get(field) for field in TASK_SCHEMA.names}
            row["sourceFileSha256"] = source_hash
            batch.append(row)
            count += 1
            if row["logicalTaskKey"] == task_ref["logicalTaskKey"]:
                if (row["state"], row["source"], source_hash, row["blockHash"]) != (
                    "OPEN", task_ref["sourceRef"], task_ref["sourceFileSha256"], task_ref["taskRevision"]
                ):
                    raise ValueError("WORKBOARD_TASK_ROW_DRIFT")
                matches += 1
            if len(batch) == ROW_GROUP:
                writer.write_table(pa.Table.from_pylist(batch, schema=TASK_SCHEMA))
                groups += 1
                batch.clear()
        if batch:
            writer.write_table(pa.Table.from_pylist(batch, schema=TASK_SCHEMA))
            groups += 1
    if matches != 1:
        raise ValueError("WORKBOARD_TASK_ROW_NOT_UNIQUE")
    return count, groups


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--route-plan", type=Path, required=True)
    parser.add_argument("--workboard", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    output = args.out.resolve()
    temp_root = (ROOT / ".tmp").resolve()
    if output == temp_root or not output.is_relative_to(temp_root):
        parser.error("output must be a new directory under the repository .tmp")
    plan_bytes = args.route_plan.read_bytes()
    snapshot_sha = file_digest(args.workboard)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    corpus = freeze_symbols(json.loads(plan_bytes), plan_bytes, snapshot_sha, head)
    output.mkdir(parents=True, exist_ok=False)
    task_index = output / "workboard-tasks.parquet"
    rows, groups = write_task_index(args.workboard, task_index, corpus["taskRef"])
    if file_digest(args.workboard) != snapshot_sha:
        raise ValueError("WORKBOARD_CHANGED_DURING_EXPORT")
    corpus_path = output / "symbols.json"
    corpus_path.write_text(json.dumps(corpus, indent=2) + "\n", encoding="utf-8", newline="\n")
    receipt = {"status": "PROPOSAL_ONLY", "scope": "local AST byte readback and derived Parquet workboard index",
               "gitHead": head, "canonicalAuthority": False, "datastoreWritesPerformed": False,
               "trainingEligible": False, "symbols": len(corpus["symbols"]), "taskRows": rows, "rowGroups": groups,
               "batchRows": ROW_GROUP, "inputBytes": args.workboard.stat().st_size,
               "taskIndexBytes": task_index.stat().st_size, "taskIndexSha256": file_digest(task_index),
               "symbolCorpusSha256": file_digest(corpus_path), "workboardSha256": snapshot_sha}
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
