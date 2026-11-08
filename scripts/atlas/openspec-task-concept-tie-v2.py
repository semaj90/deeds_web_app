#!/usr/bin/env python3
"""
openspec-task-concept-tie-v2.py

Concept tie v2 with explicit lanes, OKF keyword-corpus integration, and NB/LR
inferred proposals on unresolved rows. Read-only; writes new report files only.

Lanes (one per row, never mixed):
  EXACT_CANONICAL          multi-word or specific technical concept phrase / source_ref match
  EXACT_ALIAS              a non-generic domain alias appears in the task text (longest match first)
  COARSE_DOMAIN_LEXICAL    single-word coarse domain hit (e.g. retrieval, graph, database, cache)
  GENERIC_ALIAS_EXCLUDED   the only matching term is generic (GENERIC_TERMS) or meta/predicate
  UNKNOWN                  no lane matched; carries a structured reason (JSONB)

All non-exact rows (COARSE_DOMAIN_LEXICAL, GENERIC_ALIAS_EXCLUDED, UNKNOWN) receive
a non-canonical `proposal` JSONB object from MultinomialNB + LogisticRegression
trained on the deterministic EXACT_CANONICAL + EXACT_ALIAS ties (`authority: inferred_only`).
Implemented in pure Python + NumPy + PyYAML (zero sklearn dependency).
"""
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

import numpy as np
import yaml

# Standalone 1-word terms too generic to identify a specific concept topic.
GENERIC_TERMS = {
    "domain", "type", "code", "data", "model", "file", "system", "service", "layer", "lane",
    "source", "index", "packet", "card", "page", "route", "agent", "workflow", "module", "concept",
    "state", "table", "query", "check", "audit", "schema", "client", "server",
    "alias", "instance", "category", "capability", "operation", "protocol", "artifact", "relationship",
}

# Single-word coarse domain names that are valid high-level domains but too broad for exact concept ties.
COARSE_SINGLE_WORD_DOMAINS = {
    "retrieval", "database", "graph", "cache", "auth", "network", "documentation",
    "frontend", "compiler", "devops", "gpu", "testing", "security", "storage",
    "search", "postgres", "docs", "topology", "embedding", "inference", "pipeline", "programming",
}

FILE_PATH_RE = re.compile(
    r"`((?:sveltekit-frontend|scripts|python|services|packages|native|simd-bridge|\.okf|openspec|docs)/[A-Za-z0-9_./-]+)`"
)
TASK_CODE_RE = re.compile(r"\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+)\b")
TOKEN_RE = re.compile(r"\b[a-z][a-z0-9_]{2,}\b")


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return "sha256:" + h.hexdigest()


def load_catalogs(root):
    seed_path = os.path.join(root, "docs/reports/concept-seed-dry-v1.json")
    seed = json.load(open(seed_path, encoding="utf-8"))

    collision_terms = {"retrieval", "database", "graph"}

    exact_canonical = {}   # multi-token or specific technical phrase -> conceptId
    exact_alias = {}       # specific alias -> conceptId
    coarse_domain = {}     # single-word coarse domain -> conceptId
    meta_or_predicate = {} # excluded schema/predicate terms -> conceptId
    source_ref_map = {}    # repo relative path -> conceptId

    for p in seed["proposals"]:
        cid = p["conceptId"]
        ns = p.get("namespace", "")
        k = norm(p.get("canonicalLabel", ""))
        if ns in ("meta", "predicate"):
            if len(k) >= 3:
                meta_or_predicate.setdefault(k, cid)
            continue

        if len(k) >= 4:
            if len(k.split()) >= 2 and k not in GENERIC_TERMS:
                exact_canonical.setdefault(k, cid)
            elif k in COARSE_SINGLE_WORD_DOMAINS:
                coarse_domain.setdefault(k, cid)
            elif k in GENERIC_TERMS:
                meta_or_predicate.setdefault(k, cid)
            else:
                exact_canonical.setdefault(k, cid)

        for a in p.get("aliases", []) or []:
            ka = norm(a)
            if len(ka) < 3:
                continue
            if len(ka.split()) >= 2 and not (set(ka.split()) <= GENERIC_TERMS):
                exact_alias.setdefault(ka, cid)
            elif ka in COARSE_SINGLE_WORD_DOMAINS:
                coarse_domain.setdefault(ka, cid)
            elif ka in GENERIC_TERMS:
                meta_or_predicate.setdefault(ka, cid)
            else:
                exact_alias.setdefault(ka, cid)

    kw_path = os.path.join(root, ".okf/corpora/keyword-corpus.yaml")
    if os.path.exists(kw_path):
        kw_doc = yaml.safe_load(open(kw_path, encoding="utf-8"))
        for entry in kw_doc.get("entries", []) or []:
            cid = f"concept:okf:{entry['id']}"
            for sref in entry.get("source_refs", []) or []:
                if not sref.startswith("http"):
                    source_ref_map.setdefault(sref.replace("\\", "/"), cid)
            for term in entry.get("terms", []) or []:
                kt = norm(term)
                if len(kt) < 4:
                    continue
                if len(kt.split()) >= 2 and not (set(kt.split()) <= GENERIC_TERMS):
                    exact_canonical.setdefault(kt, cid)
                elif kt not in GENERIC_TERMS and kt not in COARSE_SINGLE_WORD_DOMAINS and len(kt) >= 5:
                    exact_canonical.setdefault(kt, cid)

    return {
        "exact_canonical": exact_canonical,
        "exact_alias": exact_alias,
        "coarse_domain": coarse_domain,
        "meta_or_predicate": meta_or_predicate,
        "source_ref_map": source_ref_map,
        "collision_terms": collision_terms,
    }


def sort_hits(hits):
    return sorted(hits, key=lambda x: (-len(x[0].split()), -len(x[0]), x[0], x[1]))


def build_tfidf_matrix(texts, min_df=2, max_features=8000):
    N = len(texts)
    doc_tokens = []
    df_counts = Counter()
    for t in texts:
        toks = TOKEN_RE.findall(t.lower())
        bigrams = [f"{toks[i]}_{toks[i+1]}" for i in range(len(toks) - 1)]
        all_t = toks + bigrams
        doc_tokens.append(all_t)
        for u in set(all_t):
            df_counts[u] += 1

    vocab_items = [w for w, c in df_counts.items() if c >= min_df]
    vocab_items.sort(key=lambda w: (-df_counts[w], w))
    vocab_items = vocab_items[:max_features]
    vocab = {w: i for i, w in enumerate(vocab_items)}
    V = len(vocab)

    idf = np.zeros(V, dtype=np.float32)
    for w, i in vocab.items():
        idf[i] = np.log((1.0 + N) / (1.0 + df_counts[w])) + 1.0

    X = np.zeros((N, V), dtype=np.float32)
    for row_idx, toks in enumerate(doc_tokens):
        counts = Counter(t for t in toks if t in vocab)
        if not counts:
            continue
        for w, c in counts.items():
            col = vocab[w]
            X[row_idx, col] = (1.0 + np.log(float(c))) * idf[col]
        norm_val = np.linalg.norm(X[row_idx])
        if norm_val > 1e-8:
            X[row_idx] /= norm_val
    return X


def stratified_split(indices, labels, test_ratio=0.2, seed=42):
    rng = np.random.default_rng(seed)
    by_class = defaultdict(list)
    for idx, lbl in zip(indices, labels):
        by_class[lbl].append(idx)
    train_idx, test_idx = [], []
    for lbl in sorted(by_class.keys()):
        arr = list(by_class[lbl])
        rng.shuffle(arr)
        n_te = max(1, int(round(len(arr) * test_ratio))) if len(arr) >= 2 else 0
        test_idx.extend(arr[:n_te])
        train_idx.extend(arr[n_te:])
    return np.array(train_idx, dtype=np.int64), np.array(test_idx, dtype=np.int64)


def fit_predict_nb(X_tr, y_tr, classes, X_eval, alpha=0.5):
    C = len(classes)
    V = X_tr.shape[1]
    class_to_i = {c: i for i, c in enumerate(classes)}
    feature_count = np.zeros((C, V), dtype=np.float64)
    class_count = np.zeros(C, dtype=np.float64)
    for row, lbl in zip(X_tr, y_tr):
        ci = class_to_i[lbl]
        feature_count[ci] += row
        class_count[ci] += 1.0
    smoothed_fc = feature_count + alpha
    smoothed_cc = smoothed_fc.sum(axis=1, keepdims=True)
    feature_log_prob = np.log(smoothed_fc) - np.log(smoothed_cc)
    class_log_prior = np.log(class_count / class_count.sum())

    jll = X_eval @ feature_log_prob.T + class_log_prior
    jll_max = jll.max(axis=1, keepdims=True)
    exp_jll = np.exp(jll - jll_max)
    probs = exp_jll / exp_jll.sum(axis=1, keepdims=True)
    return probs


def fit_predict_lr(X_tr, y_tr, classes, X_eval, C_reg=4.0, epochs=250, lr=1.5):
    N, V = X_tr.shape
    K = len(classes)
    class_to_i = {c: i for i, c in enumerate(classes)}
    Y = np.zeros((N, K), dtype=np.float32)
    for idx, lbl in enumerate(y_tr):
        Y[idx, class_to_i[lbl]] = 1.0

    W = np.zeros((V, K), dtype=np.float32)
    b = np.zeros(K, dtype=np.float32)
    l2 = 1.0 / (C_reg * max(1, N))

    for ep in range(epochs):
        logits = X_tr @ W + b
        logits -= logits.max(axis=1, keepdims=True)
        exp_l = np.exp(logits)
        P = exp_l / exp_l.sum(axis=1, keepdims=True)
        diff = (P - Y) / float(N)
        grad_W = X_tr.T @ diff + l2 * W
        grad_b = diff.sum(axis=0)
        step = lr / (1.0 + 0.005 * ep)
        W -= step * grad_W
        b -= step * grad_b

    eval_logits = X_eval @ W + b
    eval_logits -= eval_logits.max(axis=1, keepdims=True)
    exp_e = np.exp(eval_logits)
    return exp_e / exp_e.sum(axis=1, keepdims=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()
    root = os.path.abspath(args.root)

    cats = load_catalogs(root)
    exact_canonical = cats["exact_canonical"]
    exact_alias = cats["exact_alias"]
    coarse_domain = cats["coarse_domain"]
    meta_or_predicate = cats["meta_or_predicate"]
    source_ref_map = cats["source_ref_map"]
    collision_terms = cats["collision_terms"]

    v1_files = sorted(glob.glob(os.path.join(root, "docs/reports/openspec-task-concept-tie-v1.*.rows.jsonl")))
    rows = [json.loads(l) for l in open(v1_files[-1], encoding="utf-8")]

    out, lanes = [], Counter()
    raw_texts = []

    for r in rows:
        raw_str = f"{r.get('featureLabel', '')} {r.get('text', '')}"
        raw_texts.append(raw_str)
        text = " " + norm(raw_str) + " "
        file_targets = FILE_PATH_RE.findall(r.get("text", "") or "")
        task_codes = TASK_CODE_RE.findall(r.get("text", "") or "")

        sref_hits = [(fp, source_ref_map[fp]) for fp in file_targets if fp in source_ref_map]
        hits_c = sort_hits([(k, cid) for k, cid in exact_canonical.items() if f" {k} " in text])
        hits_a = sort_hits([(k, cid) for k, cid in exact_alias.items() if f" {k} " in text])
        hits_coarse = sort_hits([(k, cid) for k, cid in coarse_domain.items() if f" {k} " in text])
        hits_generic = [k for k in GENERIC_TERMS if f" {k} " in text]
        hits_meta = [k for k in meta_or_predicate if f" {k} " in text]

        base = {
            "task_id": r["id"],
            "change_id": r["change_id"],
            "rank": r.get("rank"),
            "canonical_authority": False,
        }

        if sref_hits:
            fp, cid = sref_hits[0]
            rec = dict(
                base,
                concept_id=cid,
                tie_lane="EXACT_CANONICAL",
                score=1.0,
                unknown_reason=None,
                matched_term=f"source_ref:{fp}",
            )
        elif hits_c:
            k, cid = hits_c[0]
            score = round(min(1.0, 0.70 + 0.10 * len(k.split()) + len(k) / 100.0), 4)
            rec = dict(
                base,
                concept_id=cid,
                tie_lane="EXACT_CANONICAL",
                score=score,
                unknown_reason=None,
                matched_term=k,
            )
        elif hits_a:
            k, cid = hits_a[0]
            score = round(min(0.95, 0.60 + 0.10 * len(k.split()) + len(k) / 100.0), 4)
            rec = dict(
                base,
                concept_id=cid,
                tie_lane="EXACT_ALIAS",
                score=score,
                unknown_reason=None,
                matched_term=k,
            )
        elif hits_coarse:
            k, cid = hits_coarse[0]
            rec = dict(
                base,
                concept_id=cid,
                tie_lane="COARSE_DOMAIN_LEXICAL",
                score=0.45,
                unknown_reason={
                    "code": "SINGLE_WORD_COARSE_DOMAIN",
                    "matchedTerm": k,
                    "aliasCollision": k in collision_terms,
                    "allCoarseTerms": [x[0] for x in hits_coarse[:5]],
                    "explicitFileTargets": file_targets[:5],
                    "taskCodes": task_codes[:5],
                },
                matched_term=k,
            )
        elif hits_generic or hits_meta:
            rec = dict(
                base,
                concept_id=None,
                tie_lane="GENERIC_ALIAS_EXCLUDED",
                score=0.0,
                unknown_reason={
                    "code": "ONLY_GENERIC_OR_META_TERMS",
                    "genericTerms": sorted(set(hits_generic))[:8],
                    "metaOrPredicateTerms": sorted(set(hits_meta))[:8],
                    "explicitFileTargets": file_targets[:5],
                    "taskCodes": task_codes[:5],
                },
                matched_term=None,
            )
        else:
            rec = dict(
                base,
                concept_id=None,
                tie_lane="UNKNOWN",
                score=0.0,
                unknown_reason={
                    "code": "NO_CANONICAL_OR_ALIAS_MATCH",
                    "featureLabelPresent": bool(r.get("featureLabel")),
                    "explicitFileTargets": file_targets[:5],
                    "taskCodes": task_codes[:5],
                },
                matched_term=None,
            )

        lanes[rec["tie_lane"]] += 1
        rec["proposal"] = None
        out.append(rec)

    # Fit pure-NumPy MultinomialNB + Softmax L2 LogisticRegression on deterministic EXACT_CANONICAL + EXACT_ALIAS ties
    tied_indices = [
        i for i, rec in enumerate(out)
        if rec["tie_lane"] in ("EXACT_CANONICAL", "EXACT_ALIAS") and rec["concept_id"]
    ]
    concept_counts = Counter(out[i]["concept_id"] for i in tied_indices)
    eligible_indices = [i for i in tied_indices if concept_counts[out[i]["concept_id"]] >= 5]

    classifier_metrics = {"status": "SKIPPED"}
    if len(eligible_indices) >= 50:
        X_all = build_tfidf_matrix(raw_texts, min_df=2, max_features=6000)
        y_all_labels = [out[i]["concept_id"] for i in eligible_indices]
        classes = sorted(set(y_all_labels))

        tr_idx, te_idx = stratified_split(eligible_indices, y_all_labels, test_ratio=0.2, seed=42)
        y_tr = [out[i]["concept_id"] for i in tr_idx]
        y_te = np.array([out[i]["concept_id"] for i in te_idx])

        nb_te_probs = fit_predict_nb(X_all[tr_idx], y_tr, classes, X_all[te_idx], alpha=0.5)
        lr_te_probs = fit_predict_lr(X_all[tr_idx], y_tr, classes, X_all[te_idx], C_reg=4.0)

        nb_preds = np.array([classes[idx] for idx in np.argmax(nb_te_probs, axis=1)])
        lr_preds = np.array([classes[idx] for idx in np.argmax(lr_te_probs, axis=1)])
        nb_acc = round(float((nb_preds == y_te).mean()), 4)
        lr_acc = round(float((lr_preds == y_te).mean()), 4)

        target_indices = [
            i for i, rec in enumerate(out)
            if rec["tie_lane"] in ("COARSE_DOMAIN_LEXICAL", "GENERIC_ALIAS_EXCLUDED", "UNKNOWN")
        ]
        agree_count = 0
        if target_indices:
            X_tr_full = X_all[eligible_indices]
            X_unk = X_all[target_indices]
            nb_probs = fit_predict_nb(X_tr_full, y_all_labels, classes, X_unk, alpha=0.5)
            lr_probs = fit_predict_lr(X_tr_full, y_all_labels, classes, X_unk, C_reg=4.0)

            for row_offset, idx in enumerate(target_indices):
                nb_top = int(np.argmax(nb_probs[row_offset]))
                lr_top = int(np.argmax(lr_probs[row_offset]))
                nb_cid = classes[nb_top]
                lr_cid = classes[lr_top]
                agree = nb_cid == lr_cid
                if agree:
                    agree_count += 1
                out[idx]["proposal"] = {
                    "authority": "inferred_only",
                    "canonicalAuthority": False,
                    "nbConceptId": nb_cid,
                    "nbConfidence": round(float(nb_probs[row_offset, nb_top]), 4),
                    "lrConceptId": lr_cid,
                    "lrConfidence": round(float(lr_probs[row_offset, lr_top]), 4),
                    "modelsAgree": agree,
                }

        classifier_metrics = {
            "status": "FITTED_ON_DETERMINISTIC_SPECIFIC_TIES",
            "trainingRows": len(eligible_indices),
            "distinctClasses": len(classes),
            "heldOutTestSize": len(te_idx),
            "nbHeldOutAccuracy": nb_acc,
            "lrHeldOutAccuracy": lr_acc,
            "proposalsAttached": len(target_indices),
            "nbLrAgreementCount": agree_count,
            "nbLrAgreementPct": round(100.0 * agree_count / max(1, len(target_indices)), 2),
        }

    stem = f"openspec-task-concept-tie-v2.{args.stamp}"
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    p_rows = os.path.join(out_dir, f"{stem}.rows.jsonl")
    p_man = os.path.join(out_dir, f"{stem}.manifest.json")
    with open(p_rows, "w", encoding="utf-8", newline="\n") as fh:
        for rec in out:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    total = len(out)
    manifest = {
        "schema": "atlas.openspec-task-concept-tie.v2",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "catalog": {
            "sources": [
                "docs/reports/concept-seed-dry-v1.json",
                ".okf/corpora/keyword-corpus.yaml",
            ],
            "status": "DRY_SEED_AND_OKF_REFERENCE_NOT_CANONICAL",
            "exactCanonicalPhrases": len(exact_canonical),
            "exactAliasTerms": len(exact_alias),
            "coarseDomainTerms": len(coarse_domain),
            "excludedMetaOrPredicateTerms": len(meta_or_predicate),
            "sourceRefBindings": len(source_ref_map),
        },
        "genericTerms": sorted(GENERIC_TERMS),
        "coarseSingleWordDomains": sorted(COARSE_SINGLE_WORD_DOMAINS),
        "lanes": {k: {"count": v, "pct": round(100.0 * v / total, 2)} for k, v in sorted(lanes.items())},
        "classifier": classifier_metrics,
        "tableDraft": "sveltekit-frontend/drizzle/manual/20261107_atlas_concept_tie_v2_DRAFT.sql (not applied)",
        "outputs": {os.path.basename(p_rows): sha256(p_rows)},
    }
    with open(p_man, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(json.dumps({
        "lanes": manifest["lanes"],
        "classifier": manifest["classifier"],
        "rows": os.path.relpath(p_rows, root),
        "manifest": os.path.relpath(p_man, root),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
