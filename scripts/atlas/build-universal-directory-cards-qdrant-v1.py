#!/usr/bin/env python3
"""Build or query a local proposal-only Universal Repo Directory Card index (v1).

Examples:
  # Build local proposal cards for eligible populated directories + optional GPU ranking:
  C:\\Python313\\python.exe scripts/atlas/build-universal-directory-cards-qdrant-v1.py --dim 768 --llama8090-top 6

  # Fast semantic + OBO + rg search over the cached universal directory index:
  C:\\Python313\\python.exe scripts/atlas/build-universal-directory-cards-qdrant-v1.py --query "tree-sitter cst ast symbol projection" --top-k 8
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.repo_directory_card_qdrant_helper_v1 import (
    SCHEMA_UNIVERSAL_DIR_INDEX_V1,
    DirectEg2OnnxEncoderV1,
    UniversalDirectoryCardV1,
    build_all_directory_cards_multicore_v1,
    compute_gpu_directory_graph_and_rank_v1,
    enrich_top_cards_via_llama8090_v1,
    load_obo_term_keywords_v1,
    search_directories_and_files_v1,
)

DEFAULT_STATE_DIR = REPO_ROOT / ".tmp" / "atlas" / "universal-directory-cards-v1"
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "reports" / "universal-repo-directory-cards-v1.json"
OBO_PATH = REPO_ROOT / ".okf" / "ontologies" / "atlas-domain-and-language-terms-v1.obo"
REVISION_SEMANTICS = {
    "workspaceRevision": "Exact admitted workspace snapshot revision; selected revision alone is insufficient.",
    "sourceRevision": "sha256:<hex> of each member file's exact raw bytes.",
    "inventoryManifestDigest": "sha256 of stable canonical JSON over repository scope, workspace revision, sorted member identities/revisions/byte lengths, and sorted exclusion records.",
    "directoryEvidenceDigest": "Computed by computeDirectoryEnrichmentDigestsV1 from directory path, workspace revision, inventory digest, sorted exact member bindings, producer revision, and the digest of the hint's structured metadata.",
    "producerRevision": "sha256 of the exact card producer and policy/config inputs; independent of source and workspace revisions.",
    "representationRevision": "Separate model artifact, tokenizer, prompt, dimension, normalization, and encoding recipe identity for embeddings.",
}


def _save_state(
    state_dir: Path,
    cards: list[UniversalDirectoryCardV1],
    embeddings: np.ndarray,
    manifest: dict[str, Any],
) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    cards_jsonl = state_dir / "cards.jsonl"
    with cards_jsonl.open("w", encoding="utf-8") as fh:
        for c in cards:
            fh.write(json.dumps(asdict(c), separators=(",", ":")) + "\n")

    emb_path = state_dir / "embeddings.f32le"
    emb_bytes = np.ascontiguousarray(embeddings, dtype=np.float32).tobytes()
    emb_path.write_bytes(emb_bytes)

    manifest["files"] = {
        "cards.jsonl": {
            "bytes": cards_jsonl.stat().st_size,
            "sha256": "sha256:" + hashlib.sha256(cards_jsonl.read_bytes()).hexdigest(),
        },
        "embeddings.f32le": {
            "bytes": len(emb_bytes),
            "shape": list(embeddings.shape),
            "sha256": "sha256:" + hashlib.sha256(emb_bytes).hexdigest(),
        },
    }
    (state_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _load_state(state_dir: Path) -> tuple[list[UniversalDirectoryCardV1], np.ndarray, dict[str, Any]]:
    manifest = json.loads((state_dir / "manifest.json").read_text(encoding="utf-8"))
    shape = tuple(manifest["files"]["embeddings.f32le"]["shape"])
    raw = (state_dir / "embeddings.f32le").read_bytes()
    embeddings = np.frombuffer(raw, dtype=np.float32).reshape(shape).copy()
    cards: list[UniversalDirectoryCardV1] = []
    for line in (state_dir / "cards.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            cards.append(UniversalDirectoryCardV1(**json.loads(line)))
    return cards, embeddings, manifest


def main() -> int:
    ap = argparse.ArgumentParser(description="Universal Repo Directory Cards + RTX GPU + EG2 ONNX + Qdrant")
    ap.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR))
    ap.add_argument("--report-out", default=str(DEFAULT_REPORT_PATH))
    ap.add_argument("--dim", type=int, default=768, choices=(768, 512, 256, 128))
    ap.add_argument("--max-tokens", type=int, default=128)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--llama8090-top", type=int, default=6)
    ap.add_argument("--rebuild", action="store_true", help="Force rebuild even if cached state exists")
    ap.add_argument("--query", action="append", default=[], help="Run semantic search query (repeatable)")
    ap.add_argument("--top-k", type=int, default=8)
    args = ap.parse_args()

    state_dir = Path(args.state_dir)
    report_out = Path(args.report_out)
    encoder = DirectEg2OnnxEncoderV1(max_tokens=args.max_tokens)

    need_build = args.rebuild or not (state_dir / "manifest.json").is_file()
    if need_build:
        t_start = time.perf_counter()
        cards, build_stats = build_all_directory_cards_multicore_v1(REPO_ROOT, obo_path=OBO_PATH)
        texts_to_embed = [f"{c.dir_path}: {c.summary[:480]}" for c in cards]
        embeddings, embed_meta = encoder.encode(
            texts_to_embed,
            dim=args.dim,
            batch_size=args.batch_size,
            task_prompt_name="CodeRetrieval",
        )
        cards, gpu_receipt = compute_gpu_directory_graph_and_rank_v1(cards, embeddings, prefer_cuda=True)
        cards, llama_receipt = enrich_top_cards_via_llama8090_v1(cards, top_n=args.llama8090_top)
        # The current directory cards are derived from a local rg inventory. They do
        # not carry an admitted workspace revision or exact member-source bindings,
        # so they are not eligible for a live Qdrant projection. Keep the local
        # vectors available for proposal-only search and require a separately
        # qualified inventory/projection owner before enabling any remote write.
        qdrant_receipt = {
            "qdrantStatus": "BLOCKED_UNQUALIFIED_WORKSPACE_INVENTORY",
            "collection": None,
            "preparedPoints": len(cards),
            "liveWriteAttempted": False,
            "workspaceRevision": None,
            "inventoryDigest": None,
            "reason": "Directory cards lack an admitted workspace revision and exact member-source bindings.",
        }

        missing_by_root = collections.Counter(c.top_root for c in cards if not c.in_legacy_atlas_dirs)
        topo_dist = collections.Counter(t for c in cards for t in c.topo_classes)
        ranked_cards = sorted(cards, key=lambda c: -c.fusion_rank)

        manifest: dict[str, Any] = {
            "schema": SCHEMA_UNIVERSAL_DIR_INDEX_V1,
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "canonicalAuthority": False,
            "writesToCanonicalStores": False,
            "sourceInventoryQualification": {
                "status": "UNQUALIFIED_LOCAL_WORKTREE_INVENTORY",
                "workspaceRevision": None,
                "inventoryDigest": None,
                "memberSourceDigestsPresent": False,
                "eligibleForLiveProjection": False,
                "revisionSemantics": REVISION_SEMANTICS,
            },
            "totalElapsedMs": round((time.perf_counter() - t_start) * 1000.0, 2),
            "structuralStats": build_stats,
            "embeddingReceipt": embed_meta,
            "gpuGraphReceipt": gpu_receipt,
            "llama8090SummaryReceipt": llama_receipt,
            "qdrantSyncReceipt": qdrant_receipt,
            "missingFromLegacyDirsByRoot": dict(missing_by_root.most_common(25)),
            "topoDistribution": dict(topo_dist.most_common(20)),
            "topRankedDirectories": [asdict(c) for c in ranked_cards[:30]],
            "newlyDiscoveredHelperDirectories": [
                {
                    "dirPath": c.dir_path,
                    "cardId": c.card_id,
                    "fileCount": c.file_count,
                    "topoClasses": c.topo_classes,
                    "oboConceptIds": c.obo_concept_ids[:5],
                    "topSymbols": c.top_symbols[:6],
                    "topFiles": c.top_files[:4],
                    "fusionRank": c.fusion_rank,
                }
                for c in ranked_cards
                if not c.in_legacy_atlas_dirs
            ][:40],
        }
        _save_state(state_dir, cards, embeddings, manifest)
    else:
        cards, embeddings, manifest = _load_state(state_dir)

    # Normalize both newly built and previously cached manifests. Older cached
    # runs may contain a queued/live Qdrant receipt, but this inventory has no
    # admitted workspace revision or exact member-source bindings, so it must
    # never be reported as eligible for projection.
    manifest["sourceInventoryQualification"] = {
        "status": "UNQUALIFIED_LOCAL_WORKTREE_INVENTORY",
        "workspaceRevision": None,
        "inventoryDigest": None,
        "memberSourceDigestsPresent": False,
        "eligibleForLiveProjection": False,
        "revisionSemantics": REVISION_SEMANTICS,
    }
    manifest["qdrantSyncReceipt"] = {
        "qdrantStatus": "BLOCKED_UNQUALIFIED_WORKSPACE_INVENTORY",
        "collection": None,
        "preparedPoints": len(cards),
        "liveWriteAttempted": False,
        "workspaceRevision": None,
        "inventoryDigest": None,
        "reason": "Directory cards lack an admitted workspace revision and exact member-source bindings.",
    }

    search_runs: list[dict[str, Any]] = []
    if args.query:
        obo_cat, obo_toks = load_obo_term_keywords_v1(OBO_PATH) if OBO_PATH.is_file() else (None, {})
        for q in args.query:
            res = search_directories_and_files_v1(
                q,
                repo_root=REPO_ROOT,
                cards=cards,
                embeddings=embeddings,
                encoder=encoder,
                obo_catalog=obo_cat,
                obo_term_tokens=obo_toks,
                top_k=args.top_k,
                prefer_cuda=True,
            )
            search_runs.append(res)
        manifest["sampleSemanticSearchQueries"] = search_runs

    report_out.parent.mkdir(parents=True, exist_ok=True)
    report_out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "totalDirectories": manifest["structuralStats"]["totalDirectories"],
                "missingInLegacyAtlasDirs": manifest["structuralStats"]["missingInLegacyAtlasDirs"],
                "embeddingBackend": manifest["embeddingReceipt"]["backend"],
                "gpuBackend": manifest["gpuGraphReceipt"]["backend"],
                "gpuDevice": manifest["gpuGraphReceipt"]["deviceName"],
                "gpuComputeMs": manifest["gpuGraphReceipt"]["computeMs"],
                "cpuParityMaxAbsDiff": manifest["gpuGraphReceipt"]["cpuParityMaxAbsDiff"],
                "llama8090Enriched": manifest["llama8090SummaryReceipt"].get("enriched", 0),
                "qdrantStatus": manifest["qdrantSyncReceipt"]["qdrantStatus"],
                "qdrantLiveWriteAttempted": manifest["qdrantSyncReceipt"].get("liveWriteAttempted", False),
                "queriesExecuted": len(search_runs),
                "reportOut": str(report_out.relative_to(REPO_ROOT)),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
