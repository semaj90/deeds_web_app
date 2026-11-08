#!/usr/bin/env python3
"""
openspec-task-pipeline-v1.py

One-command runner for the OpenSpec task analysis chain. Runs three existing steps
with one shared stamp, chains their outputs, and writes a receipt.

  1. openspec-task-extract-v1.py    tasks.md -> all rows + citation PageRank   (--top 0)
  2. openspec-task-rank-fuse-v1.py  RRF of citation / theme / kNN-PageRank + Louvain communities
  3. openspec-task-domain-fanout-v1.py  proposal-only domain tags + fanout

Each step is the owner of its own logic; this file only sequences them. It writes
only new report files. Stops at the first failing step and records it in the receipt.
Advisory output: canonicalAuthority false.

Usage (repo root):
  python scripts/atlas/openspec-task-pipeline-v1.py [--out-dir docs/reports] [--k 10] [--page-size 100]
"""
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(step, argv, root):
    """Run one step; return (ok, stdout_tail, stderr_tail)."""
    proc = subprocess.run([sys.executable] + argv, cwd=root, capture_output=True, text=True)
    return proc.returncode == 0, proc.stdout[-1500:], proc.stderr[-1500:]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return "sha256:" + h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--page-size", type=int, default=100)
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    rel = lambda p: os.path.relpath(p, root).replace("\\", "/")

    steps = []

    extract = os.path.join(HERE, "openspec-task-extract-v1.py")
    fuse = os.path.join(HERE, "openspec-task-rank-fuse-v1.py")
    domain = os.path.join(HERE, "openspec-task-domain-fanout-v1.py")

    ok, out, err = run("extract", [extract, "--root", root, "--out-dir", args.out_dir,
                                   "--top", "0", "--page-size", str(args.page_size), "--stamp", args.stamp], root)
    steps.append({"step": "extract", "ok": ok, "stderr": err if not ok else ""})
    if not ok:
        return finish(out_dir, args, steps, root, status="FAILED_AT_EXTRACT")

    extract_all_open = os.path.join(out_dir, f"openspec-task-extract-v1.{args.stamp}.all-open.jsonl")
    if not os.path.exists(extract_all_open):
        steps[-1]["ok"] = False
        steps[-1]["stderr"] = f"expected output missing: {rel(extract_all_open)}"
        return finish(out_dir, args, steps, root, status="FAILED_AT_EXTRACT")

    ok, out, err = run("fuse", [fuse, "--root", root, "--in", rel(extract_all_open), "--out-dir", args.out_dir,
                                "--k", str(args.k), "--page-size", str(args.page_size), "--stamp", args.stamp], root)
    steps.append({"step": "fuse", "ok": ok, "stderr": err if not ok else ""})
    if not ok:
        return finish(out_dir, args, steps, root, status="FAILED_AT_FUSE")

    fused = os.path.join(out_dir, f"openspec-task-rank-fuse-v1.{args.stamp}.jsonl")
    if not os.path.exists(fused):
        steps[-1]["ok"] = False
        steps[-1]["stderr"] = f"expected output missing: {rel(fused)}"
        return finish(out_dir, args, steps, root, status="FAILED_AT_FUSE")

    ok, out, err = run("domain", [domain, "--root", root, "--in", rel(fused), "--out-dir", args.out_dir,
                                  "--stamp", args.stamp], root)
    steps.append({"step": "domain", "ok": ok, "stderr": err if not ok else ""})
    if not ok:
        return finish(out_dir, args, steps, root, status="FAILED_AT_DOMAIN")

    return finish(out_dir, args, steps, root, status="OK")


def finish(out_dir, args, steps, root, status):
    rel = lambda p: os.path.relpath(p, root).replace("\\", "/")
    stamp = args.stamp
    outputs = sorted(glob.glob(os.path.join(out_dir, f"*{stamp}*")))
    outputs = [p for p in outputs if not p.endswith(".receipt.json")]
    receipt = {
        "schema": "atlas.openspec-task-pipeline.receipt.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "stamp": stamp,
        "status": status,
        "canonicalAuthority": False,
        "params": {"k": args.k, "pageSize": args.page_size, "rrfK": 60, "topMode": "all-open"},
        "steps": steps,
        "outputs": {rel(p): sha256(p) for p in outputs if os.path.isfile(p)},
        "writes": "new report files only; no PostgreSQL, Valkey, Qdrant, Neo4j, or source edits",
    }
    path = os.path.join(out_dir, f"openspec-task-pipeline-v1.{stamp}.receipt.json")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(receipt, fh, indent=2)
        fh.write("\n")
    print(json.dumps({"status": status, "receipt": rel(path),
                      "steps": [{"step": s["step"], "ok": s["ok"]} for s in steps]}, indent=2))
    if status != "OK":
        for s in steps:
            if not s["ok"]:
                print(f"--- {s['step']} stderr ---\n{s['stderr']}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
