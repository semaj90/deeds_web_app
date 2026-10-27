#!/usr/bin/env python3
"""Evaluation harness for the domain classifier baseline (CLASSIFICATION-GATE-01).

Read-only, no training, no DB/cache/vector writes, canonical_authority is always False.

Design rules:
  * Accuracy is only ever computed against REVIEWED gold (`reviewedGroup` set by a human). Weak labels
    (`originalLabel`) came from the classifier's own lineage, so agreement with them is reported as a
    separate, explicitly non-accuracy diagnostic.
  * Matching is probabilistic: the harness reports precision/recall, top-k recall, ECE and a confidence-floor
    sweep. It never treats a score as identity.
  * Small samples are flagged (INSUFFICIENT_SAMPLE) rather than presented as trustworthy numbers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

SCHEMA = "atlas.domain-classifier-eval.v1"
PRODUCER_REVISION = "atlas-domain-classifier-eval-v1"
MIN_PER_CLASS_FOR_TRUST = 30
MIN_TOTAL_FOR_TRUST = 200
NON_GOLD_CHOICES = frozenset({"AMBIGUOUS", "NOT_A_DOMAIN", "SKIP"})

# A predictor maps one dataset row to (label, confidence or None, ranked scores {label: score} or None).
Predictor = Callable[[dict[str, Any]], "tuple[str, Optional[float], Optional[dict[str, float]]]"]


def per_class_metrics(gold: Sequence[str], pred: Sequence[str]) -> dict[str, Any]:
    labels = sorted(set(gold) | set(pred))
    out: dict[str, dict[str, float]] = {}
    for lab in labels:
        tp = sum(1 for g, p in zip(gold, pred) if g == lab and p == lab)
        fp = sum(1 for g, p in zip(gold, pred) if g != lab and p == lab)
        fn = sum(1 for g, p in zip(gold, pred) if g == lab and p != lab)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        out[lab] = {"precision": prec, "recall": rec, "f1": f1, "support": sum(1 for g in gold if g == lab)}
    supported = [v for v in out.values() if v["support"] > 0]
    macro_f1 = sum(v["f1"] for v in supported) / len(supported) if supported else 0.0
    accuracy = sum(1 for g, p in zip(gold, pred) if g == p) / len(gold) if gold else 0.0
    return {"accuracy": accuracy, "macro_f1": macro_f1, "per_class": out}


def topk_recall(gold: Sequence[str], ranked: Sequence[Optional[dict[str, float]]], k: int) -> Optional[float]:
    scored = [(g, r) for g, r in zip(gold, ranked) if r]
    if not scored:
        return None
    hit = 0
    for g, r in scored:
        top = [lab for lab, _ in sorted(r.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]
        hit += 1 if g in top else 0
    return hit / len(scored)


def expected_calibration_error(conf: Sequence[float], correct: Sequence[bool], bins: int = 10) -> float:
    n = len(conf)
    if n == 0:
        return 0.0
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, c in enumerate(conf) if (lo <= c < hi) or (b == bins - 1 and c == 1.0)]
        if not idx:
            continue
        acc = sum(1 for i in idx if correct[i]) / len(idx)
        avg = sum(conf[i] for i in idx) / len(idx)
        ece += (len(idx) / n) * abs(acc - avg)
    return ece


def floor_sweep(conf: Sequence[float], correct: Sequence[bool], floors: Sequence[float]) -> list[dict[str, float]]:
    rows = []
    n = len(conf)
    for f in floors:
        keep = [i for i, c in enumerate(conf) if c >= f]
        rows.append({
            "floor": f,
            "coverage": len(keep) / n if n else 0.0,
            "accuracy_on_covered": (sum(1 for i in keep if correct[i]) / len(keep)) if keep else 0.0,
        })
    return rows


def _human_reviewer_id(row: dict[str, Any], *, second: bool = False) -> Optional[str]:
    keys = ("secondReviewer", "secondReviewerId", "second_reviewer") if second else ("reviewer", "reviewerId", "reviewer_id")
    value = next((row.get(key) for key in keys if row.get(key) is not None), None)
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    reviewer_tokens = normalized.casefold().replace("-", "_").replace(".", "_").split("_")
    forbidden_tokens = {"synthetic", "model", "agent", "bot", "assistant", "llm", "dspy", "classifier", "predictor"}
    if not normalized or "test" in reviewer_tokens or "not_a_human" in normalized.casefold() or any(token in forbidden_tokens for token in reviewer_tokens):
        return None
    return normalized


def _has_human_review_provenance(row: dict[str, Any], *, second: bool = False) -> bool:
    if _human_reviewer_id(row, second=second) is None:
        return False
    timestamp_keys = ("secondReviewedAt", "second_reviewed_at") if second else ("reviewedAt", "reviewed_at")
    reviewed_at = next((row.get(key) for key in timestamp_keys if row.get(key)), None)
    if not isinstance(reviewed_at, str) or not reviewed_at.strip():
        return False
    try:
        parsed_at = datetime.fromisoformat(reviewed_at.strip().replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed_at.tzinfo is not None and parsed_at.utcoffset() is not None


def evaluate(rows: list[dict[str, Any]], predictor: Predictor, *, revision_qualified_only: bool = False) -> dict[str, Any]:
    considered = [r for r in rows if not revision_qualified_only or r.get("sourceRevision")]
    # Escape-hatch labels and labels without a verified human reviewer are never gold.
    non_gold = [r for r in considered if r.get("reviewedGroup") in NON_GOLD_CHOICES]
    labeled_rows = [r for r in considered if r.get("reviewedGroup") and r.get("reviewedGroup") not in NON_GOLD_CHOICES]
    unverified_review_rows = [r for r in labeled_rows if not _has_human_review_provenance(r)]
    gold_rows = [r for r in labeled_rows if _has_human_review_provenance(r)]
    double_reviewed = [
        r for r in gold_rows
        if _has_human_review_provenance(r, second=True)
        and _human_reviewer_id(r, second=True).casefold() != _human_reviewer_id(r).casefold()
    ]
    minimum_double_review_rows = (len(gold_rows) + 9) // 10
    warnings: list[str] = []
    report: dict[str, Any] = {
        "schema": SCHEMA,
        "producerRevision": PRODUCER_REVISION,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "rowsConsidered": len(considered),
        "goldRows": len(gold_rows),
        "unverifiedReviewRows": len(unverified_review_rows),
        "doubleReviewedGoldRows": len(double_reviewed),
        "doubleReviewCoverage": len(double_reviewed) / len(gold_rows) if gold_rows else 0.0,
        "minimumDoubleReviewRows": minimum_double_review_rows,
        "reviewedNonGoldRows": dict(Counter(r["reviewedGroup"] for r in non_gold)),
        "revisionQualifiedOnly": revision_qualified_only,
        "warnings": warnings,
    }
    if not gold_rows:
        report["status"] = "NO_GOLD_LABELS"
        warnings.append("No row has a non-test human reviewer and reviewedGroup; accuracy is NOT computable. Weak-label agreement below is a diagnostic only.")
    else:
        gold = [r["reviewedGroup"] for r in gold_rows]
        preds = [predictor(r) for r in gold_rows]
        pred_labels = [p[0] for p in preds]
        confs = [p[1] for p in preds]
        m = per_class_metrics(gold, pred_labels)
        report.update({"metrics": m, "top3_recall": topk_recall(gold, [p[2] for p in preds], 3)})
        if all(c is not None for c in confs):
            correct = [g == p for g, p in zip(gold, pred_labels)]
            report["ece"] = expected_calibration_error(confs, correct)  # type: ignore[arg-type]
            report["floor_sweep"] = floor_sweep(confs, correct, [0.0, 0.3, 0.5, 0.7, 0.9])  # type: ignore[arg-type]
        else:
            report["ece"] = None
            warnings.append("Predictor returns no confidence; ECE and floor sweep skipped.")
        counts = Counter(gold)
        thin = sorted(c for c, n in counts.items() if n < MIN_PER_CLASS_FOR_TRUST)
        if len(gold_rows) < MIN_TOTAL_FOR_TRUST or thin:
            report["status"] = "INSUFFICIENT_SAMPLE"
            warnings.append(f"n={len(gold_rows)} (<{MIN_TOTAL_FOR_TRUST}) or classes below {MIN_PER_CLASS_FOR_TRUST} examples: {thin}. Numbers are not trustworthy.")
        elif len(double_reviewed) < minimum_double_review_rows:
            report["status"] = "INSUFFICIENT_REVIEWER_COVERAGE"
            warnings.append(f"double-reviewed rows={len(double_reviewed)} (<{minimum_double_review_rows}, 10% of gold rows); independent-review coverage is insufficient.")
        else:
            report["status"] = "SCORED"
    # Diagnostic, explicitly NOT accuracy: agreement with the weak label the draft was proposed from.
    weak_rows = [r for r in considered if r.get("originalLabel")]
    if weak_rows:
        agree = sum(1 for r in weak_rows if predictor(r)[0] == r["originalLabel"])
        report["weakLabelAgreementDiagnostic"] = {
            "rows": len(weak_rows),
            "agreement": agree / len(weak_rows),
            "meaning": "NOT accuracy: the weak label shares lineage with the classifier under test.",
        }
    report["inputChecksum"] = hashlib.sha256(json.dumps(considered, sort_keys=True).encode("utf-8")).hexdigest()
    return report


def rules_predictor(row: dict[str, Any]):
    """Default predictor: the existing deterministic classifier (label only, no confidence)."""
    from atlas_external_docs import classify_domain

    label = classify_domain(Path(str(row.get("sourceRef") or row.get("featureLabel") or "")).name, str(row.get("textEvidence") or ""))
    return str(label), None, None


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default="docs/reports/domain-calibration-draft-v1.jsonl")
    ap.add_argument("--report", default="docs/reports/domain-classifier-eval-baseline-v1.json")
    ap.add_argument("--revision-qualified-only", action="store_true")
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[1]
    rows = load_jsonl(root / args.input)
    report = evaluate(rows, rules_predictor, revision_qualified_only=args.revision_qualified_only)
    out = root / args.report
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report.get(k) for k in ("status", "rowsConsidered", "goldRows", "weakLabelAgreementDiagnostic", "warnings")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
