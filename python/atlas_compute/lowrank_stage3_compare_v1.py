"""LOWRANK-NORM-01 stage 3: compare the low-rank normalized scorer against the GEMM baseline on a shared fixture.

Descriptive CPU report, not a quality claim: there are no reviewed golden labels, so nothing here says a rank is
"good enough". Hard gates are algebraic identities only. No GPU, no database, no persistence beyond an optional
report file.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from atlas_compute import lowrank_tile_projection_v1 as lr
from atlas_compute.low_rank_feature_scorer import FEATURE_NAMES, LowRankFeatureScorer
from atlas_compute.candidate_concept_tile_v1 import stable_top_k

FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "rank_tile_parity_v1.json"
FIT_PARAMS = {"generator": "synthetic-correlated-6ch", "rows": 240, "seed": 7, "present_rate": 0.85}


def synthetic_fit(params=FIT_PARAMS):
    rng = np.random.default_rng(params["seed"])
    n = params["rows"]
    base = rng.normal(size=(n, 3))
    x = base @ rng.normal(size=(3, 6)) + 0.3 * rng.normal(size=(n, 6)) + np.array([1.0, 2.0, -0.5, 0.2, 3.0, 0.0])
    present = (rng.random((n, 6)) < params["present_rate"]).astype(float)
    return np.where(present == 1, x, 0.0), present


def fit_set_digest(params=FIT_PARAMS) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()


def kendall_tau_b(a, b) -> float:
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    conc = disc = ta = tb = 0
    for i in range(len(a)):
        for j in range(i + 1, len(a)):
            da, db = np.sign(a[i] - a[j]), np.sign(b[i] - b[j])
            if da == 0 and db == 0:
                continue
            if da == 0:
                ta += 1
            elif db == 0:
                tb += 1
            elif da == db:
                conc += 1
            else:
                disc += 1
    denom = np.sqrt((conc + disc + ta) * (conc + disc + tb))
    return float((conc - disc) / denom) if denom else 1.0


def pair_changes(base, proj, tol=1e-12):
    """Discordant pairs (strictly opposite order) and pairs whose tie status changed."""
    disc = tie_changed = 0
    for i in range(len(base)):
        for j in range(i + 1, len(base)):
            sb = 0 if abs(base[i] - base[j]) <= tol else np.sign(base[i] - base[j])
            sp = 0 if abs(proj[i] - proj[j]) <= tol else np.sign(proj[i] - proj[j])
            if sb != 0 and sp != 0 and sb != sp:
                disc += 1
            elif (sb == 0) != (sp == 0):
                tie_changed += 1
    return int(disc), int(tie_changed)


def overlap_at(base_order, proj_order, k) -> float:
    return len(set(base_order[:k]) & set(proj_order[:k])) / float(k)


# S3-5 mapping from the 6 tile channels into the challenger's 8-feature contract. Only channels with an unambiguous
# meaning are mapped; astAffinity (the challenger wants a DISTANCE), lexical rank direction aside, and
# executionUtility have no safe counterpart, and freshness / retrieval_uncertainty / cache_residency are not tile
# channels at all. Unmapped challenger inputs are set to their calibration mean (normalized 0).
NONLINEAR_CHANNEL_MAP = {
    "semanticRelevance": "dense_similarity",
    "lexicalRelevance": "lexical_rank",
    "personalizedPageRank": "pagerank",
    "domainAffinity": "domain_confidence",
}


def nonlinear_challenger(x, p, ordinals, baseline, mu, d):
    """Fixed-init (UNTRAINED) 2-layer GELU scorer on the mapped channels. Descriptive reordering only."""
    n = len(ordinals)
    idx = {name: lr.CHANNEL_NAMES.index(src) for src, name in NONLINEAR_CHANNEL_MAP.items()}
    mu8 = [0.0] * len(FEATURE_NAMES)
    sd8 = [1.0] * len(FEATURE_NAMES)
    for src, name in NONLINEAR_CHANNEL_MAP.items():
        j = FEATURE_NAMES.index(name)
        mu8[j], sd8[j] = mu[lr.CHANNEL_NAMES.index(src)], d[lr.CHANNEL_NAMES.index(src)]
    scorer = LowRankFeatureScorer(mu=mu8, sigma=sd8)
    scores = []
    for i in range(n):
        raw = list(mu8)                                   # unmapped inputs sit at their calibration mean
        for name, c in idx.items():
            raw[FEATURE_NAMES.index(name)] = float(x[i][c])   # raw_zero policy: missing channels keep raw 0
        scores.append(scorer.score_single(scorer.normalize(raw)))
    order = stable_top_k(scores, ordinals, n)
    base_order = stable_top_k(baseline, ordinals, n)
    disc, tie_changed = pair_changes(baseline, scores, tol=1e-9)
    return {
        "trainedWeights": False, "weightInit": "deterministic Xavier-like (not fitted)", "scoreRounding": "6 decimals",
        "channelMap": NONLINEAR_CHANNEL_MAP, "channelsUsed": len(NONLINEAR_CHANNEL_MAP),
        "unmappedChallengerInputs": [n_ for n_ in FEATURE_NAMES if n_ not in NONLINEAR_CHANNEL_MAP.values()],
        "top5Overlap": overlap_at(base_order, order, 5), "top10Overlap": overlap_at(base_order, order, min(10, n)),
        "kendallTauB": kendall_tau_b(baseline, scores), "discordantPairs": disc, "tieStatusChangedPairs": tie_changed,
        "topKOrdinals": [ordinals[i] for i in order[:5]],
        "note": "Untrained challenger: this measures how a fixed-init nonlinear scorer reorders the baseline, NOT quality.",
    }


def load_fixture(path=FIXTURE):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    n = len(d["candidateOrdinals"])
    x = np.array(d["tileFeatures"]).reshape(-1, 6)[:n]
    p = np.array(d["tilePresent"]).reshape(-1, 6)[:n].astype(float)
    return d, x, p


def compare(path=FIXTURE):
    d, x, p = load_fixture(path)
    w = np.array(d["headWeightsByChannel"], dtype=np.float64)
    bias = float(d["headBias"])
    ordinals = list(d["candidateOrdinals"])
    n = len(ordinals)
    baseline = bias + x @ w                                  # float64 recomputation of the TS GEMM head
    ts_scores = np.array(d["scores"])
    base_order = stable_top_k(baseline, ordinals, n)

    def curve(fx, fp, digest, policy):
        rows = []
        for r in (6, 5, 4, 3, 2, 1):
            proj = lr.fit_lowrank_projection(fx, fp, r, digest, missing_policy=policy)
            d_arr, w_mat = np.array(proj.d), np.array(proj.w)
            v = w_mat.T @ (d_arr * w)                        # best head inside the rank-r subspace (normalized space)
            scores = lr.head_scores(lr.project(proj, x, p), v, bias)
            order = stable_top_k(scores, ordinals, n)
            disc, tie_changed = pair_changes(baseline, scores)
            row = {
                "rank": r, "projectionChecksum": proj.projection_checksum,
                "top5Overlap": overlap_at(base_order, order, 5), "top10Overlap": overlap_at(base_order, order, min(10, n)),
                "kendallTauB": kendall_tau_b(baseline, scores), "discordantPairs": disc, "tieStatusChangedPairs": tie_changed,
                "topKOrdinals": [ordinals[i] for i in order[:5]],
                "reconstructionError": lr.reconstruction_error(proj, x, p),
            }
            if r == 6:
                const = np.array([lr.presence_dependent_constant(proj, v, p[i]) for i in range(n)])
                row["identityMaxAbsError"] = float(np.max(np.abs(scores - (baseline + const))))
                row["presenceConstantRange"] = [float(const.min()), float(const.max())]
            rows.append(row)
        return rows

    sx, sp = synthetic_fit()
    fixture_digest = "sha256:" + hashlib.sha256(json.dumps({"fit": "fixture-rows", "ordinalMap": d["ordinalMapChecksum"]}, sort_keys=True).encode()).hexdigest()
    curves = {
        policy: {
            "fitSynthetic": {"fitSetDigest": fit_set_digest(), "fitSetParams": FIT_PARAMS, "rankCurve": curve(sx, sp, fit_set_digest(), policy)},
            "fitOnFixtureRows": {"fitSetDigest": fixture_digest, "fitSetParams": {"generator": "fixture-rows", "rows": n},
                                 "rankCurve": curve(x, p, fixture_digest, policy)},
        }
        for policy in lr.MISSING_POLICIES
    }
    fit_proj = lr.fit_lowrank_projection(x, p, 6, fixture_digest, missing_policy=lr.DEFAULT_MISSING_POLICY)
    challenger = nonlinear_challenger(x, p, ordinals, baseline, fit_proj.mu, fit_proj.d)
    return {
        "schema": "atlas.lowrank-norm-stage3-report.v1", "canonicalAuthority": False, "writesPerformed": False, "gpuExecuted": False,
        "fixtureOrdinalMapChecksum": d["ordinalMapChecksum"], "candidateCount": n,
        "fullyPresentRows": int((p.sum(axis=1) == 6).sum()),
        "baselineVsTsMaxAbsDiff": float(np.max(np.abs(baseline - ts_scores))),
        "baselineTopK": [ordinals[i] for i in base_order[:5]], "curves": curves,
        "decidedMissingPolicy": lr.DEFAULT_MISSING_POLICY,
        "nonlinearChallenger": challenger,
        "note": "Descriptive only. No reviewed golden labels exist, so no quality pass/fail is claimed.",
    }


if __name__ == "__main__":
    report = compare()
    out = Path(__file__).resolve().parents[2] / "docs" / "reports" / "lowrank-norm-stage3-v1.json"
    out.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {out}")
