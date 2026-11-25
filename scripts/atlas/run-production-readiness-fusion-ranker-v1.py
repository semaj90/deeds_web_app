from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.async_multicore_readiness_ranker_v1 import (
    ReadinessCandidateV1,
    run_async_multicore_readiness_ranker_v1,
)

REPORT_OUT = REPO_ROOT / "docs" / "reports" / "production-readiness-fusion-recommendations-v1.json"
WS_REV = "sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c"


def _http_get_json(url: str, timeout: float = 2.5) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            if r.status == 200:
                return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None
    return None


async def _probe_http(url: str) -> dict[str, Any] | None:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _http_get_json, url, 2.5)


def build_live_readiness_probes() -> list:
    disk = shutil.disk_usage(str(REPO_ROOT))
    free_disk_gib = disk.free / (1024**3)
    disk_safe = min(1.0, free_disk_gib / 8.0)

    async def p0_disk_headroom() -> ReadinessCandidateV1:
        return ReadinessCandidateV1(
            candidate_ordinal=0,
            canonical_id="readiness:reclaim-disk-headroom",
            title=f"Reclaim C: disk headroom ({free_disk_gib:.2f} GiB free vs 8.00 GiB floor; ~31.2 GB safe in .venv*/node_modules/.tmp)",
            lane="infrastructure.storage",
            source_revision=WS_REV,
            evidence_refs=("scripts/atlas/assert-resource-headroom-v1.mjs", "scripts/atlas/audit-artifact-bloat.mjs"),
            blocker_unwrap_weight=0.98,
            evidence_completeness=min(1.0, free_disk_gib / 20.0),
            parity_verified=1.0,
            headroom_safety=1.0,
            execution_readiness=0.98,
            recommended_command="node scripts/atlas/assert-resource-headroom-v1.mjs",
        )

    async def p1_sidecar_eg2_default() -> ReadinessCandidateV1:
        h = await _probe_http("http://127.0.0.1:8095/health")
        up = 1.0 if h else 0.3
        return ReadinessCandidateV1(
            candidate_ordinal=1,
            canonical_id="readiness:restart-8095-eg2-default",
            title="Restart miniforge-nlp-sidecar (:8095) so PID 1 switches default /classify to :8094 EG2 ONNX (zero Ollama)",
            lane="nlp.classification",
            source_revision=WS_REV,
            evidence_refs=("python/miniforge_nlp_sidecar.py", "docs/reports/ollama-retirement-inventory-v1.json"),
            blocker_unwrap_weight=0.90,
            evidence_completeness=0.85,
            parity_verified=1.0,
            headroom_safety=0.95,
            execution_readiness=up,
            recommended_command="docker restart miniforge-nlp-sidecar",
        )

    async def p2_eg2_routes_finish() -> ReadinessCandidateV1:
        q = await _probe_http("http://127.0.0.1:6333/collections/codebase_chunks_eg2_768_q8")
        pts = int(((q or {}).get("result") or {}).get("points_count") or 0)
        cov = min(1.0, pts / 1334.0)
        return ReadinessCandidateV1(
            candidate_ordinal=2,
            canonical_id="readiness:complete-eg2-route-projection",
            title=f"Finish indexing remaining SvelteKit routes into Qdrant codebase_chunks_eg2_768_q8 ({pts}/1334 points)",
            lane="retrieval.eg2-onnx",
            source_revision=WS_REV,
            evidence_refs=("scripts/atlas/index-sveltekit-routes-eg2-onnx-v1.py", "docs/reports/sveltekit-routes-eg2-onnx-index-v1.json"),
            blocker_unwrap_weight=0.82,
            evidence_completeness=cov,
            parity_verified=1.0,
            headroom_safety=max(0.45, disk_safe),
            execution_readiness=0.92 if pts > 0 else 0.5,
            recommended_command="C:\\Python313\\python.exe scripts/atlas/index-sveltekit-routes-eg2-onnx-v1.py --offset 1050 --limit 250",
        )

    async def p3_go_retrieval_receipts() -> ReadinessCandidateV1:
        h8100 = await _probe_http("http://127.0.0.1:8100/health")
        up = 1.0 if h8100 else 0.4
        return ReadinessCandidateV1(
            candidate_ordinal=3,
            canonical_id="readiness:go-retrieval-onnx-receipt-wiring",
            title="Rebuild :8097 (/embed/v2) or wire :8100 Go Retrieval to :8094 ONNX receipt + QDRANT_BM25_BRANCH_ACTIVE=true",
            lane="retrieval.go-8100",
            source_revision=WS_REV,
            evidence_refs=("services/go-retrieval-service/main.go", "services/go-embedding-service/provenance_v2.go"),
            blocker_unwrap_weight=0.94,
            evidence_completeness=0.55,
            parity_verified=0.90,
            headroom_safety=disk_safe,
            execution_readiness=0.38 * up,
            recommended_command="cd services/go-retrieval-service && go test -v ./...",
        )

    async def p4_gold_calibration_reviews() -> ReadinessCandidateV1:
        rev = await _probe_http("http://127.0.0.1:5173/api/admin/domain-calibration-reviews")
        saved_cnt = len(((rev or {}).get("decisions") or {}))
        cov = min(1.0, saved_cnt / 200.0)
        return ReadinessCandidateV1(
            candidate_ordinal=4,
            canonical_id="readiness:human-domain-calibration-200",
            title=f"Complete human domain calibration reviews to 200+ trust floor ({saved_cnt} saved on current reviewer)",
            lane="evaluation.gold-labels",
            source_revision=WS_REV,
            evidence_refs=("docs/reports/domain-calibration-gold-v2-review-sheet-v2.html", "python/atlas_graph_runtime/golden_label_workbench_v1.py"),
            blocker_unwrap_weight=0.86,
            evidence_completeness=cov,
            parity_verified=0.85,
            headroom_safety=0.95,
            execution_readiness=0.75,
            recommended_command="node scripts/atlas/audit-domain-calibration-pg18-source-bindings-v1.mjs",
        )

    async def p5_wsl2_rapids_vram_gate() -> ReadinessCandidateV1:
        m8090 = await _probe_http("http://127.0.0.1:8090/v1/models")
        vram_coord_ready = 0.88 if m8090 else 0.70
        return ReadinessCandidateV1(
            candidate_ordinal=5,
            canonical_id="readiness:wsl2-rapids-8098-gpu-parity",
            title="Release :8090 VRAM via manage-llama-8090-vram.ps1, run WSL2 atlas-rapids-cu13 (:8098) cuML/cuGraph parity, and restore :8090",
            lane="gpu.rapids-8098",
            source_revision=WS_REV,
            evidence_refs=("scripts/manage-llama-8090-vram.ps1", ".agents/skills/llama-server-vram-manager/SKILL.md"),
            blocker_unwrap_weight=0.76,
            evidence_completeness=0.65,
            parity_verified=0.90,
            headroom_safety=max(0.50, disk_safe),
            execution_readiness=vram_coord_ready,
            recommended_command="pwsh -NoProfile -File scripts/manage-llama-8090-vram.ps1 -Action status",
        )

    async def p6_turbo16_full_projection() -> ReadinessCandidateV1:
        q = await _probe_http("http://127.0.0.1:6333/collections/codebase_chunks_768_turbo16")
        pts = int(((q or {}).get("result") or {}).get("points_count") or 0)
        cov = min(1.0, pts / 274428.0)
        return ReadinessCandidateV1(
            candidate_ordinal=6,
            canonical_id="readiness:qdrant-turbo16-274k-projection",
            title=f"Scale Qdrant codebase_chunks_768_turbo16 projection ({pts}/274,428 points) after C: >= 8 GiB free",
            lane="retrieval.qdrant-turbo16",
            source_revision=WS_REV,
            evidence_refs=("scripts/atlas/project_pg18_to_qdrant_turbo16_v1.py", ".tmp/turbo16-projection-checkpoint.json"),
            blocker_unwrap_weight=0.72,
            evidence_completeness=cov,
            parity_verified=0.95,
            headroom_safety=0.25 if free_disk_gib < 8.0 else 0.90,
            execution_readiness=0.30 if free_disk_gib < 8.0 else 0.88,
            recommended_command=".venv-qdrant120\\Scripts\\python.exe scripts/atlas/project_pg18_to_qdrant_turbo16_v1.py --limit 2560 --batch-size 256",
        )

    return [
        p0_disk_headroom,
        p1_sidecar_eg2_default,
        p2_eg2_routes_finish,
        p3_go_retrieval_receipts,
        p4_gold_calibration_reviews,
        p5_wsl2_rapids_vram_gate,
        p6_turbo16_full_projection,
    ]


async def _amain() -> int:
    probes = build_live_readiness_probes()
    result = await run_async_multicore_readiness_ranker_v1(
        probes,
        max_concurrency=8,
        cpu_workers=4,
        top_k=10,
    )
    REPORT_OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_amain()))
