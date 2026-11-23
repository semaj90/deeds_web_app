#!/usr/bin/env python3
"""
Concurrent OpenSpec task-domain candidates + RTX PyTorch KMeans/KNN/PageRank + .okf retrieval experiment (v2)

Unifies:
1. UTF-8/BOM-aware ingestion of local `openspec/changes/*/{proposal.md,tasks.md}` preserving display locators and headings.
2. Hierarchical keyword-rule domain candidates (line + heading + change name + proposal text); these are not OAKLib labels or reviewed taxonomy assignments.
3. Read-only indexing of tracked/local `.okf` Firecrawl documentation (`docs/.okf/pinned/admission-envelopes-v1.json`,
   `docs/.okf/**/chunks.jsonl`, `docs/.okf/dev/raw/**/*.json`).
4. Optional PyTorch CUDA KMeans (`k=8`) + cosine similarity over 512-wide token-hash features; this is not EmbeddingGemma or semantic_768.
5. Keyword-rule domain-candidate graph -> PyTorch CUDA (`torch_cuda`) & NetworkX PageRank (`typed_graph_runtime.py`)
   + `stable_topk` (`topk_paginator.py`) + `AsyncDagWorker` tournament (`rlm_dspy_tournament_dag_v1.py`).

Invariants:
- Read-only (`canonicalAuthority: false`, `writesPerformed: false`).
- Never auto-promotes task checkboxes (`CREATED != WIRED != PROVEN != DONE`).
"""

from __future__ import annotations

import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.request

os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPUTE_DEVICE = "cpu"
sys.path.insert(0, str(REPO_ROOT / "python"))

from atlas_compute.concept_tile_residency_v1 import (  # noqa: E402
    TileState,
    descriptor_key,
    transition as transition_tile_state,
)
from atlas_compute.cutile_kv_block_swap import (  # noqa: E402
    KvFsmContext,
    KvSwapState,
    step_kv_swap_fsm,
)
from atlas_compute.lexical_ast_cst_ml_langgraph_bridge_v1 import (  # noqa: E402
    run_lexical_ast_cst_langgraph_helper_v1,
)
from atlas_compute.low_rank import compare_low_rank_recommendations  # noqa: E402
from atlas_compute.rlm_dspy_tournament_dag_v1 import (  # noqa: E402
    TournamentCandidatePromptV1,
    TournamentProposalOutputV1,
    run_prefill_error_fix_tournament_v1,
)
from atlas_compute.topk_paginator import stable_topk  # noqa: E402
from atlas_compute.typed_graph_runtime import run_pagerank  # noqa: E402
from atlas_graph_runtime.contracts import TypedGraphEdge  # noqa: E402

VALKEY_CENTROID_TTL_SECONDS = 604800  # 7 days (7 * 24 * 3600)

OPENSPEC_DIR = REPO_ROOT / "openspec" / "changes"
OKF_DIR = REPO_ROOT / "docs" / ".okf"
OUT_JSON = REPO_ROOT / "docs" / "reports" / "openspec-domain-candidate-ranking-experiment-v2.json"

EXT_RE = re.compile(
    r"\b[a-zA-Z0-9_./-]+\.(ts|mts|svelte|py|proto|sql|cu|cpp|rs|go|yaml|yml|okf|json|mjs)\b"
)
TASK_LINE_RE = re.compile(r"^\s*-\s*\[([ xX~])\]\s*(.+)$")
HEADING_RE = re.compile(r"^\s*#{1,4}\s+(.+)$")
TOKEN_RE = re.compile(r"[a-z0-9_]{3,24}")

DOMAIN_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("candidate:domain.scene_3d", ("three", "scene", "mesh", "prefab", "bvh", "splat", "camera", "goap", "webgl", "glb", "avatar", "character", "spatial", "polygon", "contour")),
    ("candidate:domain.gpu_cuda_tensor", ("cuda", "gpu", "tensor", "libtorch", "trt", "cuvs", "cutile", "gemm", "vram", "avx2", "simd", "cagra", "rapids", "triton", "fp16", "int4", "quant")),
    ("candidate:domain.retrieval_graphrag", ("qdrant", "pgvector", "pagerank", "knn", "rrf", "topk", "graphrag", "neo4j", "networkx", "fts", "bm25", "rerank", "hybrid", "search", "retriev", "embed", "768")),
    ("candidate:domain.nlp_okf_docs", ("8095", "spacy", "langextract", "firecrawl", "okf", "oaklib", "treesitter", "tree-sitter", "ast-grep", "ontology", "concept", "taxonomy", "doc", "crawl")),
    ("candidate:domain.kanban_a2a_mcp", ("kanban", "a2a", "acp", "mcp", "dspy", "rlm", "gepa", "workboard", "tournament", "subprompt", "agent", "prefill", "dag", "fsm")),
    ("candidate:domain.persistence_pg18", ("postgres", "drizzle", "seaweed", "valkey", "redis", "migration", "sql", "table", "schema", "column", "index", "store", "db", "database")),
    ("candidate:domain.frontend_svelte5_ui", ("svelte", "rune", "dialog", "modal", "canvas", "component", "route", "ui", "ux", "page", "button", "css", "unocss", "bits-ui", "view")),
    ("candidate:domain.evidence_media_video", ("evidence", "video", "audio", "image", "upload", "exhibit", "transcript", "whisper", "frame", "clock", "timeline", "case", "caption")),
    ("candidate:domain.codeintel_ast_routing", ("codeintel", "ast", "symbol", "router", "viterbi", "hmm", "lut", "classifier", "directory", "compile", "helper", "file", "chunk")),
    ("candidate:domain.runtime_cache_residency", ("cache", "residency", "bitfrost", "lease", "memory", "buffer", "stream", "pool", "queue", "worker", "async", "batch", "packet", "tile")),
    ("candidate:domain.security_auth_governance", ("auth", "token", "guard", "permission", "policy", "admission", "lineage", "revision", "checksum", "sha256", "seal", "authority", "gate")),
    ("candidate:domain.testing_verification_gan", ("test", "spec", "vitest", "playwright", "pytest", "audit", "verify", "proof", "prove", "receipt", "check", "benchmark", "parity", "fix", "error")),
]


def decode_utf8_normalized(raw: bytes) -> tuple[str, str]:
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace"), "utf-16-bom"
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig", errors="replace"), "utf-8-sig"
    if b"\x00" in raw[:200]:
        return raw.decode("utf-16-le", errors="replace"), "utf-16-heuristic"
    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace"), "latin-1-fallback"


def classify_domain_candidate(task_text: str, heading_text: str, change_name: str, proposal_text: str) -> dict:
    """Return a keyword-rule candidate with provenance; never mint an ontology label."""
    for scope_text in (
        f"{task_text} {change_name}",
        f"{task_text} {heading_text} {change_name}",
        f"{task_text} {heading_text} {change_name} {proposal_text[:600]}",
    ):
        lower = scope_text.lower()
        best_domain = ""
        best_hits = 0
        for domain_id, keywords in DOMAIN_RULES:
            hits = sum(1 for kw in keywords if kw in lower)
            if hits > best_hits:
                best_hits = hits
                best_domain = domain_id
        if best_hits > 0:
            return {
                "domainId": best_domain,
                "status": "UNREVIEWED_CANDIDATE",
                "method": "TASK_TEXT_KEYWORD_RULE",
                "matchedKeywordCount": best_hits,
            }
    return {
        "domainId": None,
        "status": "UNCLASSIFIED_REVIEW_REQUIRED",
        "method": "NO_KEYWORD_MATCH",
        "matchedKeywordCount": 0,
    }


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def load_task_identity_join(join_path: Path, manifest_path: Path, snapshot_path: Path) -> tuple[dict, dict]:
    """Load exact workboard task identities and fail closed on stale join inputs."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8-sig"))
    if manifest.get("schema") != "atlas.openspec.task-inventory-workboard-join-manifest.v1":
        raise ValueError("task identity join manifest schema is not recognized")
    if snapshot.get("schema") != "atlas.openspec.workboard-task-snapshot.v1":
        raise ValueError("workboard task snapshot schema is not recognized")
    if manifest.get("inputs", {}).get("snapshotSha256") != sha256_file(snapshot_path):
        raise ValueError("workboard snapshot hash differs from the join manifest")
    if manifest.get("output", {}).get("sha256") != sha256_file(join_path):
        raise ValueError("task identity join hash differs from the join manifest")

    snapshot_hashes = {
        str(source).replace("\\", "/"): revision
        for source, revision in (snapshot.get("sourceFileHashes") or {}).items()
    }
    snapshot_tasks: dict[tuple[str, int], list[dict]] = {}
    for task in snapshot.get("tasks", []):
        source = str(task.get("source") or "").replace("\\", "/")
        line = task.get("line")
        if source and isinstance(line, int) and not isinstance(line, bool):
            snapshot_tasks.setdefault((source, line), []).append(task)

    identities: dict[tuple[str, int], dict] = {}
    source_revisions: dict[str, str] = {}
    with join_path.open("r", encoding="utf-8-sig", errors="strict") as stream:
        for line_no, raw in enumerate(stream, 1):
            if not raw.strip():
                continue
            row = json.loads(raw)
            if row.get("joinStatus") != "MATCHED_EXACT_SOURCE_REVISION":
                continue
            source = str(row.get("source") or "").replace("\\", "/")
            line = row.get("line")
            if not source or not isinstance(line, int) or isinstance(line, bool):
                raise ValueError(f"invalid source locator in join row {line_no}")
            source_revision = row.get("sourceFileRevision")
            task_key = row.get("logicalTaskKey") or row.get("stableKey")
            if not source_revision or not task_key or not row.get("taskRevision"):
                raise ValueError(f"identity/revision missing from exact join row {line_no}")
            if snapshot_hashes.get(source) != source_revision:
                raise ValueError(f"join row source revision is not in the supplied workboard snapshot: {source}")
            candidates = snapshot_tasks.get((source, line), [])
            if len(candidates) != 1:
                raise ValueError(f"workboard snapshot locator is missing or ambiguous: {source}#L{line}")
            task = candidates[0]
            task_identity = task.get("taskIdentity") or {}
            if (
                task.get("taskKey") != row.get("workboardTaskKey")
                or task.get("stableKey") != row.get("stableKey")
                or task.get("logicalTaskKey") != row.get("logicalTaskKey")
                or task_identity.get("taskRevision") != row.get("taskRevision")
                or task_identity.get("basis") != row.get("identityBasis")
            ):
                raise ValueError(f"join identity does not match supplied workboard snapshot: {source}#L{line}")
            source_revisions[source] = source_revision
            location = (source, line)
            if location in identities:
                raise ValueError(f"duplicate exact task identity at {source}#L{line}")
            identities[location] = row

    for source, expected_revision in source_revisions.items():
        source_path = REPO_ROOT / Path(source)
        if not source_path.is_file() or sha256_file(source_path) != expected_revision:
            raise ValueError(f"STALE_TASK_SOURCE_REVISION: {source}")
    if len(identities) != manifest.get("joinStatusCounts", {}).get("MATCHED_EXACT_SOURCE_REVISION"):
        raise ValueError("exact join row count differs from the join manifest")
    return identities, {
        "manifestPath": str(manifest_path),
        "snapshotPath": str(snapshot_path),
        "snapshotSha256": manifest["inputs"]["snapshotSha256"],
        "joinSha256": manifest["output"]["sha256"],
        "exactRows": len(identities),
        "logicalTaskKeys": sum(1 for row in identities.values() if row.get("logicalTaskKey")),
        "migrationStableKeys": sum(1 for row in identities.values() if not row.get("logicalTaskKey")),
    }


def parse_change_dir(change_dir: Path, task_identities: dict[tuple[str, int], dict]) -> dict:
    change_name = change_dir.name
    proposal_path = change_dir / "proposal.md"
    tasks_path = change_dir / "tasks.md"

    encodings: dict[str, str] = {}
    proposal_text = ""
    if proposal_path.is_file():
        proposal_text, enc = decode_utf8_normalized(proposal_path.read_bytes())
        encodings["proposal.md"] = enc

    tasks: list[dict] = []
    ext_counts: dict[str, int] = {}
    domain_counts: dict[str, int] = {}
    counts = {"done": 0, "partial": 0, "open": 0}
    current_heading = ""

    if tasks_path.is_file():
        task_bytes = tasks_path.read_bytes()
        task_file_revision = "sha256:" + hashlib.sha256(task_bytes).hexdigest()
        tasks_text, enc = decode_utf8_normalized(task_bytes)
        encodings["tasks.md"] = enc
        for line_no, line in enumerate(tasks_text.splitlines(), start=1):
            hm = HEADING_RE.match(line)
            if hm:
                current_heading = hm.group(1).strip()
                continue
            m = TASK_LINE_RE.match(line)
            if not m:
                continue
            mark, body = m.group(1), m.group(2).strip()
            if mark in ("x", "X"):
                counts["done"] += 1
                continue
            state = "PARTIAL" if mark == "~" else "OPEN"
            if state == "PARTIAL":
                counts["partial"] += 1
            else:
                counts["open"] += 1

            exts = sorted(set(EXT_RE.findall(body)))
            for ext in exts:
                ext_counts[ext] = ext_counts.get(ext, 0) + 1

            source_ref = f"openspec/changes/{change_name}/tasks.md"
            identity = task_identities.get((source_ref, line_no))
            if identity is None or identity.get("sourceFileRevision") != task_file_revision:
                raise ValueError(f"TASK_IDENTITY_JOIN_MISSING_OR_STALE: {source_ref}#L{line_no}")
            task_identity_key = identity.get("logicalTaskKey") or identity["stableKey"]
            bare_id = identity.get("taskCode") or task_identity_key
            domain_candidate = classify_domain_candidate(body, current_heading, change_name, proposal_text)
            domain_id = domain_candidate["domainId"]
            domain_count_key = domain_id or domain_candidate["status"]
            domain_counts[domain_count_key] = domain_counts.get(domain_count_key, 0) + 1

            score = 70.0 + (15.0 if state == "PARTIAL" else 0.0) + min(12.0, len(exts) * 4.0)
            if "crime-scene-reconstruction" in change_name:
                score += 10.0

            tasks.append({
                "taskIdentityKey": task_identity_key,
                "taskIdentityBasis": identity.get("identityBasis"),
                "taskRevision": identity.get("taskRevision"),
                "sourceFileRevision": task_file_revision,
                "workboardTaskKey": identity.get("workboardTaskKey"),
                "logicalTaskKey": identity.get("logicalTaskKey"),
                "stableKey": identity.get("stableKey"),
                "declaredTaskCode": identity.get("taskCode"),
                "sourceRef": f"{source_ref}#L{line_no}",
                "change": change_name,
                "taskId": bare_id,
                "line": line_no,
                "heading": current_heading[:120],
                "state": state,
                "domainId": domain_id,
                "domainLabelStatus": domain_candidate["status"],
                "domainLabelMethod": domain_candidate["method"],
                "domainMatchedKeywordCount": domain_candidate["matchedKeywordCount"],
                "extensions": exts,
                "baseScore": round(min(99.0, score), 2),
                "locator": f"openspec/changes/{change_name}/tasks.md#L{line_no}",
                "summary": body[:240],
            })

    return {
        "change": change_name,
        "encodings": encodings,
        "counts": counts,
        "extCounts": ext_counts,
        "domainCounts": domain_counts,
        "tasks": tasks,
    }


def load_okf_doc_corpus() -> tuple[list[dict], dict]:
    """Load Firecrawled .okf API documentation chunks from docs/.okf (including gitignored files)."""
    chunks: list[dict] = []
    sources_seen: set[str] = set()
    envelopes_path = OKF_DIR / "pinned" / "admission-envelopes-v1.json"
    if envelopes_path.is_file():
        envelopes = json.loads(envelopes_path.read_text(encoding="utf-8"))
        for env in envelopes:
            page = env.get("page", {})
            url = page.get("url", "")
            provider = page.get("provider", "unknown")
            product = page.get("product", "unknown")
            sources_seen.add(f"{provider}:{product}")
            for c in env.get("chunks", []):
                chunks.append({
                    "chunkId": c.get("chunkId"),
                    "provider": provider,
                    "product": product,
                    "url": url,
                    "domainClass": c.get("domainClass", ""),
                    "text": c.get("text", "")[:600],
                    "sourceFile": "docs/.okf/pinned/admission-envelopes-v1.json",
                })

    raw_dev_dir = OKF_DIR / "dev" / "raw"
    raw_files_count = 0
    if raw_dev_dir.is_dir():
        for raw_json in sorted(raw_dev_dir.rglob("*.json")):
            raw_files_count += 1
            try:
                data = json.loads(raw_json.read_text(encoding="utf-8", errors="replace"))
            except Exception:
                continue
            product = raw_json.parent.name
            url = data.get("url") or data.get("source_url") or raw_json.stem
            md = data.get("markdown") or data.get("text") or data.get("content") or ""
            if isinstance(md, str) and len(md) > 40:
                sources_seen.add(f"dev:{product}")
                chunks.append({
                    "chunkId": f"okf-dev:{product}:{raw_json.stem[:40]}",
                    "provider": "okf-dev-raw",
                    "product": product,
                    "url": str(url),
                    "domainClass": product,
                    "text": md[:600],
                    "sourceFile": str(raw_json.relative_to(REPO_ROOT)).replace("\\", "/"),
                })

    return chunks, {
        "totalChunksIndexed": len(chunks),
        "uniqueSources": len(sources_seen),
        "rawDevJsonFiles": raw_files_count,
        "pinnedEnvelopesLoaded": envelopes_path.is_file(),
    }


def rtx_kmeans_and_knn_okf_docs(
    tasks: list[dict],
    okf_chunks: list[dict],
    num_clusters: int = 8,
    top_k_docs: int = 3,
    vocab_dim: int = 512,
) -> dict:
    """
    RTX 3060 Ti PyTorch CUDA KMeans clustering (k=8) over candidate tasks +
    Cosine KNN (top_k=3) matching each task to crawled .okf Firecrawl API documentation chunks.
    """
    device = torch.device(COMPUTE_DEVICE)

    def vectorize_texts(texts: list[str]) -> torch.Tensor:
        mat = torch.zeros((len(texts), vocab_dim), dtype=torch.float32, device=device)
        for row_idx, txt in enumerate(texts):
            for tok in TOKEN_RE.findall(txt.lower()):
                col = int(hashlib.md5(tok.encode("utf-8")).hexdigest()[:8], 16) % vocab_dim
                mat[row_idx, col] += 1.0
        norms = torch.norm(mat, p=2, dim=1, keepdim=True).clamp(min=1e-6)
        return mat / norms

    task_texts = [
        f"{t['taskId']} {t['domainId']} {' '.join(t['extensions'])} {t['summary']} {' '.join(t.get('nlp8095', {}).get('concepts', []))}"
        for t in tasks
    ]
    doc_texts = [f"{c['provider']} {c['product']} {c['domainClass']} {c['text']}" for c in okf_chunks]

    task_vecs = vectorize_texts(task_texts)
    doc_vecs = vectorize_texts(doc_texts)

    # 1. PyTorch CUDA KMeans (k=8, 12 iterations, deterministic initialization)
    k = min(num_clusters, len(tasks))
    stride = max(1, len(tasks) // k)
    centroids = task_vecs[[i * stride for i in range(k)]].clone()
    assignments = torch.zeros(len(tasks), dtype=torch.long, device=device)

    for _ in range(12):
        # Cosine similarity to centroids -> [N, K]
        sim = torch.mm(task_vecs, centroids.t())
        assignments = torch.argmax(sim, dim=1)
        for cluster_id in range(k):
            mask = assignments == cluster_id
            if torch.any(mask):
                c_mean = task_vecs[mask].mean(dim=0, keepdim=True)
                centroids[cluster_id] = c_mean / torch.norm(c_mean, p=2).clamp(min=1e-6)

    centroid_sims = torch.mm(task_vecs, centroids.t())
    assigned_scores = centroid_sims[torch.arange(len(tasks), device=device), assignments]

    # 2. PyTorch CUDA Cosine KNN: Tasks [N, D] x Docs^T [D, M] -> [N, M]
    knn_sim = torch.mm(task_vecs, doc_vecs.t())
    topk_vals, topk_idxs = torch.topk(knn_sim, k=min(top_k_docs, len(okf_chunks)), dim=1)

    # 3. Ewin Tang-inspired length-square sampling + torch.svd_lowrank vs full SVD on [N, M]
    knn_sim_np = knn_sim.detach().cpu().numpy()
    tang_lowrank_receipt = compare_low_rank_recommendations(
        knn_sim_np,
        query_row=0,
        target_rank=min(8, min(knn_sim_np.shape)),
        oversampling=4,
        power_iterations=2,
        top_k=min(10, knn_sim_np.shape[1]),
        sample_count=32,
        device=str(device),
    )

    # 3b. PyTorch CUDA Z-score + L2 Normalization & CUDA PCA (torch.pca_lowrank, q=8)
    # Center features (Z-score across dimension 0) before low-rank PCA projection
    feat_mean = task_vecs.mean(dim=0, keepdim=True)
    feat_std = task_vecs.std(dim=0, keepdim=True).clamp(min=1e-6)
    task_vecs_zscore = (task_vecs - feat_mean) / feat_std
    pca_q = min(8, min(task_vecs_zscore.shape))
    u_pca, s_pca, v_pca = torch.pca_lowrank(task_vecs_zscore, q=pca_q, center=False, niter=2)
    task_pca_coords = torch.mm(task_vecs_zscore, v_pca[:, :pca_q])  # [N, pca_q]
    total_var = float((task_vecs_zscore ** 2).sum().item())
    pca_var_explained = float((s_pca ** 2).sum().item()) / max(1e-6, total_var)

    # Compute per-task Ewin Tang low-rank reconstructed top-1 recommendation score via rank-q SVD of knn_sim
    u_knn, s_knn, v_knn = torch.svd_lowrank(knn_sim, q=min(8, min(knn_sim.shape)), niter=2)
    knn_lowrank_recon = (u_knn * s_knn.unsqueeze(0)) @ v_knn.t()
    tang_task_target_scores = knn_lowrank_recon.max(dim=1).values  # [N] continuous target score per task

    # 4. Load AST-grep / ts-morph symbol index from docs/.okf/dev/symbol-index.jsonl
    symbol_index_path = OKF_DIR / "dev" / "symbol-index.jsonl"
    okf_symbols: list[dict] = []
    if symbol_index_path.is_file():
        for line in symbol_index_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.strip():
                try:
                    okf_symbols.append(json.loads(line))
                except Exception:
                    pass

    assignments_cpu = assignments.detach().cpu().tolist()
    assigned_scores_cpu = assigned_scores.detach().cpu().tolist()
    topk_vals_cpu = topk_vals.detach().cpu().tolist()
    topk_idxs_cpu = topk_idxs.detach().cpu().tolist()
    pca_coords_cpu = task_pca_coords.detach().cpu().tolist()
    tang_targets_cpu = tang_task_target_scores.detach().cpu().tolist()

    # Build proposed centroid descriptors only; no Valkey client or cache write occurs here.
    centroid_descriptors: list[dict] = []
    for cid_idx in range(k):
        c_bytes = centroids[cid_idx].detach().cpu().numpy().tobytes()
        c_sha = hashlib.sha256(c_bytes).hexdigest()[:16]
        centroid_descriptors.append({
            "clusterId": cid_idx,
            "centroidChecksum": f"sha256:{c_sha}",
            "proposedCacheKey": f"centroid:v1:kmeans_cluster_{cid_idx}:{c_sha}",
            "proposedTtlSeconds": VALKEY_CENTROID_TTL_SECONDS,
            "proposedEvictionPolicy": "allkeys-lru",
            "featureContract": "atlas.token-hash-l2-512.v1",
            "cacheWritePerformed": False,
            "persistsRawTensors": False,
        })

    cluster_Sizes: dict[int, int] = {}
    for idx, t in enumerate(tasks):
        cid = int(assignments_cpu[idx])
        cluster_Sizes[cid] = cluster_Sizes.get(cid, 0) + 1
        t["kmeansClusterId"] = cid
        t["kmeansCentroidSim"] = round(float(assigned_scores_cpu[idx]), 4)
        t["pcaCoords"] = [round(float(x), 5) for x in pca_coords_cpu[idx][:4]]
        t["ewinTangTargetScore"] = round(float(tang_targets_cpu[idx]), 6)
        matched_docs = []
        for doc_rank, (doc_idx, sim_val) in enumerate(zip(topk_idxs_cpu[idx], topk_vals_cpu[idx]), start=1):
            doc = okf_chunks[int(doc_idx)]
            matched_docs.append({
                "rank": doc_rank,
                "chunkId": doc["chunkId"],
                "provider": doc["provider"],
                "product": doc["product"],
                "url": doc["url"],
                "cosineScore": round(float(sim_val), 4),
                "sourceFile": doc["sourceFile"],
                "excerpt": doc["text"][:180],
            })
        t["topKOkfDocs"] = matched_docs
        t["astGrepSymbolRefs"] = [
            {
                "symbolName": s.get("symbol_name"),
                "symbolKind": s.get("symbol_kind"),
                "language": s.get("language"),
                "markdownPath": s.get("markdown_path"),
                "evidenceMethods": s.get("evidence_methods", []),
            }
            for s in okf_symbols[:2]
        ]

    return {
        "device": str(device),
        "numClusters": k,
        "vocabDim": vocab_dim,
        "clusterSizes": cluster_Sizes,
        "tasksEmbedded": len(tasks),
        "okfDocsEmbedded": len(okf_chunks),
        "astGrepSymbolsIndexed": len(okf_symbols),
        "ewinTangLowRank": {
            "schema": tang_lowrank_receipt.schema,
            "method": tang_lowrank_receipt.method,
            "targetRank": tang_lowrank_receipt.target_rank,
            "relativeFrobeniusError": round(tang_lowrank_receipt.relative_frobenius_error, 6),
            "topKOverlap": round(tang_lowrank_receipt.top_k_overlap, 4),
            "lengthSquareSampleOrdinals": tang_lowrank_receipt.length_square_sample_ordinals[:12],
            "topRecommendedDocOrdinals": [r.column_ordinal for r in tang_lowrank_receipt.approximate_recommendations[:5]],
        },
        "featureContract": "atlas.token-hash-l2-512.v1",
        "semanticEmbeddingUsed": False,
        "cudaPcaNormalization": {
            "normalization": ["L2_unit_norm", "Z_score_standardization"],
            "pcaMethod": "torch.pca_lowrank",
            "pcaRank": pca_q,
            "varianceExplainedRatio": round(pca_var_explained, 6),
            "singularValues": [round(float(x), 4) for x in s_pca.detach().cpu().tolist()],
        },
        "valkeyCentroidDescriptors": centroid_descriptors,
    }


def analyze_with_nlp8095(task: dict) -> dict:
    payload = json.dumps({"text": f"{task['taskId']} ({task['domainId']}): {task['summary']}"}).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8095/analyze",
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        concepts = [c for c in data.get("concepts", []) if isinstance(c, str) and c][:6]
        entities = [e.get("text") for e in data.get("entities", []) if isinstance(e, dict) and e.get("text")][:6]
        return {
            **task,
            "nlp8095": {
                "status": "OK",
                "providerRevision": str(data.get("provider_revision", ""))[:100],
                "concepts": concepts,
                "entities": entities,
            },
        }
    except Exception as exc:
        return {
            **task,
            "nlp8095": {"status": f"FALLBACK:{type(exc).__name__}", "concepts": [], "entities": []},
        }


def probe_runtimes() -> dict:
    libtorch_candidates = [
        REPO_ROOT / "libtorch-win-shared-with-deps-2.9.0+cu130",
        REPO_ROOT / "libtorch",
    ]
    napi_addon = REPO_ROOT / "simd-bridge" / "cpp" / "build-x64-fallback" / "Release" / "tensorrt_bridge.node"
    return {
        "cpuCores": os.cpu_count() or 1,
        "pythonVersion": sys.version.split()[0],
        "pytorchVersion": torch.__version__,
        "cudaAvailable": bool(torch.cuda.is_available()),
        "cudaDevice": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "napiSimdBridgeBuilt": napi_addon.is_file(),
        "libtorchDirPresent": any(p.exists() for p in libtorch_candidates),
    }


async def main_async() -> int:
    global COMPUTE_DEVICE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--compute-backend",
        choices=("cpu", "cuda"),
        default="cpu",
        help="CUDA is opt-in and must only be used after the workstation GPU/VRAM admission gate.",
    )
    parser.add_argument(
        "--task-identity-join",
        type=Path,
        default=REPO_ROOT / "docs" / "reports" / "openspec-local-inventory-20261122" / "workboard-join-02.jsonl",
    )
    parser.add_argument(
        "--task-identity-manifest",
        type=Path,
        default=REPO_ROOT / "docs" / "reports" / "openspec-local-inventory-20261122" / "workboard-join-02.manifest.json",
    )
    parser.add_argument(
        "--workboard-snapshot",
        type=Path,
        default=REPO_ROOT / ".tmp" / "atlas" / "openspec-workboard-task-snapshot-local.json",
    )
    args = parser.parse_args()
    if args.compute_backend == "cuda":
        if not torch.cuda.is_available():
            raise SystemExit("CUDA was requested but PyTorch reports no visible CUDA device; CPU fallback is disabled.")
        COMPUTE_DEVICE = "cuda:0"
    else:
        COMPUTE_DEVICE = "cpu"

    task_identities, identity_join_meta = load_task_identity_join(
        args.task_identity_join,
        args.task_identity_manifest,
        args.workboard_snapshot,
    )

    t0 = time.perf_counter()
    cpu_workers = min(16, max(4, (os.cpu_count() or 8)))

    change_dirs = sorted([d for d in OPENSPEC_DIR.iterdir() if d.is_dir() and d.name != "archive"])
    with ThreadPoolExecutor(max_workers=cpu_workers) as pool:
        parsed_changes = list(pool.map(lambda directory: parse_change_dir(directory, task_identities), change_dirs))

    all_tasks: list[dict] = []
    ext_totals: dict[str, int] = {}
    domain_totals: dict[str, int] = {}
    encoding_summary: dict[str, int] = {}
    total_counts = {"done": 0, "partial": 0, "open": 0}

    for item in parsed_changes:
        for k, v in item["counts"].items():
            total_counts[k] += v
        for ext, c in item["extCounts"].items():
            ext_totals[ext] = ext_totals.get(ext, 0) + c
        for dom, c in item["domainCounts"].items():
            domain_totals[dom] = domain_totals.get(dom, 0) + c
        for enc in item["encodings"].values():
            encoding_summary[enc] = encoding_summary.get(enc, 0) + 1
        all_tasks.extend(item["tasks"])

    # Load .okf Firecrawl corpus (including gitignored files)
    okf_chunks, okf_meta = load_okf_doc_corpus()

    # Pick top 32 candidates for optional :8095 NLP + token-feature CUDA/CPU ranking
    all_tasks.sort(key=lambda t: (-t["baseScore"], t["taskIdentityKey"]))
    top32 = all_tasks[:32]

    with ThreadPoolExecutor(max_workers=8) as nlp_pool:
        enriched32 = list(nlp_pool.map(analyze_with_nlp8095, top32))

    # Run RTX 3060 Ti PyTorch CUDA KMeans (k=8) + Cosine KNN (Top-3 .okf docs per task)
    kmeans_knn_receipt = rtx_kmeans_and_knn_okf_docs(enriched32, okf_chunks, num_clusters=8, top_k_docs=3)

    # Build explicit keyword-domain candidate edges for PyTorch CUDA + NetworkX PageRank
    node_id_to_ord: dict[str, int] = {}

    def get_ord(node_id: str) -> int:
        if node_id not in node_id_to_ord:
            node_id_to_ord[node_id] = len(node_id_to_ord)
        return node_id_to_ord[node_id]

    for t in enriched32:
        get_ord(t["taskIdentityKey"])

    edges: list[TypedGraphEdge] = []
    seen_edges: set[tuple[int, int, str]] = set()
    domain_candidate_tuples: list[dict] = []

    def add_edge(src_id: str, dst_id: str, kind: str, weight: float, origin: str) -> None:
        s_ord, d_ord = get_ord(src_id), get_ord(dst_id)
        if s_ord == d_ord or (s_ord, d_ord, kind) in seen_edges:
            return
        seen_edges.add((s_ord, d_ord, kind))
        edges.append(TypedGraphEdge(src_ordinal=s_ord, dst_ordinal=d_ord, kind=kind, weight=weight))
        domain_candidate_tuples.append({"subject": src_id, "predicate": kind, "object": dst_id, "origin": origin})

    for t in enriched32:
        cid = t["taskIdentityKey"]
        dom = t["domainId"]
        cluster_node = f"pa:kmeans.cluster_{t['kmeansClusterId']}"
        if dom:
            add_edge(cid, dom, "HAS_DOMAIN_CANDIDATE", 0.45, "TASK_TEXT_KEYWORD_RULE")
            add_edge(dom, cid, "CANDIDATE_FOR_TASK", 0.3, "TASK_TEXT_KEYWORD_RULE")
        add_edge(cid, cluster_node, "IN_KMEANS_CLUSTER", 0.85, "RTX_KMEANS_CUDA")
        add_edge(cluster_node, cid, "CLUSTER_MEMBER", 0.5, "RTX_KMEANS_CUDA")
        for ext in t["extensions"]:
            ext_node = f"pa:ext.{ext}"
            add_edge(cid, ext_node, "TOUCHES_EXT", 0.8, "FILE_PICKUP")
            add_edge(ext_node, cid, "EXT_REFERENCED_BY", 0.4, "FILE_PICKUP")
        for concept in t["nlp8095"].get("concepts", [])[:4]:
            c_node = f"pa:concept.{concept.lower().replace(' ', '_')[:32]}"
            add_edge(cid, c_node, "MENTIONS_CONCEPT", 0.9, "NLP_8095")
            add_edge(c_node, cid, "CONCEPT_IN_TASK", 0.5, "NLP_8095")
        for doc_hit in t.get("topKOkfDocs", [])[:2]:
            doc_node = f"pa:okf_doc.{doc_hit['product']}"
            add_edge(cid, doc_node, "GROUNDED_IN_OKF_DOC", max(0.2, doc_hit["cosineScore"]), "RTX_KNN_OKF")
            add_edge(doc_node, cid, "DOC_SUPPORTS_TASK", 0.4, "RTX_KNN_OKF")

    all_ordinals = list(node_id_to_ord.values())
    pr_scores_cuda, pr_receipt_cuda = run_pagerank(
        graph_revision="openspec:domain-candidate-v2",
        node_ordinals=all_ordinals,
        edges=edges,
        backend="torch_cuda" if COMPUTE_DEVICE.startswith("cuda") else "torch_cpu",
    )
    pr_scores_nx, pr_receipt_nx = run_pagerank(
        graph_revision="openspec:domain-candidate-v2",
        node_ordinals=all_ordinals,
        edges=edges,
        backend="networkx",
    )

    ranked_inputs: list[dict] = []
    by_cid: dict[str, dict] = {}
    for idx, t in enumerate(enriched32):
        cid = t["taskIdentityKey"]
        c_ord = node_id_to_ord[cid]
        pr = pr_scores_cuda.get(c_ord, 0.0)
        doc_top1 = t["topKOkfDocs"][0]["cosineScore"] if t.get("topKOkfDocs") else 0.0
        combined = round(
            min(0.9999, (t["baseScore"] / 100.0) * 0.65 + min(0.20, pr * 4.0) + min(0.1499, doc_top1 * 0.15)),
            6,
        )
        t["pagerankCuda"] = round(pr, 6)
        t["pagerankNetworkx"] = round(pr_scores_nx.get(c_ord, 0.0), 6)
        t["combinedScore"] = combined
        by_cid[cid] = t
        ranked_inputs.append({
            "candidateOrdinal": idx,
            "canonicalId": cid,
            "taskIdentityKey": cid,
            "score": combined,
        })

    # ── Piece 1: Explicit Data Structures (Dictionaries/Maps, Ordered Arrays, Adjacency Lists) ──
    ordered_task_rows: list[dict] = list(enriched32)
    task_id_lookup_map: dict[str, int] = {}
    for row_idx, t in enumerate(ordered_task_rows):
        task_id_lookup_map[t["taskIdentityKey"]] = row_idx
        task_id_lookup_map[t["taskId"]] = row_idx

    dependency_adjacency_list: dict[str, list[str]] = {}
    for t in ordered_task_rows:
        cid = t["taskIdentityKey"]
        deps: list[str] = []
        # Domain, KMeans cluster, and cross-task shared extension/concept neighbors
        if t["domainId"]:
            deps.append(t["domainId"])
        deps.append(f"pa:kmeans.cluster_{t['kmeansClusterId']}")
        for peer in ordered_task_rows:
            if peer["taskIdentityKey"] != cid and peer["change"] == t["change"]:
                deps.append(peer["taskIdentityKey"])
        dependency_adjacency_list[cid] = deps[:8]

    # ── Piece 2: PyTorch CUDA Linear Regression (torch.linalg.lstsq) for Continuous Ewin Tang Predictions ──
    reg_device = torch.device(COMPUTE_DEVICE)
    x_rows = []
    y_rows = []
    for t in ordered_task_rows:
        doc_top1 = t["topKOkfDocs"][0]["cosineScore"] if t.get("topKOkfDocs") else 0.0
        pca_c = t.get("pcaCoords", [0.0, 0.0, 0.0, 0.0])
        x_rows.append([
            1.0,  # intercept bias
            float(t["baseScore"]) / 100.0,
            float(t["pagerankCuda"]) * 10.0,
            float(t["kmeansCentroidSim"]),
            float(doc_top1),
            float(pca_c[0]),
            float(pca_c[1]),
            float(pca_c[2]),
            float(pca_c[3]),
        ])
        y_rows.append([float(t["ewinTangTargetScore"])])

    X_mat = torch.tensor(x_rows, dtype=torch.float32, device=reg_device)
    Y_vec = torch.tensor(y_rows, dtype=torch.float32, device=reg_device)
    lstsq_sol = torch.linalg.lstsq(X_mat, Y_vec)
    beta_weights = lstsq_sol.solution  # [9, 1]
    Y_pred = torch.mm(X_mat, beta_weights)
    mse_val = float(torch.mean((Y_vec - Y_pred) ** 2).item())
    y_var = float(torch.mean((Y_vec - Y_vec.mean()) ** 2).item())
    r2_val = 1.0 - (mse_val / max(1e-8, y_var))

    y_pred_cpu = Y_pred.squeeze(-1).detach().cpu().tolist()
    for row_idx, t in enumerate(ordered_task_rows):
        t["predictedTangScore"] = round(float(y_pred_cpu[row_idx]), 6)

    linear_regression_receipt = {
        "solver": "torch.linalg.lstsq",
        "device": str(reg_device),
        "fitTarget": "same-row-derived-low-rank-knn-reconstruction-score",
        "evaluationStatus": "IN_SAMPLE_ONLY_NOT_PREDICTIVE_VALIDATION",
        "heldOutEvaluation": False,
        "promotionEligible": False,
        "featureNames": [
            "bias",
            "baseScoreNorm",
            "pagerankCudaScaled",
            "kmeansCentroidSim",
            "top1OkfCosine",
            "pca0",
            "pca1",
            "pca2",
            "pca3",
        ],
        "weights": [round(float(w), 6) for w in beta_weights.squeeze(-1).detach().cpu().tolist()],
        "mse": round(mse_val, 8),
        "r2Score": round(r2_val, 6),
        "sampleCount": len(ordered_task_rows),
    }

    topk_res = stable_topk(ranked_inputs, k=16, offset=0)
    top16_items = [by_cid[c.get("taskIdentityKey") or c["canonicalId"]] for c in topk_res["candidates"]]

    # ── Piece 3: fixture-only KV swap FSM + residency/cache proposal descriptors (no Valkey writes) ──
    workspace_rev = "rev:domain-candidate-experiment-v2"
    host_pinned_kv = torch.zeros((4, 16, 64), dtype=torch.float16)
    if COMPUTE_DEVICE.startswith("cuda"):
        host_pinned_kv = host_pinned_kv.pin_memory()
        device_paged_kv = torch.zeros((16, 16, 64), dtype=torch.float16, device=reg_device)
    else:
        device_paged_kv = torch.zeros((16, 16, 64), dtype=torch.float16)
    page_table_map = torch.tensor([0, 2, 4, 6], dtype=torch.int32)

    gpu_fsm_residency_swaps: list[dict] = []
    for idx, t in enumerate(top16_items[:8]):
        # Synthetic FSM signals for exercising the transition contract; not Titans/MIRAS inference.
        surprise_score = round(min(1.0, 0.45 + float(t["predictedTangScore"]) * 0.6), 4)
        retention_alpha = round(max(0.15, min(0.98, 0.55 + float(t["kmeansCentroidSim"]) * 0.4)), 4)
        fsm_ctx = KvFsmContext(
            state=KvSwapState.S0_BIFROST_LOOKUP,
            prefix_key=f"prefix:{t['taskIdentityKey']}",
            domain_id=idx + 1,
            lod_tier=0 if idx < 4 else 1,
            surprise_score=surprise_score,
            retention_alpha=retention_alpha,
            lease_expires_at_ms=int(time.time() * 1000) + 60000,
            fence_epoch=2,
        )
        visited_states = [fsm_ctx.state.name]
        # Step through S0 -> S1/S2 -> S3 -> S4
        while fsm_ctx.state != KvSwapState.S4_MIRAS_EVICT_OR_PERSIST:
            fsm_ctx = step_kv_swap_fsm(
                fsm_ctx,
                bifrost_lookup_fn=lambda _k, d: (d % 2 == 1),
                turbovec_search_fn=lambda _k, _d, top_k=200: [d["chunkId"] for d in t.get("topKOkfDocs", [])],
                host_pinned_kv=host_pinned_kv,
                device_paged_kv=device_paged_kv,
                page_table_map=page_table_map,
                use_cutile=False,
                synchronize=True,
                now_ms=int(time.time() * 1000),
                expected_fence_epoch=2,
            )
            visited_states.append(fsm_ctx.state.name)
        # Execute S4 MIRAS policy evaluation
        fsm_ctx = step_kv_swap_fsm(fsm_ctx, surprise_tau=0.5, evict_tau=0.3)

        # Advance 12-state immutable TileState residency descriptor
        desc_key = descriptor_key({
            "packet_key": t["taskIdentityKey"],
            "source_revision": workspace_rev,
            "workspace_revision": workspace_rev,
            "graph_revision": "openspec:domain-candidate-v2",
            "representation_revision": "atlas.token-hash-l2-512.v1",
            "domain_taxonomy_revision": "unreviewed-keyword-rules-v2",
            "feature_schema_revision": "pca_lowrank_v1",
            "tile_checksum": hashlib.sha256(str(t["pcaCoords"]).encode("utf-8")).hexdigest()[:16],
            "evidence_checksum": hashlib.sha256(t["summary"].encode("utf-8")).hexdigest()[:16],
            "cache_generation": 1,
            "lease_id": f"lease:{t['taskId']}",
        })
        tile = TileState(state="UNRESOLVED", descriptor=desc_key)
        for next_st in (
            "GROUNDED",
            "FEATURED",
            "VALIDATED",
            "INDEX_REFERENCED",
            "CACHED",
            "CONTEXT_ADMITTED",
            "PREFILL_BOUND",
        ):
            tile = transition_tile_state(tile, next_st, descriptor=desc_key)

        t["residencyDescriptorKey"] = desc_key
        gpu_fsm_residency_swaps.append({
            "taskIdentityKey": t["taskIdentityKey"],
            "kvSwapFsm": {
                "visitedStates": visited_states,
                "bifrostHit": fsm_ctx.bifrost_hit,
                "s2HostPinnedVerified": fsm_ctx.s2_host_pinned_verified,
                "s2StageMode": fsm_ctx.s2_stage_mode,
                "activeBlocksInserted": fsm_ctx.active_blocks,
                "copyBackendUsed": fsm_ctx.copy_backend_used,
                "cudaStreamSynchronized": fsm_ctx.cuda_stream_synchronized,
                "fixtureSurpriseSignal": fsm_ctx.surprise_score,
                "fixtureRetentionSignal": fsm_ctx.retention_alpha,
                "simulatedPersistDecision": fsm_ctx.persisted,
                "simulatedEvictDecision": fsm_ctx.evicted,
                "storageWritePerformed": False,
            },
            "tileResidency": {
                "finalState": tile.state,
                "descriptorKey": desc_key,
            "proposedCacheKey": f"bitfrost:residency:v1:{desc_key}",
            "proposedTtlSeconds": VALKEY_CENTROID_TTL_SECONDS,
            "proposedEvictionPolicy": "allkeys-lru",
            "cacheWritePerformed": False,
                "persistsRawKvOrTensors": False,
            },
        })
    tournament_candidates = [
        TournamentCandidatePromptV1(
            candidate_ordinal=idx,
            canonical_id=t["taskIdentityKey"],
            agent_role=f"dspy-worker-{idx % 2}",
            subprompt_id=f"subprompt:{t['taskId']}",
            model_revision="gemma4-legal-iq4xs-direct.gguf",
            source_revision=workspace_rev,
            evidence_refs=(t["locator"],),
        )
        for idx, t in enumerate(top16_items[:8])
    ]

    async def claim_fn(_b):
        return True

    async def read_current_fn(b):
        return b

    async def propose_fn(cand: TournamentCandidatePromptV1) -> TournamentProposalOutputV1:
        t = by_cid[cand.canonical_id]
        return TournamentProposalOutputV1(
            score=float(t["combinedScore"]),
            patch_targets=tuple(t["extensions"] or [t["locator"]]),
            rationale=f"keyword domain candidate={t['domainId']} status={t['domainLabelStatus']} cluster={t['kmeansClusterId']} prCuda={t['pagerankCuda']}",
            verifier_passed=False,
        )

    tournament_out = await run_prefill_error_fix_tournament_v1(
        run_id="run-domain-candidate-experiment-v2",
        dag_revision="dag-v2",
        workspace_revision=workspace_rev,
        graph_revision="graph-v2",
        candidates=tournament_candidates,
        claim=claim_fn,
        read_current=read_current_fn,
        propose_fn=propose_fn,
    )

    # ── Piece 4: Lexical + AST + CST -> ML Classifiers + XGBoost Grouped Dataset + C++ Radix + LangGraph Helper ──
    lexical_ast_cst_langgraph_receipt = run_lexical_ast_cst_langgraph_helper_v1(
        run_id="run-domain-candidate-experiment-v2",
        workspace_revision=workspace_rev,
        candidate_tasks=ordered_task_rows,
        top_k=16,
    )

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    report = {
        "schema": "atlas.openspec.domain-candidate-ranking-experiment.v2",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "elapsedMs": elapsed_ms,
        "runtimes": probe_runtimes(),
        "computeBackend": COMPUTE_DEVICE,
        "taskIdentityJoin": identity_join_meta,
        "okfCorpus": okf_meta,
        "rtxKmeansKnn": kmeans_knn_receipt,
        "dataStructures": {
            "taskIdLookupMapSize": len(task_id_lookup_map),
            "sampleTaskIdLookupMap": dict(list(task_id_lookup_map.items())[:12]),
            "orderedTaskRowCount": len(ordered_task_rows),
            "orderedTaskRowIds": [t["taskIdentityKey"] for t in ordered_task_rows[:12]],
            "dependencyAdjacencyListNodes": len(dependency_adjacency_list),
            "sampleDependencyAdjacencyList": dict(list(dependency_adjacency_list.items())[:8]),
        },
        "linearRegressionEwinTangFit": linear_regression_receipt,
        "lexicalAstCstMlLangGraph": lexical_ast_cst_langgraph_receipt,
        "gpuFsmAndCachePlan": {
            "cacheBackendConnected": False,
            "cacheWritePerformed": False,
            "proposedTtlSeconds": VALKEY_CENTROID_TTL_SECONDS,
            "proposedEvictionPolicy": "allkeys-lru",
            "featureContract": "atlas.token-hash-l2-512.v1",
            "fsmExecutionMode": "FIXTURE_ONLY",
            "titansOrMirasModelExecuted": False,
            "persistsRawKvOrTensors": False,
            "swaps": gpu_fsm_residency_swaps,
        },
        "corpusSummary": {
            "changesScanned": len(parsed_changes),
            "encodingDistribution": encoding_summary,
            "taskCounts": total_counts,
            "unclassifiedOpenTasks": sum(
                1 for change in parsed_changes for task in change["tasks"]
                if task["state"] == "OPEN" and task["domainLabelStatus"] == "UNCLASSIFIED_REVIEW_REQUIRED"
            ),
            "domainLabelStatusCounts": {
                status: sum(1 for change in parsed_changes for task in change["tasks"] if task["domainLabelStatus"] == status)
                for status in ("UNREVIEWED_CANDIDATE", "UNCLASSIFIED_REVIEW_REQUIRED")
            },
            "reviewedTaskDomainLabels": 0,
            "domainDistribution": dict(sorted(domain_totals.items(), key=lambda kv: (-kv[1], kv[0]))),
            "extensionDistribution": dict(sorted(ext_totals.items(), key=lambda kv: (-kv[1], kv[0]))),
        },
        "graphReceipts": {
            "torchCuda": {
                "backend": pr_receipt_cuda.effective_backend,
                "nodeCount": pr_receipt_cuda.node_count,
                "edgeCount": pr_receipt_cuda.edge_count,
                "tupleCount": len(domain_candidate_tuples),
            },
            "networkx": {
                "backend": pr_receipt_nx.effective_backend,
                "nodeCount": pr_receipt_nx.node_count,
                "edgeCount": pr_receipt_nx.edge_count,
            },
        },
        "top16PromptCandidates": [
            {
                "rank": idx + 1,
                "taskIdentityKey": t["taskIdentityKey"],
                "taskId": t["taskId"],
                "change": t["change"],
                "state": t["state"],
                "domainCandidateId": t["domainId"],
                "domainLabelStatus": t["domainLabelStatus"],
                "domainLabelMethod": t["domainLabelMethod"],
                "kmeansClusterId": t["kmeansClusterId"],
                "kmeansCentroidSim": t["kmeansCentroidSim"],
                "pcaCoords": t.get("pcaCoords", []),
                "ewinTangTargetScore": t.get("ewinTangTargetScore", 0.0),
                "predictedTangScore": t.get("predictedTangScore", 0.0),
                "residencyDescriptorKey": t.get("residencyDescriptorKey"),
                "extensions": t["extensions"],
                "combinedScore": t["combinedScore"],
                "pagerankCuda": t["pagerankCuda"],
                "pagerankNetworkx": t["pagerankNetworkx"],
                "locator": t["locator"],
                "nlp8095": t["nlp8095"],
                "topKOkfDocs": t["topKOkfDocs"],
                "promptCandidate": {
                    "task_id": t["taskId"],
                    "task_identity_key": t["taskIdentityKey"],
                    "domain_candidate": t["domainId"],
                    "domain_label_status": t["domainLabelStatus"],
                    "kmeans_cluster": t["kmeansClusterId"],
                    "okf_doc_refs": [d["chunkId"] for d in t["topKOkfDocs"]],
                    "instruction": f"Review and produce a bounded proposal for {t['taskIdentityKey']} at {t['locator']}",
                    "summary": t["summary"],
                },
            }
            for idx, t in enumerate(top16_items)
        ],
        "tournamentWinner": tournament_out.get("winner"),
        "sampleDomainCandidateTuples": domain_candidate_tuples[:24],
    }
    report["reportSha256"] = hashlib.sha256(
        json.dumps(report, sort_keys=True).encode("utf-8")
    ).hexdigest()

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "elapsedMs": report["elapsedMs"],
                "changesScanned": report["corpusSummary"]["changesScanned"],
                "taskCounts": report["corpusSummary"]["taskCounts"],
                "unclassifiedOpenTasks": report["corpusSummary"]["unclassifiedOpenTasks"],
                "domainDistribution": report["corpusSummary"]["domainDistribution"],
                "okfCorpus": report["okfCorpus"],
                "rtxKmeansKnn": report["rtxKmeansKnn"],
                "linearRegressionEwinTangFit": report["linearRegressionEwinTangFit"],
                "lexicalAstCstMlLangGraph": {
                    "routerTensorContract": report["lexicalAstCstMlLangGraph"]["routerTensorContract"],
                    "xgboostGroupedDatasetReceipt": report["lexicalAstCstMlLangGraph"]["xgboostGroupedDatasetReceipt"],
                    "cppRadixPackingReceipt": report["lexicalAstCstMlLangGraph"]["cppRadixPackingReceipt"],
                    "routeDistribution": report["lexicalAstCstMlLangGraph"]["routeDistribution"],
                    "langGraphNodesCompleted": len(report["lexicalAstCstMlLangGraph"]["langGraphNodeTransitions"]),
                    "top1Recommendation": report["lexicalAstCstMlLangGraph"]["recommendations"][0] if report["lexicalAstCstMlLangGraph"]["recommendations"] else None,
                },
                "dataStructuresSummary": {
                    "taskIdLookupMapSize": report["dataStructures"]["taskIdLookupMapSize"],
                    "orderedTaskRowCount": report["dataStructures"]["orderedTaskRowCount"],
                    "dependencyAdjacencyListNodes": report["dataStructures"]["dependencyAdjacencyListNodes"],
                },
                "gpuFsmFixtureTransitions": len(report["gpuFsmAndCachePlan"]["swaps"]),
                "sampleFsmSwap0": report["gpuFsmAndCachePlan"]["swaps"][0] if report["gpuFsmAndCachePlan"]["swaps"] else None,
                "torchCudaBackend": report["graphReceipts"]["torchCuda"]["backend"],
                "tupleCount": report["graphReceipts"]["torchCuda"]["tupleCount"],
                "tournamentWinner": (report["tournamentWinner"] or {}).get("taskIdentityKey"),
                "sampleTop1OkfDocs": [d["chunkId"] for d in report["top16PromptCandidates"][0]["topKOkfDocs"]],
                "reportSha256": report["reportSha256"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async()))
