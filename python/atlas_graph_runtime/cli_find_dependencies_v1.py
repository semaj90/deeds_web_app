"""CLI & helper replacing Neo4j find_dependencies with Parent Atlas Typed Graph + NetworkX + optional PyTorch CUDA PageRank.

Reads/writes zero canonical stores (`canonicalAuthority=False`, `writesPerformed=False`).
Enforces the 1,536 MiB free-VRAM gate before running optional PyTorch CUDA PageRank parity.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from .dependency_lookup_v1 import resolve_dependencies_v1, resolve_dependents_v1

VRAM_GATE_MIB = 1536
_IMPORT_RE = re.compile(
    r"""(?:import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\s*\(\s*)['"]([^'"]+)['"]""",
    re.MULTILINE,
)


def _sha256_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _sha256_json(obj: Any) -> str:
    encoded = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _resolve_repo_file(repo_root: Path, target: str) -> tuple[str | None, Path | None]:
    cleaned = str(target or "").strip().replace("\\", "/").lstrip("./")
    if not cleaned:
        return None, None
    candidates = [cleaned]
    if not cleaned.startswith("sveltekit-frontend/"):
        candidates.append(f"sveltekit-frontend/{cleaned}")
    for rel in candidates:
        candidate = (repo_root / rel).resolve()
        try:
            candidate.relative_to(repo_root.resolve())
        except ValueError:
            continue
        if candidate.is_file():
            return rel, candidate
    return None, None


def _resolve_import_target(repo_root: Path, source_rel: str, specifier: str) -> tuple[str, str, str]:
    """Resolve an import only when exactly one workspace-local file matches.

    The third value is an observation status. External packages and unresolved or
    ambiguous local paths are deliberately not promoted to file dependency edges.
    """
    if specifier.startswith("$lib/"):
        sub = specifier[len("$lib/"):]
        base = repo_root / "sveltekit-frontend" / "src" / "lib" / sub
    elif specifier.startswith("."):
        base = (repo_root / source_rel).parent / specifier
    else:
        return specifier, "ExternalModule", "EXTERNAL_MODULE"

    candidates = [base]
    stem_str = str(base)
    if stem_str.endswith(".js"):
        candidates.append(Path(stem_str[:-3] + ".ts"))
        candidates.append(Path(stem_str[:-3] + ".mts"))
        candidates.append(Path(stem_str[:-3] + ".mjs"))
    else:
        for ext in (".ts", ".mts", ".js", ".mjs", ".svelte"):
            candidates.append(Path(stem_str + ext))
        candidates.append(base / "index.ts")
        candidates.append(base / "index.js")

    root = repo_root.resolve()
    resolved: dict[str, Path] = {}
    for cand in candidates:
        try:
            actual = cand.resolve(strict=True)
            actual.relative_to(root)
        except (OSError, ValueError):
            continue
        if actual.is_file():
            resolved[actual.as_posix().lower()] = actual
    if len(resolved) == 1:
        actual = next(iter(resolved.values()))
        return actual.relative_to(root).as_posix(), "CodebaseFile", "UNIQUE_REPO_TARGET"
    if len(resolved) > 1:
        return specifier, "UnresolvedImport", "AMBIGUOUS_REPO_TARGET"
    return specifier, "UnresolvedImport", "REPO_TARGET_NOT_FOUND"


def _maybe_torch_cuda_pagerank(
    node_ordinals: list[int],
    edges: list[tuple[int, int, float]],
    alpha: float = 0.85,
    max_iter: int = 100,
    tol: float = 1e-8,
) -> dict[str, Any]:
    """Run PyTorch CUDA PageRank only when CUDA is available and free VRAM >= 1,536 MiB."""
    try:
        import torch
    except Exception as exc:
        return {"executed": False, "reason": f"TORCH_UNAVAILABLE:{exc}", "freeVramMiB": None}

    if not torch.cuda.is_available():
        return {"executed": False, "reason": "CUDA_UNAVAILABLE", "freeVramMiB": 0}

    free_bytes, total_bytes = torch.cuda.mem_get_info()
    free_mib = int(free_bytes // (1024 * 1024))
    if free_mib < VRAM_GATE_MIB:
        return {
            "executed": False,
            "reason": "VRAM_BELOW_1536_MIB_GATE",
            "freeVramMiB": free_mib,
            "totalVramMiB": int(total_bytes // (1024 * 1024)),
        }

    n = len(node_ordinals)
    if n == 0:
        return {"executed": False, "reason": "EMPTY_GRAPH", "freeVramMiB": free_mib}

    idx_map = {ord_id: i for i, ord_id in enumerate(node_ordinals)}
    mat = torch.zeros((n, n), dtype=torch.float64, device="cuda")
    out_deg = [0.0] * n
    for src, dst, w in edges:
        out_deg[idx_map[src]] += w
    for src, dst, w in edges:
        s_i, d_i = idx_map[src], idx_map[dst]
        if out_deg[s_i] > 0:
            mat[d_i, s_i] += w / out_deg[s_i]

    dangling = torch.tensor([1.0 if d == 0 else 0.0 for d in out_deg], dtype=torch.float64, device="cuda")
    vec = torch.full((n,), 1.0 / n, dtype=torch.float64, device="cuda")
    for _ in range(max_iter):
        dangle_mass = alpha * torch.sum(vec * dangling) / n
        next_vec = alpha * (mat @ vec) + dangle_mass + (1.0 - alpha) / n
        if torch.sum(torch.abs(next_vec - vec)).item() < n * tol:
            vec = next_vec
            break
        vec = next_vec

    scores = {node_ordinals[i]: float(vec[i].item()) for i in range(n)}
    return {
        "executed": True,
        "backend": "torch_cuda",
        "freeVramMiB": free_mib,
        "scores": scores,
    }


_SKIP_DIRS = frozenset({"node_modules", ".svelte-kit", ".git", "dist", "build", "__pycache__", ".venv"})
_SOURCE_EXTS = frozenset({".ts", ".mts", ".js", ".mjs", ".svelte"})


def _iter_source_files(repo_root: Path):
    src_root = repo_root / "sveltekit-frontend" / "src"
    scan_root = src_root if src_root.is_dir() else repo_root
    for path in scan_root.rglob("*"):
        if any(part in _SKIP_DIRS for part in path.parts):
            continue
        if path.is_file() and path.suffix.lower() in _SOURCE_EXTS:
            yield path


def run_find_dependencies_cli(
    *,
    target: str,
    repo_root: Path,
    workspace_revision: str | None = None,
    prefer_cuda: bool = False,
    direction: str = "outgoing",
) -> dict[str, Any]:
    if direction not in ("outgoing", "incoming"):
        return {
            "target": str(target or ""),
            "direction": direction,
            "dependencies": [],
            "lookup": {
                "canonical": str(target or "").strip().replace("\\", "/").lower(),
                "phase": "ATLAS_GRAPH",
                "nodesMatched": [],
                "failure": "INVALID_DIRECTION",
                "truncated": False,
                "rowCap": 500,
            },
            "provenance": {
                "tool": "find_dependencies",
                "authority": "atlas_typed_graph_projection",
                "graphRevision": None,
                "evidenceRefs": [],
                "status": "UNRESOLVED",
                "subject": str(target or ""),
            },
            "canonicalAuthority": False,
            "writesPerformed": False,
            "importObservations": [],
        }

    rel_path, abs_path = _resolve_repo_file(repo_root, target)
    if rel_path is None or abs_path is None:
        return {
            "target": str(target or ""),
            "direction": direction,
            "dependencies": [],
            "lookup": {
                "canonical": str(target or "").strip().replace("\\", "/").lower(),
                "phase": "ATLAS_GRAPH",
                "nodesMatched": [],
                "failure": "SOURCE_NOT_INDEXED" if ("/" in str(target) or "." in str(target)) else "TARGET_NOT_A_PATH",
                "truncated": False,
                "rowCap": 500,
            },
            "provenance": {
                "tool": "find_dependencies",
                "authority": "atlas_typed_graph_projection",
                "graphRevision": None,
                "evidenceRefs": [],
                "status": "UNRESOLVED",
                "subject": str(target or ""),
            },
            "canonicalAuthority": False,
            "writesPerformed": False,
            "importObservations": [],
        }

    source_bytes = abs_path.read_bytes()
    source_text = source_bytes.decode("utf-8", errors="replace")
    source_revision = _sha256_bytes(source_bytes)
    # A hash of the root path is not a workspace revision. Without the
    # canonical caller-supplied revision, keep import observations lexical-only.
    ws_rev = workspace_revision if isinstance(workspace_revision, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", workspace_revision) else None

    # Parse real static imports with exact line numbers
    nodes: list[dict[str, Any]] = [
        {
            "gpu_node_id": 0,
            "source_ref": rel_path,
            "source_revision": source_revision,
            "workspace_revision": ws_rev,
            "node_kind": "CodebaseFile",
            "qualified_name": rel_path,
        }
    ]
    edges: list[dict[str, Any]] = []
    seen_targets: dict[str, int] = {}
    import_observations: list[dict[str, Any]] = []
    revision_blocked = False

    if direction == "incoming":
        target_canonical = rel_path.lower()
        for cand_abs in _iter_source_files(repo_root):
            cand_rel = cand_abs.relative_to(repo_root).as_posix()
            if cand_rel.lower() == target_canonical:
                continue
            cand_bytes = cand_abs.read_bytes()
            cand_text = cand_bytes.decode("utf-8", errors="replace")
            cand_rev = _sha256_bytes(cand_bytes)
            for match in _IMPORT_RE.finditer(cand_text):
                specifier = match.group(1)
                dep_ref, dep_kind, resolution = _resolve_import_target(repo_root, cand_rel, specifier)
                line_no = cand_text[: match.start()].count("\n") + 1
                if dep_kind != "CodebaseFile" or dep_ref.lower() != target_canonical:
                    continue
                import_observations.append({"sourceRef": cand_rel, "line": line_no, "specifier": specifier,
                                            "targetRef": dep_ref,
                                            "resolution": resolution if ws_rev else "WORKSPACE_REVISION_REQUIRED"})
                if ws_rev is None:
                    revision_blocked = True
                    continue
                if cand_rel not in seen_targets:
                    node_id = len(nodes)
                    seen_targets[cand_rel] = node_id
                    nodes.append(
                        {
                            "gpu_node_id": node_id,
                            "source_ref": cand_rel,
                            "source_revision": cand_rev,
                            "workspace_revision": ws_rev,
                            "node_kind": "CodebaseFile",
                            "qualified_name": cand_rel,
                        }
                    )
                src_id = seen_targets[cand_rel]
                edges.append(
                    {
                        "edgeId": f"imp:{cand_rel}#L{line_no}->{rel_path}",
                        "src_gpu_node_id": src_id,
                        "dst_gpu_node_id": 0,
                        "edge_type": "IMPORTS",
                        "weight": 1.0,
                        "sourceRef": cand_rel,
                        "sourceRevision": cand_rev,
                        "workspaceRevision": ws_rev,
                        "evidenceRefs": [f"{cand_rel}#L{line_no}"],
                    }
                )
    else:
        for match in _IMPORT_RE.finditer(source_text):
            specifier = match.group(1)
            line_no = source_text[: match.start()].count("\n") + 1
            dep_ref, dep_kind, resolution = _resolve_import_target(repo_root, rel_path, specifier)
            observation = {"sourceRef": rel_path, "line": line_no, "specifier": specifier,
                           "resolution": resolution}
            if dep_kind == "CodebaseFile":
                observation["targetRef"] = dep_ref
            if ws_rev is None and dep_kind == "CodebaseFile":
                observation["resolution"] = "WORKSPACE_REVISION_REQUIRED"
                revision_blocked = True
            import_observations.append(observation)
            if dep_kind != "CodebaseFile" or ws_rev is None:
                continue
            if dep_ref not in seen_targets:
                node_id = len(nodes)
                seen_targets[dep_ref] = node_id
                dep_rev = source_revision
                if dep_kind == "CodebaseFile":
                    dep_file = repo_root / dep_ref
                    if dep_file.is_file():
                        dep_rev = _sha256_bytes(dep_file.read_bytes())
                nodes.append(
                    {
                        "gpu_node_id": node_id,
                        "source_ref": dep_ref,
                        "source_revision": dep_rev,
                        "workspace_revision": ws_rev,
                        "node_kind": dep_kind,
                        "qualified_name": dep_ref,
                    }
                )
            dst_id = seen_targets[dep_ref]
            edges.append(
                {
                    "edgeId": f"imp:{rel_path}#L{line_no}->{dep_ref}",
                    "src_gpu_node_id": 0,
                    "dst_gpu_node_id": dst_id,
                    "edge_type": "IMPORTS",
                    "weight": 1.0,
                    "sourceRef": rel_path,
                    "sourceRevision": source_revision,
                    "workspaceRevision": ws_rev,
                    "evidenceRefs": [f"{rel_path}#L{line_no}"],
                }
            )

    graph_revision = _sha256_json({"nodes": nodes, "edges": edges}) if ws_rev else None

    if not edges:
        return {
            "target": rel_path,
            "direction": direction,
            "dependencies": [],
            "lookup": {
                "canonical": rel_path.lower(),
                "phase": "ATLAS_GRAPH",
                "nodesMatched": [{"family": "source_ref", "key": rel_path, "flagged": False}],
                "failure": ("WORKSPACE_REVISION_REQUIRED" if revision_blocked else
                            ("NO_INCOMING_EDGES" if direction == "incoming" else "NO_OUTGOING_EDGES")),
                "truncated": False,
                "rowCap": 500,
            },
            "provenance": {
                "tool": "find_dependencies",
                "authority": "atlas_typed_graph_projection",
                "graphRevision": graph_revision,
                "sourceRevision": source_revision,
                "evidenceRefs": [rel_path],
                "status": "IDENTITY_BOUND_REVISION_QUALIFIED" if ws_rev else "UNRESOLVED",
                "subject": rel_path,
            },
            "canonicalAuthority": False,
            "writesPerformed": False,
            "importObservations": import_observations,
        }

    resolver = resolve_dependents_v1 if direction == "incoming" else resolve_dependencies_v1
    resolved = resolver(
        target=rel_path,
        source_identity={
            "sourceRef": rel_path,
            "sourceRevision": source_revision,
            "workspaceRevision": ws_rev,
        },
        graph_revision=graph_revision,
        workspace_revision=ws_rev,
        nodes=nodes,
        edges=edges,
    )

    cuda_parity = None
    if prefer_cuda:
        cuda_parity = _maybe_torch_cuda_pagerank(
            [n["gpu_node_id"] for n in nodes],
            [(e["src_gpu_node_id"], e["dst_gpu_node_id"], float(e["weight"])) for e in edges],
        )

    return {
        "target": resolved.get("target", rel_path),
        "direction": direction,
        "dependencies": resolved.get("dependencies", []),
        "lookup": {
            "canonical": rel_path.lower(),
            "phase": "ATLAS_GRAPH",
            "nodesMatched": [{"family": "source_ref", "key": rel_path, "flagged": False}],
            "failure": resolved.get("failure"),
            "truncated": resolved.get("truncated", False),
            "rowCap": resolved.get("rowCap", 500),
        },
        "pageRank": {
            **(resolved.get("pageRank") or {"backend": "networkx"}),
            "cudaChallenger": cuda_parity,
        },
        "provenance": {
            "tool": "find_dependencies",
            "authority": "atlas_typed_graph_projection",
            "graphRevision": graph_revision,
            "sourceRevision": source_revision,
            "workspaceRevision": ws_rev,
            "evidenceRefs": resolved.get("evidenceRefs", [rel_path]),
            "status": "IDENTITY_BOUND_REVISION_QUALIFIED" if not resolved.get("failure") else "UNRESOLVED",
            "subject": rel_path,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
        "importObservations": import_observations,
    }


def main() -> int:
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    target = str(payload.get("target") or "")
    repo_root = Path(payload.get("repoRoot") or Path(__file__).resolve().parents[2])
    prefer_cuda = bool(payload.get("preferCuda", False))
    workspace_revision = payload.get("workspaceRevision")
    direction = str(payload.get("direction") or "outgoing")
    result = run_find_dependencies_cli(
        target=target,
        repo_root=repo_root,
        workspace_revision=workspace_revision,
        prefer_cuda=prefer_cuda,
        direction=direction,
    )
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
