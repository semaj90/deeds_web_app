"""DOC_VERSION_PIN_AUDIT_01 (READ ONLY): does each canonical external-doc page's version qualification match what this repo actually runs?

Local truth = installed package versions (sveltekit-frontend/node_modules/*/package.json, declared range from package.json) and the live Postgres/pgvector server.
Corpus truth = atlas_external_doc_pages.product_version. The corpus never invents an exact version, so CURRENT_UPSTREAM@date pages are UPSTREAM_UNPINNED (cannot be claimed
to describe the installed version); only an EXACT/MAJOR qualification that agrees with the local version is MATCH. Writes only docs/reports/doc-version-pin-audit-v1.json.
"""
from __future__ import annotations

import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "sveltekit-frontend"
NPM = {"svelte": "svelte", "sveltekit": "@sveltejs/kit", "drizzle-orm": "drizzle-orm", "drizzle-kit": "drizzle-kit", "bits-ui": "bits-ui"}


def psql(sql: str) -> str:
    return subprocess.run(["docker", "exec", "-i", "legal-ai-postgres", "psql", "-U", "legal_admin", "-d", "legal_ai_db", "-tA"], input=sql, capture_output=True, text=True, encoding="utf-8", check=True).stdout.strip()


def local_versions() -> dict[str, dict]:
    declared = {**json.loads((FE / "package.json").read_text(encoding="utf-8")).get("dependencies", {}), **json.loads((FE / "package.json").read_text(encoding="utf-8")).get("devDependencies", {})}
    out = {}
    for product, pkg in NPM.items():
        f = FE / "node_modules" / pkg / "package.json"
        out[product] = {"declaredRange": declared.get(pkg), "installed": json.loads(f.read_text(encoding="utf-8"))["version"] if f.exists() else None, "source": f"node_modules/{pkg}"}
    pg = re.search(r"PostgreSQL (\d+\.\d+)", psql("select version()"))
    out["postgresql"] = {"declaredRange": None, "installed": pg.group(1) if pg else None, "source": "live server select version()"}
    out["pgvector"] = {"declaredRange": None, "installed": psql("select extversion from pg_extension where extname='vector'") or None, "source": "live pg_extension"}
    return out


def classify(qual: str, installed: str | None) -> str:
    if not installed:
        return "LOCAL_VERSION_UNKNOWN"
    if qual.startswith("UNVERSIONED"):
        return "UNVERSIONED"
    if qual.startswith("CURRENT_UPSTREAM"):
        return "UPSTREAM_UNPINNED"  # honest: describes whatever upstream was on the crawl date, not necessarily the installed release
    if qual == installed:
        return "EXACT_MATCH"
    if re.fullmatch(r"\d+", qual) and installed.split(".")[0] == qual:
        return "MAJOR_MATCH"
    return "VERSION_MISMATCH"


def main() -> int:
    local = local_versions()
    rows = [r.split("|") for r in psql("select product, product_version, count(*) from atlas_external_doc_pages group by 1,2 order by 1,2").splitlines()]
    items = [{"product": p, "corpusQualification": q, "pages": int(n), "local": local.get(p), "status": classify(q, (local.get(p) or {}).get("installed"))} for p, q, n in rows]
    counts = Counter(i["status"] for i in items)
    for i in items:
        print(f'{i["product"]:12} {i["corpusQualification"]:32} pages={i["pages"]:<3} local={(i["local"] or {}).get("installed")} declared={(i["local"] or {}).get("declaredRange")} -> {i["status"]}')
    receipt = {
        "schema": "atlas.doc-version-pin-audit.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "DOC_VERSION_PIN_AUDIT_01", "items": items, "statusCounts": dict(counts),
        "result": "ALL_PAGES_PINNED_AND_MATCHING" if set(counts) <= {"EXACT_MATCH", "MAJOR_MATCH"} else "VERSION_PIN_GAPS",
        "finding": "npm-product pages are CURRENT_UPSTREAM@date, so they cannot be claimed to describe the installed release; pinning them needs a version-addressed crawl (e.g. the docs site's tagged/versioned path or the package's own docs at the installed tag), not a relabel.",
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0},
    }
    (ROOT / "docs/reports/doc-version-pin-audit-v1.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(receipt["result"], dict(counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
