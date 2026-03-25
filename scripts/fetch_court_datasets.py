#!/usr/bin/env python3
"""
fetch_court_datasets.py
-----------------------
Discover and optionally download legal court-opinion datasets from:
  - HuggingFace Hub  (casehold, pile-of-law, lex_glue, CourtListener exports)
  - CourtListener Bulk API  (Free Law Project — free, jurisdiction-tagged)
  - Harvard Caselaw Access Project (CAP) API
  - DOJ Press Release Archive (recent opinions / summaries)

Usage:
  python scripts/fetch_court_datasets.py list            # show all known datasets
  python scripts/fetch_court_datasets.py download hf casehold/casehold
  python scripts/fetch_court_datasets.py download cl --jurisdiction ca --limit 1000
  python scripts/fetch_court_datasets.py download cap --jurisdiction ma --limit 500
  python scripts/fetch_court_datasets.py download doj --limit 200

After download, run:
  python scripts/ingest_court_opinions.py <downloaded_file.jsonl>

Requirements (install once):
  pip install requests datasets huggingface_hub tqdm
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Known HuggingFace datasets for US law
# ---------------------------------------------------------------------------
HF_DATASETS = [
    {
        "id": "casehold/casehold",
        "name": "CaseHOLD",
        "description": "53 k US court opinions with holdings from the Harvard CAP corpus. "
                        "Each example has a citing context, five candidate holdings, and the correct holding. "
                        "Good for: opinion retrieval, holding classification.",
        "jurisdiction": "federal + state (mixed)",
        "size": "~53 k rows",
        "splits": ["train", "validation", "test"],
        "license": "CC BY 4.0",
        "url": "https://huggingface.co/datasets/casehold/casehold",
    },
    {
        "id": "pile-of-law/pile-of-law",
        "name": "Pile of Law",
        "description": "256 GB corpus of diverse legal text: court opinions (federal + state), "
                        "contracts, statutes, regulatory text, bar exam prep, law review articles. "
                        "Subsets can be filtered by source. Use the 'opinions_federal' or "
                        "'opinions_state' subsets to pull only court opinions.",
        "jurisdiction": "federal + state (separate subsets)",
        "size": "~256 GB total; opinion subsets ~30-50 GB",
        "splits": ["train"],
        "license": "CC BY 4.0",
        "url": "https://huggingface.co/datasets/pile-of-law/pile-of-law",
    },
    {
        "id": "coastalcph/lex_glue",
        "name": "LexGLUE",
        "description": "Seven legal NLP benchmark tasks covering ECtHR decisions, EU legislation, "
                        "US Supreme Court opinions (SCOTUS), contract NLI, and more. "
                        "scotus split has ~5 700 US Supreme Court decisions with issue-area labels.",
        "jurisdiction": "US Supreme Court (scotus split) + EU",
        "size": "~50 k rows across tasks",
        "splits": ["train", "validation", "test"],
        "license": "CC BY 4.0",
        "url": "https://huggingface.co/datasets/coastalcph/lex_glue",
    },
    {
        "id": "jncraton/court-listener-opinions",
        "name": "CourtListener Opinions Export",
        "description": "A CourtListener bulk-data export uploaded to HuggingFace. "
                        "Contains federal and state opinion metadata (citations, court, date) "
                        "with download links to full text via CourtListener API.",
        "jurisdiction": "federal + state (structured)",
        "size": "~8 M opinion metadata rows (linked to full text)",
        "splits": ["train"],
        "license": "CC0 / Public Domain",
        "url": "https://huggingface.co/datasets/jncraton/court-listener-opinions",
    },
    {
        "id": "rcf1/all-case-law",
        "name": "All Case Law (HF Mirror)",
        "description": "Mirror of Harvard Caselaw Access Project full-text opinions. "
                        "Contains opinions from all 50 states + federal courts pre-2021.",
        "jurisdiction": "all US jurisdictions",
        "size": "~6.7 M opinions",
        "splits": ["train"],
        "license": "Public Domain (pre-1928) / CC BY-NC-SA (1928+)",
        "url": "https://huggingface.co/datasets/rcf1/all-case-law",
    },
    {
        "id": "HFforLegal/legal-summarization",
        "name": "Legal Summarization",
        "description": "Court opinions paired with human-written summaries. "
                        "Useful for training summarization models and evaluating "
                        "AI-generated summaries of court opinions.",
        "jurisdiction": "US federal courts (mixed)",
        "size": "~430 k pairs",
        "splits": ["train", "validation", "test"],
        "license": "Apache 2.0",
        "url": "https://huggingface.co/datasets/HFforLegal/legal-summarization",
    },
]

# ---------------------------------------------------------------------------
# CourtListener jurisdiction codes (partial list)
# ---------------------------------------------------------------------------
CL_JURISDICTION_MAP = {
    # Federal
    "scotus": ("supreme", None, "US Supreme Court"),
    "ca1": ("federal", None, "First Circuit"),
    "ca2": ("federal", None, "Second Circuit"),
    "ca3": ("federal", None, "Third Circuit"),
    "ca4": ("federal", None, "Fourth Circuit"),
    "ca5": ("federal", None, "Fifth Circuit"),
    "ca6": ("federal", None, "Sixth Circuit"),
    "ca7": ("federal", None, "Seventh Circuit"),
    "ca8": ("federal", None, "Eighth Circuit"),
    "ca9": ("federal", None, "Ninth Circuit"),
    "ca10": ("federal", None, "Tenth Circuit"),
    "ca11": ("federal", None, "Eleventh Circuit"),
    "cadc": ("federal", None, "DC Circuit"),
    "cafc": ("federal", None, "Federal Circuit"),
    "dcd": ("federal", None, "D.D.C."),
    "kyed": ("federal", None, "E.D. Ky."),
    # State (add more as needed)
    "cal": ("state", "California", "California Supreme Court"),
    "calctapp": ("state", "California", "California Court of Appeal"),
    "ny": ("state", "New York", "New York Court of Appeals"),
    "nyappdiv": ("state", "New York", "NY Appellate Division"),
    "tex": ("state", "Texas", "Texas Supreme Court"),
    "fla": ("state", "Florida", "Florida Supreme Court"),
    "ill": ("state", "Illinois", "Illinois Supreme Court"),
    "pa": ("state", "Pennsylvania", "Pennsylvania Supreme Court"),
    "ohio": ("state", "Ohio", "Ohio Supreme Court"),
    "mich": ("state", "Michigan", "Michigan Supreme Court"),
    "ga": ("state", "Georgia", "Georgia Supreme Court"),
    "nc": ("state", "North Carolina", "North Carolina Supreme Court"),
    "va": ("state", "Virginia", "Virginia Supreme Court"),
    "wash": ("state", "Washington", "Washington Supreme Court"),
    "ariz": ("state", "Arizona", "Arizona Supreme Court"),
    "nv": ("state", "Nevada", "Nevada Supreme Court"),
    "co": ("state", "Colorado", "Colorado Supreme Court"),
    "or": ("state", "Oregon", "Oregon Supreme Court"),
    "mn": ("state", "Minnesota", "Minnesota Supreme Court"),
    "mo": ("state", "Missouri", "Missouri Supreme Court"),
    "la": ("state", "Louisiana", "Louisiana Supreme Court"),
    "md": ("state", "Maryland", "Maryland Court of Appeals"),
    "nj": ("state", "New Jersey", "New Jersey Supreme Court"),
    "ma": ("state", "Massachusetts", "Massachusetts Supreme Judicial Court"),
    "ct": ("state", "Connecticut", "Connecticut Supreme Court"),
    "wi": ("state", "Wisconsin", "Wisconsin Supreme Court"),
    "in": ("state", "Indiana", "Indiana Supreme Court"),
}

DOWNLOAD_DIR = Path(__file__).parent / "court_data"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ensure_download_dir():
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def print_dataset_table(datasets):
    print(f"\n{'─'*80}")
    print(f"{'ID':<45} {'Jurisdiction':<28} {'Size'}")
    print(f"{'─'*80}")
    for d in datasets:
        print(f"{d['id']:<45} {d['jurisdiction']:<28} {d['size']}")
    print(f"{'─'*80}\n")
    for d in datasets:
        print(f"  [{d['id']}]  {d['name']}")
        print(f"  {d['description']}")
        print(f"  License: {d['license']}  |  URL: {d['url']}")
        print()


# ---------------------------------------------------------------------------
# HuggingFace download
# ---------------------------------------------------------------------------

def download_hf(dataset_id: str, split: str = "train", subset: str = None,
                limit: int = 5000, output_file: str = None):
    try:
        from datasets import load_dataset
    except ImportError:
        print("ERROR: Install the `datasets` package first:\n  pip install datasets")
        sys.exit(1)

    print(f"\n[HF] Loading dataset: {dataset_id}  split={split}  subset={subset or 'default'}")
    load_kwargs = dict(split=split, streaming=True)
    if subset:
        load_kwargs["name"] = subset

    try:
        ds = load_dataset(dataset_id, **load_kwargs)
    except RuntimeError as e:
        if "loading script" in str(e).lower():
            print(f"  Dataset {dataset_id} uses a legacy loading script incompatible with current `datasets` library.")
            print("  Try a parquet-based mirror instead. Recommended alternatives:")
            print("    coastalcph/lex_glue  (scotus config ~5700 SCOTUS opinions)")
            print("    HFforLegal/legal-summarization  (430k opinion+summary pairs)")
            print("    jncraton/court-listener-opinions  (8M metadata rows)")
            sys.exit(1)
        raise

    outfile = output_file or str(DOWNLOAD_DIR / f"{dataset_id.replace('/', '__')}__{split}.jsonl")
    ensure_download_dir()

    print(f"[HF] Streaming {limit} rows → {outfile}")
    count = 0
    with open(outfile, "w", encoding="utf-8") as f:
        for row in ds:
            f.write(json.dumps(row, default=str) + "\n")
            count += 1
            if count % 500 == 0:
                print(f"  {count} rows written...", end="\r", flush=True)
            if count >= limit:
                break

    print(f"\n[HF] Done — {count} rows saved to {outfile}")
    return outfile


# ---------------------------------------------------------------------------
# CourtListener Bulk API download
# ---------------------------------------------------------------------------

def download_courtlistener(court_slug: str = "scotus", limit: int = 1000,
                            after_date: str = None, output_file: str = None,
                            api_token: str = None):
    """
    Downloads opinion clusters from CourtListener's REST API.
    Free account required — get token at https://www.courtlistener.com/sign-in/
    Set CL_API_TOKEN env var or pass --cl-token on the CLI.
    API docs: https://www.courtlistener.com/api/rest/v3/
    """
    api_token = api_token or os.environ.get("CL_API_TOKEN", "")
    try:
        import requests
    except ImportError:
        print("ERROR: Install requests:\n  pip install requests")
        sys.exit(1)

    ensure_download_dir()
    outfile = output_file or str(DOWNLOAD_DIR / f"courtlistener__{court_slug}.jsonl")

    base_url = "https://www.courtlistener.com/api/rest/v3/clusters/"
    params = {
        "court": court_slug,
        "format": "json",
        "page_size": min(limit, 100),
        "order_by": "-date_filed",
    }
    if after_date:
        params["date_filed__gt"] = after_date

    jlevel, jstate, court_name = CL_JURISDICTION_MAP.get(
        court_slug, ("federal", None, court_slug))

    print(f"\n[CourtListener] Court: {court_name} ({court_slug}) → {outfile}")
    if not api_token:
        print("  ⚠  No CL_API_TOKEN set.")
        print("     CourtListener now requires a free account token.")
        print("     Register at https://www.courtlistener.com/sign-in/ and set CL_API_TOKEN env var.")
        print("  Attempting unauthenticated request (may 401)...")
    count = 0
    next_url = base_url
    cl_headers = {"User-Agent": "deeds-legal-ai/1.0"}
    if api_token:
        cl_headers["Authorization"] = f"Token {api_token}"

    with open(outfile, "w", encoding="utf-8") as f:
        while next_url and count < limit:
            try:
                resp = requests.get(next_url, params=params if next_url == base_url else None,
                                    timeout=30,
                                    headers=cl_headers)
                resp.raise_for_status()
            except Exception as e:
                print(f"\nERROR fetching {next_url}: {e}")
                break

            data = resp.json()
            results = data.get("results", [])
            for cluster in results:
                # Normalize to our court_opinions schema
                row = {
                    "title": cluster.get("case_name", ""),
                    "citation": (cluster.get("citations") or [""])[0] if cluster.get("citations") else "",
                    "docket_number": cluster.get("docket", {}).get("docket_number", "") if isinstance(cluster.get("docket"), dict) else "",
                    "court": court_name,
                    "jurisdiction_level": jlevel,
                    "jurisdiction_state": jstate,
                    "circuit": court_name if jlevel == "federal" else None,
                    "case_date": cluster.get("date_filed"),
                    "judges": cluster.get("judges", ""),
                    "summary": cluster.get("syllabus", ""),
                    "holding": "",
                    "practice_area": None,
                    "source": "courtlistener",
                    "source_url": f"https://www.courtlistener.com{cluster.get('absolute_url', '')}",
                    "source_id": str(cluster.get("id", "")),
                    "_raw_cluster": cluster,
                }
                f.write(json.dumps(row, default=str) + "\n")
                count += 1
                if count >= limit:
                    break

            print(f"  {count}/{limit} clusters fetched...", end="\r", flush=True)
            next_url = data.get("next")
            params = None   # pagination URL already has params
            time.sleep(0.25)  # be polite to CL servers

    if count == 0 and not api_token:
        print("\n  TIP: Set CL_API_TOKEN environment variable and retry.")
        print("       e.g.  $env:CL_API_TOKEN = 'your_token_here'")
    print(f"\n[CourtListener] Done — {count} clusters saved to {outfile}")
    return outfile


# ---------------------------------------------------------------------------
# Harvard CAP download
# ---------------------------------------------------------------------------

def download_cap(jurisdiction: str = "us", limit: int = 500,
                 api_key: str = None, output_file: str = None):
    """
    Downloads opinions from Harvard Caselaw Access Project API.
    Full text requires a free API key from: https://case.law/user/register/
    """
    try:
        import requests
    except ImportError:
        print("ERROR: Install requests:\n  pip install requests")
        sys.exit(1)

    api_key = api_key or os.environ.get("CAP_API_KEY", "")
    ensure_download_dir()
    outfile = output_file or str(DOWNLOAD_DIR / f"cap__{jurisdiction}.jsonl")

    headers = {"Authorization": f"Token {api_key}"} if api_key else {}
    params = {
        "jurisdiction": jurisdiction,
        "page_size": min(limit, 100),
        "full_case": "true" if api_key else "false",
    }

    print(f"\n[CAP] Jurisdiction: {jurisdiction} → {outfile}")
    if not api_key:
        print("  ⚠  No CAP_API_KEY set — full opinion text will be unavailable.")
        print("     Register free at https://case.law/user/register/ and set CAP_API_KEY env var.")

    count = 0
    next_url = "https://api.case.law/v1/cases/"

    with open(outfile, "w", encoding="utf-8") as f:
        while next_url and count < limit:
            try:
                resp = requests.get(next_url, params=params if "case.law" in next_url and "?" not in next_url else None,
                                    headers=headers, timeout=30)
                resp.raise_for_status()
            except Exception as e:
                print(f"\nERROR: {e}")
                break

            data = resp.json()
            for case in data.get("results", []):
                court = case.get("court", {})
                jurisdiction_info = case.get("jurisdiction", {})
                row = {
                    "title": case.get("name", ""),
                    "citation": case.get("citations", [{}])[0].get("cite", "") if case.get("citations") else "",
                    "docket_number": case.get("docket_number", ""),
                    "court": court.get("name", ""),
                    "jurisdiction_level": "state" if jurisdiction_info.get("slug") not in ("us", "dc") else "federal",
                    "jurisdiction_state": jurisdiction_info.get("name"),
                    "circuit": None,
                    "case_date": case.get("decision_date"),
                    "judges": "",
                    "opinion_text": case.get("casebody", {}).get("data", {}).get("opinions", [{}])[0].get("text", "") if api_key else "",
                    "summary": "",
                    "holding": "",
                    "source": "cap",
                    "source_url": case.get("frontend_url", ""),
                    "source_id": str(case.get("id", "")),
                }
                f.write(json.dumps(row, default=str) + "\n")
                count += 1
                if count >= limit:
                    break

            print(f"  {count}/{limit} cases...", end="\r", flush=True)
            next_url = data.get("next")
            params = None
            time.sleep(0.2)

    print(f"\n[CAP] Done — {count} cases saved to {outfile}")
    return outfile


# ---------------------------------------------------------------------------
# DOJ Press Release Archive
# ---------------------------------------------------------------------------

def _download_doj_rss(limit: int, outfile: str):
    """Fallback: parse DOJ RSS/Atom feed for press releases."""
    import requests
    import xml.etree.ElementTree as ET

    rss_urls = [
        "https://www.justice.gov/news/rss",
        "https://www.justice.gov/rss/news.xml",
        "https://www.justice.gov/feeds/opa/justice-news.xml",
    ]
    count = 0
    with open(outfile, "w", encoding="utf-8") as f:
        for feed_url in rss_urls:
            try:
                resp = requests.get(feed_url, timeout=20,
                                    headers={"User-Agent": "deeds-legal-ai/1.0"})
                if resp.status_code != 200:
                    continue
                root = ET.fromstring(resp.content)
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                # Try RSS <item> first, then Atom <entry>
                items = (root.findall(".//item") or
                         root.findall(".//atom:entry", ns) or
                         root.findall(".//entry"))
                for item in items:
                    if count >= limit:
                        break
                    def _text(tag, ns_prefix=None):
                        el = item.find(tag) if not ns_prefix else item.find(f"{ns_prefix}:{tag}", ns)
                        return el.text.strip() if el is not None and el.text else ""
                    title = _text("title") or _text("title", "atom")
                    link  = _text("link")  or _text("link", "atom")
                    date  = _text("pubDate") or _text("updated", "atom") or _text("published", "atom")
                    body  = _text("description") or _text("summary", "atom")
                    # Parse RFC 2822 / ISO-8601 dates from RSS feeds
                    parsed_date = None
                    if date:
                        try:
                            from email.utils import parsedate_to_datetime
                            parsed_date = parsedate_to_datetime(date).date().isoformat()
                        except Exception:
                            try:
                                parsed_date = date[:10] if len(date) >= 10 and date[:10].replace('-', '').isdigit() else None
                            except Exception:
                                parsed_date = None
                    row = {
                        "title": title,
                        "court": "US Department of Justice",
                        "jurisdiction_level": "federal",
                        "jurisdiction_state": None,
                        "circuit": None,
                        "case_date": parsed_date,
                        "opinion_text": body,
                        "summary": body[:500] if body else "",
                        "source": "doj",
                        "source_url": link,
                        "source_id": link,
                    }
                    f.write(json.dumps(row, default=str) + "\n")
                    count += 1
                if count > 0:
                    print(f"  ✓ Parsed {count} items from {feed_url}")
                    break
            except Exception as e:
                print(f"  RSS feed {feed_url} failed: {e}")
    if count == 0:
        print("  ✗ All DOJ RSS feeds failed. Skipping DOJ source.")
    print(f"\n[DOJ] Done — {count} items saved to {outfile}")


def download_doj(limit: int = 200, output_file: str = None):
    """
    Downloads DOJ press release summaries from the DOJ public RSS/JSON feed.
    These are federal case outcomes with cause descriptions.
    """
    try:
        import requests
    except ImportError:
        print("ERROR: Install requests:\n  pip install requests")
        sys.exit(1)

    ensure_download_dir()
    outfile = output_file or str(DOWNLOAD_DIR / "doj_press_releases.jsonl")

    # DOJ public search API — try multiple known URL patterns
    DOJ_ENDPOINTS = [
        "https://www.justice.gov/api/v1/press.json",
        "https://www.justice.gov/api/v1/news.json",
        "https://www.justice.gov/api/v1/press-releases.json",
    ]
    url = None
    params = {"pagesize": min(limit, 100), "page": 0, "fields": "title,changed,body,uuid,url"}
    import requests as _req
    for candidate in DOJ_ENDPOINTS:
        try:
            test = _req.get(candidate, params={"pagesize": 1, "page": 0}, timeout=10,
                            headers={"User-Agent": "deeds-legal-ai/1.0"})
            if test.status_code == 200:
                url = candidate
                print(f"  ✓ DOJ API endpoint: {url}")
                break
        except Exception:
            pass
    if not url:
        print("  ⚠  All DOJ JSON endpoints returned non-200. Falling back to RSS feed.")
        _download_doj_rss(limit, outfile)
        return outfile

    print(f"\n[DOJ] Downloading press releases → {outfile}")
    count = 0

    with open(outfile, "w", encoding="utf-8") as f:
        while count < limit:
            try:
                resp = requests.get(url, params=params, timeout=30,
                                    headers={"User-Agent": "deeds-legal-ai/1.0"})
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"\nERROR: {e}")
                break

            results = data.get("results", [])
            if not results:
                break

            for item in results:
                row = {
                    "title": item.get("title", ""),
                    "court": "US Department of Justice",
                    "jurisdiction_level": "federal",
                    "jurisdiction_state": None,
                    "circuit": None,
                    "case_date": item.get("changed", "")[:10] if item.get("changed") else None,
                    "opinion_text": item.get("body", ""),
                    "summary": item.get("body", "")[:500] if item.get("body") else "",
                    "source": "doj",
                    "source_url": f"https://www.justice.gov{item.get('url', '')}",
                    "source_id": item.get("uuid", ""),
                }
                f.write(json.dumps(row, default=str) + "\n")
                count += 1
                if count >= limit:
                    break

            print(f"  {count}/{limit} press releases...", end="\r", flush=True)
            params["page"] += 1
            time.sleep(0.3)

    print(f"\n[DOJ] Done — {count} items saved to {outfile}")
    return outfile


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fetch legal court opinion datasets from HuggingFace, CourtListener, CAP, or DOJ",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command")

    # list
    subparsers.add_parser("list", help="List all known datasets and sources")

    # download hf
    dl = subparsers.add_parser("download", help="Download a dataset")
    dl.add_argument("source", choices=["hf", "cl", "cap", "doj"],
                    help="hf=HuggingFace  cl=CourtListener  cap=Harvard CAP  doj=DOJ press releases")
    dl.add_argument("--dataset", help="HF dataset ID (for hf source)")
    dl.add_argument("--split", default="train", help="HF dataset split (default: train)")
    dl.add_argument("--subset", help="HF dataset subset/config name (e.g. opinions_federal)")
    dl.add_argument("--jurisdiction", default="scotus",
                    help="Court slug for CL (e.g. ca9, cal, scotus) or CAP jurisdiction slug")
    dl.add_argument("--limit", type=int, default=1000, help="Max rows to download (default: 1000)")
    dl.add_argument("--after", help="Only fetch opinions after this date (YYYY-MM-DD, CL only)")
    dl.add_argument("--cap-key", help="CAP API key (or set CAP_API_KEY env var)")
    dl.add_argument("--cl-token", help="CourtListener API token (or set CL_API_TOKEN env var)")
    dl.add_argument("--output", help="Output JSONL file path")

    args = parser.parse_args()

    if args.command == "list":
        print("\n=== HuggingFace Legal Datasets ===")
        print_dataset_table(HF_DATASETS)
        print("\n=== CourtListener Court Slugs (sample) ===")
        for slug, (level, state, name) in sorted(CL_JURISDICTION_MAP.items()):
            state_str = f"({state})" if state else "(federal)"
            print(f"  {slug:<12} {level:<10} {state_str:<22} {name}")
        print()
        print("=== After downloading, run: ===")
        print("  python scripts/ingest_court_opinions.py <downloaded_file.jsonl>")
        return

    if args.command == "download":
        if args.source == "hf":
            if not args.dataset:
                print("ERROR: --dataset required for HuggingFace source")
                print("Example: --dataset casehold/casehold")
                sys.exit(1)
            download_hf(args.dataset, split=args.split, subset=args.subset,
                        limit=args.limit, output_file=args.output)

        elif args.source == "cl":
            download_courtlistener(court_slug=args.jurisdiction, limit=args.limit,
                                   after_date=args.after, output_file=args.output,
                                   api_token=getattr(args, "cl_token", None))

        elif args.source == "cap":
            download_cap(jurisdiction=args.jurisdiction, limit=args.limit,
                         api_key=args.cap_key, output_file=args.output)

        elif args.source == "doj":
            download_doj(limit=args.limit, output_file=args.output)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
