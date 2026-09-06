#!/usr/bin/env python3
"""Validate the existing BeautifulSoup capture shape with Pydantic.

This is a boundary validator, not a crawler or persistence owner. By default it
reads a JSON capture from stdin or --input. --url is an explicit opt-in to the
existing ``python.atlas_external_docs.fetch_beautifulsoup`` adapter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))


class BeautifulSoupCaptureV1(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    fetcher: str = Field(min_length=1)
    url: HttpUrl
    resolved_url: HttpUrl
    title: str = Field(min_length=1)
    markdown: str = Field(min_length=1)
    raw_checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    normalized_checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    outgoing_urls: tuple[HttpUrl, ...] = ()
    metadata: dict[str, Any] = {}
    canonical_authority: bool = False

    @field_validator("fetcher")
    @classmethod
    def require_beautifulsoup_or_known_capture(cls, value: str) -> str:
        if value not in {"BEAUTIFULSOUP_HTTP", "FIRECRAWL_V2", "fallback"}:
            raise ValueError("unsupported capture producer")
        return value

    @field_validator("normalized_checksum")
    @classmethod
    def checksum_matches_normalized_text(cls, value: str, info: Any) -> str:
        markdown = info.data.get("markdown")
        if isinstance(markdown, str) and hashlib.sha256(markdown.encode("utf-8")).hexdigest() != value:
            raise ValueError("normalized_checksum does not match UTF-8 markdown bytes")
        return value

    @model_validator(mode="after")
    def validate_boundary(self) -> "BeautifulSoupCaptureV1":
        if self.canonical_authority:
            raise ValueError("capture is an observation; canonical_authority must be false")
        if urlparse(str(self.resolved_url)).scheme not in {"http", "https"}:
            raise ValueError("resolved_url must be HTTP(S)")
        return self


def load_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.url:
        from atlas_external_docs import fetch_beautifulsoup

        return fetch_beautifulsoup(args.url).to_dict()
    raw = Path(args.input).read_text(encoding="utf-8") if args.input else sys.stdin.read()
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("capture JSON must be an object")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="JSON capture file; stdin when omitted")
    parser.add_argument("--url", help="explicitly fetch one URL through the existing BeautifulSoup adapter")
    args = parser.parse_args()
    if args.input and args.url:
        parser.error("use --input or --url, not both")
    try:
        capture = BeautifulSoupCaptureV1.model_validate(load_payload(args))
    except Exception as exc:  # noqa: BLE001 - CLI validation boundary
        print(json.dumps({"schema": "atlas.okf-beautifulsoup-capture.v1", "status": "REJECTED", "error": str(exc)}))
        return 1
    print(json.dumps({
        "schema": "atlas.okf-beautifulsoup-capture.v1",
        "status": "VALIDATED",
        "fetcher": capture.fetcher,
        "resolvedUrl": str(capture.resolved_url),
        "contentChecksum": capture.normalized_checksum,
        "parser": capture.metadata.get("parser"),
        "parserVersion": capture.metadata.get("parserVersion"),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
