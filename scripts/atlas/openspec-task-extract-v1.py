#!/usr/bin/env python3
"""
openspec-task-extract-v1.py

Read-only extraction of OpenSpec tasks.md checkboxes into JSONL, plus a
PageRank-ranked, paginated view of the top open tasks.

Writes ONLY new report files under --out-dir (default docs/reports/).
Never edits tasks.md, the workboard, PostgreSQL, Valkey, Qdrant or Neo4j.

Pipeline (CPU, stdlib + networkx; task identity before acceleration):
  1. git ls-files --cached --others --exclude-standard -> local task inventory
  2. detect UTF-8 / UTF-16 and quarantine invalid encoding instead of replacement decoding
  3. parse open/partial/done checkboxes, declared task codes and source revisions
  4. directed graph: task -> task it cites (networkx PageRank, damping 0.85)
  5. rank OPEN tasks by PageRank, tie-break by stable id
  6. emit full JSONL, top-K JSONL with page numbers, and a manifest with sha256

Usage (from repo root):
  python scripts/atlas/openspec-task-extract-v1.py --out-dir docs/reports --top 1000 --page-size 100
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

CHECKBOX = re.compile(r"^\s*[-*]\s\[( |x|X|~)\]\s(.*)$")
HEADER = re.compile(r"^(#{1,6})\s+(.*)$")
# Mirrors scripts/atlas/lib/wfu-metadata.mjs::WFU_ID so this scan does not
# silently narrow the workboard's declared-ID syntax. This is still only the
# literal ID at the start of a checkbox item; it is not a generated task key.
TASK_CODE = re.compile(
    r"^(?:\*\*)?`?((?=[A-Z0-9-]*\d)[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+[a-z]?|\d+(?:\.\d+)+[a-z]?)`?\b"
)
REF_CODE = re.compile(r"\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,3}[a-z]?)\b")
EXCLUDE = re.compile(r"(archive|phase-110|phase_|/v2/|^v2/|parent_atlas_tensor_residency_integration_v2)")
TEXT_LIMIT = 400


def git_tasks(root):
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=root, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    files = [p.replace("\\", "/") for p in out if re.search(r"(^|/)tasks\.md$", p)]
    return sorted(p for p in files if not EXCLUDE.search(p))


def change_id(path):
    m = re.search(r"openspec/(?:changes|specs/openspec/changes)/([^/]+)/tasks\.md$", path)
    if m:
        return m.group(1)
    return os.path.basename(os.path.dirname(path)) or path


def decode_task_bytes(raw):
    """Decode task Markdown without silently replacing bytes or inventing rows."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig", errors="strict"), "utf-8-bom", None
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16-le", errors="strict"), "utf-16-le-bom", None
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16-be", errors="strict"), "utf-16-be-bom", None

    # BOM-less UTF-16 ASCII text has a strong alternating-NUL signal. Detect it
    # before UTF-8 so it cannot be misreported as malformed UTF-8.
    if len(raw) >= 8 and len(raw) % 2 == 0:
        even_nuls = sum(value == 0 for value in raw[0::2])
        odd_nuls = sum(value == 0 for value in raw[1::2])
        pairs = len(raw) // 2
        if odd_nuls / pairs >= 0.25 and even_nuls / pairs < 0.05:
            return raw.decode("utf-16-le", errors="strict"), "utf-16-le-no-bom", None
        if even_nuls / pairs >= 0.25 and odd_nuls / pairs < 0.05:
            return raw.decode("utf-16-be", errors="strict"), "utf-16-be-no-bom", None

    try:
        return raw.decode("utf-8", errors="strict"), "utf-8", None
    except UnicodeDecodeError as exc:
        return None, "invalid-utf8", {"byteStart": exc.start, "byteEnd": exc.end, "reason": exc.reason}


def parse_file(root, rel):
    tasks = []
    header = ""
    path = os.path.join(root, rel)
    try:
        with open(path, "rb") as fh:
            raw_bytes = fh.read()
    except OSError as exc:
        return tasks, {"file": rel, "sha256": None, "encoding": "unreadable", "decodeStatus": "READ_ERROR", "errorType": type(exc).__name__, "taskRows": 0}

    file_hash = hashlib.sha256(raw_bytes).hexdigest()
    try:
        content, encoding, decode_error = decode_task_bytes(raw_bytes)
    except UnicodeDecodeError as exc:
        content, encoding = None, "invalid-utf16"
        decode_error = {"byteStart": exc.start, "byteEnd": exc.end, "reason": exc.reason}

    if content is None:
        return tasks, {
            "file": rel, "sha256": file_hash, "encoding": encoding,
            "decodeStatus": "INVALID_ENCODING", "decodeError": decode_error, "taskRows": 0,
        }

    for lineno, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.rstrip("\r")
        h = HEADER.match(line)
        if h:
            header = h.group(2).strip()[:200]
            continue
        c = CHECKBOX.match(line)
        if not c:
            continue
        mark, text = c.group(1), c.group(2).strip()
        code_m = TASK_CODE.match(text)
        code = code_m.group(1) if code_m else None
        refs = sorted({r for r in REF_CODE.findall(text) if r != code})
        tasks.append({
            # `id` remains a source locator; task_code is the declared ID when present.
            "id": f"{rel}#L{lineno}",
            "file": rel,
            "change_id": change_id(rel),
            "line": lineno,
            "sourceFileRevision": f"sha256:{file_hash}",
            "taskLineChecksum": hashlib.sha256(raw_line.encode("utf-8")).hexdigest(),
            "status": "done" if mark.lower() == "x" else "partial" if mark == "~" else "open",
            "task_code": code,
            "identityState": "DECLARED_TASK_CODE" if code else "NO_DECLARED_TASK_CODE",
            "section": header,
            "text": text[:TEXT_LIMIT],
            "refs": refs,
        })
    return tasks, {
        "file": rel, "sha256": file_hash, "encoding": encoding,
        "decodeStatus": "OK", "taskRows": len(tasks),
    }


def git_value(root, *args):
    result = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def build_graph(tasks):
    """Directed edges task -> task it cites. Returns (nodes, out_edges, in_degree, edge_count)."""
    nodes = [t["id"] for t in tasks]
    by_code = defaultdict(list)
    for t in tasks:
        if t["task_code"]:
            by_code[t["task_code"]].append(t["id"])
    out_edges = defaultdict(set)
    in_degree = defaultdict(int)
    for t in tasks:
        for r in t["refs"]:
            for target in by_code.get(r, []):
                if target != t["id"] and target not in out_edges[t["id"]]:
                    out_edges[t["id"]].add(target)
                    in_degree[target] += 1
    edge_count = sum(len(v) for v in out_edges.values())
    return nodes, out_edges, in_degree, edge_count


def pagerank(nodes, out_edges, damping=0.85, max_iter=200, tol=1e-10):
    """Standard PageRank by power iteration (dangling mass redistributed uniformly).
    Pure Python: no scipy dependency."""
    n = len(nodes)
    if n == 0:
        return {}
    idx = {node: i for i, node in enumerate(nodes)}
    out_deg = [len(out_edges.get(node, ())) for node in nodes]
    in_lists = [[] for _ in range(n)]
    for src, targets in out_edges.items():
        si = idx[src]
        for dst in targets:
            in_lists[idx[dst]].append(si)
    rank = [1.0 / n] * n
    teleport = (1.0 - damping) / n
    for _ in range(max_iter):
        dangling = damping * sum(rank[i] for i in range(n) if out_deg[i] == 0) / n
        new = [teleport + dangling] * n
        for j in range(n):
            s = 0.0
            for i in in_lists[j]:
                s += rank[i] / out_deg[i]
            new[j] += damping * s
        delta = sum(abs(new[i] - rank[i]) for i in range(n))
        rank = new
        if delta < tol:
            break
    total = sum(rank) or 1.0
    return {node: rank[idx[node]] / total for node in nodes}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--top", type=int, default=1000, help="0 = rank and page every open task")
    ap.add_argument("--page-size", type=int, default=100)
    ap.add_argument("--damping", type=float, default=0.85)
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    files = git_tasks(root)
    tasks = []
    input_files = []
    for rel in files:
        file_tasks, file_record = parse_file(root, rel)
        tasks.extend(file_tasks)
        input_files.append(file_record)

    scoped_declared_ids = Counter(
        (task["change_id"], task["task_code"])
        for task in tasks
        if task["task_code"]
    )
    for task in tasks:
        if task["task_code"] and scoped_declared_ids[(task["change_id"], task["task_code"])] > 1:
            task["identityState"] = "AMBIGUOUS_DUPLICATE_DECLARED_TASK_CODE"

    source_manifest_bytes = json.dumps(
        [{"file": item["file"], "sha256": item["sha256"]} for item in input_files],
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    source_manifest_checksum = "sha256:" + hashlib.sha256(source_manifest_bytes).hexdigest()

    nodes, out_edges, in_degree, edge_count = build_graph(tasks)
    pr = pagerank(nodes, out_edges, damping=args.damping)

    for t in tasks:
        t["pagerank"] = round(pr.get(t["id"], 0.0), 10)
        t["in_degree"] = in_degree.get(t["id"], 0)

    open_tasks = [t for t in tasks if t["status"] == "open"]
    open_tasks.sort(key=lambda t: (-t["pagerank"], -t["in_degree"], t["id"]))
    top = open_tasks if args.top == 0 else open_tasks[: args.top]
    top_label = "all-open" if args.top == 0 else f"top{args.top}"
    for rank, t in enumerate(top, start=1):
        t["rank"] = rank
        t["page"] = (rank - 1) // args.page_size + 1

    stem = f"openspec-task-extract-v1.{args.stamp}"
    full_path = os.path.join(out_dir, f"{stem}.all.jsonl")
    top_path = os.path.join(out_dir, f"{stem}.{top_label}.jsonl")
    manifest_path = os.path.join(out_dir, f"{stem}.manifest.json")

    write_jsonl(full_path, tasks)
    write_jsonl(top_path, top)

    status_counts = defaultdict(int)
    for t in tasks:
        status_counts[t["status"]] += 1
    manifest = {
        "schema": "atlas.openspec-task-extract.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "canonicalAuthority": False,
        "producer": {
            "path": "scripts/atlas/openspec-task-extract-v1.py",
            "sha256": sha256_file(__file__),
        },
        "invocation": sys.argv,
        "workspaceHead": git_value(root, "rev-parse", "HEAD"),
        "workspaceBranch": git_value(root, "branch", "--show-current"),
        "inputMode": "working-tree tracked plus untracked non-ignored task files",
        "sourceManifestChecksum": source_manifest_checksum,
        "params": {
            "root": ".",
            "top": args.top,
            "pageSize": args.page_size,
            "pagerankDamping": args.damping,
            "pagerankMaxIter": 200,
            "pagerankTol": 1e-10,
            "excludePattern": EXCLUDE.pattern,
            "rankBy": "pagerank desc, in_degree desc, id asc",
        },
        "inputs": {
            "tasksMdFiles": len(files),
            "files": input_files,
            "sourceManifestChecksum": source_manifest_checksum,
            "encodingIssueFiles": sum(1 for item in input_files if item["decodeStatus"] != "OK"),
            "declaredTaskCodeRows": sum(1 for task in tasks if task["task_code"]),
            "rowsWithoutDeclaredTaskCode": sum(1 for task in tasks if not task["task_code"]),
            "openRowsWithoutDeclaredTaskCode": sum(
                1 for task in tasks if task["status"] == "open" and not task["task_code"]
            ),
            "duplicateDeclaredTaskCodeGroupsWithinChange": sum(
                1 for count in scoped_declared_ids.values() if count > 1
            ),
            "rowsWithDuplicateDeclaredTaskCodeWithinChange": sum(
                count for count in scoped_declared_ids.values() if count > 1
            ),
        },
        "counts": {
            "rows": len(tasks),
            "open": status_counts["open"],
            "partial": status_counts["partial"],
            "done": status_counts["done"],
            "graphNodes": len(nodes),
            "graphEdges": edge_count,
            "withTaskCode": sum(1 for t in tasks if t["task_code"]),
            "topWritten": len(top),
            "pages": (len(top) + args.page_size - 1) // args.page_size,
        },
        "outputs": {
            os.path.basename(full_path): sha256_file(full_path),
            os.path.basename(top_path): sha256_file(top_path),
        },
    }
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")

    print(json.dumps({"manifest": os.path.relpath(manifest_path, root),
                      "all": os.path.relpath(full_path, root),
                      "top": os.path.relpath(top_path, root),
                      "counts": manifest["counts"],
                      "workspaceHead": manifest["workspaceHead"],
                      "sourceManifestChecksum": source_manifest_checksum,
                      "encodingIssueFiles": manifest["inputs"]["encodingIssueFiles"],
                      "rowsWithoutDeclaredTaskCode": manifest["inputs"]["rowsWithoutDeclaredTaskCode"],
                      "openRowsWithoutDeclaredTaskCode": manifest["inputs"]["openRowsWithoutDeclaredTaskCode"],
                      "duplicateDeclaredTaskCodeGroupsWithinChange": manifest["inputs"]["duplicateDeclaredTaskCodeGroupsWithinChange"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
