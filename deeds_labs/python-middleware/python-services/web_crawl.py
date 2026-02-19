# Phase 70: Web Crawl Service
# Crawls URLs and extracts clean text content
# Python 3.12 + requests + beautifulsoup4 + small dependencies

import os
import asyncio
import json
import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import urljoin, urlparse
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Web scraping
try:
    import requests
    from bs4 import BeautifulSoup
    import httpx
    WEB_SCRAPING_AVAILABLE = True
except ImportError:
    WEB_SCRAPING_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 Web Crawl Service", version="1.0.0")

class CrawlRequest(BaseModel):
    url: str
    max_depth: int = 1
    follow_links: bool = False
    extract_metadata: bool = True
    timeout: int = 30

class CrawlResponse(BaseModel):
    url: str
    title: str = ""
    text_content: str = ""
    metadata: Dict[str, Any] = {}
    links: List[str] = []
    status_code: int = 0
    backend: str = "requests-beautifulsoup"

class ParseRequest(BaseModel):
    html: str
    extract_links: bool = True
    extract_metadata: bool = True

class ParseResponse(BaseModel):
    title: str = ""
    text_content: str = ""
    metadata: Dict[str, Any] = {}
    links: List[str] = []
    backend: str = "beautifulsoup"

def clean_text(text: str) -> str:
    """Clean extracted text"""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove leading/trailing whitespace
    text = text.strip()
    return text

def extract_metadata(soup: BeautifulSoup, url: str) -> Dict[str, Any]:
    """Extract metadata from HTML"""
    metadata = {}

    # Title
    title_tag = soup.find('title')
    if title_tag:
        metadata['title'] = title_tag.get_text().strip()

    # Meta description
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    if desc_tag:
        metadata['description'] = desc_tag.get('content', '')

    # Meta keywords
    keywords_tag = soup.find('meta', attrs={'name': 'keywords'})
    if keywords_tag:
        metadata['keywords'] = keywords_tag.get('content', '')

    # Open Graph tags
    og_tags = soup.find_all('meta', attrs={'property': lambda x: x and x.startswith('og:')})
    for tag in og_tags:
        prop = tag.get('property', '')[3:]  # Remove 'og:' prefix
        content = tag.get('content', '')
        metadata[f'og_{prop}'] = content

    # URL info
    parsed_url = urlparse(url)
    metadata['domain'] = parsed_url.netloc
    metadata['scheme'] = parsed_url.scheme

    return metadata

def extract_text_content(soup: BeautifulSoup) -> str:
    """Extract clean text content from HTML"""
    # Remove script and style elements
    for script in soup(["script", "style"]):
        script.decompose()

    # Get text
    text = soup.get_text()

    # Clean the text
    text = clean_text(text)

    return text

def extract_links(soup: BeautifulSoup, base_url: str) -> List[str]:
    """Extract all links from HTML"""
    links = []
    for a_tag in soup.find_all('a', href=True):
        href = a_tag['href']
        # Convert relative URLs to absolute
        absolute_url = urljoin(base_url, href)
        links.append(absolute_url)

    return list(set(links))  # Remove duplicates

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if WEB_SCRAPING_AVAILABLE else "limited",
        "backend": "requests-beautifulsoup",
        "web_scraping_available": WEB_SCRAPING_AVAILABLE
    }

@app.post("/crawl", response_model=CrawlResponse)
async def crawl_url(request: CrawlRequest):
    """Crawl a URL and extract content"""
    if not WEB_SCRAPING_AVAILABLE:
        raise HTTPException(status_code=503, detail="Web scraping libraries not available")

    try:
        # Make HTTP request
        response = requests.get(
            request.url,
            timeout=request.timeout,
            headers={
                'User-Agent': 'Phase70-WebCrawler/1.0 (Legal AI Assistant)'
            }
        )

        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')

        # Extract data
        title = ""
        if soup.title:
            title = soup.title.get_text().strip()

        text_content = extract_text_content(soup)

        metadata = {}
        if request.extract_metadata:
            metadata = extract_metadata(soup, request.url)

        links = []
        if request.follow_links or request.extract_metadata:
            links = extract_links(soup, request.url)

        return CrawlResponse(
            url=request.url,
            title=title,
            text_content=text_content,
            metadata=metadata,
            links=links,
            status_code=response.status_code,
            backend="requests-beautifulsoup"
        )

    except requests.exceptions.RequestException as e:
        logger.error(f"Crawl failed for {request.url}: {e}")
        raise HTTPException(status_code=400, detail=f"Crawl failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error crawling {request.url}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/parse", response_model=ParseResponse)
async def parse_html(request: ParseRequest):
    """Parse HTML content and extract structured data"""
    if not WEB_SCRAPING_AVAILABLE:
        raise HTTPException(status_code=503, detail="Web scraping libraries not available")

    try:
        # Parse HTML
        soup = BeautifulSoup(request.html, 'html.parser')

        # Extract data
        title = ""
        if soup.title:
            title = soup.title.get_text().strip()

        text_content = extract_text_content(soup)

        metadata = {}
        if request.extract_metadata:
            metadata = extract_metadata(soup, "")

        links = []
        if request.extract_links:
            links = extract_links(soup, "")

        return ParseResponse(
            title=title,
            text_content=text_content,
            metadata=metadata,
            links=links,
            backend="beautifulsoup"
        )

    except Exception as e:
        logger.error(f"HTML parsing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "web_crawl:app",
        host="0.0.0.0",
        port=8102,
        reload=False,
        log_level="info"
    )