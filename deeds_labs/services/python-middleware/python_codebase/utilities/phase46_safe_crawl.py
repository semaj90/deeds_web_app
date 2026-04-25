"""
Phase 46 - Safe Crawl & Tensor Cache (Step 1)
---------------------------------------------

Fetches a single whitelisted URL if robots.txt allows it, extracts textual
content, detects language, performs sentence splitting, and stores the result
locally for later indexing. No data leaves the machine and nothing is written
to Neo4j/pgvector/MinIO yet.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional
from urllib import robotparser
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from langdetect import DetectorFactory, detect, LangDetectException
import nltk

# Ensure deterministic language detection
DetectorFactory.seed = 0

# Attempt to load punkt; download quietly if missing
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt", quiet=True)

# Whitelisted domains for early testing
DEFAULT_WHITELIST = {
    "www.typescriptlang.org",
    "developer.mozilla.org",
    "svelte.dev",
    "kit.svelte.dev",
}

USER_AGENT = (
    "SafeCrawler/1.0 (+https://github.com/your-org) "
    "LangChainResearchBot/0.1"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Phase46 safe single-URL crawler."
    )
    parser.add_argument("url", help="URL to fetch (http/https).")
    parser.add_argument(
        "--cache-dir",
        default="cache/web",
        help="Directory to store cached documents (default: cache/web).",
    )
    parser.add_argument(
        "--allow",
        nargs="*",
        default=None,
        help="Optional override whitelist of hostnames (space separated).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip robots.txt checks (not recommended).",
    )
    return parser.parse_args()


def allowed_to_crawl(url: str, force: bool = False) -> bool:
    if force:
        return True

    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[warn] Failed to read robots.txt ({robots_url}): {exc}")
        return False
    return rp.can_fetch("*", url)


def fetch_url(url: str) -> Optional[requests.Response]:
    try:
        resp = requests.get(
            url,
            timeout=30,
            headers={"User-Agent": USER_AGENT},
        )
    except requests.RequestException as exc:
        print(f"[error] Request failed: {exc}")
        return None

    if resp.status_code != 200:
        print(f"[warn] Non-success status code: {resp.status_code}")
        return None
    return resp


def extract_text(html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    # Remove script/style and other noisy tags
    for tag in soup(["script", "style", "noscript", "header", "footer", "svg"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    text = soup.get_text(separator="\n")
    # collapse whitespace
    lines = [line.strip() for line in text.splitlines()]
    clean_text = "\n".join(line for line in lines if line)
    return {"title": title, "text": clean_text}


def detect_language(text: str) -> str:
    try:
        return detect(text)
    except LangDetectException:
        return "unknown"


def sentence_split(text: str) -> List[str]:
    sentences = nltk.sent_tokenize(text)
    return [s.strip() for s in sentences if s.strip()]


def compute_checksum(text: str) -> str:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return digest


def slug_from_checksum(checksum: str) -> str:
    return checksum[:16]


def ensure_cache_dir(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)


def load_manifest(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        print(f"[warn] Manifest at {path} is invalid JSON; starting fresh.")
        return {}


def save_manifest(path: Path, manifest: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


def main() -> int:
    args = parse_args()
    url = args.url.strip()
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        print("[error] Only http/https URLs are supported.")
        return 1

    whitelist = set(args.allow) if args.allow else DEFAULT_WHITELIST
    if parsed.netloc not in whitelist:
        print(
            f"[warn] Host '{parsed.netloc}' not in whitelist. "
            "Pass --allow to override."
        )
        return 1

    if not allowed_to_crawl(url, force=args.force):
        print("[warn] Robots.txt disallows crawling this URL. Aborting.")
        return 1

    response = fetch_url(url)
    if response is None:
        return 1

    content = extract_text(response.text)
    text = content["text"]
    if not text:
        print("[warn] No textual content extracted.")
        return 1

    lang = detect_language(text)
    if lang != "en":
        print(f"[warn] Detected language '{lang}' (expected 'en'). Skipping.")
        return 1

    sentences = sentence_split(text)
    if len(sentences) < 3:
        print("[warn] Not enough sentences extracted for meaningful embedding.")
        return 1

    checksum = compute_checksum(text)
    slug = slug_from_checksum(checksum)

    fetched_at = dt.datetime.utcnow().isoformat() + "Z"

    payload: Dict[str, Any] = {
        "source_url": url,
        "host": parsed.netloc,
        "lang": lang,
        "title": content["title"],
        "fetched_at": fetched_at,
        "checksum": checksum,
        "num_sentences": len(sentences),
        "sentences": sentences,
        "text": text,
        "status": "ok",
    }

    cache_dir = Path(args.cache_dir)
    ensure_cache_dir(cache_dir)
    manifest_path = cache_dir / "manifest.json"

    record_path = cache_dir / f"{slug}.json"
    with record_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    manifest = load_manifest(manifest_path)
    manifest[url] = {
        "path": str(record_path),
        "checksum": checksum,
        "fetched_at": fetched_at,
        "lang": lang,
        "title": content["title"],
        "num_sentences": len(sentences),
    }
    save_manifest(manifest_path, manifest)

    print(f"[info] Cached {url} -> {record_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
