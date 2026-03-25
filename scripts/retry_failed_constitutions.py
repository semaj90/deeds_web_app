#!/usr/bin/env python3
"""
retry_failed_constitutions.py
--------------------------------
Second-pass fetcher for the states that returned 404/403/connection-refused
in the main fetch run. Uses corrected/updated official URLs.

Usage:
  python scripts/retry_failed_constitutions.py
"""

import json
import os
import re
import sys
import time
import warnings
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

OUT_DIR = Path(__file__).parent / "court_data" / "constitutions"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
})

RETRY_STATES = [
    # Alabama — SOS or alternative
    {"abbr": "AL", "name": "Alabama",
     "urls": [
         "https://www.legislature.state.al.us/aliswww/AL_Constitution.htm",
         "https://sos.alabama.gov/statutes/2013/constitution",
     ], "last_amended_known": 2022},

    # Arkansas — PDF via FTP document service
    {"abbr": "AR", "name": "Arkansas",
     "urls": [
         "https://www.arkleg.state.ar.us/Home/FTPDocument?path=%2FConstitutions%2FArkansas+Constitution.pdf",
         "https://www.arkleg.state.ar.us/Home/FTPDocument?path=%2FConstitutions%2FArkansasConstitution.pdf",
     ], "last_amended_known": 2020},

    # Connecticut — CGA (try different path / wait on conn refused)
    {"abbr": "CT", "name": "Connecticut",
     "urls": [
         "https://www.cga.ct.gov/asp/content/constitutions/CTConstitution.htm",
         "https://cga.ct.gov/current/constitution.asp",
     ], "last_amended_known": 2012},

    # Georgia — law.georgia.gov PDF (path changed)
    {"abbr": "GA", "name": "Georgia",
     "urls": [
         "https://law.georgia.gov/sites/default/files/Constitution_of_Georgia.pdf",
         "https://law.georgia.gov/sites/law.georgia.gov/files/Constitution_of_Georgia.pdf",
         "https://georgia.gov/sites/georgia.gov/files/Constitution_of_Georgia_2022.pdf",
         "https://law.georgia.gov/constitution",
     ], "last_amended_known": 2022},

    # Hawaii — capitol.hawaii.gov (PDF 403 → try HTML)
    {"abbr": "HI", "name": "Hawaii",
     "urls": [
         "https://www.capitol.hawaii.gov/hrscurrent/Vol01_Ch0001-0042F/HRS_Constitution/hrsconstdefault.htm",
         "https://www.capitol.hawaii.gov/constitution/constitution.htm",
         "https://www.hawaii.gov/gov/hawaii-state-constitution",
     ], "last_amended_known": 2022},

    # Iowa — legis.iowa.gov (URL changed)
    {"abbr": "IA", "name": "Iowa",
     "urls": [
         "https://www.legis.iowa.gov/law/constitution",
         "https://www.legis.iowa.gov/law/const",
         "https://coolice.legis.iowa.gov/Links/IowaCode/IowaConstitution.htm",
     ], "last_amended_known": 1998},

    # Kansas — session year updated to 2025-26
    {"abbr": "KS", "name": "Kansas",
     "urls": [
         "https://kslegislature.org/li/b2025_26/statute/constitution/",
         "https://kslegislature.org/li_2016s1/b2017_18/constitution/",
         "https://kslegislature.org/li/",
     ], "last_amended_known": 2022},

    # Kentucky — apps.legislature.ky.gov
    {"abbr": "KY", "name": "Kentucky",
     "urls": [
         "https://apps.legislature.ky.gov/law/constitution/constitution.aspx",
         "https://apps.legislature.ky.gov/Law/Constitution/Constitution.aspx",
         "https://lrc.ky.gov/GenInfo/Constitution.htm",
     ], "last_amended_known": 2020},

    # Maine — legislature.maine.gov (path changed)
    {"abbr": "ME", "name": "Maine",
     "urls": [
         "https://legislature.maine.gov/statutes/constitution",
         "https://legislature.maine.gov/legis/statutes/constitution.html",
         "https://www.maine.gov/sos/cec/rules/02/350/350.htm",
         "https://legislature.maine.gov/general/constitution/",
     ], "last_amended_known": 2024},

    # Mississippi — sos.ms.gov PDF (path changed)
    {"abbr": "MS", "name": "Mississippi",
     "urls": [
         "https://www.sos.ms.gov/content/documents/elections/MississippiConstitution.pdf",
         "https://www.sos.ms.gov/Portals/0/PS/SOS_Divisions/Election/msconstitution2022.pdf",
         "https://www.sos.ms.gov/Elections_Voting/Documents/MSCONSTITUTION.pdf",
         "https://www.sos.ms.gov/elections",
     ], "last_amended_known": 2022},

    # Montana — leg.mt.gov (path changed)
    {"abbr": "MT", "name": "Montana",
     "urls": [
         "https://leg.mt.gov/laws/constitution",
         "https://leg.mt.gov/bills/mca_toc/constitution/",
         "https://leg.mt.gov/bills/mca_toc/",
     ], "last_amended_known": 2004},

    # New Hampshire — nh.gov (403 → try sos)
    {"abbr": "NH", "name": "New Hampshire",
     "urls": [
         "https://sos.nh.gov/elections/elections-data/statutes-and-rules",
         "https://sos.nh.gov/media/1101/nhconstitution-rev.pdf",
         "https://www.nh.gov/governance/state-constitution.htm",
     ], "last_amended_known": 2022},

    # New Jersey — njleg (path changed)
    {"abbr": "NJ", "name": "New Jersey",
     "urls": [
         "https://www.njleg.state.nj.us/legislation/constitution",
         "https://nj.gov/njleg/constitution",
         "https://www.njleg.state.nj.us/Papers/conbook.pdf",
         "https://www.state.nj.us/state/docs/njconstitution.pdf",
     ], "last_amended_known": 2023},

    # New Mexico — nmlegis.gov (path changed)
    {"abbr": "NM", "name": "New Mexico",
     "urls": [
         "https://www.nmlegis.gov/EnactedLegislation/Constitution",
         "https://www.nmlegis.gov/Publications/NewMexicoConstitution.pdf",
         "https://www.nmlegis.gov/GetContent?fileStorageId=58",
     ], "last_amended_known": 2022},

    # New York — nysenate 403 → try NY state DOS PDF
    {"abbr": "NY", "name": "New York",
     "urls": [
         "https://dos.ny.gov/system/files/documents/2022/02/Constitution-January-1-2022.pdf",
         "https://www.nysenate.gov/legislation/laws/CNS/article1",
         "https://www.dos.ny.gov/info/constitution.htm",
         "https://www.dos.ny.gov/info/pdfs/constitution.pdf",
     ], "last_amended_known": 2023},

    # North Carolina — ncleg.gov (path changed)
    {"abbr": "NC", "name": "North Carolina",
     "urls": [
         "https://www.ncleg.gov/Laws/Constitution/Article1",
         "https://www.ncleg.gov/Laws/GeneralStatuteSections/Chapter_nc_const",
         "https://ncleg.net/Legislation/Statutes/StatutesTOC.pl?Chapter=0000",
     ], "last_amended_known": 2022},

    # North Dakota — legis.nd.gov (path changed)
    {"abbr": "ND", "name": "North Dakota",
     "urls": [
         "https://ndlegis.gov/constitution",
         "https://www.legis.nd.gov/general-information/north-dakota-constitution",
         "https://legis.nd.gov/constitution",
     ], "last_amended_known": 2022},

    # Oregon — oregonlegislature.gov (.html → .htm)
    {"abbr": "OR", "name": "Oregon",
     "urls": [
         "https://www.oregonlegislature.gov/bills_laws/ors/const.htm",
         "https://oregonlegislature.gov/bills_laws/ors/const.htm",
         "https://www.oregonlegislature.gov/bills_laws/Pages/Constitution.aspx",
     ], "last_amended_known": 2024},

    # Rhode Island — connection refused
    {"abbr": "RI", "name": "Rhode Island",
     "urls": [
         "https://www.rilegislature.gov/laws/constitution.htm",
         "https://rilegislature.gov/laws/constitution.htm",
         "https://www.sos.ri.gov/divisions/civics-education/constitution",
     ], "last_amended_known": 2004},

    # Utah — le.utah.gov (path changed)
    {"abbr": "UT", "name": "Utah",
     "urls": [
         "https://le.utah.gov/xcode/Constitution/",
         "https://le.utah.gov/xcode/constitution/",
         "https://le.utah.gov/xcode/title68/chapter3/68-3-7.html",
         "https://le.utah.gov/xcode/Title68/Chapter3/68-3.html",
     ], "last_amended_known": 2024},

    # West Virginia — wvlegislature.gov (path changed)
    {"abbr": "WV", "name": "West Virginia",
     "urls": [
         "https://www.wvlegislature.gov/WVCODE/WV_CONSTITUTION.cfm",
         "https://code.wvlegislature.gov/wv-constitution/article-1/",
         "https://www.wvlegislature.gov/wvcode/wvconstitution.cfm",
     ], "last_amended_known": 2024},

    # Wisconsin — legis.wisconsin.gov (path changed)
    {"abbr": "WI", "name": "Wisconsin",
     "urls": [
         "https://legis.wisconsin.gov/statutes/prefaces/const/",
         "https://docs.legis.wisconsin.gov/statutes/statutes/Constitution.pdf",
         "https://legis.wisconsin.gov/statutes/Constitution",
     ], "last_amended_known": 2024},

    # Puerto Rico — lexjuris.com (path changed)
    {"abbr": "PR", "name": "Puerto Rico",
     "urls": [
         "https://www.lexjuris.com/LexJurisConstitucion/ConIng000.htm",
         "https://www.lexjuris.com/LexJurisConstitucion/ConEng00100.htm",
         "https://www.lexjuris.com/lexcons.htm",
     ], "last_amended_known": 1952},

    # Guam — Organic Act (connection refused)
    {"abbr": "GU", "name": "Guam",
     "urls": [
         "https://www.guamlegislature.com/organic-act/",
         "https://www.guamlegislature.com/organic_act/organic_act.html",
         "https://guamlegislature.com/organic-act-of-guam/",
     ], "last_amended_known": 2019},

    # Virgin Islands — vi.gov (path changed)
    {"abbr": "VI", "name": "US Virgin Islands",
     "urls": [
         "https://www.vi.gov/government/",
         "https://laws.vi.gov/",
         "https://www.vi.gov/",
     ], "last_amended_known": 2016},
]


def extract_html_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer",
                     "aside", "form", "iframe", "noscript", "svg"]):
        tag.decompose()
    selectors = ["main", "article", "#content", ".content", "#main-content",
                 ".constitution", ".law-text", ".statute-text",
                 "#lawText", ".bill-text", ".session-law", "#page-content",
                 ".article-content", "body"]
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 500:
                return text
    return soup.get_text(separator="\n", strip=True)


def extract_pdf_text(content: bytes) -> str:
    import io
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            return "\n\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
        return f"[PDF extraction failed: {e}]"


def try_url(url: str, timeout: int = 25) -> tuple[str, int]:
    """Returns (text, status_code). text='' on failure."""
    try:
        r = SESSION.get(url, timeout=timeout, allow_redirects=True)
        ct = r.headers.get("Content-Type", "")
        if r.status_code == 200:
            if "pdf" in ct.lower() or url.lower().endswith(".pdf"):
                return extract_pdf_text(r.content), 200
            return extract_html_text(r.text), 200
        return "", r.status_code
    except Exception:
        return "", -1


_AMEND_PATTERNS = [
    r"(?:last\s+amended|as\s+amended(?:\s+through)?)[^\d]*(\d{4})",
    r"(?:effective|revised|updated|ratified)[^\d]*(\d{4})",
    r"\bamended\s+(?:in\s+)?(\d{4})\b",
]


def detect_year(text: str) -> Optional[int]:
    years = set()
    for pat in _AMEND_PATTERNS:
        for m in re.finditer(pat, text[:20000], re.I):
            y = int(m.group(1))
            if 1776 <= y <= 2026:
                years.add(y)
    for m in re.finditer(r"\b(20(?:0[0-9]|1[0-9]|2[0-6]))\b", text[:30000]):
        years.add(int(m.group(1)))
    return max(years) if years else None


def main():
    print(f"\n{'='*70}")
    print(f"  RETRY PASS — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  States: {len(RETRY_STATES)}")
    print(f"{'='*70}\n")

    success = failed = 0

    for entry in RETRY_STATES:
        abbr = entry["abbr"]
        name = entry["name"]
        known = entry.get("last_amended_known")

        print(f"  [{abbr}] {name}")
        best_text = ""
        best_url  = ""
        best_sc   = -1

        for url in entry["urls"]:
            text, sc = try_url(url)
            if sc == 200 and len(text) >= 500:
                best_text = text
                best_url  = url
                best_sc   = sc
                print(f"       ✓ {url}")
                print(f"         {len(text):,} chars | year={detect_year(text)}")
                break
            else:
                print(f"       ✗ HTTP {sc}  {url}")
            time.sleep(0.5)

        if best_text:
            year = detect_year(best_text)
            out_file = OUT_DIR / f"{abbr.lower()}_constitution.jsonl"
            with open(out_file, "w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "title":              f"{name} Constitution",
                    "citation":           f"{name} Const.",
                    "court":              f"{name} Legislature",
                    "jurisdiction_level": "state",
                    "jurisdiction_state": name,
                    "document_type":      "constitution",
                    "case_date":          f"{year or known or 2000}-01-01",
                    "opinion_text":       best_text,
                    "summary":            best_text[:600].strip(),
                    "source":             "constitution",
                    "source_url":         best_url,
                    "source_id":          f"const_{abbr.lower()}",
                    "is_official":        True,
                    "detected_amendment_year": year,
                    "known_amendment_year":    known,
                    "currency_badge": ("CURRENT" if year and year >= 2023 else
                                       "RECENT" if year and year >= 2019 else
                                       "DATED"),
                }, ensure_ascii=False) + "\n")
            # Remove any old _NEEDS_RENDERING placeholder
            placeholder = OUT_DIR / f"{abbr.lower()}_constitution_NEEDS_RENDERING.jsonl"
            if placeholder.exists():
                placeholder.unlink()
            success += 1
        else:
            failed += 1
            print(f"       ✗ All URLs failed for {abbr}")

        print()
        time.sleep(1.0)

    print(f"\n{'='*70}")
    print(f"  Retry succeeded: {success}/{len(RETRY_STATES)}")
    print(f"  Still failed:    {failed}")

    # List all available JSONL files
    jsonl_files = sorted(OUT_DIR.glob("*_constitution.jsonl"))
    print(f"\n  Available constitution files: {len(jsonl_files)}")
    for f in jsonl_files:
        sz = f.stat().st_size
        print(f"    {f.name:<45} {sz:>10,} bytes")

    print(f"\n  To ingest all into PostgreSQL:")
    print(f"  python scripts/ingest_court_opinions.py scripts/court_data/constitutions/*.jsonl --source constitution")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
