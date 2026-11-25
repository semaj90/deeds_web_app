from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import psycopg

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.packed_feature_block_v1 import (
    decode_packed_feature_block_v1,
    encode_packed_feature_block_v1,
)

GOLD_GRAPHRAG_PATH = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2-graphrag-v2.jsonl"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "ace-daily-simd-headroom-eg2-gap-v1.json"


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _parse_and_extract(line: str) -> tuple[list[int], list[int], int]:
    row = json.loads(line)
    bd = row.get("completenessBreakdown") or {}
    bits = [
        1 if bd.get("sourceOnDisk", 0) > 0 else 0,
        1 if bd.get("revisionBound", 0) > 0 else 0,
        1 if bd.get("cleanEvidenceText", 0) > 0 else 0,
        1 if bd.get("rgSymbolEvidence", 0) > 0 else 0,
        1 if bd.get("oaklibOntologySupport", 0) > 0 else 0,
        1 if bd.get("semanticVectorPresent", 0) > 0 else 0,
        1 if row.get("hasEg2Vector") else 0,
    ]
    score = int(row.get("completenessScore") or 0)
    rec = row.get("graphRagRecommendation") or {}
    conf_nibble = min(15, max(0, int(round(float(rec.get("confidence") or 0.0) * 15))))
    score_nibble = min(15, max(0, int(round(score / 100.0 * 15))))
    oak_nibble = min(15, len(row.get("oaklibSupportingTerms") or []))
    rg_nibble = min(15, len(row.get("rgSupportingLines") or []))
    nbr_nibble = min(15, len(row.get("graphRagNeighbors") or []))
    eg2_nibble = 15 if row.get("hasEg2Vector") else 0
    sem_nibble = 15 if row.get("hasSemantic768Vector") else 0
    nibbles = [score_nibble, conf_nibble, oak_nibble, rg_nibble, nbr_nibble, sem_nibble, eg2_nibble]
    return bits, nibbles, score


def main() -> int:
    _load_env_file(REPO_ROOT / ".env")
    lines = [ln for ln in GOLD_GRAPHRAG_PATH.read_text(encoding="utf-8").splitlines() if ln.strip()]

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(_parse_and_extract, lines))
    parse_ms = (time.perf_counter() - t0) * 1000.0

    all_bits: list[int] = []
    all_nibbles: list[int] = []
    scores: list[int] = []
    for bits, nibbles, sc in results:
        all_bits.extend(bits)
        all_nibbles.extend(nibbles)
        scores.append(sc)

    t1 = time.perf_counter()
    pfb1_bytes = encode_packed_feature_block_v1(
        feature_map_rev=1,
        candidate_count=len(results),
        feature_count=7,
        bits=all_bits,
        nibbles=all_nibbles,
    )
    decoded = decode_packed_feature_block_v1(pfb1_bytes)
    pfb1_ms = (time.perf_counter() - t1) * 1000.0

    # Route-level EmbeddingGemma 2 coverage audit
    routes_root = REPO_ROOT / "sveltekit-frontend" / "src" / "routes"
    route_files = sorted(
        str(p.relative_to(REPO_ROOT / "sveltekit-frontend")).replace("\\", "/")
        for p in routes_root.rglob("*")
        if p.is_file() and p.name in ("+server.ts", "+page.svelte", "+page.server.ts", "+layout.svelte", "+layout.server.ts")
    )

    sem768_routes: set[str] = set()
    eg2_routes: set[str] = set()
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT relative_path
                    FROM codebase_chunk_index
                    WHERE relative_path LIKE 'src/routes/%'
                      AND content_embedding_768 IS NOT NULL
                    """
                )
                sem768_routes = {r[0].replace("\\", "/") for r in cur.fetchall() if r[0]}
                cur.execute(
                    """
                    SELECT DISTINCT relative_path
                    FROM codebase_chunk_eg2_embeddings
                    WHERE relative_path LIKE 'src/routes/%'
                       OR relative_path LIKE 'sveltekit-frontend/src/routes/%'
                    """
                )
                for (rp,) in cur.fetchall():
                    if rp:
                        norm = rp.replace("\\", "/")
                        if norm.startswith("sveltekit-frontend/"):
                            norm = norm[len("sveltekit-frontend/"):]
                        eg2_routes.add(norm)

    route_set = set(route_files)
    missing_eg2_routes = sorted(route_set - eg2_routes)
    missing_sem768_routes = sorted(route_set - sem768_routes)

    report: dict[str, Any] = {
        "schema": "atlas.ace-daily-simd-headroom-eg2-gap.v1",
        "multiCorePfb1Analysis": {
            "workers": 4,
            "rowsProcessed": len(results),
            "featureCountPerRow": 7,
            "parseAndExtractMs": round(parse_ms, 2),
            "pfb1EncodeDecodeMs": round(pfb1_ms, 2),
            "pfb1TotalBytes": len(pfb1_bytes),
            "pfb1HeaderBytes": 104,
            "pfb1DecodedCandidateCount": decoded.candidate_count,
            "pfb1Verified": decoded.candidate_count == len(results) and decoded.feature_count == 7,
            "averageCompletenessPct": round(sum(scores) / len(scores), 2) if scores else 0.0,
        },
        "sveltekitRouteCoverage": {
            "totalRouteFilesOnDisk": len(route_files),
            "semantic768CoveredRoutes": len(route_set & sem768_routes),
            "semantic768MissingRoutes": len(missing_sem768_routes),
            "eg2CoveredRoutes": len(route_set & eg2_routes),
            "eg2MissingRoutes": len(missing_eg2_routes),
            "eg2CoveragePct": round((len(route_set & eg2_routes) / max(len(route_files), 1)) * 100.0, 2),
            "sampleMissingEg2Routes": missing_eg2_routes[:20],
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
