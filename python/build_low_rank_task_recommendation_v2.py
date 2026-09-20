#!/usr/bin/env python3
"""Advisory low-rank challenger ordering for the OpenSpec actionable workboard.

Reads docs/reports/actionable-workboard-v3.json and writes
docs/reports/low-rank-task-recommendation-v2.json, the challenger input consumed by
scripts/atlas/build-openspec-challenger-tournament-v1.mjs.

Reuses atlas_compute.low_rank.shortlist_candidate_ordinals (TANG_INSPIRED nomination);
it does not add a second low-rank implementation. The output is advisory only:
upstream execution state and the deterministic critical-path rank remain authority.

Inputs are the per-task ``featureVector`` (atlas.workboard-feature-vector.v1, WFU-09), never the
legacy scalar fields, which carry adapter defaults (estimatedMinutes=15, lowRankScore=0.5, ...).
A feature is used only when it is present on enough tasks and its basis is qualified
(OBSERVED or DERIVED; PROXY/HEURISTIC only with --include-weak-basis). Absent values are never
fabricated: a used feature's few missing cells are set to the column mean and reported.

Leakage rules: the deterministic `rank`, the placeholder `lowRankScore` and advisory selection
dispositions are not features. `goalRank` is a deterministic sort key, so it is flagged
`usedByDeterministicRank` in the report; agreement with the deterministic order should be read
with that in mind.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from atlas_compute.low_rank import shortlist_candidate_ordinals

# (feature name in featureVector.features, sign): +1 higher is better, -1 lower is better.
FEATURES: list[tuple[str, int]] = [
    ("goalRank", -1),
    ("selectionEligible", 1),
    ("sourceAgeSeconds", -1),
    ("mutationRisk", -1),
    ("prerequisiteCount", -1),
    ("evidenceReceiptCount", 1),
    ("affectedFileCount", -1),
    ("remainingRequiredGates", -1),
    ("unblocksGateCount", 1),
    ("estimatedMinutes", -1),
    ("risk", -1),
    ("evidenceReuse", 1),
    ("goalClosure", 1),
    ("cacheAffinity", 1),
    # Text-derived from the tasks.md block (scripts/atlas/derive-workboard-features-from-tasks-v1.mjs).
    ("specLineCount", -1),
    ("requiresHumanApproval", -1),
    ("schemaRisk", -1),
    ("productionRisk", -1),
    ("externalDependencyRisk", -1),
    ("downstreamBlockedCount", 1),
]
QUALIFIED_BASIS = {"OBSERVED", "DERIVED"}
MIN_PRESENT_FRACTION = 0.9
# A feature whose non-modal values cover fewer than this fraction of present tasks is effectively constant:
# distinct-value count alone would let 7 outliers among 2,298 tasks pass as "varying".
MIN_MINORITY_FRACTION = 0.01
WEAK_BASIS = {"PROXY", "HEURISTIC", "TEXT_DERIVED"}


def _display_path(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path)


def _cell(task: dict, name: str) -> dict:
    feature = ((task.get("featureVector") or {}).get("features") or {}).get(name)
    return feature if isinstance(feature, dict) else {"present": False, "value": 0, "basis": "ABSENT"}


def _select_features(tasks: list[dict], allowed_basis: set[str]) -> tuple[list[dict], list[dict]]:
    """Return (usable feature descriptors, rejected feature descriptors with reasons)."""
    usable: list[dict] = []
    rejected: list[dict] = []
    total = len(tasks)
    for name, sign in FEATURES:
        cells = [_cell(task, name) for task in tasks]
        present = [c for c in cells if c.get("present") is True]
        bases = sorted({str(c.get("basis")) for c in present})
        numeric = [float(c["value"]) for c in present if isinstance(c.get("value"), (int, float))]
        values = set(numeric)
        modal = max((numeric.count(v) for v in values), default=0)
        minority = (1 - modal / len(numeric)) if numeric else 0.0
        reason = None
        if not present:
            reason = "ABSENT_EVERYWHERE"
        elif len(present) / total < MIN_PRESENT_FRACTION:
            reason = "PRESENT_ON_TOO_FEW_TASKS"
        elif not set(bases) <= allowed_basis:
            reason = "UNQUALIFIED_BASIS:" + ",".join(sorted(set(bases) - allowed_basis))
        elif len(values) < 2:
            reason = "NO_VARIANCE"
        elif minority < MIN_MINORITY_FRACTION:
            reason = "NEAR_CONSTANT"
        entry = {"name": name, "sign": sign, "present": len(present), "basis": bases, "distinctValues": len(values), "minorityFraction": round(minority, 4)}
        if reason:
            rejected.append({**entry, "reason": reason})
        else:
            usable.append(entry)
    return usable, rejected


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=repo_root / "docs/reports/actionable-workboard-v3.json")
    parser.add_argument("--output", type=Path, default=repo_root / "docs/reports/low-rank-task-recommendation-v2.json")
    parser.add_argument("--rank", type=int, default=3)
    parser.add_argument("--seed", type=int, default=0xA71A5)
    parser.add_argument(
        "--include-weak-basis",
        action="store_true",
        help="also admit PROXY/HEURISTIC/TEXT_DERIVED-basis features (default: OBSERVED/DERIVED only)",
    )
    args = parser.parse_args()

    workboard = json.loads(args.input.read_text(encoding="utf-8"))
    tasks = workboard.get("tasks", [])
    if not tasks:
        raise SystemExit("workboard has no tasks")

    allowed_basis = set(QUALIFIED_BASIS)
    if args.include_weak_basis:
        allowed_basis |= WEAK_BASIS
    usable, rejected = _select_features(tasks, allowed_basis)
    # A low-rank ordering needs at least two varying qualified columns; with one it is just a sort on
    # that column and would masquerade as an independent challenger. Emit an explicit degenerate report
    # (no ordering) so the tournament cannot report a false comparison.
    degenerate = len(usable) < 2

    base = {
        "schema": "atlas.low-rank-task-recommendation.v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "policy": "TANG_INSPIRED_LOW_RANK_SHORTLIST",
        "advisoryOnly": True,
        "canonicalAuthority": False,
        "eligibleForAuthority": False,
        "writesPerformed": False,
        "source": {
            "file": _display_path(args.input, repo_root),
            "semanticChecksum": workboard.get("semanticChecksum"),
            "featureVectorSchema": workboard.get("featureVectorSchema"),
            "taskCount": len(tasks),
        },
        "qualifiedBasis": sorted(allowed_basis),
        "featuresUsed": [f["name"] for f in usable],
        "featuresRejected": rejected,
    }

    if degenerate:
        report = {
            **base,
            "status": "DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE",
            "reason": "Fewer than 2 qualified, varying workboard features; refusing to emit a single-feature sort as a challenger.",
            "tasks": [],
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"DEGENERATE: {len(usable)} qualified varying feature(s) {report['featuresUsed']}; wrote empty ordering")
        return 0

    columns = []
    missing_filled = {}
    for feature in usable:
        raw = np.array(
            [float(c["value"]) if c.get("present") is True else np.nan for c in (_cell(t, feature["name"]) for t in tasks)],
            dtype=np.float64,
        )
        missing = int(np.isnan(raw).sum())
        if missing:
            raw[np.isnan(raw)] = np.nanmean(raw)  # documented mean fill, never a fabricated observation
            missing_filled[feature["name"]] = missing
        std = raw.std()
        columns.append(((raw - raw.mean()) / std) * feature["sign"])  # higher is better on every column
    signed = np.stack(columns, axis=1)
    query = signed.max(axis=0)  # ideal candidate profile

    rank = min(args.rank, len(usable), len(tasks))
    ordinals = np.arange(len(tasks), dtype=np.int64)
    selected, receipt = shortlist_candidate_ordinals(
        signed.astype(np.float32),
        ordinals,
        query.astype(np.float32),
        rank=rank,
        target_count=len(tasks),
        seed=args.seed,
        device="cpu",
    )

    ordered = [
        {"id": str(tasks[ordinal].get("id")), "rank": position + 1}
        for position, ordinal in enumerate(selected)
    ]
    report = {
        **base,
        "status": "OK",
        "featuresUsedByDeterministicRank": [
            f["name"] for f in usable if f["name"] == "goalRank"
        ],
        "missingCellsMeanFilled": missing_filled,
        "targetRank": rank,
        "receipt": receipt.to_dict(),
        "tasks": ordered,
    }
    report["outputChecksum"] = "sha256:" + hashlib.sha256(
        json.dumps(ordered, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {args.output} tasks={len(ordered)} features={report['featuresUsed']} rank={rank} "
        f"checksum={report['outputChecksum'][:19]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
