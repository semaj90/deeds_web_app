"""Shadow-only, revision-qualified candidate feature alignment.

No database access, no model promotion. Adapt real rows from existing feature producers.
Missing labels are rejected rather than manufactured from a retrieval score.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import math
from typing import Iterable, Mapping

FEATURES = (
    "exact_symbol_match", "fts_score", "semantic_similarity", "pagerank",
    "graph_distance", "hyperedge_overlap", "domain_confidence", "source_authority",
)
REVISIONS = ("source_revision", "workspace_revision", "representation_revision")

@dataclass(frozen=True)
class AlignedCandidate:
    qid: str
    candidate_key: str
    label: float
    values: tuple[float, ...]
    missing: tuple[bool, ...]
    revisions: tuple[str, ...]

def align_rows(rows: Iterable[Mapping[str, object]]) -> tuple[AlignedCandidate, ...]:
    output = []
    seen = set()
    for row in rows:
        qid, key = (str(row.get(k) or "").strip() for k in ("qid", "packet_key"))
        revs = tuple(str(row.get(k) or "").strip() for k in REVISIONS)
        if not qid or not key or not all(revs):
            raise ValueError("RANK_IDENTITY_OR_REVISION_MISSING")
        if row.get("revision_status") != "PROVEN":
            raise ValueError("RANK_REVISION_NOT_PROVEN")
        if "label" not in row or row["label"] is None:
            raise ValueError("RANK_LABEL_MISSING")
        label = float(row["label"])
        if not math.isfinite(label):
            raise ValueError("RANK_LABEL_NONFINITE")
        identity = (qid, key, *revs)
        if identity in seen:
            raise ValueError("RANK_DUPLICATE_CANDIDATE")
        seen.add(identity)
        values, missing = [], []
        for name in FEATURES:
            raw = row.get(name)
            absent = raw is None
            value = 0.0 if absent else float(raw)
            if not math.isfinite(value):
                raise ValueError("RANK_FEATURE_NONFINITE:" + name)
            values.append(value)
            missing.append(absent)
        output.append(AlignedCandidate(qid, key, label, tuple(values), tuple(missing), revs))
    return tuple(sorted(output, key=lambda x: (x.qid, x.candidate_key, x.revisions)))

def manifest_digest(rows: tuple[AlignedCandidate, ...]) -> str:
    payload = {"schema": "atlas.ranking-alignment.v1", "features": FEATURES, "rows": [
        {"qid": r.qid, "candidate": r.candidate_key, "label": r.label,
         "values": r.values, "missing": r.missing, "revisions": r.revisions}
        for r in rows
    ]}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def split_by_query(rows: tuple[AlignedCandidate, ...], *, seed: int = 42, train_fraction: float = .7, validation_fraction: float = .15):
    """Stable group partition; never split one query across partitions."""
    if not (0 < train_fraction < 1 and 0 < validation_fraction < 1 and train_fraction + validation_fraction < 1):
        raise ValueError("RANK_INVALID_SPLIT")
    groups = sorted({r.qid for r in rows}, key=lambda q: hashlib.sha256(f"{seed}:{q}".encode()).hexdigest())
    n = len(groups)
    if n < 3:
        raise ValueError("RANK_NEEDS_THREE_QUERY_GROUPS")
    ntrain = max(1, min(n-2, int(n * train_fraction)))
    nval = max(1, min(n-ntrain-1, int(n * validation_fraction)))
    sets = [set(groups[:ntrain]), set(groups[ntrain:ntrain+nval]), set(groups[ntrain+nval:])]
    return tuple(tuple(r for r in rows if r.qid in s) for s in sets)
