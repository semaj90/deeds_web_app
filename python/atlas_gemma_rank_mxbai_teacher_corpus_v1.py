"""Capture a bounded, read-only mxbai teacher corpus for AtlasGemmaRankV1.

This intentionally captures the existing MICRO-04 frozen cohort through the live
mxbai sidecar.  The result is preparation evidence only: the sidecar exposes the
application's sigmoid-normalized score, not the underlying CrossEncoder logit, and
the cohort is not yet round-tripped through the canonical CandidateOrdinalMapV1.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
COHORT_SOURCE = ROOT / "python" / "atlas_gemma_rank_shadow_04_v1.py"
DEFAULT_ENDPOINT = "http://127.0.0.1:8099/rerank"
MODEL_ID = "mixedbread-ai/mxbai-rerank-base-v2"
SCHEMA = "atlas.gemma-rank-mxbai-teacher-corpus.v1"
WORKSPACE_REVISION = "atlas-gemma-shadow-04-cohort-v1"


def sha256_json(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def content_revision(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_cohort(path: Path) -> list[dict[str, Any]]:
    """Read only the literal COHORT assignment without importing model libraries."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        targets: list[ast.expr] = []
        value_node: ast.expr | None = None
        if isinstance(node, ast.Assign):
            targets = list(node.targets)
            value_node = node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets = [node.target]
            value_node = node.value
        if value_node is not None and any(isinstance(target, ast.Name) and target.id == "COHORT" for target in targets):
            value = ast.literal_eval(value_node)
            if not isinstance(value, list):
                raise ValueError("COHORT must be a list")
            return value
    raise ValueError(f"COHORT assignment not found in {path}")


def post_json(endpoint: str, payload: dict[str, Any], timeout: float) -> tuple[dict[str, Any], float]:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            decoded = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"mxbai sidecar HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"mxbai sidecar unavailable: {exc.reason}") from exc
    elapsed_ms = (time.perf_counter() - started) * 1000
    if not isinstance(decoded, dict):
        raise ValueError("mxbai response must be a JSON object")
    return decoded, elapsed_ms


def validate_response(response: dict[str, Any], expected_ids: list[str]) -> dict[str, Any]:
    if response.get("model_id") != MODEL_ID:
        raise ValueError(f"unexpected mxbai model_id: {response.get('model_id')!r}")
    ranked = response.get("ranked")
    if not isinstance(ranked, list) or len(ranked) != len(expected_ids):
        raise ValueError("mxbai response has incomplete ranked rows")
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for rank, item in enumerate(ranked):
        if not isinstance(item, dict) or set(item) != {"packet_key", "score"}:
            raise ValueError("mxbai response contains malformed ranked row")
        candidate_id = item["packet_key"]
        score = item["score"]
        if not isinstance(candidate_id, str) or not candidate_id:
            raise ValueError("mxbai response contains an invalid candidate id")
        if candidate_id in seen or candidate_id not in expected_ids:
            raise ValueError("mxbai response contains duplicate or unknown candidate id")
        if not isinstance(score, (int, float)) or not (0.0 <= float(score) <= 1.0):
            raise ValueError("mxbai response score is not a finite normalized value")
        seen.add(candidate_id)
        rows.append({"candidateId": candidate_id, "rank": rank, "score": float(score)})
    if seen != set(expected_ids):
        raise ValueError("mxbai response did not account for every requested candidate")
    return {
        "rows": rows,
        "batchCount": response.get("batch_count"),
        "latencyMs": response.get("latency_ms"),
        "vramPeakMb": response.get("vram_peak_mb"),
        "vramCurrentMb": response.get("vram_current_mb"),
    }


def capture(endpoint: str, timeout: float) -> dict[str, Any]:
    cohort = load_cohort(COHORT_SOURCE)
    if len(cohort) != 3 or any(len(item.get("candidates", [])) != 5 for item in cohort):
        raise ValueError("expected the bounded 3-query x 5-candidate MICRO-04 cohort")

    query_rows: list[dict[str, Any]] = []
    request_checksums: list[str] = []
    response_checksums: list[str] = []
    for item in cohort:
        candidates = [
            {
                "packet_key": candidate_id,
                "text": text,
            }
            for candidate_id, text in item["candidates"]
        ]
        payload = {
            "model": MODEL_ID,
            "query": item["query"],
            "candidates": candidates,
            "batch_size": len(candidates),
        }
        request_checksums.append(sha256_json(payload))
        response, transport_ms = post_json(endpoint, payload, timeout)
        response_checksums.append(sha256_json(response))
        validated = validate_response(response, [candidate["packet_key"] for candidate in candidates])
        by_id = {candidate["packet_key"]: candidate for candidate in candidates}
        observations = [
            {
                "candidateId": row["candidateId"],
                "sourceRevision": content_revision(by_id[row["candidateId"]]["text"]),
                "workspaceRevision": WORKSPACE_REVISION,
                "candidateText": by_id[row["candidateId"]]["text"],
                "rank": row["rank"],
                "score": row["score"],
                "scoreSemantics": "sigmoid_once_normalized",
            }
            for row in validated["rows"]
        ]
        query_rows.append(
            {
                "query": item["query"],
                "queryChecksum": sha256_json(item["query"]),
                "requestChecksum": request_checksums[-1],
                "responseChecksum": response_checksums[-1],
                "transportLatencyMs": round(transport_ms, 3),
                "sidecar": validated,
                "observations": observations,
            }
        )

    receipt = {
        "schema": SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCohort": str(COHORT_SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "endpoint": endpoint,
        "modelId": MODEL_ID,
        "cohortWorkspaceRevision": WORKSPACE_REVISION,
        "queryCount": len(query_rows),
        "candidateCount": sum(len(row["observations"]) for row in query_rows),
        "candidateIdentityQualified": False,
        "canonicalOrdinalMapProven": False,
        "rawLogitsAvailable": False,
        "scoreSemantics": "sigmoid_once_normalized",
        "distillationEligible": False,
        "distillationIneligibleReason": "LIVE_MXBAI_NORMALIZED_SCORES_CAPTURED_BUT_CANONICAL_ORDINAL_MAP_AND_RAW_LOGITS_REMAIN_UNPROVEN",
        "requestChecksums": request_checksums,
        "responseChecksums": response_checksums,
        "queries": query_rows,
    }
    receipt["receiptChecksum"] = sha256_json(receipt)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    receipt = capture(args.endpoint, args.timeout)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "queries": receipt["queryCount"],
        "candidates": receipt["candidateCount"],
        "scoreSemantics": receipt["scoreSemantics"],
        "distillationEligible": receipt["distillationEligible"],
        "receiptChecksum": receipt["receiptChecksum"],
    }, indent=2))


if __name__ == "__main__":
    main()
