"""Shared fail-closed helpers for read-only GA8 evaluation harnesses."""

from __future__ import annotations

import hashlib
import json
import math
import os

# GA8-HARDEN-FINAL item 2: the real provenance artifact that vouches for
# atlas_graph_authority_scores.pagerank_l1 -- a live networkx-vs-cugraph parity proof over a
# frozen graph snapshot (see CLAUDE.md's "Correction (2026-08-26)" note: this parity pipeline,
# not Neo4j's own GDS PageRank run, is the trusted compute path for the pagerank_l1 values GA8
# reads). GA8 must verify this receipt rather than trust the live table blindly or duplicate a
# partial PageRank configuration of its own.
GRAPH_PROVENANCE_RECEIPT_PATH = "sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json"
REQUIRED_RECEIPT_FIELDS = ("status", "graphRevision", "pagerankCorrelation", "manifest")


def verify_graph_provenance_receipt(path: str = GRAPH_PROVENANCE_RECEIPT_PATH) -> dict:
    """Read, checksum, parse, and field-validate the graph parity receipt. Fails closed
    (SystemExit) on a missing file, corrupt/unparseable JSON, missing required fields, or a
    non-PASS status -- this is a hard precondition for trusting pagerank_l1, not a soft warning.
    Returns a small provenance-identity dict safe to embed in a GA8 receipt for traceability.
    """
    if not os.path.isfile(path):
        raise SystemExit(f"GA8_GRAPH_PROVENANCE_RECEIPT_MISSING:{path}")

    with open(path, "rb") as fh:
        raw_bytes = fh.read()
    receipt_checksum = hashlib.sha256(raw_bytes).hexdigest()

    try:
        receipt = json.loads(raw_bytes)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"GA8_GRAPH_PROVENANCE_RECEIPT_UNPARSEABLE:{path}") from exc

    missing_fields = [field for field in REQUIRED_RECEIPT_FIELDS if field not in receipt]
    if missing_fields:
        raise SystemExit(f"GA8_GRAPH_PROVENANCE_RECEIPT_FIELDS_MISSING:{','.join(missing_fields)}")

    if receipt.get("status") != "PASS":
        raise SystemExit(f"GA8_GRAPH_PROVENANCE_RECEIPT_NOT_PASSING:{receipt.get('status')}")

    manifest = receipt.get("manifest") or {}
    for manifest_field in ("nodeTableHash", "edgeTableHash", "graphRevision"):
        if not manifest.get(manifest_field):
            raise SystemExit(f"GA8_GRAPH_PROVENANCE_MANIFEST_FIELD_MISSING:{manifest_field}")

    return {
        "receiptPath": path,
        "receiptChecksum": receipt_checksum,
        "graphRevision": receipt["graphRevision"],
        "status": receipt["status"],
        "pagerankCorrelation": receipt["pagerankCorrelation"],
        "nodeTableHash": manifest["nodeTableHash"],
        "edgeTableHash": manifest["edgeTableHash"],
        "generatedAt": receipt.get("generatedAt"),
    }


def validate_pagerank_row(source_ref: str, raw: object) -> float:
    if raw is None:
        raise SystemExit(f"GA8_PAGERANK_NULL_VALUE:{source_ref}")
    try:
        score = float(raw)
    except (TypeError, ValueError) as exc:
        raise SystemExit(f"GA8_PAGERANK_NON_NUMERIC:{source_ref}") from exc
    if not math.isfinite(score):
        raise SystemExit(f"GA8_PAGERANK_NON_FINITE:{source_ref}")
    if score < 0.0:
        raise SystemExit(f"GA8_PAGERANK_NEGATIVE:{source_ref}")
    return score


def normalize_pagerank(values: list[float]) -> tuple[list[float], bool, tuple[float, float] | None]:
    if not values:
        return [], True, None
    lo, hi = min(values), max(values)
    if hi == lo:
        return [0.0 for _ in values], True, (lo, hi)
    return [(value - lo) / (hi - lo) for value in values], False, (lo, hi)
