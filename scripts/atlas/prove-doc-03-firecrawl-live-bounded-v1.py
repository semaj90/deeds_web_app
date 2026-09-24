#!/usr/bin/env python3
"""Run one tightly bounded Firecrawl v2 canary; never persists returned pages."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_okf_docs_pipeline import (  # noqa: E402
    SourceConfig,
    build_firecrawl_crawl_v2_request,
    firecrawl_crawl_v2,
)

REPORT = ROOT / "docs" / "reports" / "parent-atlas" / "doc-03-firecrawl-live-bounded-v1.json"


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--maximum-pages", type=int, default=3)
    parser.add_argument("--maximum-depth", type=int, default=1)
    parser.add_argument("--follow-sitemap", action="store_true", default=False)
    args = parser.parse_args()

    if not 1 <= args.maximum_pages <= 5:
        raise ValueError("DOC_03_CANARY_PAGE_LIMIT_MUST_BE_1_TO_5")
    if not 0 <= args.maximum_depth <= 2:
        raise ValueError("DOC_03_CANARY_DEPTH_MUST_BE_0_TO_2")
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        raise RuntimeError("FIRECRAWL_API_KEY_REQUIRED")
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("DOC_03_HTTPS_URL_REQUIRED")

    hostname = parsed.hostname.lower()
    source = SourceConfig(
        source_id="doc-03-live-canary",
        source_revision="doc-03-live-canary:v1",
        title="DOC-03 bounded Firecrawl canary",
        base_urls=(args.url,),
        allowed_domains=(hostname,),
        authority_class="EXTERNAL_DOCUMENTATION",
        default_fetcher="FIRECRAWL_CRAWL",
        output_namespace="docs/.okf/doc-03-canary",
        include_paths=(),
        exclude_paths=(),
        maximum_pages=args.maximum_pages,
        maximum_depth=args.maximum_depth,
        follow_sitemap=args.follow_sitemap,
        pages=(),
        ldr_export_files=(),
        source_namespace="doc-03-canary",
    )
    request_body = build_firecrawl_crawl_v2_request(source)

    try:
        pages = firecrawl_crawl_v2(
            source, api_key=api_key, poll_seconds=1.0, maximum_wait_seconds=120
        )
        failure = None
    except Exception as exc:  # do not persist provider body, request headers, or credentials
        pages = ()
        failure = {"class": type(exc).__name__, "httpStatus": getattr(exc, "code", None)}

    cross_domain = [
        page.resolved_url for page in pages
        if (urlparse(page.resolved_url).hostname or "").lower() != hostname
    ]
    wrong_fetcher = [page.resolved_url for page in pages if page.fetcher != "FIRECRAWL_V2"]
    missing_crawl_ids = [page.resolved_url for page in pages if not page.metadata.get("crawl_id")]
    checks = {
        "pageCountNonzero": len(pages) > 0,
        "pageCountWithinLimit": len(pages) <= args.maximum_pages,
        "requestLimitBound": request_body["limit"] == args.maximum_pages,
        "requestDepthBound": request_body["maxDiscoveryDepth"] == args.maximum_depth,
        "requestSitemapBound": request_body["sitemap"] == ("include" if args.follow_sitemap else "skip"),
        "externalLinksDisabled": request_body["allowExternalLinks"] is False,
        "subdomainsDisabled": request_body["allowSubdomains"] is False,
        "entireDomainDisabled": request_body["crawlEntireDomain"] is False,
        "allResultsAllowedDomain": not cross_domain,
        "allResultsFirecrawlV2": not wrong_fetcher,
        "crawlIdsPresent": not missing_crawl_ids,
    }
    passed = all(checks.values())
    report = {
        "schema": "atlas.doc-03.firecrawl-live-bounded-proof.v1",
        "gate": "DOC-03",
        "status": "DOC_03_LIVE_BOUNDED_CRAWL_PROVEN" if passed else "DOC_03_LIVE_BOUNDED_CRAWL_FAILED",
        "mode": "LIVE_EXTERNAL_READ_NO_CORPUS_PERSISTENCE",
        "source": {
            "url": args.url, "allowedDomain": hostname, "maximumPages": args.maximum_pages,
            "maximumDepth": args.maximum_depth, "followSitemap": args.follow_sitemap,
        },
        "submittedRequest": request_body,
        "submittedRequestChecksum": sha256(stable_json(request_body)),
        "observed": {
            "pageCount": len(pages),
            "resolvedUrls": [page.resolved_url for page in pages],
            "normalizedChecksums": [page.normalized_checksum for page in pages],
            "failure": failure,
        },
        "checks": checks,
        "apiKeyRecorded": False,
        "pageBodiesRecorded": False,
        "corpusWritesPerformed": False,
        "postgresWritesPerformed": False,
        "qdrantWritesPerformed": False,
        "neo4jWritesPerformed": False,
        "valkeyWritesPerformed": False,
        "canonicalPromotion": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "pageCount": len(pages), "reportPath": str(REPORT)}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
