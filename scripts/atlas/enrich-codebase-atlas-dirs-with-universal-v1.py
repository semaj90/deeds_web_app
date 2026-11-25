#!/usr/bin/env python3
"""Enrich `sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json` with OBO/EG2 universal cards (Seam 3).

Preserves the exact `v: 1` card schema expected by `context-for-file.ts` and `build-atlas-index.mjs` while:
1. Replacing `"unclassified"` topo entries on existing directory cards with verified OBO/structural topo classes.
2. Appending all 1,803 previously missing repository directories (`tools/`, `python/`, `packages/`, `openspec/`,
   `mcp-server-mcp/`, `simd-bridge/`, `docker/`, etc.).
3. Demoting retired `ollama.ts` / `minio-client.ts` entries in `top[]` when active modules exist.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
UNIVERSAL_JSONL = REPO_ROOT / ".tmp" / "atlas" / "universal-directory-cards-v1" / "cards.jsonl"
DIRS_JSON = REPO_ROOT / "sveltekit-frontend" / "memory" / "atlas" / "codebase-atlas.dirs.json"

DEFAULT_TOOLS = [
    "kag.multi_lane_search",
    "graph.expand_neighborhood",
    "topology.same_som_cluster",
    "clusters.get_members",
    "context.build_kv_packet",
    "taxonomy.children",
    "taxonomy.path",
    "search.hybrid",
]


def _deprioritize_legacy_top(top_files: list[str], fallback_files: list[str]) -> list[str]:
    seen: list[str] = []
    legacy: list[str] = []
    for f in [*top_files, *fallback_files]:
        if not f or f in seen or f in legacy:
            continue
        low = f.lower()
        if "ollama" in low or "minio" in low:
            legacy.append(f)
        else:
            seen.append(f)
    return (seen + legacy)[:5]


def main() -> int:
    existing_doc = json.loads(DIRS_JSON.read_text(encoding="utf-8"))
    existing_cards: list[dict[str, Any]] = list(existing_doc.get("cards") or [])

    universal_by_dir: dict[str, dict[str, Any]] = {}
    universal_by_alias: dict[str, dict[str, Any]] = {}
    for raw in UNIVERSAL_JSONL.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        u = json.loads(raw)
        universal_by_dir[u["dir_path"]] = u
        if u.get("frontend_alias_path"):
            universal_by_alias[u["frontend_alias_path"]] = u

    repaired_unclassified = 0
    seen_dirs: set[str] = set()
    merged_cards: list[dict[str, Any]] = []

    for card in existing_cards:
        d = str(card.get("d") or "")
        seen_dirs.add(d)
        u = universal_by_dir.get(d) or universal_by_alias.get(d)
        if u is not None:
            old_topo = [t for t in (card.get("topo") or []) if t != "unclassified"]
            if len(old_topo) != len(card.get("topo") or []) or not old_topo:
                repaired_unclassified += 1
            new_topo = list(dict.fromkeys([*old_topo, *(u.get("topo_classes") or [])]))[:4]
            new_tags = list(dict.fromkeys([*(card.get("tags") or []), *(u.get("obo_concept_ids") or [])]))[:8]
            new_tools = list(dict.fromkeys([*(u.get("mcp_tools") or []), *(card.get("tools") or DEFAULT_TOOLS)]))[:8]
            card = {
                **card,
                "topo": new_topo or ["core-infrastructure"],
                "tags": new_tags,
                "tools": new_tools,
                "top": _deprioritize_legacy_top(list(card.get("top") or []), list(u.get("top_files") or [])),
            }
        merged_cards.append(card)

    added_missing = 0
    for d_path, u in universal_by_dir.items():
        alias = u.get("frontend_alias_path")
        if d_path in seen_dirs or (alias and alias in seen_dirs):
            continue
        parent = u.get("parent_dir") or ""
        merged_cards.append(
            {
                "d": d_path,
                "a": f"agents:{d_path}/AGENTS.md" if d_path != "." else "agents:AGENTS.md",
                "p": f"agents:{parent}/AGENTS.md" if parent and parent != "." else "",
                "n": int(u.get("file_count") or 0),
                "clusters": [f"{t}:0" for t in (u.get("topo_classes") or [])[:3]],
                "topo": list(u.get("topo_classes") or ["core-infrastructure"])[:4],
                "tools": list(dict.fromkeys([*(u.get("mcp_tools") or []), *DEFAULT_TOOLS]))[:8],
                "tags": list(u.get("obo_concept_ids") or [])[:8],
                "pr": round(float(u.get("semantic_pagerank") or 0.0), 3),
                "auth": round(float(u.get("fusion_rank") or 0.0), 3),
                "avgAuth": round(float(u.get("fusion_rank") or 0.0) * 0.5, 3),
                "kgpu": 0,
                "hits": 0,
                "dirty": 0,
                "rank": round(float(u.get("fusion_rank") or 0.0) * 0.45, 3),
                "top": _deprioritize_legacy_top([], list(u.get("top_files") or [])),
            }
        )
        added_missing += 1

    merged_cards.sort(key=lambda c: (-float(c.get("rank") or 0.0), str(c.get("d") or "")))
    out_doc = {
        "v": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "count": len(merged_cards),
        "cards": merged_cards,
    }
    DIRS_JSON.write_text(json.dumps(out_doc, separators=(",", ":")), encoding="utf-8")

    remaining_unclass = sum(1 for c in merged_cards if "unclassified" in (c.get("topo") or []))
    print(
        json.dumps(
            {
                "previousCount": len(existing_cards),
                "mergedCount": len(merged_cards),
                "addedMissingDirectories": added_missing,
                "repairedUnclassifiedCards": repaired_unclassified,
                "remainingUnclassifiedCards": remaining_unclass,
                "outputPath": str(DIRS_JSON.relative_to(REPO_ROOT)).replace("\\", "/"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
