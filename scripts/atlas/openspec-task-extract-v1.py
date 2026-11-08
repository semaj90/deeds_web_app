#!/usr/bin/env python3
"""
openspec-task-extract-v1.py

Read-only extraction of OpenSpec tasks.md checkboxes into JSONL, plus a
PageRank-ranked, paginated view of the top open tasks.

Writes ONLY new report files under --out-dir (default docs/reports/).
Never edits tasks.md, the workboard, PostgreSQL, Valkey, Qdrant or Neo4j.

Pipeline (CPU, stdlib + networkx; sized for ~7k rows):
  1. git ls-files -> tasks.md inventory, excluding archive/duplicate copies
  2. parse "- [ ]" / "- [x]" lines, section headers, task codes, cross-refs
  3. directed graph: task -> task it cites (networkx PageRank, damping 0.85)
  4. rank OPEN tasks by PageRank, tie-break by stable id
  5. emit full JSONL, top-K JSONL with page numbers, and a manifest with sha256

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
from collections import defaultdict

CHECKBOX = re.compile(r"^\s*[-*]\s\[( |x|X)\]\s(.*)$")
HEADER = re.compile(r"^(#{1,6})\s+(.*)$")
TASK_CODE = re.compile(r"^\**\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{1,3}[a-z]?)\b")
REF_CODE = re.compile(r"\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,3}[a-z]?)\b")
EXCLUDE = re.compile(r"(archive|phase-110|phase_|/v2/|^v2/|parent_atlas_tensor_residency_integration_v2)")
TEXT_LIMIT = 400


def git_tasks(root):
    out = subprocess.run(
        ["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    files = [p.replace("\\", "/") for p in out if re.search(r"(^|/)tasks\.md$", p)]
    return sorted(p for p in files if not EXCLUDE.search(p))


def change_id(path):
    m = re.search(r"openspec/(?:changes|specs/openspec/changes)/([^/]+)/tasks\.md$", path)
    if m:
        return m.group(1)
    return os.path.basename(os.path.dirname(path)) or path


def parse_file(root, rel):
    tasks = []
    header = ""
    with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
        for lineno, raw in enumerate(fh, start=1):
            line = raw.rstrip("\r\n")
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
                "id": f"{rel}#L{lineno}",
                "file": rel,
                "change_id": change_id(rel),
                "line": lineno,
                "status": "done" if mark.lower() == "x" else "open",
                "task_code": code,
                "section": header,
                "text": text[:TEXT_LIMIT],
                "refs": refs,
            })
    return tasks


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
    for rel in files:
        tasks.extend(parse_file(root, rel))

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
        "inputs": {"tasksMdFiles": len(files)},
        "counts": {
            "rows": len(tasks),
            "open": status_counts["open"],
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
                      "counts": manifest["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
