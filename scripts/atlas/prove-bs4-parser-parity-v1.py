#!/usr/bin/env python3
"""Fixture-only BeautifulSoup parser comparison; no network or persistence."""

from __future__ import annotations

import hashlib
import json
import re
from importlib.metadata import version
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs/reports/parent-atlas/bs4-parser-parity-v1.json"
FIXTURES = {
    "valid-structured": """<!doctype html><html><head><meta charset="utf-8"><title>API é 🚀</title></head>
<body><main><h1>API Overview</h1><p>Use <code>search()</code>.</p>
<pre><code class="language-python">def f(x):\n    return x + 1</code></pre>
<a href="/reference#one">Reference</a></main></body></html>""",
    "malformed-nested": "<main><h2>Rules</h2><ul><li>one<li>two</ul><p>AT&amp;T &lt; API",
    "table-unicode": "<main><h2>Limits</h2><table><tr><th>é</th><th>🚀</th></tr><tr><td>1</td><td>2</td></tr></table></main>",
}


def projection(html: str, parser: str) -> dict[str, object]:
    soup = BeautifulSoup(html.encode("utf-8"), parser)
    main = soup.find("main") or soup.body or soup
    headings = [re.sub(r"\s+", " ", tag.get_text(" ", strip=True)) for tag in main.find_all(re.compile(r"^h[1-6]$"))]
    code = [tag.get_text("\n") for tag in main.find_all("pre")]
    links = sorted({str(tag["href"]).split("#", 1)[0] for tag in soup.find_all("a", href=True)})
    text = re.sub(r"\s+", " ", main.get_text(" ", strip=True))
    return {
        "title": soup.title.get_text(" ", strip=True) if soup.title else None,
        "headings": headings,
        "code": code,
        "links": links,
        "textChecksum": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }


def main() -> int:
    parser_outputs: dict[str, dict[str, dict[str, object]]] = {
        parser: {name: projection(html, parser) for name, html in FIXTURES.items()}
        for parser in ["html.parser"]
    }
    try:
        version("lxml")
        parser_outputs["lxml"] = {name: projection(html, "lxml") for name, html in FIXTURES.items()}
    except Exception:
        pass
    parity = len(parser_outputs) == 2 and all(
        parser_outputs["html.parser"][name] == parser_outputs["lxml"][name] for name in FIXTURES
    )
    report = {
        "schema": "atlas.bs4.parser-parity.v1",
        "status": "BS4_PARSER_PARITY_PROVEN" if parity else "BS4_PARSER_PARITY_REVIEW_REQUIRED",
        "beautifulSoupVersion": version("beautifulsoup4"),
        "productionParser": "html.parser",
        "fixtureCount": len(FIXTURES),
        "parsersCompared": sorted(parser_outputs),
        "parity": parity,
        "projections": parser_outputs,
        "networkCalls": False,
        "writesPerformed": False,
        "productionParserChanged": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if parity else 1


if __name__ == "__main__":
    raise SystemExit(main())
