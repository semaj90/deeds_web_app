"""Export ALL openspec/changes/*/tasks.md to NDJSON, build sparse CSR + 4D topology arrays,
and emit bounded RLM contextual-engineering prompt packets for agentic error fixing.

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
Does NOT allocate GPU VRAM or mutate Postgres/Qdrant/Graphify/tasks.md.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_graph_runtime.mcts_grpo_array_queue_v1 import build_feature_and_topology_arrays_v1
from atlas_graph_runtime.task_feature_gate_v1 import (
    build_idempotent_queue_proposals_v1,
    build_task_domain_csr_v1,
    build_task_keyword_csr_v1,
)

_TASK_RE = re.compile(r"^\s*-\s+\[([ xX])\]\s+(.+)$")
ALLOWED_DOMAINS = [
    "api", "auth", "cache", "compiler", "database", "devops", "error-handling",
    "frontend", "gpu", "graph", "machine-learning", "retrieval", "test",
    "database.postgresql", "devops.env-config", "devops.process-mgmt", "frontend.sveltekit",
]
_DOMAIN_HINTS = {
    "database.postgresql": ("postgres", "pgvector", "drizzle", "sql"),
    "frontend.sveltekit": ("svelte", "sveltekit", "vitest", "unocss"),
    "retrieval": ("retriev", "search", "qdrant", "hybrid", "rrf", "bm25"),
    "graph": ("graph", "networkx", "cugraph", "pagerank", "edge", "imports"),
    "gpu": ("gpu", "vram", "cuda", "cuvs", "cuml", "rapids", "tensor"),
    "cache": ("valkey", "redis", "bitfrost", "cache", "ttl"),
    "machine-learning": ("mlp", "xgboost", "grpo", "dspy", "gepa", "classifier"),
    "compiler": ("ast", "tree-sitter", "8095", "tsc", "svelte-check"),
    "api": ("mcp", "grpc", "endpoint", "route", "http"),
}


def _infer_proposed_domains(text: str) -> list[str]:
    lowered = text.lower()
    out = [dom for dom, keys in _DOMAIN_HINTS.items() if any(k in lowered for k in keys)]
    return out


def export_all_openspec_tasks_and_prompts_v1(
    changes_dir: Path,
    *,
    ndjson_path: Path,
    prompts_path: Path,
    receipt_path: Path,
    open_analysis_cap: int = 250,
) -> dict[str, Any]:
    all_rows: list[dict[str, Any]] = []
    open_tasks: list[dict[str, Any]] = []
    done_count = 0

    for tasks_md in sorted(changes_dir.glob("*/tasks.md")):
        raw_bytes = tasks_md.read_bytes()
        file_sha = f"sha256:{hashlib.sha256(raw_bytes).hexdigest()}"
        rel_path = tasks_md.relative_to(changes_dir.parent.parent).as_posix() if (changes_dir.parent.parent in tasks_md.parents) else tasks_md.name
        change_name = tasks_md.parent.name

        for line_no, line in enumerate(raw_bytes.decode("utf-8", errors="replace").splitlines(), start=1):
            m = _TASK_RE.match(line)
            if not m:
                continue
            is_done = m.group(1).lower() == "x"
            body = m.group(2).strip()
            task_id = f"{change_name}:L{line_no}"
            proposed = _infer_proposed_domains(body)
            row = {
                "taskId": task_id,
                "change": change_name,
                "line": line_no,
                "status": "DONE" if is_done else "OPEN",
                "taskRevision": f"line:{line_no}:{file_sha[:19]}",
                "scope": "repo:deeds",
                "sourceRef": rel_path,
                "sourceSha256": file_sha,
                "text": body[:320],
                "proposedDomains": proposed,
            }
            all_rows.append(row)
            if is_done:
                done_count += 1
            elif len(open_tasks) < open_analysis_cap:
                open_tasks.append(row)

    ndjson_path.parent.mkdir(parents=True, exist_ok=True)
    ndjson_path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in all_rows) + ("\n" if all_rows else ""),
        encoding="utf-8",
    )

    kw_csr = build_task_keyword_csr_v1(open_tasks) if open_tasks else None
    dom_csr = build_task_domain_csr_v1(open_tasks, allowed_domains=ALLOWED_DOMAINS) if open_tasks else None
    queue_proposals = build_idempotent_queue_proposals_v1(open_tasks) if open_tasks else []

    # Build dense [N, 5] task summary vectors -> 4D TopologyCoordinate4V1 (CPU SVD oracle; WSL2 cuML/cuVS ready)
    topo_summary = None
    if open_tasks:
        dense_rows = [
            [
                min(1.0, len(t["text"]) / 320.0),
                min(1.0, len(t["proposedDomains"]) / 4.0),
                1.0 if "gpu" in t["proposedDomains"] else 0.0,
                1.0 if "graph" in t["proposedDomains"] or "retrieval" in t["proposedDomains"] else 0.0,
                1.0 if "database.postgresql" in t["proposedDomains"] else 0.0,
            ]
            for t in open_tasks
        ]
        topo = build_feature_and_topology_arrays_v1(dense_rows, prefer_cuml_umap=False)
        topo_summary = {
            "featureShape": topo["featureShape"],
            "topologyShape": topo["topologyShape"],
            "featureChecksum": topo["featureChecksum"],
            "topologyChecksum": topo["topologyChecksum"],
            "topologyBackend": topo["topologyBackend"],
        }

    # Emit bounded RLM contextual-engineering prompt packets for agentic error fixing (PROPOSAL_ONLY)
    prompts: list[dict[str, Any]] = []
    for t, q in zip(open_tasks, queue_proposals):
        domains = t["proposedDomains"] or ["unresolved"]
        prompts.append({
            "schema": "atlas.rlm-context-prompt.v1",
            "idempotencyKey": q["idempotencyKey"],
            "taskId": t["taskId"],
            "sourceRef": t["sourceRef"],
            "sourceSha256": t["sourceSha256"],
            "proposedDomains": domains,
            "recommendedLane": "error-fixing-kanban" if "compiler" in domains or "frontend.sveltekit" in domains else "atlas-retrieval-fanout",
            "boundedContextPrompt": (
                f"TASK {t['taskId']} ({t['sourceRef']}@{t['sourceSha256'][:19]}): "
                f"Verify source span and dependencies for domains={','.join(domains)}; "
                f"Goal: {t['text'][:180]}. "
                f"Constraints: read-only until ContextManifest accepted; canonicalAuthority=false."
            ),
            "status": "PROPOSED",
            "canonicalAuthority": False,
        })

    prompts_path.write_text(
        "\n".join(json.dumps(p, ensure_ascii=False) for p in prompts) + ("\n" if prompts else ""),
        encoding="utf-8",
    )

    receipt = {
        "schema": "atlas.openspec-all-tasks-batch-receipt.v1",
        "totalTasksExported": len(all_rows),
        "doneTasks": done_count,
        "openTasks": len(all_rows) - done_count,
        "analyzedOpenSampleCount": len(open_tasks),
        "ndjsonPath": str(ndjson_path),
        "promptsPath": str(prompts_path),
        "promptPacketCount": len(prompts),
        "keywordCsr": {"shape": kw_csr["shape"], "nnz": kw_csr["nnz"], "csrChecksum": kw_csr["csrChecksum"]} if kw_csr else None,
        "domainCsr": {"shape": dom_csr["shape"], "nnz": dom_csr["nnz"], "csrChecksum": dom_csr["csrChecksum"]} if dom_csr else None,
        "topology": topo_summary,
        "wsl2RapidsReadyForGpuChallenger": True,
        "gpuVramAllocated": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def main() -> int:
    receipt = export_all_openspec_tasks_and_prompts_v1(
        REPO_ROOT / "openspec" / "changes",
        ndjson_path=REPO_ROOT / "docs" / "reports" / "openspec-all-tasks-export-v1.ndjson",
        prompts_path=REPO_ROOT / "docs" / "reports" / "openspec-rlm-context-prompts-v1.jsonl",
        receipt_path=REPO_ROOT / "docs" / "reports" / "openspec-all-tasks-batch-receipt-v1.json",
    )
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
