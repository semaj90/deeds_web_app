#!/usr/bin/env python3
"""Capture official DSPy docs into immutable local .okf artifacts only.

Firecrawl Map discovers the current docs URLs; BeautifulSoup normalizes each
same-origin HTML page. No PostgreSQL, Valkey, Qdrant, graph, or model calls.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from atlas_external_docs import extract_structured_text  # noqa: E402

CONFIG_PATH = ROOT / ".okf/docs/dspy/corpus.json"
CONFIG_ROOT = ROOT / ".okf/docs/dspy"
OUTPUT_ROOT = ROOT / ".okf/docs/dspy/snapshots"
MAX_MAP_BYTES = 4 * 1024 * 1024
MAX_INDEX_BYTES = 2 * 1024 * 1024
MAX_PAGE_BYTES = 8 * 1024 * 1024
TIMEOUT_SECONDS = 45


def sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def stable_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def bounded_get(url: str, max_bytes: int) -> tuple[bytes, str, str]:
    request = Request(url, headers={"User-Agent": "ParentAtlas-OfficialDocsSnapshot/1.0", "Accept": "text/html,text/plain,application/xml,*/*;q=0.8"})
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 - URLs checked by caller
        payload = response.read(max_bytes + 1)
        if len(payload) > max_bytes:
            raise ValueError(f"RESPONSE_TOO_LARGE:{max_bytes}")
        return payload, response.geturl(), response.headers.get("content-type", "unknown")


def in_scope(url: str, authority: str, prefix: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.netloc == urlparse(authority).netloc and parsed.path.startswith(prefix) and not parsed.query and not parsed.fragment


def discover(config: dict, api_key: str, limit: int) -> tuple[list[str], bytes]:
    payload = stable_json({"url": config["authority"] + config["scopePrefix"], "limit": limit, "includeSubdomains": False, "sitemap": "only"})
    request = Request(config["firecrawlMapEndpoint"], data=payload, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 - fixed Firecrawl endpoint
        raw = response.read(MAX_MAP_BYTES + 1)
    if len(raw) > MAX_MAP_BYTES:
        raise ValueError("FIRECRAWL_MAP_RESPONSE_TOO_LARGE")
    result = json.loads(raw)
    if result.get("success") is False:
        raise RuntimeError("FIRECRAWL_MAP_FAILED")
    links = result.get("links") or []
    urls = set()
    for item in links:
        candidate = item.get("url") if isinstance(item, dict) else item
        if isinstance(candidate, str) and in_scope(candidate, config["authority"], config["scopePrefix"]):
            urls.add(candidate)
    if not urls:
        raise ValueError("FIRECRAWL_MAP_RETURNED_NO_IN_SCOPE_URLS")
    return sorted(urls), raw


def capture_page(url: str, config: dict, output_dir: Path) -> dict:
    try:
        raw, resolved, content_type = bounded_get(url, MAX_PAGE_BYTES)
        if not in_scope(resolved, config["authority"], config["scopePrefix"]):
            raise ValueError("REDIRECT_OUTSIDE_DECLARED_SCOPE")
        title, text, outgoing = extract_structured_text(raw, base_url=resolved)
        if not text.strip():
            raise ValueError("BEAUTIFULSOUP_EMPTY_TEXT")
        if len(text.encode("utf-8")) > MAX_PAGE_BYTES:
            raise ValueError("NORMALIZED_PAGE_TOO_LARGE")
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()
        html_rel = f"pages/{key}.html"
        text_rel = f"pages/{key}.md"
        (output_dir / "pages").mkdir(parents=True, exist_ok=True)
        (output_dir / html_rel).write_bytes(raw)
        normalized = text.encode("utf-8")
        (output_dir / text_rel).write_bytes(normalized)
        return {
            "status": "FETCHED", "canonicalUrl": url, "resolvedUrl": resolved,
            "title": title, "contentType": content_type,
            "rawHtmlSha256": sha256(raw), "normalizedTextSha256": sha256(normalized),
            "rawByteLength": len(raw), "normalizedByteLength": len(normalized),
            "artifactRefs": {"rawHtml": html_rel, "normalizedText": text_rel},
            "outgoingUrlCount": len(outgoing), "normalizer": "atlas_external_docs.extract_structured_text",
        }
    except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as exc:
        return {"status": "FAILED", "canonicalUrl": url, "reason": f"{type(exc).__name__}:{exc}"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true", help="perform bounded local capture; without this flag only print the plan")
    parser.add_argument("--verify-dir", help="verify a prior snapshot directory without network access")
    parser.add_argument("--config", default=str(CONFIG_PATH.relative_to(ROOT)), help="source config inside .okf/docs/dspy")
    parser.add_argument("--limit", type=int, default=250)
    parser.add_argument("--concurrency", type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.limit <= 250 or not 1 <= args.concurrency <= 4:
        parser.error("limit must be 1..250 and concurrency must be 1..4")
    if args.fetch and args.verify_dir:
        parser.error("--fetch and --verify-dir are mutually exclusive")
    if args.verify_dir:
        snapshot = (ROOT / args.verify_dir).resolve()
        if not snapshot.is_relative_to(OUTPUT_ROOT.resolve()):
            raise ValueError("VERIFY_DIR_OUTSIDE_DSPY_SNAPSHOT_ROOT")
        manifest_bytes = (snapshot / "manifest.json").read_bytes()
        manifest = json.loads(manifest_bytes)
        receipt_path = snapshot / "receipt.json"
        receipt = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else {}
        pages = manifest.get("pages", [])
        checked = 0
        failures = []
        if receipt.get("manifestSha256") != sha256(manifest_bytes):
            failures.append("RECEIPT_MANIFEST_CHECKSUM_MISMATCH")
        if receipt.get("filesystemSnapshotWritten") is not True or receipt.get("datastoreWritesPerformed") is not False:
            failures.append("RECEIPT_WRITE_SCOPE_INVALID")
        for row in pages:
            if row.get("status") != "FETCHED":
                failures.append(f"PAGE_NOT_FETCHED:{row.get('canonicalUrl', 'unknown')}")
                continue
            for key, digest_key in (("rawHtml", "rawHtmlSha256"), ("normalizedText", "normalizedTextSha256")):
                rel = Path(row["artifactRefs"][key])
                if rel.is_absolute() or ".." in rel.parts:
                    failures.append("ARTIFACT_PATH_INVALID")
                    continue
                artifact = (snapshot / rel).resolve()
                if not artifact.is_relative_to(snapshot):
                    failures.append("ARTIFACT_PATH_ESCAPE")
                    continue
                if not artifact.exists() or sha256(artifact.read_bytes()) != row[digest_key]:
                    failures.append(f"ARTIFACT_CHECKSUM_MISMATCH:{row.get('canonicalUrl')}:{key}")
                else:
                    checked += 1
        if manifest.get("pagesManifestSha256") != sha256((snapshot / "pages.jsonl").read_bytes()):
            failures.append("PAGES_MANIFEST_CHECKSUM_MISMATCH")
        for item in manifest.get("indexes", []):
            artifact = (snapshot / item["artifactRef"]).resolve()
            if not artifact.is_relative_to(snapshot) or not artifact.exists() or sha256(artifact.read_bytes()) != item["sha256"]:
                failures.append(f"INDEX_CHECKSUM_MISMATCH:{item.get('url')}")
            else:
                checked += 1
        print(json.dumps({"schema": "atlas.dspy-doc-snapshot-verification.v1", "manifestSha256": sha256(manifest_bytes), "pageCount": len(pages), "artifactsVerified": checked, "failureCount": len(failures), "failures": failures[:20], "canonicalAuthority": False, "datastoreWritesPerformed": False}, indent=2))
        return 0 if not failures else 2

    config_path = (ROOT / args.config).resolve()
    if not config_path.is_relative_to(CONFIG_ROOT.resolve()):
        raise ValueError("CONFIG_OUTSIDE_DSPY_DOCS_ROOT")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("schema") != "atlas.local-doc-corpus-source.v1" or config.get("canonicalAuthority") is not False:
        raise ValueError("DSPY_CORPUS_CONFIG_INVALID")
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        raise RuntimeError("FIRECRAWL_API_KEY_REQUIRED")
    urls, map_bytes = discover(config, api_key, args.limit)
    if len(urls) > args.limit:
        raise ValueError("DISCOVERY_EXCEEDS_DECLARED_LIMIT")
    url_set_checksum = sha256(("\n".join(urls) + "\n").encode("utf-8"))
    if not args.fetch:
        print(json.dumps({"schema": "atlas.dspy-doc-capture-plan.v1", "corpusId": config["corpusId"], "urlCount": len(urls), "urlSetChecksum": url_set_checksum, "fetchRequested": False, "canonicalAuthority": False, "writesPerformed": False}, indent=2))
        return 0

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + url_set_checksum.removeprefix("sha256:")[:12]
    output_dir = OUTPUT_ROOT / run_id
    output_dir.mkdir(parents=True, exist_ok=False)
    (output_dir / "indexes").mkdir()
    (output_dir / "indexes/firecrawl-map.json").write_bytes(map_bytes)
    index_records = []
    for key, url in (("llms.txt", config["discoveryIndex"]), ("sitemap.xml", config["sitemap"])):
        body, resolved, content_type = bounded_get(url, MAX_INDEX_BYTES)
        if not in_scope(resolved, config["authority"], config["scopePrefix"]):
            raise ValueError(f"INDEX_REDIRECT_OUTSIDE_SCOPE:{key}")
        (output_dir / "indexes" / key).write_bytes(body)
        index_records.append({"url": url, "resolvedUrl": resolved, "contentType": content_type, "sha256": sha256(body), "byteLength": len(body), "artifactRef": f"indexes/{key}"})

    page_records = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(capture_page, url, config, output_dir) for url in urls]
        for future in as_completed(futures):
            page_records.append(future.result())
    page_records.sort(key=lambda row: row["canonicalUrl"])
    successful = [row for row in page_records if row["status"] == "FETCHED"]
    failed = [row for row in page_records if row["status"] != "FETCHED"]
    pages_bytes = b"".join(stable_json(row) for row in page_records)
    (output_dir / "pages.jsonl").write_bytes(pages_bytes)
    manifest = {
        "schema": "atlas.local-doc-snapshot-manifest.v1", "corpusId": config["corpusId"],
        "sourceAuthority": config["sourceAuthority"], "versionChannel": config["versionChannel"],
        "scope": config["authority"] + config["scopePrefix"], "generatedAt": datetime.now(timezone.utc).isoformat(),
        "captureMethod": config["captureMethod"], "normalizerRevision": "atlas_external_docs.extract_structured_text/BeautifulSoup-html.parser",
        "discovery": {"provider": "firecrawl-map-v2", "urlCount": len(urls), "urlSetSha256": url_set_checksum, "mapResponseSha256": sha256(map_bytes)},
        "indexes": index_records, "discoveredPageCount": len(urls), "fetchedPageCount": len(successful), "failedPageCount": len(failed),
        "pagesManifestSha256": sha256(pages_bytes), "pages": page_records,
        "admissionState": "LOCAL_UNADMITTED" if not failed else "LOCAL_PARTIAL_UNADMITTED",
        "canonicalAuthority": False, "writesPerformed": True, "datastoreWritesPerformed": False,
        "writes": {"filesystemSnapshot": True, "postgres": 0, "valkey": 0, "qdrant": 0, "neo4j": 0, "graphify": 0, "embeddingCalls": 0},
    }
    manifest_bytes = stable_json(manifest)
    (output_dir / "manifest.json").write_bytes(manifest_bytes)
    receipt = {"schema": "atlas.dspy-doc-capture-receipt.v1", "corpusId": config["corpusId"], "outputDir": output_dir.relative_to(ROOT).as_posix(), "manifestSha256": sha256(manifest_bytes), "discoveredPageCount": len(urls), "fetchedPageCount": len(successful), "failedPageCount": len(failed), "admissionState": manifest["admissionState"], "canonicalAuthority": False, "writesPerformed": True, "filesystemSnapshotWritten": True, "datastoreWritesPerformed": False}
    (output_dir / "receipt.json").write_bytes(stable_json(receipt))
    print(json.dumps(receipt, indent=2))
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
