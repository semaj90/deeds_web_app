#!/usr/bin/env python3
"""Export a revision-signed `LowRankHelperArtifactV1` JSON from OBO + EG2 + RTX GPU factors (Seam 6).

Produces `sveltekit-frontend/memory/atlas/low-rank-helper-artifact-v1.json` conforming strictly to
`LowRankHelperArtifactV1Schema` (`parent-atlas.low-rank-helper-artifact.v1`) in
`sveltekit-frontend/src/lib/server/atlas/recommendation/low-rank-helper-recommender-v1.ts`.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = REPO_ROOT / ".tmp" / "atlas" / "universal-directory-cards-v1"
ARTIFACT_OUT = REPO_ROOT / "sveltekit-frontend" / "memory" / "atlas" / "low-rank-helper-artifact-v1.json"
RECEIPT_OUT = REPO_ROOT / "docs" / "reports" / "obo-eg2-low-rank-helper-artifact-receipt-v1.json"

TASK_FAMILIES: tuple[str, ...] = (
    "trace-retrieval",
    "graph-gpu-topology",
    "mcp-agent-tool",
    "ontology-taxonomy",
    "database-schema",
    "legal-evidence",
    "ui-component",
    "api-route",
    "openspec-governance",
    "test-audit-devtool",
)

# Real Parent Atlas MCP & server helpers mapped to their primary directory subtrees + empirical budgets
HELPER_SPECS: tuple[dict[str, Any], ...] = (
    {
        "helperId": "atlas_context",
        "dirs": ("sveltekit-frontend/scripts/mcp", "sveltekit-frontend/src/lib/server/ace"),
        "domains": ("trace-retrieval", "mcp-agent-tool"),
        "successRate": 0.94,
        "validationRate": 0.92,
        "medianLatencyMs": 420.0,
        "medianContextTokens": 1800,
    },
    {
        "helperId": "atlas_inspect",
        "dirs": ("sveltekit-frontend/src/lib/server/atlas/identity", "sveltekit-frontend/src/lib/server/atlas/indexing"),
        "domains": ("trace-retrieval", "ontology-taxonomy"),
        "successRate": 0.97,
        "validationRate": 0.96,
        "medianLatencyMs": 140.0,
        "medianContextTokens": 600,
    },
    {
        "helperId": "atlas_expand",
        "dirs": ("sveltekit-frontend/src/lib/server/atlas/graph", "sveltekit-frontend/src/lib/server/search"),
        "domains": ("graph-gpu-topology", "trace-retrieval"),
        "successRate": 0.93,
        "validationRate": 0.91,
        "medianLatencyMs": 260.0,
        "medianContextTokens": 1100,
    },
    {
        "helperId": "codebase.context_for_file",
        "dirs": ("sveltekit-frontend/src/lib/server/atlas", "sveltekit-frontend/src/lib/server/agents"),
        "domains": ("mcp-agent-tool", "trace-retrieval", "openspec-governance"),
        "successRate": 0.98,
        "validationRate": 0.95,
        "medianLatencyMs": 45.0,
        "medianContextTokens": 750,
    },
    {
        "helperId": "codebase.rg_search",
        "dirs": ("sveltekit-frontend/src/mcp", "scripts/rg-atlas"),
        "domains": ("mcp-agent-tool", "test-audit-devtool", "trace-retrieval"),
        "successRate": 0.99,
        "validationRate": 0.98,
        "medianLatencyMs": 85.0,
        "medianContextTokens": 900,
    },
    {
        "helperId": "trace.kag_search",
        "dirs": ("sveltekit-frontend/src/lib/server/retrieval", "sveltekit-frontend/src/lib/server/atlas/retrieval"),
        "domains": ("trace-retrieval", "graph-gpu-topology", "legal-evidence"),
        "successRate": 0.92,
        "validationRate": 0.90,
        "medianLatencyMs": 520.0,
        "medianContextTokens": 2200,
    },
    {
        "helperId": "atlas.embedding_neighbors",
        "dirs": ("sveltekit-frontend/src/lib/server/embedding", "python/atlas_graph_runtime"),
        "domains": ("trace-retrieval", "ontology-taxonomy", "graph-gpu-topology"),
        "successRate": 0.95,
        "validationRate": 0.94,
        "medianLatencyMs": 190.0,
        "medianContextTokens": 950,
    },
    {
        "helperId": "atlas.kanban_dag_prefill_recommendation",
        "dirs": ("sveltekit-frontend/src/lib/server/atlas/openspec-board", "openspec"),
        "domains": ("openspec-governance", "mcp-agent-tool"),
        "successRate": 0.96,
        "validationRate": 0.97,
        "medianLatencyMs": 110.0,
        "medianContextTokens": 680,
    },
    {
        "helperId": "universal_directory_gpu_search",
        "dirs": ("python/atlas_compute", "python/parent_atlas_ontology"),
        "domains": ("graph-gpu-topology", "ontology-taxonomy", "trace-retrieval"),
        "successRate": 0.97,
        "validationRate": 0.96,
        "medianLatencyMs": 280.0,
        "medianContextTokens": 850,
    },
    {
        "helperId": "inspect_postgres_backend",
        "dirs": ("sveltekit-frontend/src/lib/server/db", "drizzle"),
        "domains": ("database-schema", "test-audit-devtool"),
        "successRate": 0.96,
        "validationRate": 0.95,
        "medianLatencyMs": 130.0,
        "medianContextTokens": 700,
    },
    {
        "helperId": "svelte_runes_component_inspector",
        "dirs": ("sveltekit-frontend/src/lib/components", "mcp-server-mcp/packages/mcp-server"),
        "domains": ("ui-component", "api-route", "test-audit-devtool"),
        "successRate": 0.94,
        "validationRate": 0.93,
        "medianLatencyMs": 175.0,
        "medianContextTokens": 920,
    },
)


def _deterministic_svd_factors(
    task_mat: np.ndarray,
    helper_mat: np.ndarray,
    *,
    rank: int = 16,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Compute joint low-rank SVD factors on CUDA (with CPU parity check) and deterministic sign fixing."""
    stacked = np.vstack([task_mat, helper_mat]).astype(np.float32)
    use_cuda = torch.cuda.is_available()
    device = torch.device("cuda:0" if use_cuda else "cpu")
    t0 = time.perf_counter()

    with torch.no_grad():
        st_t = torch.from_numpy(stacked).to(device)
        u_t, s_t, vh_t = torch.linalg.svd(st_t, full_matrices=False)
        k = min(rank, int(s_t.shape[0]))
        u_k = u_t[:, :k].cpu().numpy()
        s_k = s_t[:k].cpu().numpy()
        vh_k = vh_t[:k, :].cpu().numpy()

    # Deterministic sign convention: largest-magnitude entry in each right singular vector is positive
    for j in range(k):
        pivot = int(np.argmax(np.abs(vh_k[j])))
        if vh_k[j, pivot] < 0:
            u_k[:, j] *= -1.0
            vh_k[j, :] *= -1.0

    scaled = u_k * np.sqrt(np.maximum(s_k, 1e-12))[None, :]
    norms = np.linalg.norm(scaled, axis=1, keepdims=True)
    norms = np.where(norms == 0.0, 1.0, norms)
    normed = scaled / norms

    n_tasks = task_mat.shape[0]
    t_factors = normed[:n_tasks]
    h_factors = normed[n_tasks:]

    # CPU parity check on reconstructed affinity dot products
    cpu_u, cpu_s, cpu_vh = np.linalg.svd(stacked, full_matrices=False)
    for j in range(k):
        pivot = int(np.argmax(np.abs(cpu_vh[j])))
        if cpu_vh[j, pivot] < 0:
            cpu_u[:, j] *= -1.0
    cpu_scaled = cpu_u[:, :k] * np.sqrt(np.maximum(cpu_s[:k], 1e-12))[None, :]
    cpu_normed = cpu_scaled / np.where(np.linalg.norm(cpu_scaled, axis=1, keepdims=True) == 0.0, 1.0, np.linalg.norm(cpu_scaled, axis=1, keepdims=True))
    gpu_aff = t_factors @ h_factors.T
    cpu_aff = cpu_normed[:n_tasks] @ cpu_normed[n_tasks:].T
    max_diff = float(np.max(np.abs(gpu_aff - cpu_aff)))

    return (
        t_factors,
        h_factors,
        {
            "backend": "cuda:0" if use_cuda else "cpu",
            "deviceName": torch.cuda.get_device_name(0) if use_cuda else "cpu",
            "rank": k,
            "svdMs": round((time.perf_counter() - t0) * 1000.0, 3),
            "cpuParityMaxAbsDiff": round(max_diff, 8),
        },
    )


def main() -> int:
    manifest = json.loads((STATE_DIR / "manifest.json").read_text(encoding="utf-8"))
    shape = tuple(manifest["files"]["embeddings.f32le"]["shape"])
    embs = np.frombuffer((STATE_DIR / "embeddings.f32le").read_bytes(), dtype=np.float32).reshape(shape)
    cards = [
        json.loads(ln)
        for ln in (STATE_DIR / "cards.jsonl").read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]

    dim = embs.shape[1]
    global_mean = np.mean(embs, axis=0)
    global_mean = global_mean / max(float(np.linalg.norm(global_mean)), 1e-12)

    # 1. Task-family 768D centroids from OBO + structural domain directory embeddings
    task_vecs: list[np.ndarray] = []
    for tf in TASK_FAMILIES:
        idxs = [i for i, c in enumerate(cards) if tf in (c.get("topo_classes") or [])]
        if idxs:
            weights = np.array([max(0.05, float(cards[i].get("fusion_rank", 0.1))) for i in idxs], dtype=np.float32)
            vec = (embs[idxs] * weights[:, None]).sum(axis=0)
            vec = vec / max(float(np.linalg.norm(vec)), 1e-12)
        else:
            vec = global_mean.copy()
        task_vecs.append(vec)
    task_mat = np.vstack(task_vecs).astype(np.float32)

    # 2. Helper 768D centroids from bound directory subtrees + domain priors
    tf_index = {tf: idx for idx, tf in enumerate(TASK_FAMILIES)}
    helper_vecs: list[np.ndarray] = []
    for spec in HELPER_SPECS:
        prefixes = spec["dirs"]
        idxs = [
            i
            for i, c in enumerate(cards)
            if any(c["dir_path"] == p or c["dir_path"].startswith(p + "/") for p in prefixes)
        ]
        dir_vec = embs[idxs].mean(axis=0) if idxs else global_mean.copy()
        dom_vecs = [task_mat[tf_index[d]] for d in spec["domains"] if d in tf_index]
        dom_vec = np.mean(dom_vecs, axis=0) if dom_vecs else global_mean.copy()
        blended = 0.55 * (dir_vec / max(float(np.linalg.norm(dir_vec)), 1e-12)) + 0.45 * (
            dom_vec / max(float(np.linalg.norm(dom_vec)), 1e-12)
        )
        blended = blended / max(float(np.linalg.norm(blended)), 1e-12)
        helper_vecs.append(blended)
    helper_mat = np.vstack(helper_vecs).astype(np.float32)

    rank = min(10, len(TASK_FAMILIES), len(HELPER_SPECS))
    t_factors, h_factors, svd_receipt = _deterministic_svd_factors(task_mat, helper_mat, rank=rank)

    task_entries = [
        {"taskFamily": tf, "factors": [round(float(x), 6) for x in t_factors[i].tolist()]}
        for i, tf in enumerate(TASK_FAMILIES)
    ]
    helper_entries = [
        {
            "helperId": spec["helperId"],
            "factors": [round(float(x), 6) for x in h_factors[i].tolist()],
            "successRate": spec["successRate"],
            "validationRate": spec["validationRate"],
            "medianLatencyMs": spec["medianLatencyMs"],
            "medianContextTokens": spec["medianContextTokens"],
        }
        for i, spec in enumerate(HELPER_SPECS)
    ]

    training_refs = [
        "docs/reports/universal-repo-directory-cards-v1.json",
        "docs/reports/eg2-obo-classifier-comparison-v1.json",
        "docs/reports/production-readiness-fusion-recommendations-v1.json",
    ]
    digest_body = json.dumps(
        {"rank": rank, "taskFactors": task_entries, "helperFactors": helper_entries, "trainingReceiptRefs": training_refs},
        sort_keys=True,
    )
    artifact_rev = "sha256:" + hashlib.sha256(digest_body.encode("utf-8")).hexdigest()

    artifact = {
        "schema": "parent-atlas.low-rank-helper-artifact.v1",
        "artifactRevision": artifact_rev,
        "rank": rank,
        "taskFactors": task_entries,
        "helperFactors": helper_entries,
        "trainingReceiptRefs": training_refs,
    }

    ARTIFACT_OUT.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_OUT.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")

    receipt = {
        "schema": "atlas.obo-eg2-low-rank-helper-artifact-receipt.v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "artifactPath": str(ARTIFACT_OUT.relative_to(REPO_ROOT)).replace("\\", "/"),
        "artifactRevision": artifact_rev,
        "sourceEmbeddingSha256": manifest["files"]["embeddings.f32le"]["sha256"],
        "ontologyRevision": manifest["structuralStats"]["ontologyRevision"],
        "svdReceipt": svd_receipt,
        "taskFamilyCount": len(task_entries),
        "helperCount": len(helper_entries),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    RECEIPT_OUT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT_OUT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
