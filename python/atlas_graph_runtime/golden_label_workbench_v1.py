"""Golden-label review queue exporter, fail-closed corpus freezer, and J-space/MLP benchmark harness.

Enforces the `okf-oak-domain-classification-cheatsheet.md` and `AGENTS.md` gates:
- Exported candidates start `PENDING_HUMAN_REVIEW` with `goldDomainId: None`.
- `validate_and_freeze_golden_corpus_v1` fails closed on unreviewed rows, invalid
  domain IDs (must be in the 17 frozen `domain_taxonomy_v1` IDs), or counts below
  the trust floor (`min_total=200`, `min_per_class=30` by default).
- `benchmark_jspace_mlp_vs_oracle_v1` benchmarks a frozen comparison set without
  running QLoRA/backpropagation or mutating PostgreSQL (`canonicalAuthority: False`).
"""
from __future__ import annotations

import hashlib
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

FROZEN_17_DOMAIN_IDS = (
    "api",
    "auth",
    "cache",
    "compiler",
    "database",
    "database.postgresql",
    "devops",
    "devops.env-config",
    "devops.process-mgmt",
    "error-handling",
    "frontend",
    "frontend.sveltekit",
    "gpu",
    "graph",
    "machine-learning",
    "retrieval",
    "test",
)


def _sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def export_golden_label_queue_v1(
    *,
    out_path: str | Path = "docs/reports/golden-domain-label-queue-v1.jsonl",
    per_domain_limit: int = 15,
    dsn: str | None = None,
) -> dict[str, Any]:
    """Export a stratified PENDING_HUMAN_REVIEW queue across the 17 taxonomy domains from PG18."""
    import psycopg

    db_url = dsn or os.environ.get(
        "DATABASE_URL",
        "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db",
    )
    rows_out: list[dict[str, Any]] = []
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            for dom in FROZEN_17_DOMAIN_IDS:
                cur.execute(
                    """
                    SELECT packet_key, source_ref, coalesce(content_hash, sha256, ''),
                           domain_class, left(coalesce(summary, ''), 240)
                    FROM atlas_packets
                    WHERE domain_class = %s
                      AND coalesce(source_ref, '') <> ''
                    ORDER BY packet_key
                    LIMIT %s
                    """,
                    (dom, int(per_domain_limit)),
                )
                for pkey, sref, shash, prop_dom, summary in cur.fetchall():
                    rows_out.append(
                        {
                            "schema": "atlas.golden-domain-label-item.v1",
                            "canonicalAuthority": False,
                            "reviewStatus": "PENDING_HUMAN_REVIEW",
                            "packetKey": str(pkey),
                            "sourceRef": str(sref),
                            "sourceSha256": str(shash) if shash else _sha256_text(f"{pkey}:{sref}"),
                            "proposedDomain": str(prop_dom),
                            "summaryPreview": str(summary),
                            "goldDomainId": None,
                            "reviewer": None,
                            "reviewedAt": None,
                        }
                    )

    dest = Path(out_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows_out) + ("\n" if rows_out else ""),
        encoding="utf-8",
    )
    return {
        "schema": "atlas.golden-domain-label-queue-export.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "transactionReadOnly": True,
        "outPath": str(dest),
        "exportedCount": len(rows_out),
        "domainsCovered": len({r["proposedDomain"] for r in rows_out}),
    }


def validate_and_freeze_golden_corpus_v1(
    records: list[dict[str, Any]],
    *,
    min_total: int = 200,
    min_per_class: int = 30,
) -> dict[str, Any]:
    """Fail-closed validation & SHA-256 freeze of human-reviewed golden labels."""
    if not records:
        raise ValueError("GOLDEN_CORPUS_EMPTY")

    valid_domains = set(FROZEN_17_DOMAIN_IDS)
    counts: Counter[str] = Counter()
    frozen_items: list[dict[str, Any]] = []

    for idx, rec in enumerate(records):
        if rec.get("reviewStatus") != "REVIEWED_APPROVED":
            raise ValueError(f"UNREVIEWED_ROWS_PRESENT:index={idx},status={rec.get('reviewStatus')}")
        gold = rec.get("goldDomainId")
        if gold not in valid_domains:
            raise ValueError(f"INVALID_GOLD_DOMAIN_ID:index={idx},gold={gold}")
        reviewer = str(rec.get("reviewer") or "").strip()
        if not reviewer:
            raise ValueError(f"MISSING_REVIEWER:index={idx}")
        counts[str(gold)] += 1
        frozen_items.append(
            {
                "packetKey": str(rec.get("packetKey", f"item-{idx}")),
                "sourceRef": str(rec.get("sourceRef", "")),
                "sourceSha256": str(rec.get("sourceSha256", "")),
                "goldDomainId": str(gold),
                "reviewer": reviewer,
                "scores": rec.get("scores") or {},
            }
        )

    if len(frozen_items) < min_total:
        raise ValueError(f"GOLDEN_FLOOR_NOT_MET:total={len(frozen_items)}<{min_total}")
    below = {k: v for k, v in counts.items() if v < min_per_class}
    if below:
        raise ValueError(f"GOLDEN_CLASS_FLOOR_NOT_MET:{below}<{min_per_class}")

    frozen_items.sort(key=lambda x: x["packetKey"])
    canonical_blob = json.dumps(frozen_items, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    corpus_sha256 = _sha256_text(canonical_blob)

    return {
        "schema": "atlas.frozen-golden-corpus.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "totalCount": len(frozen_items),
        "classCounts": dict(counts),
        "corpusSha256": corpus_sha256,
        "items": frozen_items,
    }


def benchmark_jspace_mlp_vs_oracle_v1(frozen_corpus: dict[str, Any]) -> dict[str, Any]:
    """Run an offline comparison benchmark (accuracy + Brier score) over a frozen golden corpus."""
    items = frozen_corpus.get("items") or []
    if not items or not frozen_corpus.get("corpusSha256"):
        raise ValueError("FROZEN_CORPUS_REQUIRED")

    jspace_correct = 0
    mlp_correct = 0
    jspace_brier: list[float] = []
    mlp_brier: list[float] = []

    for item in items:
        gold = item["goldDomainId"]
        scores = item.get("scores") or {}
        j_pred = scores.get("jspacePred")
        j_prob = float(scores.get("jspaceProb", 0.5))
        m_pred = scores.get("mlpPred")
        m_prob = float(scores.get("mlpProb", 0.5))

        j_hit = 1.0 if j_pred == gold else 0.0
        m_hit = 1.0 if m_pred == gold else 0.0
        jspace_correct += int(j_hit)
        mlp_correct += int(m_hit)
        jspace_brier.append((j_prob - j_hit) ** 2)
        mlp_brier.append((m_prob - m_hit) ** 2)

    n = len(items)
    return {
        "schema": "atlas.jspace-mlp-benchmark-receipt.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "corpusSha256": frozen_corpus["corpusSha256"],
        "sampleCount": n,
        "jspace": {
            "accuracy": round(jspace_correct / n, 4),
            "brierScore": round(float(np.mean(jspace_brier)), 4),
        },
        "mlpChallenger": {
            "accuracy": round(mlp_correct / n, 4),
            "brierScore": round(float(np.mean(mlp_brier)), 4),
        },
    }
