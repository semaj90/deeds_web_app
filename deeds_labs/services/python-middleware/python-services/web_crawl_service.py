#!/usr/bin/env python3
"""
Phase 70: Web Crawl Service with LangExtract Integration
Crawls legal websites, extracts structured data, and processes with LangExtract
"""

import os
import sys
import asyncio
import logging
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse, urljoin
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict
import uvicorn
import aiohttp
import re
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import hashlib
import requests
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 Web Crawl Service with LangExtract", version="1.0.0")

class CrawledPage(BaseModel):
    url: HttpUrl
    title: Optional[str]
    text: str                    # cleaned main content
    html: Optional[str] = None   # optional raw HTML snippet
    meta: Dict[str, str] = {}
    links: List[HttpUrl] = []
    langextract: Optional[Dict[str, Any]] = None  # LangExtract structured data
    doc_id: Optional[str] = None  # LangExtract document ID

class CrawlRequest(BaseModel):
    url: HttpUrl
    depth: int = 1
    legal_domains: Optional[List[str]] = None
    include_langextract: bool = True  # Whether to run LangExtract

class CrawlResponse(BaseModel):
    root_url: HttpUrl
    depth: int
    pages: List[CrawledPage]
    langextract_processed: int = 0

# Global HTTP session
session = None

# LangExtract service configuration
LANGEXTRACT_URL = os.getenv("LANGEXTRACT_URL", "http://localhost:8099/extract")

async def init_session():
    """Initialize aiohttp session"""
    global session
    if session is None:
        timeout = aiohttp.ClientTimeout(total=30)
        session = aiohttp.ClientSession(timeout=timeout)

async def close_session():
    """Close aiohttp session"""
    global session
    if session:
        await session.close()
        session = None

def is_valid_url(url: str) -> bool:
    """Check if URL is valid"""
    try:
        parsed = urlparse(url)
        return bool(parsed.scheme and parsed.netloc)
    except:
        return False

def matches_pattern(url: str, patterns: List[str]) -> bool:
    """Check if URL matches any pattern"""
    if not patterns:
        return True

    for pattern in patterns:
        if re.search(pattern, url, re.IGNORECASE):
            return True
    return False

def extract_links(html: str, base_url: str) -> List[str]:
    """Extract links from HTML content"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        links = []

        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            absolute_url = urljoin(base_url, href)

            if is_valid_url(absolute_url):
                links.append(absolute_url)

        return list(set(links))  # Remove duplicates
    except Exception as e:
        logger.error(f"Link extraction failed: {e}")
        return []

def extract_metadata(html: str) -> Dict[str, Any]:
    """Extract metadata from HTML"""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        metadata = {}

        # Title
        title_tag = soup.find('title')
        metadata['title'] = title_tag.text.strip() if title_tag else ""

        # Meta description
        desc_tag = soup.find('meta', attrs={'name': 'description'})
        metadata['description'] = desc_tag.get('content', '') if desc_tag else ""

        # Meta keywords
        keywords_tag = soup.find('meta', attrs={'name': 'keywords'})
        metadata['keywords'] = keywords_tag.get('content', '') if keywords_tag else ""

        # Open Graph tags
        og_tags = soup.find_all('meta', attrs={'property': re.compile(r'^og:')})
        metadata['open_graph'] = {tag.get('property', ''): tag.get('content', '') for tag in og_tags}

        # Headings
        headings = {}
        for i in range(1, 7):
            h_tags = soup.find_all(f'h{i}')
            headings[f'h{i}'] = [h.text.strip() for h in h_tags]
        metadata['headings'] = headings

        return metadata
    except Exception as e:
        logger.error(f"Metadata extraction failed: {e}")
        return {}

def calculate_content_hash(content: str) -> str:
    """Calculate SHA256 hash of content"""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

async def process_with_langextract(text: str, url: str = None, title: str = None, meta: Dict = None) -> Dict[str, Any]:
    """Process text with LangExtract service"""
    try:
        payload = {
            "text": text,
            "url": url,
            "title": title,
            "meta": meta or {}
        }

        response = requests.post(LANGEXTRACT_URL, json=payload, timeout=90)
        response.raise_for_status()

        result = response.json()
        logger.info(f"✅ LangExtract processed document: {result.get('doc_id', 'unknown')}")
        return result

    except Exception as e:
        logger.error(f"❌ LangExtract failed for {url}: {e}")
        return None

def crawl_single_page(url: str, include_langextract: bool = True) -> Optional[CrawledPage]:
    """Crawl a single page and optionally process with LangExtract"""
    try:
        response = requests.get(url, timeout=30, headers={
            'User-Agent': 'Phase70-WebCrawler/1.0 (Legal AI Assistant)'
        })
        response.raise_for_status()

        html = response.text
        content_type = response.headers.get('content-type', '')

        # Check if it's HTML
        if 'text/html' not in content_type.lower():
            logger.info(f"Skipping non-HTML content: {url}")
            return None

        # Extract data
        soup = BeautifulSoup(html, 'html.parser')

        # Extract title
        title_tag = soup.find('title')
        title = title_tag.text.strip() if title_tag else "No Title"

        # Extract main text content (cleaned)
        for script in soup(["script", "style"]):
            script.decompose()
        text_content = soup.get_text(separator='\n', strip=True)

        # Extract links
        links = []
        for a_tag in soup.find_all('a', href=True):
            href = urljoin(url, a_tag['href'])
            if is_valid_url(href):
                links.append(href)

        # Extract meta
        meta = {}
        for meta_tag in soup.find_all('meta'):
            name = meta_tag.get('name') or meta_tag.get('property')
            content = meta_tag.get('content')
            if name and content:
                meta[name] = content

        # Process with LangExtract if requested
        langextract_result = None
        doc_id = None
        if include_langextract and text_content.strip():
            logger.info(f"🔍 Processing {url} with LangExtract...")
            langextract_result = asyncio.run(process_with_langextract(
                text_content, url, title, meta
            ))
            if langextract_result:
                doc_id = langextract_result.get('doc_id')

        return CrawledPage(
            url=url,
            title=title,
            text=text_content,
            html=html[:10000] if len(html) > 10000 else html,  # Limit HTML size
            meta=meta,
            links=links[:100],  # Limit links
            langextract=langextract_result.get('structured') if langextract_result else None,
            doc_id=doc_id
        )

    except Exception as e:
        logger.error(f"Failed to crawl {url}: {e}")
        return None

@app.on_event("startup")
async def startup_event():
    """Initialize HTTP session"""
    await init_session()
    logger.info("✅ Web crawl service with LangExtract initialized")

@app.on_event("shutdown")
async def shutdown_event():
    """Close HTTP session"""
    await close_session()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Phase 70 Web Crawl Service with LangExtract",
        "session_active": session is not None,
        "langextract_url": LANGEXTRACT_URL
    }

@app.post("/crawl", response_model=CrawlResponse)
def crawl_endpoint(req: CrawlRequest) -> CrawlResponse:
    """Crawl website endpoint with LangExtract integration"""
    if not is_valid_url(str(req.url)):
        raise HTTPException(status_code=400, detail="Invalid URL provided")

    try:
        pages = []
        langextract_processed = 0

        # Crawl the main page
        logger.info(f"🌐 Crawling: {req.url}")
        page_data = crawl_single_page(str(req.url), req.include_langextract)

        if page_data:
            pages.append(page_data)
            if page_data.langextract:
                langextract_processed += 1

        # For now, just return the single page
        # You can expand this to crawl multiple pages/depths as needed

        return CrawlResponse(
            root_url=req.url,
            depth=req.depth,
            pages=pages,
            langextract_processed=langextract_processed
        )

    except Exception as e:
        logger.error(f"Crawl failed: {e}")
        raise HTTPException(status_code=500, detail=f"Crawl failed: {e}")

@app.get("/crawl/status")
async def crawl_status():
    """Get crawl service status"""
    return {
        "service": "Phase 70 Web Crawl Service with LangExtract",
        "active_crawls": 0,
        "queue_size": 0,
        "langextract_url": LANGEXTRACT_URL,
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    port = int(os.getenv("WEB_CRAWL_PORT", "8103"))
    host = os.getenv("WEB_CRAWL_HOST", "0.0.0.0")

    logger.info(f"🚀 Starting web crawl service with LangExtract on {host}:{port}")
    uvicorn.run(
        "web_crawl_service:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )