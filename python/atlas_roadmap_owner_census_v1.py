"""ROADMAP_OWNER_CENSUS_01 (READ ONLY): find the ~647-line 'Parent Atlas Open Lanes TODO' variant (TurboQuant/Lloyd-Max opening) by CONTENT fingerprint across every
worktree and ignored/untracked surface, and classify its ownership relationship to reports/parent-atlas-open-lanes-todo.md. Writes only
docs/reports/parent-atlas-roadmap-owner-census-v1.json. No DB/Qdrant/Valkey/Neo4j/Graphify.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FINGERPRINTS = ["lloyd_max_codebook", "never reconstruct the key vector", r"Beta distribution.*shape changes with d", "Reading — once per query step", "Parent Atlas Open Lanes TODO"]
HISTORICAL_SECTIONS = ["Current Runtime Topology Order", "Finish Order", "Production-ready at the directory level", "USED_CONCEPT"]
EXCLUDES = ["!node_modules", "!.git", "!.venv", "!venv", "!__pycache__", "!*.gguf", "!*.safetensors", "!*.onnx", "!*.parquet", "!.next", "!.svelte-kit", "!target", "!dist"]
EXTRA_ROOTS = [Path.home() / "Downloads", Path.home() / "Desktop", Path.home() / "Documents"]


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 900) -> str:
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout).stdout
    except subprocess.TimeoutExpired:
        return "__TIMEOUT__"


def worktrees() -> list[dict]:
    out, cur = [], {}
    for line in run(["git", "worktree", "list", "--porcelain"], ROOT).splitlines() + [""]:
        if not line.strip():
            if cur:
                out.append(cur)
            cur = {}
            continue
        k, _, v = line.partition(" ")
        cur[k] = v or True
    return out


def rg_files(root: Path, pattern: str) -> tuple[list[str], bool]:
    cmd = ["rg", "-uuu", "-l", "-e", pattern, "--max-filesize", "5M"]
    for g in EXCLUDES:
        cmd += ["--glob", g]
    out = run(cmd + [str(root)], None)
    return ([l for l in out.splitlines() if l.strip()], out.startswith("__TIMEOUT__"))


def describe(path: Path, repo_root: Path | None) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    d = {"path": str(path), "lineCount": text.count("\n") + (0 if text.endswith("\n") or not text else 1), "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
         "fingerprintsPresent": [f for f in FINGERPRINTS if re.search(f, text)], "historicalSectionsPresent": [s for s in HISTORICAL_SECTIONS if s in text],
         "headingCount": len(re.findall(r"(?m)^#{1,6} ", text))}
    if repo_root and repo_root in path.parents:
        rel = path.relative_to(repo_root).as_posix()
        d["repoRoot"] = str(repo_root)
        d["relativePath"] = rel
        d["gitStatus"] = run(["git", "status", "--short", "--ignored", "--", rel], repo_root).strip() or "CLEAN_TRACKED_OR_UNKNOWN"
        d["lastCommit"] = run(["git", "log", "-1", "--format=%h %ad %s", "--date=short", "--", rel], repo_root).strip()[:200] or None
        d["inHead"] = bool(run(["git", "cat-file", "-e", f"HEAD:{rel}"], repo_root).strip() == "" and subprocess.run(["git", "cat-file", "-e", f"HEAD:{rel}"], cwd=repo_root, capture_output=True).returncode == 0)
        d["tracked"] = subprocess.run(["git", "ls-files", "--error-unmatch", rel], cwd=repo_root, capture_output=True).returncode == 0
    return d


def headings(path: Path) -> list[str]:
    return [re.sub(r"\s+`\[[A-Z_]+\]`$", "", m.strip()) for m in re.findall(r"(?m)^#{1,6} (.+)$", path.read_text(encoding="utf-8", errors="replace"))]


def main() -> int:
    wts = worktrees()
    roots = [{"path": Path(w["worktree"]), "branch": w.get("branch") or ("DETACHED@" + str(w.get("HEAD", ""))[:10])} for w in wts if Path(w["worktree"]).exists()]
    # worktrees nested under the main root are covered by the main-root search (-uuu descends into them); record that explicitly
    main_root = ROOT.resolve()
    searched, timeouts, matches = [], [], {}
    for r in roots:
        p = r["path"].resolve()
        nested = main_root in p.parents
        searched.append({"worktree": str(p), "branch": r["branch"], "coveredByMainRootSearch": nested})
        if nested:
            continue
        for fp in FINGERPRINTS:
            files, to = rg_files(p, fp)
            if to:
                timeouts.append({"root": str(p), "fingerprint": fp})
            for f in files:
                matches.setdefault(str(Path(f).resolve()), set()).add(fp)
    for x in EXTRA_ROOTS:
        if x.exists():
            searched.append({"worktree": str(x), "branch": None, "coveredByMainRootSearch": False, "kind": "extra-root"})
            for fp in FINGERPRINTS:
                files, to = rg_files(x, fp)
                if to:
                    timeouts.append({"root": str(x), "fingerprint": fp})
                for f in files:
                    matches.setdefault(str(Path(f).resolve()), set()).add(fp)
    cands = []
    for f, fps in sorted(matches.items()):
        p = Path(f)
        if p.suffix.lower() in {".json", ".jsonl"} and p.stat().st_size > 2_000_000:
            continue
        owner = next((r["path"].resolve() for r in roots if r["path"].resolve() in p.parents or r["path"].resolve() == p.parent), None)
        # prefer the deepest containing worktree
        containing = [r["path"].resolve() for r in roots if r["path"].resolve() in p.parents]
        owner = max(containing, key=lambda x: len(str(x))) if containing else None
        d = describe(p, owner)
        d["matchedFingerprints"] = sorted(fps)
        cands.append(d)
    artifact_a_path = ROOT / "reports/parent-atlas-open-lanes-todo.md"
    a = describe(artifact_a_path, ROOT)
    turbo = [c for c in cands if any(x in c["fingerprintsPresent"] for x in FINGERPRINTS[:4])]
    roadmaps = [c for c in cands if "Parent Atlas Open Lanes TODO" in c["fingerprintsPresent"]]
    b = next((c for c in turbo if 600 <= c["lineCount"] <= 700), None)
    receipt = {
        "schema": "atlas.parent-atlas-roadmap-owner-census.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "ROADMAP_OWNER_CENSUS_01",
        "worktrees": searched, "fingerprints": FINGERPRINTS, "searchTimeouts": timeouts, "excludedGlobs": EXCLUDES, "maxFilesize": "5M",
        "matches": cands, "artifactA": a, "artifactB": b,
        "openLanesTodoVariants": [{"path": c["path"], "lineCount": c["lineCount"], "sha256": c["sha256"], "tracked": c.get("tracked"), "gitStatus": c.get("gitStatus")} for c in roadmaps],
        "turboQuantFingerprintFiles": [{"path": c["path"], "lineCount": c["lineCount"], "fingerprints": c["fingerprintsPresent"]} for c in turbo],
    }
    if b:
        ha, hb = headings(Path(a["path"])), headings(Path(b["path"]))
        receipt["structuralComparison"] = {"headingsOnlyInA": sorted(set(ha) - set(hb))[:80], "headingsOnlyInB": sorted(set(hb) - set(ha))[:80], "sharedHeadings": len(set(ha) & set(hb)), "aHeadingCount": len(ha), "bHeadingCount": len(hb)}
        receipt["classification"] = "UNCLASSIFIED_NEEDS_REVIEW"
        receipt["recommendedOwnerAction"] = "MERGE_REQUIRED_AFTER_OWNER_REVIEW"
    else:
        receipt["result"] = "ROADMAP_647_ARTIFACT_NOT_FOUND"
        receipt["classification"] = "UNKNOWN_OWNER (user-supplied copy is external conversation evidence until a repo path is established)"
        receipt["recommendedOwnerAction"] = "KEEP_A_CANONICAL_SUPERSEDE_B"
        receipt["recommendedOwnerActionNote"] = "There is no B path to supersede yet; keep reports/parent-atlas-open-lanes-todo.md as the single roadmap index and, if B later appears, add a supersession pointer to it rather than maintaining two current roadmaps. Do not execute any ownership mutation now."
    receipt["hierarchy"] = {"gateAuthority": "OpenSpec tasks.md", "proofAuthority": "revision-qualified receipts", "roadmap": "one human-readable lane index", "otherCopies": "generated projections or historical snapshots"}
    receipt["writes"] = {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0, "stores": 0}
    (ROOT / "docs/reports/parent-atlas-roadmap-owner-census-v1.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": receipt.get("result", "B_FOUND"), "worktreesSearched": len(searched), "timeouts": timeouts, "candidates": len(cands),
                      "turboQuantFiles": receipt["turboQuantFingerprintFiles"], "openLanesTodoVariants": receipt["openLanesTodoVariants"], "action": receipt["recommendedOwnerAction"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
