"""Symbol-level Multinomial Naive Bayes classification lane (proposal-only, read-only, pure).

Built from existing parts, no new owner of any capability:
  * sklearn MultinomialNB, the same estimator family as python/train_domain_classifier.py (domain-level NB + LR).
  * Human-label trust rules imported from python/atlas_domain_classifier_eval_v1.py (reviewer provenance, NON_GOLD_CHOICES,
    200-row / 30-per-class floors). A row the evaluator would not count as gold is never trained on.
  * Three-way confidence gate mirroring scripts/atlas/lib/domain-classification-dag-v1.mjs (accept 0.85 / reject 0.4).
  * Leakage stripping mirroring the DAG's LEAKAGE_FIELDS: identity and revision fields are never features.

Target: domain_class (the reviewed taxonomy) per symbol. It does not decide symbol kind (the AST does), identity, or relations.
Outputs are proposals: humanLabel=False, canonicalAuthority=False, writesPerformed=False. A model prediction is never gold.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Callable, Iterable, Optional, Sequence

from atlas_domain_classifier_eval_v1 import (
    MIN_PER_CLASS_FOR_TRUST,
    MIN_TOTAL_FOR_TRUST,
    NON_GOLD_CHOICES,
    _has_human_review_provenance,
)

SCHEMA = "atlas.symbol-nb-proposal.v1"
LANE_REVISION = "atlas-symbol-nb-lane-v1"
ACCEPT_THRESHOLD = 0.85
REJECT_THRESHOLD = 0.4
LEAKAGE_FIELDS = frozenset(
    {"packet_key", "packetKey", "source_ref", "sourceRef", "source_revision", "sourceRevision", "workspace_revision",
     "workspaceRevision", "content_hash", "contentHash", "stable_symbol_id", "stableSymbolId", "symbol_version_id", "symbolVersionId"}
)

_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


class InsufficientTrustedLabels(ValueError):
    """Raised instead of training on labels that are not human-reviewed gold at the evaluator's floors."""


def subwords(identifier: str) -> list[str]:
    parts: list[str] = []
    for chunk in re.split(r"[^A-Za-z0-9]+", identifier):
        for piece in _CAMEL.split(chunk):
            piece = piece.lower()
            if piece and not piece.isdigit():
                parts.append(piece)
    return parts


def symbol_tokens(record: dict[str, Any]) -> list[str]:
    """Bag of tokens from name sub-words, kind, import-specifier segments and path-derived segments. Identity fields are ignored.

    Path-derived tokens are FEATURES only; the label always comes from a human reviewer, never from a path rule.
    """
    tokens: list[str] = []
    for key in ("name", "qualifiedName", "qualified_name"):
        if isinstance(record.get(key), str):
            tokens += [f"n:{w}" for w in subwords(record[key])]
    if isinstance(record.get("kind"), str):
        tokens.append(f"k:{record['kind']}")
    for spec in record.get("importSpecifiers", []) or []:
        tokens += [f"i:{w}" for w in subwords(str(spec))]
    path = record.get("directoryPath") or record.get("directory_path")
    if isinstance(path, str):
        tokens += [f"d:{w}" for seg in path.split("/") for w in subwords(seg)]
    for key in LEAKAGE_FIELDS:
        record.get(key)  # explicitly never read into tokens
    return tokens


def trusted_gold(rows: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Rows the evaluator itself would count as human-reviewed gold, plus a disposition report. No row is silently dropped."""
    gold, report = [], {"nonGold": 0, "unreviewedOrUnverified": 0, "gold": 0}
    for row in rows:
        label = row.get("reviewedGroup")
        if not label:
            report["unreviewedOrUnverified"] += 1
        elif label in NON_GOLD_CHOICES:
            report["nonGold"] += 1
        elif not _has_human_review_provenance(row):
            report["unreviewedOrUnverified"] += 1
        else:
            gold.append(row)
    report["gold"] = len(gold)
    return gold, report


def group_split(rows: Sequence[dict[str, Any]], group_of: Callable[[dict[str, Any]], str], validation_percent: int = 20) -> tuple[list[dict], list[dict]]:
    """Deterministic split by group (e.g. the symbol's file) so one file never sits on both sides."""
    train, valid = [], []
    for row in rows:
        bucket = int(hashlib.sha256(group_of(row).encode("utf-8")).hexdigest()[:8], 16) % 100
        (valid if bucket < validation_percent else train).append(row)
    return train, valid


def fit(rows: Sequence[dict[str, Any]], *, mechanics_only: bool = False, alpha: float = 1.0) -> dict[str, Any]:
    """Fit MultinomialNB on trusted gold. Refuses below the evaluator's floors unless mechanics_only (then trustedForScoring=False)."""
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.naive_bayes import MultinomialNB

    gold, disposition = trusted_gold(rows)
    counts: dict[str, int] = {}
    for row in gold:
        counts[row["reviewedGroup"]] = counts.get(row["reviewedGroup"], 0) + 1
    thin = sorted(c for c, n in counts.items() if n < MIN_PER_CLASS_FOR_TRUST)
    trusted = len(gold) >= MIN_TOTAL_FOR_TRUST and not thin and len(counts) >= 2
    if not trusted and not mechanics_only:
        raise InsufficientTrustedLabels(
            f"gold={len(gold)} (need {MIN_TOTAL_FOR_TRUST}), classes below {MIN_PER_CLASS_FOR_TRUST}: {thin}, classes={len(counts)}; disposition={disposition}"
        )
    if len(counts) < 2:
        raise InsufficientTrustedLabels("need at least 2 reviewed classes")
    vec = CountVectorizer(analyzer=lambda record: symbol_tokens(record), lowercase=False)
    x = vec.fit_transform(gold)
    y = [row["reviewedGroup"] for row in gold]
    nb = MultinomialNB(alpha=alpha).fit(x, y)
    digest = hashlib.sha256(
        json.dumps({"classes": list(nb.classes_), "vocab": sorted(vec.vocabulary_), "prior": [round(float(v), 12) for v in nb.class_log_prior_],
                    "fl": [[round(float(v), 12) for v in r] for r in nb.feature_log_prob_]}, sort_keys=True).encode("utf-8")
    ).hexdigest()
    return {"vectorizer": vec, "nb": nb, "classes": list(nb.classes_), "trainedRows": len(gold), "classCounts": counts, "disposition": disposition,
            "trustedForScoring": trusted, "alpha": alpha, "modelDigest": f"sha256:{digest}", "laneRevision": LANE_REVISION}


def _posterior(model: dict[str, Any], record: dict[str, Any]) -> dict[str, float]:
    probs = model["nb"].predict_proba(model["vectorizer"].transform([record]))[0]
    return {c: float(p) for c, p in zip(model["classes"], probs)}


def predict(model: dict[str, Any], record: dict[str, Any], *, accept: float = ACCEPT_THRESHOLD, reject: float = REJECT_THRESHOLD) -> dict[str, Any]:
    """Proposal with a three-way gate. A bag with no known token gets the prior only, so it is reported as NO_KNOWN_TOKENS and abstains."""
    tokens = [t for t in symbol_tokens(record) if t in model["vectorizer"].vocabulary_]
    post = _posterior(model, record)
    ranked = sorted(post.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    top, p = ranked[0]
    decision = "ABSTAIN_NO_KNOWN_TOKENS" if not tokens else "PROPOSE" if p >= accept else "REVIEW" if p >= reject else "ABSTAIN_LOW_CONFIDENCE"
    return {"schema": SCHEMA, "laneRevision": LANE_REVISION, "modelDigest": model["modelDigest"], "trustedForScoring": model["trustedForScoring"],
            "decision": decision, "proposedDomain": top if decision in ("PROPOSE", "REVIEW") else None, "probability": round(p, 6),
            "ranked": [{"domain": d, "probability": round(v, 6)} for d, v in ranked], "knownTokens": len(tokens),
            "humanLabel": False, "canonicalAuthority": False, "writesPerformed": False}


def rank_candidates(model: dict[str, Any], importer: dict[str, Any], candidates: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Order AMBIGUOUS import/definition candidates by domain agreement with the importer. It ranks for a reviewer; it never admits
    a candidate, never resolves an ambiguity, and never replaces exact source_ref/source_revision/byte-span evidence."""
    base = _posterior(model, importer)
    scored = []
    for index, cand in enumerate(candidates):
        post = _posterior(model, cand)
        scored.append({"candidateIndex": index, "agreement": round(sum(base[c] * post[c] for c in base), 6)})
    scored.sort(key=lambda s: (-s["agreement"], s["candidateIndex"]))
    return {"schema": "atlas.symbol-nb-candidate-ranking.v1", "ranked": scored, "admitsCandidate": False, "resolvesAmbiguity": False,
            "trustedForScoring": model["trustedForScoring"], "canonicalAuthority": False, "writesPerformed": False}
