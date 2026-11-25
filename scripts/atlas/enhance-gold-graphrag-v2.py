from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import psycopg

REPO_ROOT = Path(__file__).resolve().parents[2]
ENRICHED_PATH = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2-enriched-v1.jsonl"
OUT_JSONL = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2-graphrag-v2.jsonl"
OUT_REPORT = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2-graphrag-audit-v2.json"

PATH_DOMAIN_RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("test", re.compile(r"(?:^|/)(?:tests?|__tests__|__fixtures__)/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.spec\.py$", re.I), "test suite / fixture path"),
    ("frontend.sveltekit", re.compile(r"sveltekit-frontend/src/routes/|\.svelte$", re.I), "SvelteKit route or Svelte component"),
    ("frontend", re.compile(r"sveltekit-frontend/src/lib/components/", re.I), "frontend UI component"),
    ("database.postgresql", re.compile(r"drizzle/|pgvector|postgres|sql$", re.I), "PostgreSQL / Drizzle / pgvector artifact"),
    ("retrieval", re.compile(r"retrieval|qdrant|rag|search|rerank|bm25", re.I), "retrieval / Qdrant / RAG module"),
    ("gpu", re.compile(r"cuda|cuvs|cugraph|cuml|tensorrt|ggml-sycl|ggml-opencl|\.cu$|\.cl$", re.I), "GPU / CUDA / TensorRT / OpenCL kernel"),
    ("graph", re.compile(r"graph|pagerank|hypergraph|neo4j|topology|som", re.I), "graph / PageRank / topology module"),
    ("cache", re.compile(r"valkey|redis|cache|bitfrost", re.I), "cache / Valkey / BitFrost module"),
    ("auth", re.compile(r"auth|session|login|jwt|oauth", re.I), "auth / session module"),
    ("api", re.compile(r"/api/|\+server\.ts$", re.I), "HTTP API endpoint"),
    ("machine-learning", re.compile(r"onnx|pytorch|mlp|classifier|embedding|gemma|llama|training|qlora", re.I), "ML / embedding / classifier artifact"),
    ("compiler", re.compile(r"ast|treesitter|parser|compiler|cst", re.I), "AST / parser / compiler module"),
    ("devops.env-config", re.compile(r"\.env|docker-compose|dockerfile|config", re.I), "DevOps / compose / env config"),
)


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _recommend(row: dict[str, Any], pkt_meta: dict[str, Any], neighbors: list[dict[str, Any]]) -> dict[str, Any]:
    pcat = row.get("pathCategory")
    sref = str(row.get("sourceRef") or "")
    oak_terms = [t.get("name", "") for t in (row.get("oaklibSupportingTerms") or [])]
    rg_lines = row.get("rgSupportingLines") or []
    moved = row.get("rgMovedCandidateSamples") or []

    if pcat == "NOISE_OR_EPHEMERAL":
        return {
            "recommendedDomain": "NOT_A_DOMAIN",
            "confidence": 0.95,
            "rationale": f"Noise/ephemeral build/venv/storage path ({sref}); exclude from gold training.",
            "suggestedSupportEvidence": f"NOISE_OR_EPHEMERAL path excluded from training: {sref}",
        }

    hay = f"{sref} {' '.join(rg_lines)} {' '.join(oak_terms)} {' '.join(n.get('targetFeatureId','') for n in neighbors)}"
    matched_domain = None
    matched_reason = None
    for dom, pat, reason in PATH_DOMAIN_RULES:
        if pat.search(hay):
            matched_domain = dom
            matched_reason = reason
            break

    if not matched_domain and row.get("proposedOntologyGroup"):
        matched_domain = row["proposedOntologyGroup"]
        matched_reason = "aligned with proposedOntologyGroup + GraphRAG context"
    elif not matched_domain:
        matched_domain = "AMBIGUOUS"
        matched_reason = "insufficient path/symbol/GraphRAG signal"

    ev_parts: list[str] = []
    if pcat == "MISSING_ON_DISK":
        if moved:
            ev_parts.append(f"Missing on disk; moved/related candidates ({row.get('rgMovedCandidateCount', 0)}): {', '.join(moved[:3])}")
        else:
            ev_parts.append(f"Missing on disk ({sref}); no direct basename match in workspace")
    if rg_lines:
        ev_parts.append(f"rg symbols: {' | '.join(rg_lines[:3])}")
    if oak_terms:
        ev_parts.append(f"oaklib OBO: {', '.join(oak_terms[:4])}")
    if neighbors:
        top_n = [f"{n['targetFeatureId']} ({n['relationshipType']}, w={n['strength']})" for n in neighbors[:3]]
        ev_parts.append(f"GraphRAG neighbors: {'; '.join(top_n)}")
    if pkt_meta.get("communityId") is not None:
        ev_parts.append(f"community={pkt_meta['communityId']}, pagerank={pkt_meta.get('pagerank')}")

    conf = 0.85 if (rg_lines and neighbors) else (0.75 if (rg_lines or neighbors or matched_reason) else 0.45)
    return {
        "recommendedDomain": matched_domain,
        "confidence": conf,
        "rationale": f"{matched_reason}; {len(neighbors)} GraphRAG neighbors, {len(oak_terms)} OBO terms, {len(rg_lines)} rg lines",
        "suggestedSupportEvidence": " | ".join(ev_parts) if ev_parts else f"Path signal: {sref}",
    }


def main() -> int:
    _load_env_file(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    rows = [json.loads(ln) for ln in ENRICHED_PATH.read_text(encoding="utf-8").splitlines() if ln.strip()]
    packet_keys = [str(r.get("packetKey")) for r in rows if r.get("packetKey")]

    pkt_by_key: dict[str, dict[str, Any]] = {}
    neighbors_by_feature: dict[str, list[dict[str, Any]]] = {}

    if db_url and packet_keys:
        with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT packet_key, feature_id, community_id, pagerank, kmeans_cluster
                    FROM atlas_packets
                    WHERE packet_key = ANY(%s)
                    """,
                    (packet_keys,),
                )
                feature_ids: list[str] = []
                for pkey, fid, cid, pr, kc in cur.fetchall():
                    pkt_by_key[str(pkey)] = {
                        "featureId": fid,
                        "communityId": cid,
                        "pagerank": round(float(pr), 6) if pr is not None else None,
                        "kmeansCluster": kc,
                    }
                    if fid:
                        feature_ids.append(str(fid))

                if feature_ids:
                    cur.execute(
                        """
                        SELECT source_feature_id, target_feature_id, relationship_type, strength, coalesce(reasoning, '')
                        FROM atlas_feature_relationships
                        WHERE source_feature_id = ANY(%s)
                        ORDER BY strength DESC NULLS LAST
                        """,
                        (list(set(feature_ids)),),
                    )
                    for src_f, tgt_f, rel_t, strength, reason in cur.fetchall():
                        lst = neighbors_by_feature.setdefault(str(src_f), [])
                        if len(lst) < 5:
                            lst.append(
                                {
                                    "targetFeatureId": str(tgt_f),
                                    "relationshipType": str(rel_t),
                                    "strength": float(strength) if strength is not None else 0.0,
                                    "reasoning": str(reason)[:160],
                                }
                            )

    out_lines: list[str] = []
    with_neighbors = 0
    missing_with_rec = 0
    for r in rows:
        pkey = str(r.get("packetKey") or "")
        pmeta = pkt_by_key.get(pkey, {})
        fid = pmeta.get("featureId")
        nbrs = neighbors_by_feature.get(str(fid), []) if fid else []
        if nbrs:
            with_neighbors += 1
        rec = _recommend(r, pmeta, nbrs)
        if r.get("pathCategory") == "MISSING_ON_DISK" and rec["recommendedDomain"]:
            missing_with_rec += 1
        out_lines.append(
            json.dumps(
                {
                    **r,
                    "graphRagMeta": pmeta,
                    "graphRagNeighbors": nbrs,
                    "graphRagRecommendation": rec,
                },
                ensure_ascii=True,
            )
        )

    OUT_JSONL.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    report = {
        "schema": "atlas.domain-calibration-gold-v2-graphrag-audit.v2",
        "totalRows": len(rows),
        "rowsWithGraphRagNeighbors": with_neighbors,
        "missingOnDiskWithRecommendations": missing_with_rec,
        "outputJsonl": str(OUT_JSONL.relative_to(REPO_ROOT)).replace("\\", "/"),
    }
    OUT_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
