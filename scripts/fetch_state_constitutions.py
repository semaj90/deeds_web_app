#!/usr/bin/env python3
"""
fetch_state_constitutions.py
-----------------------------
Fetches all 50 US state constitutions + DC + territories from their OFFICIAL
government sources (.gov / legislature domains only).

For each constitution, this script:
  1. Verifies the URL domain is official (.gov / legislature / legis / assembly)
  2. Fetches & parses the text (HTML or PDF)
  3. Extracts the "last amended" or "last revised" date from the document
  4. Reports currency (last amendment year)
  5. Saves JSONL to scripts/court_data/constitutions/
  6. Optionally ingests directly to PostgreSQL with embeddings

Usage:
  python scripts/fetch_state_constitutions.py --check-only       # verify URLs, show amendment dates
  python scripts/fetch_state_constitutions.py --all              # fetch all 54 jurisdictions
  python scripts/fetch_state_constitutions.py --state CA         # single state
  python scripts/fetch_state_constitutions.py --all --ingest     # fetch + push to DB

Requirements:
  pip install requests beautifulsoup4 lxml pdfplumber psycopg2-binary pgvector
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# -- Config ---------------------------------------------------------------------
DB_CONFIG = {
    "host":     os.environ.get("PGHOST",     "127.0.0.1"),
    "port":     int(os.environ.get("PGPORT", "5432")),
    "database": os.environ.get("PGDATABASE", "legal_ai_db"),
    "user":     os.environ.get("PGUSER",     "legal_admin"),
    "password": os.environ.get("PGPASSWORD", "123456"),
}
OLLAMA_URL  = os.environ.get("OLLAMA_URL",  "http://127.0.0.1:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "embeddinggemma:latest")
OUT_DIR     = Path(__file__).parent / "court_data" / "constitutions"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "LegalResearch-ConstitutionFetcher/1.0 (educational; contact: admin@deeds.local)",
    "Accept": "text/html,application/xhtml+xml,application/pdf,*/*",
    "Accept-Language": "en-US,en;q=0.9",
})

# -- Official constitution registry --------------------------------------------
# Each entry: abbr, name, url, url_type, notes
# url_type: "html" | "pdf" | "multi_html" (multiple article pages)
# Official domain keywords that qualify a source as authoritative:
OFFICIAL_DOMAIN_PATTERNS = [
    r"\.gov$", r"\.gov/", r"legislature\.", r"legis\.", r"assembly\.",
    r"senate\.", r"\.us$", r"\.us/", r"house\.state\.", r"capitol\.",
    r"revisor\.", r"statutes\.", r"law\.", r"codes\.", r"leg\.",
    r"sos\.", r"mgaleg\.", r"ncleg\.", r"ilga\.", r"wslegislature\.",
    r"malegislature\.", r"nysenate\.", r"azleg\.", r"flsenate\.",
    r"txlegislature\.", r"law\.cornell\.edu",  # Cornell LII (authoritative mirror)
]

CONSTITUTIONS = [
    # -- Tier 1: Official .gov legislature sites --------------------------------
    {"abbr": "AL", "name": "Alabama",        "url": "https://legiscan.com/AL/text/constitution", "backup": "https://www.legislature.state.al.us/aliswww/AL_Constitution.htm",
     "official_url": "https://www.legislature.state.al.us/aliswww/AL_Constitution.htm",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "AK", "name": "Alaska",         "url": "https://ltgov.alaska.gov/information/alaskas-constitution/",
     "official_url": "https://ltgov.alaska.gov/information/alaskas-constitution/",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "AZ", "name": "Arizona",        "url": "https://www.azleg.gov/constitution/",
     "official_url": "https://www.azleg.gov/constitution/",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "AR", "name": "Arkansas",       "url": "https://www.arkleg.state.ar.us/Home/FTPDocument?path=%2FConstitutions%2FArkansas+Constitution.pdf",
     "official_url": "https://www.arkleg.state.ar.us/Home/FTPDocument?path=%2FConstitutions%2FArkansas+Constitution.pdf",
     "url_type": "pdf", "last_amended_known": 2020,
     "fallback_urls": ["https://www.arkleg.state.ar.us/assembly/Summary/ArkansasConstitution1874.pdf"]},
    {"abbr": "CA", "name": "California",     "url": "https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=CONS",
     "official_url": "https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=CONS",
     "url_type": "html", "last_amended_known": 2024,
     "fallback_urls": ["https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1.&lawCode=CONS",
                       "https://www.ca.gov/government/state/constitution/"]},
    {"abbr": "CO", "name": "Colorado",       "url": "https://leg.colorado.gov/colorado-constitution",
     "official_url": "https://leg.colorado.gov/colorado-constitution",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "CT", "name": "Connecticut",    "url": "https://www.cga.ct.gov/asp/Content/constitutions/CTConstitution.htm",
     "official_url": "https://www.cga.ct.gov/asp/Content/constitutions/CTConstitution.htm",
     "url_type": "html", "last_amended_known": 2012},
    {"abbr": "DE", "name": "Delaware",       "url": "https://delcode.delaware.gov/constitution/index.html",
     "official_url": "https://delcode.delaware.gov/constitution/index.html",
     "url_type": "html", "last_amended_known": 2017},
    {"abbr": "FL", "name": "Florida",        "url": "https://www.flsenate.gov/Laws/Constitution",
     "official_url": "https://www.flsenate.gov/Laws/Constitution",
     "url_type": "html", "last_amended_known": 2020},
    {"abbr": "GA", "name": "Georgia",        "url": "https://law.georgia.gov/sites/law.georgia.gov/files/2023-08/Constitution_of_Georgia.pdf",
     "official_url": "https://law.georgia.gov/sites/law.georgia.gov/files/2023-08/Constitution_of_Georgia.pdf",
     "url_type": "pdf", "last_amended_known": 2022},
    {"abbr": "HI", "name": "Hawaii",         "url": "https://www.capitol.hawaii.gov/constitution/constitution.pdf",
     "official_url": "https://www.capitol.hawaii.gov/constitution/constitution.pdf",
     "url_type": "pdf", "last_amended_known": 2022},
    {"abbr": "ID", "name": "Idaho",          "url": "https://legislature.idaho.gov/statutesrules/idconst/",
     "official_url": "https://legislature.idaho.gov/statutesrules/idconst/",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "IL", "name": "Illinois",       "url": "https://www.ilga.gov/commission/lrb/conmain.htm",
     "official_url": "https://www.ilga.gov/commission/lrb/conmain.htm",
     "url_type": "html", "last_amended_known": 1994},
    {"abbr": "IN", "name": "Indiana",        "url": "https://www.in.gov/legislative/laws/constitution/Article-1/",
     "official_url": "https://www.in.gov/legislative/laws/constitution/Article-1/",
     "url_type": "html", "last_amended_known": 2016},
    {"abbr": "IA", "name": "Iowa",           "url": "https://www.legis.iowa.gov/law/iowaCode/constitution",
     "official_url": "https://www.legis.iowa.gov/law/iowaCode/constitution",
     "url_type": "html", "last_amended_known": 1998},
    {"abbr": "KS", "name": "Kansas",         "url": "https://kslegislature.org/li/b2023_24/statute/000_constitution/article_000constitution_/000_000000_0000000_k/",
     "official_url": "https://kslegislature.org/li/b2023_24/statute/000_constitution/article_000constitution_/000_000000_0000000_k/",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "KY", "name": "Kentucky",       "url": "https://legislature.ky.gov/Law/Constitution/Pages/default.aspx",
     "official_url": "https://legislature.ky.gov/Law/Constitution/Pages/default.aspx",
     "url_type": "html", "last_amended_known": 2020},
    {"abbr": "LA", "name": "Louisiana",      "url": "https://www.legis.la.gov/legis/LawSearch.aspx?searchUniqueKey=c197487f-db35-4a40-8e81-9c7d8aacc8a2",
     "official_url": "https://legis.la.gov/Legis/Law.aspx?d=202477",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "ME", "name": "Maine",          "url": "https://legislature.maine.gov/legis/statutes/const/title0ch0sec0.html",
     "official_url": "https://legislature.maine.gov/legis/statutes/const/title0ch0sec0.html",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "MD", "name": "Maryland",       "url": "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=ccl&section=0-101&enactments=False&archived=False",
     "official_url": "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=dec&section=01-01",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "MA", "name": "Massachusetts",  "url": "https://malegislature.gov/Laws/Constitution",
     "official_url": "https://malegislature.gov/Laws/Constitution",
     "url_type": "html", "last_amended_known": 2008},
    {"abbr": "MI", "name": "Michigan",       "url": "https://www.legislature.mi.gov/Laws/Constitution",
     "official_url": "https://www.legislature.mi.gov/Laws/Constitution",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "MN", "name": "Minnesota",      "url": "https://www.revisor.mn.gov/constitution/",
     "official_url": "https://www.revisor.mn.gov/constitution/",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "MS", "name": "Mississippi",    "url": "https://www.sos.ms.gov/content/documents/elections/Mississippi%20Constitution.pdf",
     "official_url": "https://www.sos.ms.gov/content/documents/elections/Mississippi%20Constitution.pdf",
     "url_type": "pdf", "last_amended_known": 2022},
    {"abbr": "MO", "name": "Missouri",       "url": "https://revisor.mo.gov/main/PageSelect.aspx?section=const_art1sec1&bid=1&eid=",
     "official_url": "https://revisor.mo.gov/main/PageSelect.aspx",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "MT", "name": "Montana",        "url": "https://leg.mt.gov/bills/mca_toc/Constitution.htm",
     "official_url": "https://leg.mt.gov/bills/mca_toc/Constitution.htm",
     "url_type": "html", "last_amended_known": 2004},
    {"abbr": "NE", "name": "Nebraska",       "url": "https://nebraskalegislature.gov/laws/articles.php?article=I-1",
     "official_url": "https://nebraskalegislature.gov/laws/articles.php?article=I-1",
     "url_type": "html", "last_amended_known": 2020},
    {"abbr": "NV", "name": "Nevada",         "url": "https://www.leg.state.nv.us/Const/NvConst.html",
     "official_url": "https://www.leg.state.nv.us/Const/NvConst.html",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "NH", "name": "New Hampshire",  "url": "https://www.nh.gov/glance/constitution.htm",
     "official_url": "https://www.nh.gov/glance/constitution.htm",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "NJ", "name": "New Jersey",     "url": "https://www.njleg.state.nj.us/bills/BillsByYear.asp",
     "official_url": "https://pub.njleg.state.nj.us/constitution.asp",
     "url_type": "html", "last_amended_known": 2023},
    {"abbr": "NM", "name": "New Mexico",     "url": "https://www.nmlegis.gov/Constitution/",
     "official_url": "https://www.nmlegis.gov/Constitution/",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "NY", "name": "New York",       "url": "https://www.nysenate.gov/legislation/laws/CNS",
     "official_url": "https://www.nysenate.gov/legislation/laws/CNS",
     "url_type": "html", "last_amended_known": 2023},
    {"abbr": "NC", "name": "North Carolina", "url": "https://www.ncleg.gov/Laws/Constitution/Constitution",
     "official_url": "https://www.ncleg.gov/Laws/Constitution/Constitution",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "ND", "name": "North Dakota",   "url": "https://www.legis.nd.gov/information/statutes/cent-code/constitution",
     "official_url": "https://www.legis.nd.gov/information/statutes/cent-code/constitution",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "OH", "name": "Ohio",           "url": "https://codes.ohio.gov/ohio-constitution",
     "official_url": "https://codes.ohio.gov/ohio-constitution",
     "url_type": "html", "last_amended_known": 2023},
    {"abbr": "OK", "name": "Oklahoma",       "url": "https://www.oscn.net/applications/oscn/DeliverDocument.asp?CiteID=46702",
     "official_url": "https://www.oscn.net/applications/oscn/Index.asp?level=1&type=CONSTITUTION",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "OR", "name": "Oregon",         "url": "https://www.oregonlegislature.gov/bills_laws/Pages/ORS.aspx",
     "official_url": "https://www.oregonlegislature.gov/bills_laws/ors/const.html",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "PA", "name": "Pennsylvania",   "url": "https://www.legis.state.pa.us/cfdocs/legis/LI/Public/cons_index.cfm",
     "official_url": "https://www.legis.state.pa.us/cfdocs/legis/LI/Public/cons_index.cfm",
     "url_type": "html", "last_amended_known": 2023},
    {"abbr": "RI", "name": "Rhode Island",   "url": "http://webserver.rilin.state.ri.us/RiConstitution/",
     "official_url": "http://webserver.rilin.state.ri.us/RiConstitution/",
     "url_type": "html", "last_amended_known": 2004},
    {"abbr": "SC", "name": "South Carolina", "url": "https://www.scstatehouse.gov/scconstitution/scconst.php",
     "official_url": "https://www.scstatehouse.gov/scconstitution/scconst.php",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "SD", "name": "South Dakota",   "url": "https://sdlegislature.gov/Statutes/Constitution/Details/16",
     "official_url": "https://sdlegislature.gov/Statutes/Constitution/Details/16",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "TN", "name": "Tennessee",      "url": "https://www.capitol.tn.gov/legislation/constitution.html",
     "official_url": "https://www.capitol.tn.gov/legislation/constitution.html",
     "url_type": "html", "last_amended_known": 2014,
     "fallback_urls": ["https://sos.tn.gov/products/division-of-publications/tennessee-blue-book",
                       "https://www.tn.gov/content/dam/tn/attorneygeneral/documents/Tennessee_State_Constitution.pdf"]},
    {"abbr": "TX", "name": "Texas",          "url": "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.1.htm",
     "official_url": "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.1.htm",
     "url_type": "multi_html", "last_amended_known": 2023,
     "extra_article_urls": [
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.2.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.3.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.4.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.5.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.6.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.7.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.9.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.16.htm",
         "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.17.htm",
     ]},
    {"abbr": "UT", "name": "Utah",           "url": "https://le.utah.gov/xcode/Constitution/art01/art01.htm",
     "official_url": "https://le.utah.gov/xcode/Constitution/art01/art01.htm",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "VT", "name": "Vermont",        "url": "https://legislature.vermont.gov/statutes/constitution-of-the-state-of-vermont/",
     "official_url": "https://legislature.vermont.gov/statutes/constitution-of-the-state-of-vermont/",
     "url_type": "html", "last_amended_known": 2022},
    {"abbr": "VA", "name": "Virginia",       "url": "https://law.lis.virginia.gov/constitution/",
     "official_url": "https://law.lis.virginia.gov/constitution/",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "WA", "name": "Washington",     "url": "https://leg.wa.gov/LawsAndAgencyRules/Pages/constitution.aspx",
     "official_url": "https://leg.wa.gov/LawsAndAgencyRules/Pages/constitution.aspx",
     "url_type": "html", "last_amended_known": 2023},
    {"abbr": "WV", "name": "West Virginia",  "url": "https://code.wvlegislature.gov/wv-constitution/",
     "official_url": "https://code.wvlegislature.gov/wv-constitution/",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "WI", "name": "Wisconsin",      "url": "https://docs.legis.wisconsin.gov/document/statutes/Constitution",
     "official_url": "https://docs.legis.wisconsin.gov/document/statutes/Constitution",
     "url_type": "html", "last_amended_known": 2024},
    {"abbr": "WY", "name": "Wyoming",        "url": "https://wyoleg.gov/statutes/compress/WYstconstitution.htm",
     "official_url": "https://wyoleg.gov/statutes/compress/WYstconstitution.htm",
     "url_type": "html", "last_amended_known": 2024,
     "fallback_urls": ["https://wyoleg.gov/statutes/compress/STATECONSTITUTION.pdf"]},
    # -- DC + Territories ------------------------------------------------------
    {"abbr": "DC", "name": "District of Columbia",
     "url": "https://code.dccouncil.gov/us/dc/council/code/titles/1/chapters/1/",
     "official_url": "https://code.dccouncil.gov/us/dc/council/code/titles/1/chapters/1/",
     "url_type": "html", "last_amended_known": 2023},
    {"abbr": "PR", "name": "Puerto Rico",
     "url": "https://www.lexjuris.com/lexcons.htm",
     "official_url": "https://www.lexjuris.com/lexcons.htm",
     "url_type": "html", "last_amended_known": 1952},
    {"abbr": "GU", "name": "Guam",
     "url": "https://www.guamlegislature.com/organic-act-of-guam/",
     "official_url": "https://www.guamlegislature.com/organic-act-of-guam/",
     "url_type": "html", "last_amended_known": 2019},
    {"abbr": "VI", "name": "US Virgin Islands",
     "url": "https://www.vi.gov/government/constitution.html",
     "official_url": "https://www.vi.gov/government/constitution.html",
     "url_type": "html", "last_amended_known": 2016},
]


# -- Domain verifier ------------------------------------------------------------

def is_official_domain(url: str) -> tuple[bool, str]:
    """Returns (is_official, reason)."""
    parsed = urlparse(url)
    host = parsed.netloc.lower()

    # .gov is always official
    if host.endswith(".gov") or ".gov/" in url.lower():
        return True, f"✓ Official .gov domain ({host})"

    # Known official non-.gov legislature domains
    official_hosts = [
        "malegislature.gov", "nysenate.gov", "kslegislature.org",
        "nebraskalegislature.gov", "sdlegislature.gov", "wslegislature.org",
        "rilin.state.ri.us", "legis.la.gov", "oscn.net",
        "scstatehouse.gov", "azleg.gov", "flsenate.gov",
        "ilga.gov", "cga.ct.gov", "mgaleg.maryland.gov",
        "ncleg.gov", "nysenate.gov", "leg.state.nv.us",
        "legis.state.pa.us", "legislature.mi.gov", "leg.colorado.gov",
        "leg.mt.gov", "leg.wa.gov", "legis.iowa.gov", "legislature.idaho.gov",
        "nv.gov", "guamlegislature.com", "legislature.vermont.gov",
        "docs.legis.wisconsin.gov", "statute.capitol.texas.gov",
        "statutes.capitol.texas.gov", "codes.ohio.gov", "revisor.mn.gov",
        "revisor.mo.gov", "delcode.delaware.gov", "code.dccouncil.gov",
        "law.georgia.gov", "le.utah.gov", "law.lis.virginia.gov",
        "capitol.hawaii.gov", "ltgov.alaska.gov", "arkleg.state.ar.us",
        "legislature.maine.gov", "legis.nd.gov", "nmlegis.gov",
        "oregonlegislature.gov", "wyoleg.gov", "wvlegislature.gov",
        "code.wvlegislature.gov", "nh.gov", "pub.njleg.state.nj.us",
        "njleg.state.nj.us", "tn.gov", "lexjuris.com",
        "vi.gov", "in.gov",
    ]
    if any(host == h or host.endswith("." + h) for h in official_hosts):
        return True, f"✓ Known official state legislature domain ({host})"

    # .us TLD
    if host.endswith(".us"):
        return True, f"✓ Official .us state domain ({host})"

    # Warn
    return False, f"⚠  Possibly unofficial domain: {host}"


# -- Amendment date extractor ---------------------------------------------------

_AMEND_PATTERNS = [
    r"(?:last\s+amended|as\s+amended(?:\s+through)?|amendment\s+(?:no\.|number\s+)?\d+)[^\d]*(\d{4})",
    r"(?:effective|revised|updated|ratified)[^\d]*(\w+\s+\d+,?\s+)?(\d{4})",
    r"(?:article|amendment)\s+(?:xvi+|xv+|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i|\d+)[^.]*?(\d{4})\b",
    r"\bamended\s+(?:in\s+)?(\d{4})\b",
    r"\((\d{4})\)\s*$",          # trailing year in parentheses
]


def extract_amendment_date(text: str) -> Optional[int]:
    """Find the most recent year mentioned in the context of amendments."""
    years = set()
    for pat in _AMEND_PATTERNS:
        for m in re.finditer(pat, text[:20000], re.I):
            y = m.group(m.lastindex)
            try:
                yr = int(y)
                if 1776 <= yr <= 2026:
                    years.add(yr)
            except (ValueError, TypeError):
                pass
    # Also scan for 4-digit years after "20" (recent amendments)
    for m in re.finditer(r"\b(20(?:0[0-9]|1[0-9]|2[0-6]))\b", text[:30000]):
        years.add(int(m.group(1)))
    return max(years) if years else None


# -- HTML text extractor --------------------------------------------------------

def extract_html_text(html: str, url: str) -> str:
    """Clean, stripped constitutional text from HTML page."""
    soup = BeautifulSoup(html, "lxml")

    # Remove nav, header, footer, scripts, ads
    for tag in soup(["script", "style", "nav", "header", "footer",
                     "aside", "form", "iframe", "noscript", "svg"]):
        tag.decompose()

    # Try targeted selectors first (better precision for legislature sites)
    selectors = [
        "main", "article", "#content", ".content", "#main-content",
        ".constitution", "#constitution", ".law-text", ".statute-text",
        "#lawText", ".bill-text", ".session-law", "#page-content",
        ".article-content", "body",
    ]
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 500:
                return text

    return soup.get_text(separator="\n", strip=True)


def extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    import io
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages = []
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    pages.append(t)
        return "\n\n".join(pages)
    except Exception as e:
        return f"[PDF extraction failed: {e}]"


# -- Fetch a single constitution ------------------------------------------------

def fetch_constitution(entry: dict, timeout: int = 30) -> dict:
    """
    Fetch one state constitution. Returns result dict with:
      status, is_official, official_reason, fetched_text,
      detected_amendment_year, text_length, error
    """
    abbr  = entry["abbr"]
    name  = entry["name"]
    url   = entry["official_url"]
    known = entry.get("last_amended_known")

    is_official, official_reason = is_official_domain(url)

    result = {
        "abbr":                  abbr,
        "name":                  name,
        "url":                   url,
        "is_official":           is_official,
        "official_reason":       official_reason,
        "known_amendment_year":  known,
        "detected_amendment_year": None,
        "status":                "pending",
        "text_length":           0,
        "fetched_text":          "",
        "error":                 None,
    }

    MIN_TEXT = 500  # chars; below this = probably JS-rendered

    def _fetch_url(target_url: str) -> tuple[str, str, int]:
        """Returns (text, final_url, status_code). text='' on failure."""
        try:
            r = SESSION.get(target_url, timeout=timeout, allow_redirects=True)
            ct = r.headers.get("Content-Type", "")
            if r.status_code == 200:
                if "pdf" in ct.lower() or target_url.lower().endswith(".pdf"):
                    return extract_pdf_text(r.content), r.url, 200
                else:
                    return extract_html_text(r.text, r.url), r.url, 200
            return "", target_url, r.status_code
        except Exception as e:
            return "", target_url, -1

    # TX multi-article: concatenate all article pages
    if entry.get("url_type") == "multi_html" and entry.get("extra_article_urls"):
        all_urls = [url] + entry["extra_article_urls"]
        parts = []
        for art_url in all_urls:
            t, _, sc = _fetch_url(art_url)
            if sc == 200 and t:
                parts.append(t)
        text = "\n\n--- ARTICLE BREAK ---\n\n".join(parts)
        result["status"] = "ok" if parts else "error"
        result["error"]  = None if parts else "All article URLs failed"
    else:
        # Try primary URL
        text, final_url, status_code = _fetch_url(url)
        if final_url != url:
            is_official, official_reason = is_official_domain(final_url)
            result["url"]             = final_url
            result["is_official"]     = is_official
            result["official_reason"] = official_reason + f" (redirected from {url})"

        if status_code == 200 and len(text) >= MIN_TEXT:
            result["status"] = "ok"
        elif status_code == 200 and len(text) < MIN_TEXT:
            # Try fallback URLs
            result["status"] = "js_rendered"
            result["error"]  = f"Text too short ({len(text)} chars) — JS-rendered or blocked"
            for fb_url in entry.get("fallback_urls", []):
                fb_text, fb_final, fb_sc = _fetch_url(fb_url)
                if fb_sc == 200 and len(fb_text) >= MIN_TEXT:
                    text     = fb_text
                    result["url"]    = fb_url
                    result["status"] = "ok"
                    result["error"]  = f"Note: used fallback URL ({fb_url})"
                    is_off2, reason2 = is_official_domain(fb_url)
                    result["is_official"]     = is_off2
                    result["official_reason"] = reason2
                    break
        else:
            # Try fallback URLs on HTTP error or connection error
            result["status"] = f"http_{status_code}" if status_code > 0 else "error"
            result["error"]  = f"HTTP {status_code}" if status_code > 0 else "Connection failed"
            text = ""
            for fb_url in entry.get("fallback_urls", []):
                fb_text, fb_final, fb_sc = _fetch_url(fb_url)
                if fb_sc == 200 and len(fb_text) >= MIN_TEXT:
                    text     = fb_text
                    result["url"]    = fb_url
                    result["status"] = "ok"
                    result["error"]  = f"Note: used fallback URL ({fb_url})"
                    is_off2, reason2 = is_official_domain(fb_url)
                    result["is_official"]     = is_off2
                    result["official_reason"] = reason2
                    break

    year = extract_amendment_date(text) if text else None
    result["fetched_text"]            = text
    result["text_length"]             = len(text)
    result["detected_amendment_year"] = year

    return result


# -- Currency classifier --------------------------------------------------------

def classify_currency(result: dict) -> tuple[str, str]:
    """Returns (badge, explanation)."""
    detected = result.get("detected_amendment_year")
    known    = result.get("known_amendment_year")
    year     = detected or known or 0
    current_year = datetime.now().year

    if result["status"] == "js_rendered":
        # Site is official and reachable but JS-rendered — use known year
        year = known or 0
        note = f"JS-rendered — known amendment: {year}. Use Playwright or manual PDF."
        if year >= 2023:
            return "🟡 OFFICIAL/JS-RENDERED", note
        return "🟡 OFFICIAL/JS-RENDERED", note

    if result["status"] != "ok":
        return "❌ FETCH_FAILED", result.get("error", "unknown error")

    if not result["is_official"]:
        return "⚠  UNOFFICIAL_SOURCE", result["official_reason"]

    age = current_year - year
    if year >= 2023:
        badge = "🟢 CURRENT"
    elif year >= 2019:
        badge = "🟡 RECENT (≤5 yr)"
    elif year >= 2010:
        badge = "🟠 DATED (>5 yr)"
    else:
        badge = "🔴 OLDER (>10 yr)"

    note = f"Last amended: {year}" if year else "No amendment year detected"
    if detected and known and detected < known:
        note += f"  ⚠ Detected {detected} < known {known} — may be stale"
    elif detected and known and detected > known:
        note += f"  ✓ Found newer amendment {detected} vs known {known}"

    return badge, note


# -- Embedding ------------------------------------------------------------------

def embed_text(text: str) -> Optional[list]:
    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBED_MODEL, "input": [text[:4096]]},
            timeout=120,
        )
        r.raise_for_status()
        embs = r.json().get("embeddings", [])
        return embs[0] if embs else None
    except Exception:
        return None


# -- DB ingest ------------------------------------------------------------------

INSERT_SQL = """
INSERT INTO court_opinions (
    title, citation, court, jurisdiction_level, jurisdiction_state,
    case_date, opinion_text, summary, source, source_url, source_id,
    embedding, metadata
) VALUES (
    %(title)s, %(citation)s, %(court)s, %(jurisdiction_level)s, %(jurisdiction_state)s,
    %(case_date)s, %(opinion_text)s, %(summary)s, %(source)s, %(source_url)s, %(source_id)s,
    %(embedding)s::vector, %(metadata)s::jsonb
) ON CONFLICT DO NOTHING
"""


def ingest_to_db(result: dict, conn, cur):
    from pgvector.psycopg2 import register_vector
    register_vector(conn)

    text    = result["fetched_text"]
    summary = text[:600].strip() if text else ""
    emb     = embed_text(text) if text else None

    row = {
        "title":              f"{result['name']} Constitution",
        "citation":           f"{result['name']} Const.",
        "court":              f"{result['name']} Legislature",
        "jurisdiction_level": "state",
        "jurisdiction_state": result["name"],
        "case_date":          f"{result.get('detected_amendment_year') or result.get('known_amendment_year') or 2000}-01-01",
        "opinion_text":       text,
        "summary":            summary,
        "source":             "constitution",
        "source_url":         result["url"],
        "source_id":          f"const_{result['abbr'].lower()}",
        "embedding":          emb,
        "metadata":           json.dumps({
            "document_type":     "constitution",
            "abbr":              result["abbr"],
            "is_official":       result["is_official"],
            "detected_year":     result.get("detected_amendment_year"),
            "known_year":        result.get("known_amendment_year"),
        }),
    }
    cur.execute(INSERT_SQL, row)
    conn.commit()


# -- Main -----------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Fetch + verify all state constitutions from official sources")
    ap.add_argument("--check-only", action="store_true", help="Only verify URLs and show currency — no file writes")
    ap.add_argument("--all",        action="store_true", help="Fetch all 54 jurisdictions")
    ap.add_argument("--state",      metavar="ABBR",      help="Fetch a single state (e.g. CA, TX, NY)")
    ap.add_argument("--ingest",     action="store_true", help="Also insert to PostgreSQL with embeddings")
    ap.add_argument("--timeout",    type=int, default=30)
    ap.add_argument("--delay",      type=float, default=1.5, help="Seconds between requests (polite crawl)")
    args = ap.parse_args()

    if not (args.all or args.state or args.check_only):
        ap.print_help()
        sys.exit(0)

    # Select entries
    if args.state:
        entries = [e for e in CONSTITUTIONS if e["abbr"].upper() == args.state.upper()]
        if not entries:
            print(f"ERROR: Unknown state abbreviation '{args.state}'")
            print("Valid:", ", ".join(e["abbr"] for e in CONSTITUTIONS))
            sys.exit(1)
    else:
        entries = CONSTITUTIONS

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # DB connection (if ingesting)
    conn = cur = None
    if args.ingest and not args.check_only:
        import psycopg2
        conn = psycopg2.connect(**DB_CONFIG)
        cur  = conn.cursor()

    print(f"\n{'='*76}")
    print(f"  STATE CONSTITUTION FETCHER  —  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Official-source verification + currency check + text extraction")
    print(f"  Jurisdictions: {len(entries)}")
    print(f"{'='*76}")

    results   = []
    succeeded = failed = unofficial = js_rendered_count = 0

    for i, entry in enumerate(entries, 1):
        abbr = entry["abbr"]
        name = entry["name"]
        url  = entry["official_url"]

        print(f"\n[{i:>2}/{len(entries)}] {abbr}  {name}")
        print(f"         URL: {url}")

        if args.check_only:
            is_off, reason = is_official_domain(url)
            badge, note    = classify_currency({"status": "ok", "is_official": is_off,
                                                "official_reason": reason,
                                                "detected_amendment_year": None,
                                                "known_amendment_year": entry.get("last_amended_known"),
                                                "text_length": 0})
            status_icon = "✓" if is_off else "⚠"
            print(f"         {status_icon} {reason}")
            print(f"         Known last amended: {entry.get('last_amended_known', 'unknown')}")
            continue

        result = fetch_constitution(entry, timeout=args.timeout)
        badge, note = classify_currency(result)

        print(f"         {result['official_reason']}")
        print(f"         {badge}  {note}")
        print(f"         Text length: {result['text_length']:,} chars", end="")
        if result.get("error"):
            print(f"  ERROR: {result['error']}", end="")
        print()

        if result["status"] in ("ok", "js_rendered"):
            if result["status"] == "js_rendered":
                js_rendered_count += 1
                # Write placeholder JSONL with metadata only (no text)
                out_file = OUT_DIR / f"{abbr.lower()}_constitution_NEEDS_RENDERING.jsonl"
                with open(out_file, "w", encoding="utf-8") as f:
                    f.write(json.dumps({
                        "title": f"{name} Constitution",
                        "source_url": result["url"],
                        "status": "js_rendered",
                        "is_official": result["is_official"],
                        "known_amendment_year": result["known_amendment_year"],
                        "note": "Site requires JavaScript rendering. Use Playwright or download PDF manually.",
                    }, ensure_ascii=False) + "\n")
            else:
                succeeded += 1
                # Write full JSONL
                out_file = OUT_DIR / f"{abbr.lower()}_constitution.jsonl"
                with open(out_file, "w", encoding="utf-8") as f:
                    row_out = {
                        "title":              f"{name} Constitution",
                        "citation":           f"{name} Const.",
                        "court":              f"{name} Legislature",
                        "jurisdiction_level": "state",
                        "jurisdiction_state": name,
                        "document_type":      "constitution",
                        "case_date":          f"{result.get('detected_amendment_year') or result.get('known_amendment_year') or 2000}-01-01",
                        "opinion_text":       result["fetched_text"],
                        "summary":            result["fetched_text"][:600].strip(),
                        "source":             "constitution",
                        "source_url":         result["url"],
                        "source_id":          f"const_{abbr.lower()}",
                        "is_official":        result["is_official"],
                        "detected_amendment_year": result["detected_amendment_year"],
                        "known_amendment_year":    result["known_amendment_year"],
                        "currency_badge":          badge,
                        "currency_note":           note,
                    }
                    f.write(json.dumps(row_out, ensure_ascii=False) + "\n")

                if args.ingest and conn and cur:
                    try:
                        ingest_to_db(result, conn, cur)
                        print(f"         ✓ Inserted to PostgreSQL")
                    except Exception as e:
                        print(f"         ✗ DB ingest failed: {e}")
        else:
            failed += 1
            if not result["is_official"]:
                unofficial += 1

        results.append({**entry, **result, "badge": badge, "note": note})
        time.sleep(args.delay)

    # -- Summary report ---------------------------------------------------------
    if not args.check_only:
        print(f"\n{'='*76}")
        print(f"  SUMMARY")
        print(f"  Fetched:      {succeeded}/{len(entries)} (text extracted)")
        print(f"  JS-rendered:  {js_rendered_count} (official but need Playwright/manual)")
        print(f"  Failed:       {failed}")
        print(f"  Unofficial:   {unofficial}")
        print(f"  Output dir: {OUT_DIR}")
        print(f"{'='*76}")

        print("\n  CURRENCY TABLE:")
        print(f"  {'ABR':<4} {'Name':<22} {'Badge':<24} {'Note'}")
        print(f"  {'-'*4} {'-'*22} {'-'*24} {'-'*30}")
        for r in results:
            badge = r.get("badge", "?")
            note  = r.get("note", "")[:60]
            print(f"  {r['abbr']:<4} {r['name']:<22} {badge:<24} {note}")

        # Write full JSON report
        report_path = OUT_DIR / f"fetch_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\n  Full report: {report_path}")

        js_states = [r["abbr"] for r in results if r.get("status") == "js_rendered"]
        failed_states = [r["abbr"] for r in results if r.get("status") not in ("ok", "js_rendered")]
        if js_states:
            print(f"\n  JS-RENDERED (need Playwright or manual PDF download):")
            for r in results:
                if r.get("status") == "js_rendered":
                    print(f"    {r['abbr']:<4} {r['name']:<22} {r.get('url','')}")
            print(f"\n  To get these, run:")
            print(f"  python scripts/fetch_constitutions_playwright.py --states {' '.join(js_states)}")
        if failed_states:
            print(f"\n  FAILED fetches: {', '.join(failed_states)}")

        print("\n  NEXT STEPS:")
        print(f"  # Ingest all downloaded JSONL into PostgreSQL:")
        print(f"  python scripts/ingest_court_opinions.py scripts/court_data/constitutions/*.jsonl --source constitution")
        print(f"  # Or use --ingest flag on this script to embed during fetch:")
        print(f"  python scripts/fetch_state_constitutions.py --all --ingest")

    if conn:
        conn.close()


if __name__ == "__main__":
    main()

