"""Safe, bounded `rg` argument-array symbol search helper (no shell interpolation)."""

from __future__ import annotations

import json
import pathlib
import subprocess
from typing import Any


def safe_rg_symbol_search_v1(
    *,
    pattern: str,
    search_root: str | pathlib.Path,
    repo_root: str | pathlib.Path = ".",
    max_count: int = 50,
    max_filesize: str = "1M",
    timeout_s: float = 5.0,
) -> list[dict[str, Any]]:
    """Run `rg --json` using a direct argument array (`shell=False`) within `repo_root`."""
    clean_pattern = pattern.strip()
    if not clean_pattern or len(clean_pattern) > 256:
        raise ValueError("INVALID_RG_PATTERN")

    repo_resolved = pathlib.Path(repo_root).resolve()
    target_resolved = (repo_resolved / search_root).resolve() if not pathlib.Path(search_root).is_absolute() else pathlib.Path(search_root).resolve()
    try:
        target_resolved.relative_to(repo_resolved)
    except ValueError as err:
        raise ValueError(f"SEARCH_ROOT_OUTSIDE_REPO:{search_root}") from err

    cmd = [
        "rg",
        "--json",
        "--fixed-strings",
        "--max-count",
        str(max(1, min(int(max_count), 200))),
        "--max-filesize",
        max_filesize,
        "--",
        clean_pattern,
        str(target_resolved),
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_s,
        shell=False,
    )
    if proc.returncode not in (0, 1):
        raise RuntimeError(f"RG_FAILED:{proc.returncode}:{proc.stderr[:200]}")

    hits: list[dict[str, Any]] = []
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        if event.get("type") != "match":
            continue
        data = event["data"]
        path_text = data["path"]["text"]
        try:
            rel_path = str(pathlib.Path(path_text).resolve().relative_to(repo_resolved)).replace("\\", "/")
        except ValueError:
            rel_path = path_text
        hits.append(
            {
                "source_ref": rel_path,
                "line_number": int(data["line_number"]),
                "absolute_offset": int(data["absolute_offset"]),
                "line_text": data["lines"]["text"].rstrip("\r\n"),
                "canonical_authority": False,
            }
        )
        if len(hits) >= max_count:
            break
    return hits
