#!/usr/bin/env python3
"""
openspec-task-alignment-v1.py

For the fused OpenSpec task ranking, produce:

  A. feature_id / feature_label PROPOSALS per task (container = OpenSpec change).
  B. openspec_id -> feature_id alignment via ONE ripgrep pass over repo code/docs
     (task codes such as SCENE-08 found outside tasks.md = code-side evidence).
  C. Reranker check: share of tasks with code-side evidence, bucketed by fused rank.
     Reported as a 0-100% alignment, per bucket and per change. A ranking that works
     should put evidenced tasks earlier. This is a diagnostic, not a gold metric.
  D. A BLIND gold-label sample sheet (no proposed labels) and a SEPARATE key file.
     Reviewers fill the sheet; the key is for scoring only.

Identity rules honoured:
  - feature_id is never used alone as a join key; every row keeps change_id + id (file#line).
  - all labels here are PROPOSAL, canonicalAuthority false, accuracy UNMEASURED.
  - writes only new report files; no source, PostgreSQL, Valkey, Qdrant or Neo4j writes.

Usage (repo root):
  python scripts/atlas/openspec-task-alignment-v1.py --in docs/reports/openspec-task-rank-fuse-v1.<stamp>.jsonl
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import random
import re
import subprocess
import sys
from collections import Counter, defaultdict

CODE_RE = re.compile(r"\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{1,3}[a-z]?)\b")
# Two definitions, both reported:
#   STRICT  = code and architecture paths only (CODE_PREFIXES).
#   BROAD   = STRICT plus planning docs in OTHER OpenSpec change folders (own change excluded).
# docs/reports/ is never searched: generated census/workboard outputs are derived from the
# same tasks.md files, so a match there is circular.
CODE_PREFIXES = ("sveltekit-frontend/src/", "sveltekit-frontend/scripts/", "sveltekit-frontend/tests/",
                 "scripts/", "python/", "packages/", "docs/architecture/")
RG_PATHS = ["sveltekit-frontend/src", "sveltekit-frontend/scripts", "sveltekit-frontend/tests",
            "scripts", "python", "packages", "docs/architecture", "openspec", "sveltekit-frontend/openspec"]
RG_GLOBS = ["!**/tasks.md", "!docs/reports/openspec-task-*", "!docs/reports/openspec-workboard*",
            "!scripts/atlas/openspec-task-*",  # this helper's own docstrings are not evidence
            "!**/*.bak", "!**/node_modules/**", "!**/dist/**", "!**/build/**"]
BUCKETS = [(1, 100), (101, 500), (501, 1000), (1001, 3000), (3001, 10**9)]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return "sha256:" + h.hexdigest()


def feature_label_for(row):
    """Proposal: section header (markdown stripped), else humanised change id."""
    sec = (row.get("section") or "").strip()
    sec = re.sub(r"[*`_#]+", "", sec)
    sec = re.sub(r"^\s*\d+(\.\d+)*\s*", "", sec).strip()
    if sec and len(sec) >= 4:
        return sec[:120], "section-header"
    return row["change_id"].replace("-", " "), "change-id"


def rg_code_hits(root, codes):
    """One ripgrep pass. Returns Counter(code) and {code: [file, ...]} (distinct files, capped)."""
    if not codes:
        return Counter(), {}
    # Windows caps the command line (~32k chars); pass the codes via a pattern file (-f).
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8", newline="\n") as tf:
        for c in sorted(codes):
            tf.write(re.escape(c) + "\n")
        pattern_file = tf.name
    counts = Counter()
    files = defaultdict(set)
    try:
        # --json gives an unambiguous path/submatch structure. Stream it: the full
        # output is too large to buffer (MemoryError on the first attempt).
        cmd = ["rg", "--json", "--no-config", "-I", "-w", "-f", pattern_file]
        for g in RG_GLOBS:
            cmd += ["--glob", g]
        cmd += RG_PATHS
        proc = subprocess.Popen(cmd, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8", errors="replace")
        for line in proc.stdout:
            if '"type":"match"' not in line:
                continue
            evt = json.loads(line)
            data = evt["data"]
            path = data["path"]["text"].replace("\\", "/")
            for sub in data.get("submatches", []):
                code = sub["match"]["text"].strip()
                if code in codes:
                    counts[code] += 1
                    files[code].add(path)
        stderr = proc.stderr.read()
        rc = proc.wait()
    finally:
        os.unlink(pattern_file)
    if rc not in (0, 1):
        raise RuntimeError(f"rg failed ({rc}): {stderr[:400]}")
    return counts, {c: sorted(v) for c, v in files.items()}


CHANGE_PATH = re.compile(r"openspec/(?:specs/openspec/)?changes/([^/]+)/")


def independent_files(paths, own_change):
    """Evidence files that are NOT inside the task's own OpenSpec change folder."""
    out = []
    for p in paths:
        m = CHANGE_PATH.search(p)
        if m and m.group(1) == own_change:
            continue
        out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-dir", default="docs/reports")
    ap.add_argument("--sample", type=int, default=200, help="blind gold-sheet size")
    ap.add_argument("--per-bucket-min", type=int, default=0)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--stamp", default=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    src = args.inp if os.path.isabs(args.inp) else os.path.join(root, args.inp)
    with open(src, encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    rows.sort(key=lambda r: r["rank"])

    # A. feature proposals
    for r in rows:
        label, basis = feature_label_for(r)
        r["feature_id"] = f"openspec:{r['change_id']}"
        r["feature_label"] = label
        r["feature_label_basis"] = basis

    # B. one rg pass over every task code present in the backlog
    codes = {r["task_code"] for r in rows if r.get("task_code")}
    counts, files = rg_code_hits(root, codes)
    is_code = lambda p: p.startswith(CODE_PREFIXES)
    for r in rows:
        code = r.get("task_code")
        all_files = files.get(code, []) if code else []
        strict = [p for p in all_files if is_code(p)]
        broad = independent_files(all_files, r["change_id"]) if code else []
        r["codeHits"] = counts.get(code, 0) if code else 0
        r["alignedStrict"] = bool(strict)
        r["alignedBroad"] = bool(broad)
        r["codeEvidenceFiles"] = strict[:5]
        r["planningEvidenceFiles"] = [p for p in broad if not is_code(p)][:5]
        if not code:
            r["alignment"] = "NO_TASK_CODE"
        elif strict:
            r["alignment"] = "CODE_EVIDENCE"
        elif broad:
            r["alignment"] = "PLANNING_EVIDENCE_ONLY"
        else:
            r["alignment"] = "NO_CODE_REFERENCE"
        r["aligned"] = r["alignedStrict"]  # kept for the gold key; the report shows both definitions

    # C. reranker check: alignment % per rank bucket and per change
    total = len(rows)
    with_code = sum(1 for r in rows if r.get("task_code"))

    def summarize(flag):
        """Overall %, per-rank-bucket %, top-100-vs-rest lift, and per-change % for one flag."""
        n_yes = sum(1 for r in rows if r[flag])
        buckets = []
        for lo, hi in BUCKETS:
            sub = [r for r in rows if lo <= r["rank"] <= hi]
            if not sub:
                continue
            a = sum(1 for r in sub if r[flag])
            buckets.append({"ranks": f"{lo}-{min(hi, total)}", "tasks": len(sub), "aligned": a,
                            "alignmentPct": round(100.0 * a / len(sub), 2)})
        by_change = defaultdict(lambda: [0, 0])
        for r in rows:
            by_change[r["change_id"]][0] += 1
            by_change[r["change_id"]][1] += 1 if r[flag] else 0
        changes = sorted(({"change_id": c, "tasks": t, "aligned": a,
                           "alignmentPct": round(100.0 * a / t, 2)} for c, (t, a) in by_change.items()),
                         key=lambda x: (-x["alignmentPct"], -x["tasks"], x["change_id"]))
        top = [r for r in rows if r["rank"] <= 100]
        rest_ = [r for r in rows if r["rank"] > 100]
        lift_ = None
        if top and rest_:
            p_top = sum(1 for r in top if r[flag]) / len(top)
            p_rest = sum(1 for r in rest_ if r[flag]) / len(rest_)
            lift_ = round(p_top / p_rest, 3) if p_rest else None
        return {
            "tasksAligned": n_yes,
            "overallAlignmentPct": round(100.0 * n_yes / total, 2) if total else 0.0,
            "alignmentPctOfTaskCodeTasks": round(100.0 * n_yes / with_code, 2) if with_code else 0.0,
            "perRankBucket": buckets,
            "top100VsRestLift": lift_,
            "topChanges": changes[:15],
        }

    strict_sum = summarize("alignedStrict")
    broad_sum = summarize("alignedBroad")
    aligned_total = strict_sum["tasksAligned"]
    bucket_stats = strict_sum["perRankBucket"]
    lift = strict_sum["top100VsRestLift"]
    change_stats = strict_sum["topChanges"]

    # D. blind gold sheet + separate key
    rng = random.Random(args.seed)
    pool = [r for r in rows]
    take = min(args.sample, len(pool))
    chosen = sorted(rng.sample(pool, take), key=lambda r: r["rank"])
    sheet_rows, key_rows = [], []
    for r in chosen:
        sheet_rows.append({
            "id": r["id"], "change_id": r["change_id"], "task_code": r.get("task_code"),
            "text": r["text"], "reviewer": None,
            "reviewerPrimaryDomain": None,  # one of .okf/domains group_id, or UNRESOLVED / NOT_A_DOMAIN / AMBIGUOUS
            "reviewerFeatureLabel": None, "notes": None,
        })
        key_rows.append({"id": r["id"], "proposedPrimaryDomainKeyedElsewhere": True,
                         "rank": r["rank"], "feature_id": r["feature_id"], "feature_label": r["feature_label"],
                         "alignment": r["alignment"]})

    stem = f"openspec-task-alignment-v1.{args.stamp}"
    out_dir = os.path.join(root, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    p_rows = os.path.join(out_dir, f"{stem}.rows.jsonl")
    p_sheet = os.path.join(out_dir, f"{stem}.gold-sheet-blind.jsonl")
    p_key = os.path.join(out_dir, f"{stem}.gold-key.jsonl")
    p_check = os.path.join(out_dir, f"{stem}.reranker-check.json")
    p_man = os.path.join(out_dir, f"{stem}.manifest.json")

    def wj(path, items):
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            for it in items:
                fh.write(json.dumps(it, ensure_ascii=False) + "\n")

    wj(p_rows, rows)
    wj(p_sheet, sheet_rows)
    wj(p_key, key_rows)
    check = {
        "isGoldMetric": False,
        "tasksTotal": total,
        "tasksWithTaskCode": with_code,
        "definitions": {
            "strict": "task code appears in code/architecture paths only "
                      "(sveltekit-frontend src/scripts/tests, scripts, python, packages, docs/architecture)",
            "broad": "strict, plus planning docs in OTHER OpenSpec change folders "
                     "(own change folder excluded; docs/reports never searched)",
        },
        "strict": strict_sum,
        "broad": broad_sum,
        "note": ("Lift > 1 means top-ranked tasks are more often evidenced. This is a diagnostic, "
                 "not precision: no reviewed labels exist, and a code match is not proof of completion."),
    }
    with open(p_check, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(check, fh, indent=2)
        fh.write("\n")

    manifest = {
        "schema": "atlas.openspec-task-alignment.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "canonicalAuthority": False,
        "source": os.path.relpath(src, root).replace("\\", "/"),
        "params": {"sample": args.sample, "seed": args.seed, "rgPaths": RG_PATHS, "rgGlobs": RG_GLOBS},
        "accuracy": "UNMEASURED: no reviewed gold labels exist yet; the blind sheet is unreviewed",
        "gold": {"sheet": os.path.basename(p_sheet), "key": os.path.basename(p_key),
                 "sheetRows": len(sheet_rows), "keyRule": "key must not be shown to reviewers"},
        "outputs": {os.path.basename(p): sha256(p) for p in (p_rows, p_sheet, p_key, p_check)},
    }
    with open(p_man, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")

    print(json.dumps({"strictOverallPct": strict_sum["overallAlignmentPct"],
                      "broadOverallPct": broad_sum["overallAlignmentPct"],
                      "strictTasksWithEvidence": aligned_total,
                      "strictTop100VsRestLift": lift,
                      "perRankBucket": bucket_stats,
                      "goldSheet": os.path.relpath(p_sheet, root), "check": os.path.relpath(p_check, root)},
                     indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
