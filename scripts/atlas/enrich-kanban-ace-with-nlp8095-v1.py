#!/usr/bin/env python3
"""
NLP (:8095) + Keyword Top-K + OpenSpec Kanban ACE Recommendation Enricher (v1)

Reads `docs/reports/crime-scene-kanban-ace-packet-v1.json`, probes live `:8095/health`
for NLP runtime provenance, extracts bounded domain/keyword signals per task,
scores and selects Top-4 contextual agentic error-fixing proposals via `stable_topk`
(`atlas.topk.v1`), and writes a proposal-only ACE JSON packet:
  docs/reports/crime-scene-nlp-ace-recommendations-v1.json

Never mutates OpenSpec files, Postgres, Qdrant, or Redis.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.topk_paginator import stable_topk

ACE_PACKET_PATH = REPO_ROOT / "docs" / "reports" / "crime-scene-kanban-ace-packet-v1.json"
OUT_PATH = REPO_ROOT / "docs" / "reports" / "crime-scene-nlp-ace-recommendations-v1.json"

DOMAIN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "scene_ui_webgl": ("canvas", "webgl", "three", "camera", "inspector", "timeline", "clock", "cue"),
    "memory_lod_residency": ("memory", "lod", "residency", "budget", "modal", "vram", "cell"),
    "character_v2": ("character", "avatar", "socket", "walk", "glb", "pose", "skeleton"),
    "geometry_simd_lut": ("lut", "4bpp", "avx2", "geometry", "polygon", "bvh", "padf", "mesh"),
    "persistence_staging": ("save", "reopen", "persist", "staging", "postgres", "seaweedfs", "revision"),
}


def probe_nlp_8095() -> dict:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8095/health", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "reachable": True,
                "status": data.get("status"),
                "contract": data.get("contract"),
                "capabilities": data.get("capabilities", {}),
            }
    except Exception as exc:
        return {"reachable": False, "error": f"{type(exc).__name__}: {exc}"}


def post_analyze_8095(text: str, source_ref: str) -> dict | None:
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8095/analyze",
            data=json.dumps({
                "text": text,
                "sourceRef": source_ref,
                "passes": ["lexical", "classify"],
            }).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def classify_domains_and_keywords(summary: str) -> tuple[str, list[str], float]:
    low = summary.lower()
    tokens = re.findall(r"[a-z0-9_-]{3,}", low)
    best_domain = "general_scene"
    best_hits: list[str] = []
    for domain, kws in DOMAIN_KEYWORDS.items():
        hits = [kw for kw in kws if kw in low]
        if len(hits) > len(best_hits):
            best_hits = hits
            best_domain = domain
    unique_keywords = list(dict.fromkeys(best_hits + [t for t in tokens if len(t) >= 5]))[:8]
    keyword_boost = min(10.0, len(best_hits) * 2.5)
    return best_domain, unique_keywords, keyword_boost


def main() -> None:
    ace_packet = json.loads(ACE_PACKET_PATH.read_text(encoding="utf-8"))
    prefill_tasks = ace_packet.get("ContextBlob", {}).get("prefillTasks", [])
    nlp_health = probe_nlp_8095()

    scored_candidates: list[dict] = []
    by_ordinal: dict[int, dict] = {}

    live_8095_analyzed = 0
    for idx, task in enumerate(prefill_tasks):
        summary = str(task.get("summary", ""))
        source_ref = str(task.get("sourceRef", ""))
        domain, keywords, kw_boost = classify_domains_and_keywords(summary)
        live_8095 = post_analyze_8095(summary, source_ref) if nlp_health.get("reachable") else None
        if live_8095 is not None:
            live_8095_analyzed += 1
        base_score = float(task.get("quickHitScore", 0.0))
        composite = round(min(100.0, base_score + kw_boost * 0.2), 3)

        item = {
            "candidateOrdinal": idx,
            "canonicalId": task.get("scopedTaskId", task.get("taskId")),
            "taskId": task.get("taskId"),
            "sourceRef": source_ref,
            "ConceptID": task.get("ConceptID"),
            "domain": domain,
            "keywords": keywords,
            "nlp8095Attached": live_8095 is not None,
            "nlp8095Contract": live_8095.get("contract") if isinstance(live_8095, dict) else None,
            "ganLane": task.get("ganLane"),
            "score": composite,
            "sourceRevision": ace_packet.get("packetSha256", ""),
            "evidenceRefs": [source_ref],
            "kernelDagCandidate": task.get("kernelDagCandidate"),
        }
        scored_candidates.append(item)
        by_ordinal[idx] = item

    topk_4 = stable_topk(scored_candidates, k=4, offset=0)
    top_proposals = [by_ordinal[r["candidateOrdinal"]] for r in topk_4["candidates"]]

    payload = {
        "schema": "atlas.nlp-ace-recommendations.v1",
        "authorityLabel": "CONTEXTUAL_AGENTIC_REPAIR_PROPOSAL",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "nlpSidecar8095": nlp_health,
        "sourcePacketSha256": ace_packet.get("packetSha256"),
        "topkSchema": topk_4["schema"],
        "topkOrder": topk_4["order"],
        "proposalWindow": "1-4 proposals",
        "totalEvaluated": len(scored_candidates),
        "live8095AnalyzedCount": live_8095_analyzed,
        "top4Proposals": top_proposals,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "nlp8095Reachable": nlp_health.get("reachable"),
                "live8095AnalyzedCount": live_8095_analyzed,
                "totalEvaluated": len(scored_candidates),
                "top4TaskIds": [p["taskId"] for p in top_proposals],
                "top4Domains": [p["domain"] for p in top_proposals],
                "canonicalAuthority": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
