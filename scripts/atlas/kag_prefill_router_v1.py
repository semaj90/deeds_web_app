#!/usr/bin/env python3
"""
scripts/atlas/kag_prefill_router_v1.py

Operationalizes Agentic Error Fixing, OKF Documentation & Prefill DAG/KAG Synthesis:
1. Reads ranked tasks from openspec-task-rank-fuse-v1.*.jsonl (47 Louvain communities).
2. Maps each community ID (1..47) to the corresponding docs/llms/generated/*.llms-full.txt silos and .okf validation gates.
3. Builds HyperedgeV1, OntologyLinkedTupleV1, and CandidateOrdinalMapV1 structures.
4. Generates token-bounded llms.txt slices (preventing raw retrieval bloat).
5. Enforces the 5-Stage Canonical Governance Law:
   Verified Claim -> KernelDagCandidate -> Schema/Lineage Admission -> Bounded Execution -> Independent Readback
   (mutation_authorized: False at stages 1-3).
"""

from __future__ import annotations
import argparse
import hashlib
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Literal, List, Dict, Any, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]

# The routing table is keyed to this exact fuse run. A different run has different community IDs.
PINNED_FUSE_STAMP = "20261107T192448Z"
PINNED_FUSE_SHA256 = "fe0008a1cad80add5d74783a4c9b28fc64cab52b88012bbf561fc08093445a13"

# 1. Strict Evidence Provider Fidelity Hierarchy (Tier 1 = Highest Authority)
PROVIDER_FIDELITY_HIERARCHY = [
    ("TIER_1_AST_SYMBOL_PROOF",     "ts-morph / @ast-grep/napi live symbol & type readback"),
    ("TIER_2_CANONICAL_OKF_SCHEMA", "scripts/validate/canonical-gate-okf-profile-v1.mjs (atlas.okf-reconciliation-by-cause.v1)"),
    ("TIER_3_GENERATED_LLMS_TXT",   "docs/llms/generated/*.llms-full.txt pinned API slices"),
    ("TIER_4_DAG_COMMUNITY_KAG",    "openspec-task-rank-fuse-v1.*.jsonl (47 Louvain communities)"),
    ("TIER_5_SHADOW_VECTOR_MRL",    "EmbeddingGemma 2 BF16/FP32 MRL-256 / TurboVec candidate ordinal"),
]

# 2. Deterministic Routing Table: 47 Louvain Communities -> Grounding Silo + Validation Gate
COMMUNITY_ROUTING_TABLE: Dict[int, Dict[str, Any]] = {
    1: {
        "domain": "Task / Workboard Execution",
        "label": "current source recheck packet graphify snapshot",
        "llms_txt": ["docs/llms/generated/sveltekit.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "python scripts/atlas/openspec-task-extract-v1.py --top 10",
    },
    2: {
        "domain": "Ontology Linked Tuples & GraphRAG Admission",
        "label": "ontology admission graphrag qdrant tuple",
        "llms_txt": ["docs/llms/generated/postgres.llms-full.txt", "docs/llms/generated/drizzle.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "python scripts/atlas/test-kag-prefill-router-v1.py",
        "gate_status": "ROUTED_ACTIVE",
    },
    6: {
        "domain": "GPU / sm_86 / Tile Kernels",
        "label": "tile rtx gpu proof",
        "llms_txt": ["docs/llms/generated/cuda.llms-full.txt", "docs/llms/generated/webgpu.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "python scripts/retrieval/embeddinggemma2_shadow_parity_gate.py",
    },
    9: {
        "domain": "Drizzle / PostgreSQL 18 Drift",
        "label": "migration postgresql drizzle audit",
        "llms_txt": ["docs/llms/generated/drizzle.llms-full.txt", "docs/llms/generated/postgres.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "npm run audit:drizzle",
    },
    10: {
        "domain": "Tree-sitter / LangExtract AST & OKF Docs",
        "label": "ast langextract symbol evidence",
        "llms_txt": ["docs/llms/generated/sveltekit.llms-full.txt"],
        "okf_profile": ".okf/schemas/okf-concept-gap-v1.schema.json",
        "validation_cmd": "node scripts/atlas/validate-crawled-okf-docs-v1.mjs",
        "gate_status": "ROUTED_ACTIVE",
    },
    18: {
        "domain": "GPU / cuVS CAGRA & RAPIDS Resource Parity",
        "label": "gpu cuvs cugraph parity rapids",
        "llms_txt": ["docs/llms/generated/cuda.llms-full.txt", "docs/llms/generated/webgpu.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "python scripts/retrieval/embeddinggemma2_shadow_parity_gate.py",
        "gate_status": "ROUTED_ACTIVE",
    },
    21: {
        "domain": "GPU / cuVS CAGRA Vector Index",
        "label": "cuvs cagra",
        "llms_txt": ["docs/llms/generated/cuda.llms-full.txt", "docs/llms/generated/postgres.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "python scripts/retrieval/embeddinggemma2_shadow_parity_gate.py",
    },
    32: {
        "domain": "Svelte 5 Runes / UI Carousels",
        "label": "fabric studio search rollout",
        "llms_txt": ["docs/llms/generated/sveltekit.llms-full.txt", "docs/llms/generated/webgpu.llms-full.txt"],
        "okf_profile": "atlas.okf-reconciliation-by-cause.v1",
        "validation_cmd": "npx vitest run src/lib/components/evidence/EvidenceCarouselGallery.spec.ts",
    },
}

# Communities without a reviewed route (2..5, 7..8, 11..20, 22..31, 33..47). No grounding slice and no gate
# command: an unrouted candidate must not borrow an unrelated gate.
UNROUTED_ROUTE: Dict[str, Any] = {
    "domain": "UNROUTED",
    "label": "unrouted community",
    "llms_txt": [],
    "okf_profile": None,
    "validation_cmd": None,
    "gate_status": "UNROUTED",
}


# 3. Core KAG Data Structures
@dataclass(frozen=True)
class HyperedgeV1:
    hyperedge_id: str
    community_id: int
    error_pattern_hash: str
    okf_profile_ref: str
    llms_txt_refs: list[str]
    target_files: list[str]
    remediation_test_cmd: str


@dataclass(frozen=True)
class OntologyLinkedTupleV1:
    subject: str        # e.g. "task:parent-atlas-spz-detective-renderer#11.22"
    predicate: str      # e.g. "REQUIRES_OKF_GATE" | "GOVERNED_BY_LLMS_TXT" | "VERIFIED_BY_CMD"
    object_ref: str     # e.g. "docs/llms/generated/drizzle.llms-full.txt"
    source_sha256: str
    canonical_authority: bool = False  # Strictly False until Schema/Lineage Admission + Readback


@dataclass(frozen=True)
class CandidateOrdinalMapV1:
    ordinal: int
    task_id: str
    community_id: int
    rrf_score: float
    morton_or_lut_code: int
    source_sha256: str


@dataclass(frozen=True)
class KernelDagCandidatePacket:
    """
    Enforces the 5-Stage Canonical Law:
    Verified Claim -> KernelDagCandidate -> Schema/Lineage Admission -> Bounded Execution -> Independent Readback
    """
    stage: Literal[
        "1_VERIFIED_CLAIM",
        "2_KERNEL_DAG_CANDIDATE",
        "3_SCHEMA_LINEAGE_ADMISSION",
        "4_BOUNDED_EXECUTION",
        "5_INDEPENDENT_READBACK",
    ]
    mutation_authorized: bool  # Always False at stages 1-3
    hyperedge: HyperedgeV1
    ontology_tuples: list[OntologyLinkedTupleV1]
    ordinal_map: CandidateOrdinalMapV1
    prefill_context_slice: str
    prefill_sha256: str


def load_bounded_llms_txt_slice(rel_paths: list[str], max_chars_per_file: int = 3200) -> Tuple[str, str]:
    """
    Loads bounded headers from docs/llms/generated/*.llms-full.txt,
    computes a deterministic SHA-256 digest, and prevents raw context bloat.
    """
    blocks: list[str] = []
    hasher = hashlib.sha256()
    for rel in rel_paths:
        full_path = REPO_ROOT / rel
        if full_path.exists():
            raw_bytes = full_path.read_bytes()
            hasher.update(raw_bytes)
            file_sha = hashlib.sha256(raw_bytes).hexdigest()[:16]
            snippet = raw_bytes.decode("utf-8", errors="replace")[:max_chars_per_file]
            blocks.append(f"--- BEGIN {rel} (sha256:{file_sha}) ---\n{snippet}\n--- END {rel} ---")
        else:
            blocks.append(f"--- MISSING {rel} (fallback to static/llms.txt) ---")
    combined = "\n\n".join(blocks)
    return combined, hasher.hexdigest()


def synthesize_kag_candidate_from_ranked_row(row: dict, ordinal: int) -> KernelDagCandidatePacket:
    """
    Transforms a row from openspec-task-rank-fuse-v1.*.jsonl
    into a provenance-bound KernelDagCandidatePacket.
    """
    comm_id = int(row.get("community", 1))
    route = COMMUNITY_ROUTING_TABLE.get(comm_id, UNROUTED_ROUTE)
    if route["llms_txt"]:
        prefill_slice, prefill_sha = load_bounded_llms_txt_slice(route["llms_txt"])
    else:
        prefill_slice, prefill_sha = "", None
    task_id = row.get("id") or row.get("task_id", f"task:{ordinal}")
    task_text = row.get("text") or row.get("description") or task_id
    task_sha = hashlib.sha256(task_text.encode("utf-8")).hexdigest()

    hyperedge = HyperedgeV1(
        hyperedge_id=f"he:comm{comm_id}:{ordinal:04d}",
        community_id=comm_id,
        error_pattern_hash=task_sha[:16],
        okf_profile_ref=route["okf_profile"],
        llms_txt_refs=route["llms_txt"],
        target_files=[task_id.split("#")[0].split(":")[0]],
        remediation_test_cmd=route["validation_cmd"],
    )

    tuples = [
        OntologyLinkedTupleV1(
            subject=task_id,
            predicate="BELONGS_TO_DAG_COMMUNITY",
            object_ref=f"community:{comm_id}:{row.get('communityLabel', route['label'])}",
            source_sha256=task_sha,
        ),
        OntologyLinkedTupleV1(
            subject=task_id,
            predicate="GROUNDED_BY_LLMS_TXT",
            object_ref=",".join(route["llms_txt"]),
            source_sha256=prefill_sha,
        ),
        OntologyLinkedTupleV1(
            subject=task_id,
            predicate="PROPOSED_GATE_CMD",  # proposed only; this router never executes the command
            object_ref=route["validation_cmd"],
            source_sha256=task_sha,
        ),
    ]

    ordinal_map = CandidateOrdinalMapV1(
        ordinal=ordinal,
        task_id=task_id,
        community_id=comm_id,
        rrf_score=float(row.get("rrf") or row.get("score") or 0.0),
        morton_or_lut_code=None,  # no real Morton/LUT code exists for this row; never invent one
        source_sha256=task_sha,
    )

    return KernelDagCandidatePacket(
        stage="2_KERNEL_DAG_CANDIDATE",
        mutation_authorized=False,  # Canonical Law: candidate is NEVER authorization to mutate
        hyperedge=hyperedge,
        ontology_tuples=tuples,
        ordinal_map=ordinal_map,
        prefill_context_slice=prefill_slice,
        prefill_sha256=prefill_sha,
    )


def check_pin(input_path: Path, allow_unpinned: bool) -> Tuple[str, str]:
    """Return (routing, sha256). Refuse a fuse run that is not the pinned one unless explicitly allowed."""
    digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    pinned = PINNED_FUSE_STAMP in input_path.name and digest == PINNED_FUSE_SHA256
    if pinned:
        return "PINNED", digest
    if not allow_unpinned:
        raise SystemExit(
            f"ROUTING_PIN_MISMATCH: {input_path.name} (sha256 {digest[:12]}...) is not the pinned run "
            f"{PINNED_FUSE_STAMP}. Pass --allow-unpinned to route it as UNPINNED."
        )
    return "UNPINNED", digest


def main():
    parser = argparse.ArgumentParser(description="KAG Prefill Router: Synthesize KernelDagCandidate packets from ranked tasks")
    parser.add_argument(
        "--input-jsonl",
        default="docs/reports/openspec-task-rank-fuse-v1.20261107T192448Z.jsonl",
        help="Path to fused rank tasks jsonl (or 'latest' for newest file)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=10,
        help="Number of top ranked candidates to process",
    )
    parser.add_argument(
        "--allow-unpinned",
        action="store_true",
        help="Route a fuse run that is not the pinned one; output is marked routing: UNPINNED",
    )
    parser.add_argument(
        "--out-file",
        default=".tmp/atlas/kag-prefill-candidates-top10.json",
        help="Output JSON file for synthesized candidates",
    )
    args = parser.parse_args()

    input_path = REPO_ROOT / args.input_jsonl
    if args.input_jsonl == "latest" or not input_path.exists():
        fused_files = sorted((REPO_ROOT / "docs" / "reports").glob("openspec-task-rank-fuse-v1.*.jsonl"))
        if not fused_files:
            raise SystemExit("No openspec-task-rank-fuse-v1.*.jsonl found in docs/reports/")
        input_path = fused_files[-1]

    routing, input_sha = check_pin(input_path, args.allow_unpinned)
    print(f"[KAG Prefill Router] Reading ranked tasks from: {input_path} (routing: {routing})")
    packets = []
    with input_path.open("r", encoding="utf-8") as fh:
        for idx, line in enumerate(fh):
            if idx >= args.top_k:
                break
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            pkt = synthesize_kag_candidate_from_ranked_row(row, ordinal=idx)
            packets.append(asdict(pkt))

    out_file = REPO_ROOT / args.out_file
    out_file.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "routing": routing,
        "inputFile": input_path.name,
        "inputSha256": input_sha,
        "pinnedStamp": PINNED_FUSE_STAMP,
        "candidateCount": len(packets),
        "packets": packets,
    }
    out_file.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    print(f"[KAG Prefill Router] Synthesized {len(packets)} KernelDagCandidate packets ({routing}) -> {out_file}")


if __name__ == "__main__":
    main()
