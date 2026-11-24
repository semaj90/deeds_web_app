from __future__ import annotations

import json
import os
import re
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

import psycopg

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLD_PATH = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2.jsonl"
OBO_PATH = REPO_ROOT / ".okf" / "ontologies" / "atlas-domain-and-language-terms-v1.obo"

NOISE_PATH_MARKERS = (
    ".venv",
    "node_modules/",
    "/target/",
    "CMakeFiles/",
    "qdrant-windows/storage/",
    "scripts/api-cleanup/reports/backup-",
    ".tmp/",
    "neschrom97/cards/",
    ".python311/",
    "__pycache__/",
)

SCAFFOLD_CONTAMINATION_RE = re.compile(
    r"(\*\*Example\s+1|Please provide the actual code|\*\*How to use this summary|\*\*Applying the Summary|Self-Correction/Refinement)",
    re.I,
)

SYMBOL_LINE_RE = re.compile(
    r"^\s*(?:export\s+(?:async\s+)?(?:function|class|interface|type|const)|def\s+|class\s+|func\s+|CREATE\s+TABLE|@app\.)",
)


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _load_obo_terms(obo_path: Path) -> list[dict[str, Any]]:
    if not obo_path.is_file():
        return []
    terms: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    for raw in obo_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if line == "[Term]":
            if cur and cur.get("id") and cur.get("name"):
                terms.append(cur)
            cur = {"synonyms": []}
        elif line.startswith("[") and line.endswith("]"):
            if cur and cur.get("id") and cur.get("name"):
                terms.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            k, v = line.split(":", 1)
            k = k.strip()
            v = v.strip()
            if k == "id":
                cur["id"] = v
            elif k == "name":
                cur["name"] = v
            elif k == "synonym":
                m = re.match(r'"([^"]+)"', v)
                if m:
                    cur["synonyms"].append(m.group(1))
    if cur and cur.get("id") and cur.get("name"):
        terms.append(cur)
    return terms


def _match_oaklib_terms(text: str, obo_terms: list[dict[str, Any]], limit: int = 5) -> list[dict[str, str]]:
    hay = text.lower()
    hits: list[dict[str, str]] = []
    for t in obo_terms:
        name = t["name"]
        candidates = [name, *t.get("synonyms", [])]
        if any(len(c) >= 3 and re.search(rf"\b{re.escape(c.lower())}\b", hay) for c in candidates):
            hits.append({"id": t["id"], "name": name})
            if len(hits) >= limit:
                break
    return hits


def _rg_extract_file_evidence(rel_path: str, limit: int = 5) -> list[str]:
    full = REPO_ROOT / rel_path
    if not full.is_file():
        return []
    try:
        proc = subprocess.run(
            ["rg", "--no-heading", "-n", r"^\s*(export |async function |def |class |interface |type |func |CREATE TABLE|@app\.)", str(full)],
            capture_output=True,
            text=True,
            timeout=3,
        )
        lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
        if lines:
            return lines[:limit]
    except Exception:
        pass
    try:
        head = [ln.strip() for ln in full.read_text(encoding="utf-8", errors="replace").splitlines()[:12] if ln.strip()]
        return head[:limit]
    except Exception:
        return []


def _rg_find_relevant_by_basename(basename: str, limit: int = 5) -> tuple[int, list[str]]:
    if not basename or len(basename) < 3:
        return 0, []
    try:
        proc = subprocess.run(
            ["rg", "--files", "-g", f"*{basename}*"],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=4,
        )
        matches = [ln.strip().replace("\\", "/") for ln in proc.stdout.splitlines() if ln.strip()]
        return len(matches), matches[:limit]
    except Exception:
        return 0, []


def _classify_path(rel_path: str) -> str:
    norm = rel_path.replace("\\", "/")
    if any(m in norm for m in NOISE_PATH_MARKERS):
        return "NOISE_OR_EPHEMERAL"
    if (REPO_ROOT / norm).is_file():
        return "EXISTING_SOURCE_FILE"
    return "MISSING_ON_DISK"


def _compute_completeness_score(
    *,
    path_category: str,
    revision_resolution: str,
    has_clean_evidence: bool,
    rg_hits_count: int,
    oaklib_terms_count: int,
    has_semantic_vector: bool,
    has_reviewed_domain: bool,
) -> tuple[int, dict[str, int]]:
    """Deterministic 0-100% completeness ranker for golden calibration records."""
    breakdown = {
        "sourceOnDisk": 20 if path_category == "EXISTING_SOURCE_FILE" else 0,
        "revisionBound": 20 if revision_resolution == "BINDING_EXACT" else 0,
        "cleanEvidenceText": 20 if has_clean_evidence else 0,
        "rgSymbolEvidence": 15 if rg_hits_count > 0 else 0,
        "oaklibOntologySupport": 10 if oaklib_terms_count > 0 else 0,
        "semanticVectorPresent": 10 if has_semantic_vector else 0,
        "reviewedDomainLabel": 5 if has_reviewed_domain else 0,
    }
    return sum(breakdown.values()), breakdown


def main() -> int:
    _load_env_file(REPO_ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    obo_terms = _load_obo_terms(OBO_PATH)
    rows = [json.loads(ln) for ln in GOLD_PATH.read_text(encoding="utf-8").splitlines() if ln.strip()]

    # Check PG18 semantic_768 + eg2 vector presence per packet_key / source_ref
    pg_vec_by_source: set[str] = set()
    pg_eg2_by_source: set[str] = set()
    if db_url:
        with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT relative_path
                    FROM codebase_chunk_index
                    WHERE content_embedding_768 IS NOT NULL
                    """
                )
                pg_vec_by_source = {r[0].replace("\\", "/") for r in cur.fetchall() if r[0]}
                cur.execute(
                    """
                    SELECT DISTINCT relative_path
                    FROM codebase_chunk_eg2_embeddings
                    """
                )
                pg_eg2_by_source = {r[0].replace("\\", "/") for r in cur.fetchall() if r[0]}

    path_cats: Counter[str] = Counter()
    res_cats: Counter[str] = Counter()
    scaffold_count = 0
    clean_ev_count = 0
    missing_ev_count = 0
    semantic_vec_count = 0
    eg2_vec_count = 0
    oaklib_supported_count = 0
    rg_supported_count = 0
    scores: list[int] = []

    enriched_lines: list[str] = []
    for row in rows:
        sref = str(row.get("sourceRef") or "").replace("\\", "/")
        pcat = _classify_path(sref)
        path_cats[pcat] += 1
        rev_res = str(row.get("revisionResolution") or "UNRESOLVED")
        res_cats[rev_res] += 1

        raw_ev = str(row.get("textEvidence") or "").strip()
        is_scaffold = bool(raw_ev and SCAFFOLD_CONTAMINATION_RE.search(raw_ev))
        has_clean_ev = bool(raw_ev and not is_scaffold)
        if not raw_ev:
            missing_ev_count += 1
        elif is_scaffold:
            scaffold_count += 1
        else:
            clean_ev_count += 1

        rg_lines = _rg_extract_file_evidence(sref) if pcat == "EXISTING_SOURCE_FILE" else []
        rel_count, rel_files = (0, [])
        if pcat == "MISSING_ON_DISK":
            rel_count, rel_files = _rg_find_relevant_by_basename(Path(sref).name)

        if rg_lines:
            rg_supported_count += 1

        combined_text = f"{sref} {row.get('featureLabel', '')} {raw_ev if has_clean_ev else ''} {' '.join(rg_lines)}"
        oak_hits = _match_oaklib_terms(combined_text, obo_terms)
        if oak_hits:
            oaklib_supported_count += 1

        norm_no_prefix = sref[len("sveltekit-frontend/"):] if sref.startswith("sveltekit-frontend/") else sref
        has_sem = (sref in pg_vec_by_source) or (norm_no_prefix in pg_vec_by_source)
        has_eg2 = (sref in pg_eg2_by_source) or (norm_no_prefix in pg_eg2_by_source)
        if has_sem:
            semantic_vec_count += 1
        if has_eg2:
            eg2_vec_count += 1

        score, breakdown = _compute_completeness_score(
            path_category=pcat,
            revision_resolution=rev_res,
            has_clean_evidence=has_clean_ev or bool(rg_lines),
            rg_hits_count=len(rg_lines),
            oaklib_terms_count=len(oak_hits),
            has_semantic_vector=has_sem,
            has_reviewed_domain=bool(row.get("reviewedGroup")),
        )
        scores.append(score)

        enriched = {
            **row,
            "pathCategory": pcat,
            "rawEvidenceScaffoldContaminated": is_scaffold,
            "rgSupportingLines": rg_lines,
            "rgMovedCandidateCount": rel_count,
            "rgMovedCandidateSamples": rel_files,
            "oaklibSupportingTerms": oak_hits,
            "hasSemantic768Vector": has_sem,
            "hasEg2Vector": has_eg2,
            "completenessScore": score,
            "completenessBreakdown": breakdown,
            "evidenceTextEnriched": (
                raw_ev
                if has_clean_ev
                else (" | ".join(rg_lines) if rg_lines else "")
            ),
        }
        enriched_lines.append(json.dumps(enriched, ensure_ascii=True))

    out_jsonl = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2-enriched-v1.jsonl"
    out_jsonl.write_text("\n".join(enriched_lines) + "\n", encoding="utf-8")

    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    buckets = {
        "0_to_25": sum(1 for s in scores if s <= 25),
        "26_to_50": sum(1 for s in scores if 26 <= s <= 50),
        "51_to_75": sum(1 for s in scores if 51 <= s <= 75),
        "76_to_100": sum(1 for s in scores if s >= 76),
    }
    report = {
        "schema": "atlas.domain-calibration-gold-v2-audit.v1",
        "totalRows": len(rows),
        "revisionResolution": dict(res_cats),
        "pathCategories": dict(path_cats),
        "evidenceQuality": {
            "missingEvidence": missing_ev_count,
            "scaffoldContaminated": scaffold_count,
            "cleanEvidence": clean_ev_count,
        },
        "enrichmentCoverage": {
            "rgSymbolSupported": rg_supported_count,
            "oaklibOboSupported": oaklib_supported_count,
            "oboTermsLoaded": len(obo_terms),
            "semantic768VectorPresent": semantic_vec_count,
            "eg2VectorPresent": eg2_vec_count,
        },
        "completenessRanker": {
            "averageScorePct": avg_score,
            "buckets": buckets,
        },
        "enrichedJsonlPath": str(out_jsonl.relative_to(REPO_ROOT)).replace("\\", "/"),
    }
    out_report = REPO_ROOT / "docs" / "reports" / "domain-calibration-gold-v2-audit-v1.json"
    out_report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
