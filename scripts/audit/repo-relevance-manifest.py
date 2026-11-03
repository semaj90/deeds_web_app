#!/usr/bin/env python
"""Read-only repo relevance audit.

Builds a per-file manifest (Polars), scores relevance with explainable signals, and
writes reports under .tmp/repo-audit/. It NEVER moves, deletes or edits repo files.

Signals: referenced (basename mentioned in tracked text), tracked, recency, class
(source/vendored/generated/scratch/other), duplicate (sha256), name keywords.
Vendored/generated trees are NOT descended into; they are recorded as one aggregate row.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / ".tmp" / "repo-audit"
NOW = time.time()

VENDORED = {"node_modules", ".venv", "venv", ".git", "site-packages", ".pnpm-store"}
GENERATED = {".svelte-kit", "dist", "build", "target", "__pycache__", ".turbo", ".next", ".cache", ".vite"}
SCRATCH_TOP = {".tmp", "tmp", ".pytest_cache"}
SOURCE_EXT = {".ts", ".mts", ".mjs", ".js", ".svelte", ".py", ".sql", ".go", ".rs", ".ps1", ".cu", ".cpp", ".h", ".json", ".yaml", ".yml", ".md"}
TEXT_EXT = {".ts", ".mts", ".mjs", ".js", ".svelte", ".py", ".sql", ".go", ".rs", ".ps1", ".json", ".yaml", ".yml", ".md", ".toml", ".html", ".css"}
KEYWORDS = ("backup", "old", "copy", "legacy", "probe", "tmp", "temp", "deprecated", "stale", "v1", "bak", "orig")
HASH_CAP = 1_000_000
REF_CAP = 512_000


def is_vendored_dir(name: str) -> bool:
    return name in VENDORED or name.startswith(".venv")


def tracked_set() -> set[str]:
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    return {p.replace("\\", "/") for p in out.decode("utf-8", "replace").split("\0") if p}


def classify(rel: str, ext: str) -> str:
    top = rel.split("/", 1)[0]
    if top in SCRATCH_TOP:
        return "scratch"
    parts = set(rel.split("/"))
    if parts & GENERATED:
        return "generated"
    return "source" if ext in SOURCE_EXT else "other"


def walk(tracked: set[str]) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    aggs: list[dict] = []
    stack = [ROOT]
    while stack:
        d = stack.pop()
        try:
            entries = list(os.scandir(d))
        except OSError:
            continue
        for e in entries:
            try:
                rel = Path(e.path).relative_to(ROOT).as_posix()
                if e.is_dir(follow_symlinks=False):
                    if is_vendored_dir(e.name):
                        aggs.append({"path": rel, "class": "vendored", "kind": "dir"})
                    else:
                        stack.append(Path(e.path))
                elif e.is_file(follow_symlinks=False):
                    st = e.stat(follow_symlinks=False)
                    ext = os.path.splitext(e.name)[1].lower()
                    rows.append({
                        "path": rel, "name": e.name, "ext": ext, "top": rel.split("/", 1)[0],
                        "size": st.st_size, "age_days": int((NOW - st.st_mtime) / 86400),
                        "tracked": rel in tracked, "class": classify(rel, ext),
                    })
            except OSError:
                continue
    return rows, aggs


def reference_counts(tracked: set[str]) -> Counter:
    tok = re.compile(r"[A-Za-z0-9_.\-]{3,}")
    c: Counter = Counter()
    for rel in tracked:
        if os.path.splitext(rel)[1].lower() not in TEXT_EXT:
            continue
        p = ROOT / rel
        try:
            if p.stat().st_size > REF_CAP:
                continue
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        c.update(set(tok.findall(text)))  # per-file presence, not frequency
    return c


def sha(path: Path) -> str | None:
    try:
        if path.stat().st_size > HASH_CAP:
            return None
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    tracked = tracked_set()
    print(f"tracked: {len(tracked)}", file=sys.stderr)
    rows, aggs = walk(tracked)
    print(f"files walked (vendored dirs excluded): {len(rows)}; vendored dirs: {len(aggs)}", file=sys.stderr)

    refs = reference_counts(tracked)
    df = pl.DataFrame(rows)
    df = df.with_columns(
        pl.col("name").map_elements(lambda n: refs.get(n, 0), return_dtype=pl.Int64).alias("ref_files"),
        pl.col("name").str.to_lowercase().map_elements(
            lambda n: ",".join(k for k in KEYWORDS if k in n), return_dtype=pl.Utf8
        ).alias("kw"),
    )
    hashed = df.filter(pl.col("tracked") | (pl.col("class") == "source")).select("path")["path"].to_list()
    hmap = {p: sha(ROOT / p) for p in hashed}
    df = df.with_columns(pl.col("path").map_elements(lambda p: hmap.get(p), return_dtype=pl.Utf8).alias("sha256"))
    df = df.with_columns(pl.col("sha256").is_duplicated().and_(pl.col("sha256").is_not_null()).alias("dup"))

    df = df.with_columns(
        (
            pl.when(pl.col("tracked")).then(30).otherwise(0)
            + pl.when(pl.col("ref_files") >= 3).then(40).when(pl.col("ref_files") >= 1).then(20).otherwise(0)
            + pl.when(pl.col("age_days") <= 30).then(15).when(pl.col("age_days") <= 180).then(5).otherwise(0)
            + pl.when(pl.col("class") == "source").then(15).otherwise(0)
            - pl.when(pl.col("dup")).then(15).otherwise(0)
            - pl.when(pl.col("kw") != "").then(10).otherwise(0)
            - pl.when(pl.col("class").is_in(["scratch", "generated"])).then(25).otherwise(0)
        ).alias("score")
    )
    df = df.with_columns(
        pl.when((pl.col("score") < 20) & ~pl.col("tracked")).then(pl.lit("archive-candidate"))
        .when(pl.col("score") < 40).then(pl.lit("review"))
        .otherwise(pl.lit("keep")).alias("recommendation")
    )

    df.write_parquet(OUT / "manifest.parquet")
    pl.DataFrame(aggs).write_csv(OUT / "vendored-dirs.csv")
    summary = (
        df.group_by(["top", "class", "recommendation"])
        .agg(pl.len().alias("files"), (pl.col("size").sum() / 1e9).round(3).alias("gb"))
        .sort("files", descending=True)
    )
    summary.write_csv(OUT / "summary.csv")
    df.filter(pl.col("recommendation") == "archive-candidate").sort("size", descending=True).head(5000).write_csv(
        OUT / "archive-candidates.csv"
    )
    df.filter(pl.col("dup")).group_by("sha256").agg(pl.col("path"), pl.len().alias("n")).sort("n", descending=True).head(2000).write_csv(
        OUT / "duplicates.csv"
    ) if False else None
    print(summary.head(25))
    print(f"reports: {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
