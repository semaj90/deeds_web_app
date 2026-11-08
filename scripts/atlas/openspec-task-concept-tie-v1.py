#!/usr/bin/env python3
"""
openspec-task-concept-tie-v1.py

Ties each open task's CONCEPT TOPIC to its FEATURE LABEL.

  concept topic  = the task's Louvain community label + its primary taxonomy domain
  feature_label  = the section header proposed by openspec-task-alignment-v1
  tie            = token overlap (Jaccard) between the two, over meaningful tokens

Tasks that do not tie are classified UNKNOWN. Then naive Bayes and logistic regression
(scikit-learn, Windows Python 3.13) propose a concept topic for each UNKNOWN task.

CIRCULARITY: the concept topic comes from the same TF-IDF kNN graph and lexicon as the
ranking. The classifiers learn those labels, so their held-out score measures consistency,
not accuracy. Every output is PROPOSAL, canonicalAuthority false.

Writes new report files only.
"""
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB

STOP = set("""a an and are as at be by for from has have in into is it its of on or that the this to with
will was were when which who not no but if then than so such can each per via use using based any all
task tasks add new make ensure keep do does done open section""".split())
TOK = re.compile(r"[a-z][a-z0-9_]{2,}")
JACCARD_MIN = 0.15


def toks(s):
    return {w for w in TOK.findall((s or "").lower()) if w not in STOP}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return "sha256:" + h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--fused", default=None)
    ap.add_argument("--alignment", default=None)
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    fused_p = args.fused or sorted(glob.glob(os.path.join(root, "docs/reports/openspec-task-rank-fuse-v1.*.jsonl")))[-1]
    ali_p = args.alignment or sorted(glob.glob(os.path.join(root, "docs/reports/openspec-task-alignment-v1.*.rows.jsonl")))[-1]
    fused = [json.loads(l) for l in open(fused_p, encoding="utf-8") if l.strip()]
    ali = {}
    for l in open(ali_p, encoding="utf-8"):
        if l.strip():
            r = json.loads(l)
            ali[r["id"]] = r

    rows = []
    for t in fused:
        a = ali.get(t["id"], {})
        topic_label = t.get("communityLabel", "")
        primary = t.get("primaryDomain") or ""
        concept = f"{primary} {topic_label}".strip()
        fl = a.get("feature_label", "")
        cs, fs = toks(concept), toks(fl)
        inter = cs & fs
        union = cs | fs
        jac = (len(inter) / len(union)) if union else 0.0
        tied = bool(inter) and jac >= JACCARD_MIN
        rows.append({
            "id": t["id"], "rank": t["rank"], "change_id": t["change_id"], "task_code": t.get("task_code"),
            "featureLabel": fl, "conceptTopic": concept, "primaryDomain": primary or None,
            "community": t.get("community"), "communityLabel": topic_label,
            "sharedTokens": sorted(inter), "jaccard": round(jac, 4),
            "tie": "TIED" if tied else "UNKNOWN",
            "text": t.get("text", ""),
        })

    tied_rows = [r for r in rows if r["tie"] == "TIED"]
    unk_rows = [r for r in rows if r["tie"] == "UNKNOWN"]

    # NB + LR on UNKNOWN rows: learn the concept topic (community id) from text of TIED rows.
    def doc(r):
        return f"{r['featureLabel']} {r['text']}"

    proposals = {}
    held = {}
    if tied_rows and unk_rows:
        y = [str(r["community"]) for r in tied_rows]
        X = [doc(r) for r in tied_rows]
        counts = Counter(y)
        strat = y if min(counts.values()) >= 2 else None
        Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=args.seed, stratify=strat)
        vec = TfidfVectorizer(token_pattern=r"(?u)\b[a-z][a-z0-9_]{2,}\b", min_df=2, sublinear_tf=True)
        A = vec.fit_transform(Xtr)
        nb = MultinomialNB(alpha=0.5).fit(A, ytr)
        lr = LogisticRegression(max_iter=2000, C=4.0, random_state=args.seed).fit(A, ytr)
        Bt = vec.transform(Xte)
        held = {"naiveBayes": round(float((nb.predict(Bt) == np.array(yte)).mean()), 4),
                "logisticRegression": round(float((lr.predict(Bt) == np.array(yte)).mean()), 4),
                "heldOutRows": len(yte)}
        vec_all = TfidfVectorizer(token_pattern=r"(?u)\b[a-z][a-z0-9_]{2,}\b", min_df=2, sublinear_tf=True)
        XA = vec_all.fit_transform(X)
        nb_all = MultinomialNB(alpha=0.5).fit(XA, y)
        lr_all = LogisticRegression(max_iter=2000, C=4.0, random_state=args.seed).fit(XA, y)
        XU = vec_all.transform([doc(r) for r in unk_rows])
        nbp, lrp = nb_all.predict(XU), lr_all.predict(XU)
        nbq, lrq = nb_all.predict_proba(XU).max(axis=1), lr_all.predict_proba(XU).max(axis=1)
        for r, a, b, qa, qb in zip(unk_rows, nbp, lrp, nbq, lrq):
            proposals[r["id"]] = {"nbCommand": int(a), "nbProb": round(float(qa), 4),
                                  "lrCommunity": int(b), "lrProb": round(float(qb), 4)}

    stem = f"openspec-task-concept-tie-v1.{args.stamp}"
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    p_rows = os.path.join(out_dir, f"{stem}.rows.jsonl")
    p_man = os.path.join(out_dir, f"{stem}.manifest.json")
    with open(p_rows, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            r["unknownProposal"] = proposals.get(r["id"])
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    agree = sum(1 for p in proposals.values() if p["nbCommand"] == p["lrCommunity"])
    manifest = {
        "schema": "atlas.openspec-task-concept-tie.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "PROPOSAL", "canonicalAuthority": False,
        "sources": {"fused": os.path.relpath(fused_p, root).replace(chr(92), "/"),
                    "alignment": os.path.relpath(ali_p, root).replace(chr(92), "/")},
        "rule": {"tokens": "meaningful lowercase tokens, stopwords removed",
                 "concept": "primaryDomain + Louvain community label",
                 "featureLabel": "section header from alignment rows",
                 "tie": f"shared tokens and Jaccard >= {JACCARD_MIN}"},
        "counts": {"tasks": len(rows), "tied": len(tied_rows), "unknown": len(unk_rows),
                   "tiedPct": round(100.0 * len(tied_rows) / len(rows), 2) if rows else 0.0},
        "classifierHeldOutOnTied": held,
        "unknownProposalsWritten": len(proposals),
        "unknownNbLrAgreement": round(agree / len(proposals), 4) if proposals else None,
        "circularity": "concept topic and lexicon come from the same graph/lexicon; classifier scores measure consistency, not accuracy",
        "outputs": {os.path.basename(p_rows): sha256(p_rows)},
    }
    with open(p_man, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(json.dumps({"counts": manifest["counts"], "heldOut": held,
                      "rows": os.path.relpath(p_rows, root), "manifest": os.path.relpath(p_man, root)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
