#!/usr/bin/env python3
"""
openspec-task-unknown-classifier-v1.py

Naive Bayes and logistic regression over the open OpenSpec tasks, used to propose
primary domains for tasks the lexicon left UNRESOLVED.

CIRCULARITY (read first): training labels are the lexicon tags from
openspec-task-domain-fanout-v1. A model trained on them learns the lexicon. Held-out
agreement therefore measures consistency with the lexicon, NOT accuracy against truth.
Only reviewer-labelled gold can give accuracy. Outputs are PROPOSALS only.

Writes new report files only. Runs in the Windows Python 3.13 environment (sklearn 1.7).
"""
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import sys
from collections import Counter

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return "sha256:" + h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--tagged", default=None, help="domain-fanout rows jsonl (default: newest)")
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    src = args.tagged or sorted(glob.glob(os.path.join(root, "docs/reports/openspec-task-domain-fanout-v1.*.jsonl")))[-1]
    rows = [json.loads(l) for l in open(src, encoding="utf-8") if l.strip()]

    def doc(r):
        return f"{r.get('change_id','')} {r.get('text','')}"

    labelled = [r for r in rows if r.get("primaryDomain")]
    unknown = [r for r in rows if not r.get("primaryDomain")]
    X_all = [doc(r) for r in labelled]
    y_all = [r["primaryDomain"] for r in labelled]

    # Classes with a single example cannot be stratified; keep them in training only.
    counts = Counter(y_all)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_all, y_all, test_size=0.2, random_state=args.seed,
        stratify=y_all if min(counts.values()) >= 2 else None)

    vec = TfidfVectorizer(lowercase=True, token_pattern=r"(?u)\b[a-z][a-z0-9_]{2,}\b",
                          min_df=2, sublinear_tf=True)
    Xtr = vec.fit_transform(X_tr)
    Xte = vec.transform(X_te)

    nb = MultinomialNB(alpha=0.5).fit(Xtr, y_tr)
    lr = LogisticRegression(max_iter=2000, C=4.0, random_state=args.seed).fit(Xtr, y_tr)

    nb_acc = float((nb.predict(Xte) == np.array(y_te)).mean())
    lr_acc = float((lr.predict(Xte) == np.array(y_te)).mean())

    # Refit on all labelled rows for the proposals.
    vec_all = TfidfVectorizer(lowercase=True, token_pattern=r"(?u)\b[a-z][a-z0-9_]{2,}\b",
                              min_df=2, sublinear_tf=True)
    XA = vec_all.fit_transform(X_all)
    nb_all = MultinomialNB(alpha=0.5).fit(XA, y_all)
    lr_all = LogisticRegression(max_iter=2000, C=4.0, random_state=args.seed).fit(XA, y_all)

    unk_docs = [doc(r) for r in unknown]
    XU = vec_all.transform(unk_docs)
    nb_pred = nb_all.predict(XU)
    nb_prob = nb_all.predict_proba(XU).max(axis=1)
    lr_pred = lr_all.predict(XU)
    lr_prob = lr_all.predict_proba(XU).max(axis=1)
    agree = int((nb_pred == lr_pred).sum())

    stem = f"openspec-task-unknown-classifier-v1.{args.stamp}"
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    p_props = os.path.join(out_dir, f"{stem}.proposals.jsonl")
    p_man = os.path.join(out_dir, f"{stem}.manifest.json")

    with open(p_props, "w", encoding="utf-8", newline="\n") as fh:
        for r, nbp, nbq, lrp, lrq in zip(unknown, nb_pred, nb_prob, lr_pred, lr_prob):
            fh.write(json.dumps({
                "id": r["id"], "change_id": r["change_id"], "rank": r.get("rank"),
                "text": r.get("text"),
                "proposal": {"nb": {"domain": str(nbp), "prob": round(float(nbq), 4)},
                             "lr": {"domain": str(lrp), "prob": round(float(lrq), 4)}},
                "status": "PROPOSAL", "canonicalAuthority": False,
                "reviewerPrimaryDomain": None,
            }, ensure_ascii=False) + "\n")

    manifest = {
        "schema": "atlas.openspec-task-unknown-classifier.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "PROPOSAL",
        "canonicalAuthority": False,
        "source": os.path.relpath(src, root).replace("\\", "/"),
        "circularity": "training labels = lexicon tags; held-out score = agreement with lexicon, NOT accuracy",
        "accuracy": "UNMEASURED against truth; needs reviewer-labelled gold",
        "counts": {"labelledRows": len(labelled), "unknownRows": len(unknown),
                   "trainClasses": len(counts), "heldOutRows": len(X_te)},
        "heldOutAgreementWithLexicon": {"naiveBayes": round(nb_acc, 4), "logisticRegression": round(lr_acc, 4)},
        "unknownPairwiseNbLrAgreement": round(agree / len(unknown), 4) if unknown else None,
        "unknownPredictedClassCounts": {"nb": dict(Counter(map(str, nb_pred)).most_common()),
                                        "lr": dict(Counter(map(str, lr_pred)).most_common())},
        "params": {"seed": args.seed, "tfidfMinDf": 2, "nbAlpha": 0.5, "lrC": 4.0},
        "outputs": {os.path.basename(p_props): sha256(p_props)},
    }
    with open(p_man, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(json.dumps({"proposals": os.path.relpath(p_props, root), "manifest": os.path.relpath(p_man, root),
                      "heldOutAgreementWithLexicon": manifest["heldOutAgreementWithLexicon"],
                      "unknownRows": len(unknown), "nbLrAgreementOnUnknown": manifest["unknownPairwiseNbLrAgreement"]},
                     indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
