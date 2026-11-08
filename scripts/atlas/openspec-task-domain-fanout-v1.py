#!/usr/bin/env python3
"""
openspec-task-domain-fanout-v1.py

PROPOSAL-ONLY domain tagging of open OpenSpec tasks against the closed group
vocabulary in .okf/domains/atlas-domain-taxonomy.yaml (13 top-level groups,
4 child groups), plus one-to-many fanout summaries.

Contract (see docs/architecture/atlas-domain-topology-alignment and CLAUDE.md
"Classification gates everything downstream"):
  - vocabulary: exact group_id only; unresolved stays unresolved
  - one task -> many domains is expected (fanout), not an error
  - outputs are derived proposals: canonicalAuthority false, accuracy UNMEASURED
    (no reviewed gold set exists; trust floor is 200 rows and 30 per class)
  - reads the taxonomy; writes only new report files; no DB / Valkey / Qdrant / Neo4j

Scoring: a group matches when any of its lexicon regexes hits the task's text
+ section header. Score = number of distinct lexicon terms hit (evidence count).
Primary domain = highest score, ties broken by taxonomy order.

Usage (repo root):
  python scripts/atlas/openspec-task-domain-fanout-v1.py --in docs/reports/<fuse>.jsonl
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

import yaml

TAXONOMY = ".okf/domains/atlas-domain-taxonomy.yaml"

# Lexicon: group_id -> list of term regexes (case-insensitive, word-bounded where useful).
# Seeded from the taxonomy labels/descriptions and the repo's own vocabulary.
# Tightened 2026-11-07: generic words (graph, packet, candidate, test, model, page,
# table, kernel, service, fail, config, container, browser, sidecar) were each firing on
# 3-10% of tasks, so they were replaced with the specific phrases this repo uses.
LEXICON = {
    "api": [r"\bapi\b", r"\bgrpc\b", r"\bproto(buf)?s?\b", r"\brpc\b", r"\bfacade\b", r"\brest(ful)? (api|endpoint|route)s?\b"],
    "auth": [r"\bauth(n|z)?\b", r"authentication", r"authorization", r"user session", r"session (cookie|token|store|expiry)",
             r"\blogin\b", r"permission (check|gate|model|scope|grant)", r"\brbac\b", r"admin_only", r"access token", r"\bbearer\b", r"\bcsrf\b"],
    "cache": [r"\bcache[sd]?\b", r"\bredis\b", r"\bvalkey\b", r"bitfrost", r"bifrost", r"\bttl\b", r"\bwarm(ing|ed)? (cache|keys?|bitfrost)"],
    "compiler": [r"\bcompiler", r"\btsgo\b", r"typescript", r"ast-grep", r"tree-sitter", r"\bparser\b", r"\bgrammar\b", r"syntax (error|tree)", r"\blsp\b"],
    "database": [r"\bpostgres(ql)?\b", r"pgvector", r"\bdrizzle\b", r"\bsql\b", r"migration (apply|drift|ledger|journal|file)s?", r"\bjsonb\b", r"schema (change|migration|drift|contract|version)"],
    "database.postgresql": [r"pgvector", r"halfvec", r"\bhnsw\b", r"pg_search", r"\bbm25\b", r"\bbtree\b", r"\bgin index", r"postgres(ql)? (index|extension|18|version)", r"\bfts\b"],
    "devops": [r"\bdocker\b", r"\bcompose\.ya?ml\b", r"\bsystemd\b", r"\bstartup\b", r"\bdeploy(ment|ed|s)?\b", r"docker container", r"\bwsl2?\b", r"\bvhdx\b", r"powershell", r"\bvs ?code task"],
    "devops.env-config": [r"\benv\b", r"\.env\b", r"config(uration)? (file|key|value)s?", r"environment variable", r"\bdotenv\b"],
    "devops.process-mgmt": [r"\bstartup\b", r"\blaunch(er|ed|ing)?\b", r"\blifecycle\b", r"\bdaemon\b", r"\bsupervisor\b", r"port (conflict|bind|\d)", r"process management"],
    "error-handling": [r"\berror (handling|recovery|log|logs|boundary|budget)", r"error_logs", r"\bretry\b", r"fail(-| )closed", r"\bfailure", r"\brecovery\b", r"\bfallback\b", r"dead-letter", r"\bdegraded\b", r"\bexception"],
    "frontend": [r"svelte component", r"\.svelte\b", r"\bui\b", r"\bcss\b", r"unocss", r"bits-ui", r"\bdialog\b", r"browser (ui|viewer|storage|worker|shim)", r"service worker", r"indexeddb"],
    "frontend.sveltekit": [r"sveltekit", r"\bsvelte\b", r"\+page", r"\+server", r"\brunes?\b", r"\$state"],
    "gpu": [r"\bgpu\b", r"\bcuda\b", r"cuvs", r"cugraph", r"rapids", r"tensorrt", r"libtorch", r"\bvram\b", r"cublas", r"cuda kernel", r"kernel (launch|parity|oracle|benchmark)", r"\brtx\b", r"\bcutile\b"],
    "graph": [r"knowledge graph", r"graph (traversal|edge|edges|node|nodes|projection|snapshot|analysis|rag|ranking|parity|expansion|community)", r"graphrag", r"pagerank", r"neo4j", r"topology", r"communit(y|ies)", r"louvain", r"hyperedge", r"\bsom\b", r"kmeans", r"cluster (assignment|id|label|centroid)s?"],
    "machine-learning": [r"classifier", r"xgboost", r"\btrain(ing|ed|er)?\b", r"embedding", r"autoencoder", r"reranker", r"\bonnx\b", r"\bgemm\b", r"logistic", r"neural", r"\bdspy\b", r"\bgepa\b", r"checkpoint", r"model (weights|artifact|training|checkpoint)s?"],
    "retrieval": [r"\bretriev(al|er|ers|ing)\b", r"search (runtime|lane|executor|fusion|route|backend|index|result|hit)s?", r"\bhybrid search\b", r"dense search", r"\bbm25\b",
                  r"\brerank(er|ing)?\b", r"\brrf\b", r"\brecall@", r"candidate (set|ordinal|feature|matrix|cohort|generation|selection)s?",
                  r"\bann\b", r"vector (search|index|store|lane)", r"\bqdrant\b", r"turbovec", r"\bknn\b", r"\brag\b", r"packet (key|identity|revision|retrieval|search)"],
    "test": [r"unit tests?\b", r"\be2e\b", r"playwright", r"\bvitest\b", r"\bsmoke (test|check|gate)s?\b", r"regression (test|suite|gate)s?", r"\bassert(ion|ions)?\b", r"test coverage", r"\bfixtures?\b", r"\bspec files?\b"],
}

# Child -> parent, from the taxonomy (parent_group_id). Children are scored independently.
def load_taxonomy(root):
    with open(os.path.join(root, TAXONOMY), encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    groups = doc["groups"]
    order = [g["group_id"] for g in groups]
    parent = {g["group_id"]: g.get("parent_group_id") for g in groups}
    labels = {g["group_id"]: g["label"] for g in groups}
    return order, parent, labels


def score_row(text, compiled):
    hits = {}
    for gid, pats in compiled.items():
        terms = [p.pattern for p in pats if p.search(text)]
        if terms:
            hits[gid] = terms
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    src = args.inp if os.path.isabs(args.inp) else os.path.join(root, args.inp)
    with open(src, encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]

    order, parent, labels = load_taxonomy(root)
    unknown = [g for g in LEXICON if g not in labels]
    if unknown:
        print(f"LEXICON references groups not in taxonomy: {unknown}", file=sys.stderr)
        return 2
    compiled = {g: [re.compile(p, re.IGNORECASE) for p in pats] for g, pats in LEXICON.items()}

    tagged = []
    fanout_by_group = defaultdict(lambda: {"tasks": 0, "primary": 0, "changes": Counter()})
    per_task_domain_count = Counter()
    for r in rows:
        text = f"{r.get('section', '')} {r.get('text', '')}"
        hits = score_row(text, compiled)
        domains = sorted(hits, key=lambda g: (-len(hits[g]), order.index(g)))
        primary = domains[0] if domains else None
        per_task_domain_count[len(domains)] += 1
        for g in domains:
            fanout_by_group[g]["tasks"] += 1
            fanout_by_group[g]["changes"][r["change_id"]] += 1
        if primary:
            fanout_by_group[primary]["primary"] += 1
        tagged.append({
            "rank": r.get("rank"),
            "page": r.get("page"),
            "id": r["id"],
            "change_id": r["change_id"],
            "task_code": r.get("task_code"),
            "text": r.get("text"),
            "primaryDomain": primary,
            "domains": [{"group_id": g, "label": labels[g], "score": len(hits[g]), "evidence": hits[g]} for g in domains],
            "status": "PROPOSAL",
            "canonicalAuthority": False,
        })

    stem = f"openspec-task-domain-fanout-v1.{args.stamp}"
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    out_jsonl = os.path.join(out_dir, f"{stem}.jsonl")
    out_fanout = os.path.join(out_dir, f"{stem}.fanout.json")
    out_manifest = os.path.join(out_dir, f"{stem}.manifest.json")

    with open(out_jsonl, "w", encoding="utf-8", newline="\n") as fh:
        for t in tagged:
            fh.write(json.dumps(t, ensure_ascii=False) + "\n")

    fanout = []
    for g in order:
        s = fanout_by_group.get(g)
        if not s:
            fanout.append({"group_id": g, "label": labels[g], "parent": parent[g], "tasks": 0, "primary": 0, "changeFolders": 0, "topChanges": []})
            continue
        fanout.append({
            "group_id": g,
            "label": labels[g],
            "parent": parent[g],
            "tasks": s["tasks"],
            "primary": s["primary"],
            "changeFolders": len(s["changes"]),
            "topChanges": [{"change_id": c, "tasks": n} for c, n in s["changes"].most_common(5)],
        })
    unresolved = sum(1 for t in tagged if t["primaryDomain"] is None)
    with open(out_fanout, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"groups": fanout, "unresolvedTasks": unresolved,
                   "domainsPerTaskHistogram": dict(sorted(per_task_domain_count.items()))}, fh, indent=2)
        fh.write("\n")

    def sha(p):
        h = hashlib.sha256()
        with open(p, "rb") as f:
            h.update(f.read())
        return "sha256:" + h.hexdigest()

    manifest = {
        "schema": "atlas.openspec-task-domain-fanout.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "PROPOSAL",
        "canonicalAuthority": False,
        "accuracy": "UNMEASURED: no reviewed gold set; trust floor 200 rows and 30 per class not met",
        "source": os.path.relpath(src, root).replace("\\", "/"),
        "taxonomy": {"path": TAXONOMY, "groups": len(order), "topLevel": sum(1 for g in order if parent[g] is None)},
        "method": "lexicon regex hits per group; score = distinct terms hit; primary = max score, tie by taxonomy order",
        "counts": {
            "tasks": len(tagged),
            "unresolved": unresolved,
            "domainsPerTaskHistogram": dict(sorted(per_task_domain_count.items())),
        },
        "outputs": {os.path.basename(out_jsonl): sha(out_jsonl), os.path.basename(out_fanout): sha(out_fanout)},
    }
    with open(out_manifest, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")

    print(json.dumps({"jsonl": os.path.relpath(out_jsonl, root), "fanout": os.path.relpath(out_fanout, root),
                      "manifest": os.path.relpath(out_manifest, root), "counts": manifest["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
