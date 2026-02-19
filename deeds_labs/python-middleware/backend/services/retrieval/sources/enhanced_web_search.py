"""Enhanced web search with BeautifulSoup integration and safe crawling."""

import logging
from typing import List, Optional

import aiohttp
from bs4 import BeautifulSoup

from ..models import Result

logger = logging.getLogger(__name__)


class EnhancedWebSearch:
    """Enhanced web search with content extraction and safe crawling."""

    def __init__(self, timeout: int = 30):
        """Initialize EnhancedWebSearch.

        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self.user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/91.0.4472.124 Safari/537.36"
        )

    async def fetch_and_parse(self, url: str) -> Optional[dict]:
        """Fetch URL and parse content with BeautifulSoup.

        Args:
            url: URL to fetch

        Returns:
            Dictionary with parsed content or None if failed
        """
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"User-Agent": self.user_agent}
                async with session.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.timeout),
                ) as response:
                    if response.status != 200:
                        logger.warning(f"Failed to fetch {url}: {response.status}")
                        return None

                    html = await response.text()
                    return self._parse_html(html, url)
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    def _parse_html(self, html: str, url: str) -> dict:
        """Parse HTML with BeautifulSoup.

        Args:
            html: HTML content
            url: Source URL

        Returns:
            Dictionary with parsed content
        """
        soup = BeautifulSoup(html, "html.parser")

        # Remove script and style elements
        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        # Extract title
        title = ""
        if soup.title:
            title = soup.title.string or ""

        # Extract meta description
        description = ""
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "")

        # Extract main content
        content = self._extract_main_content(soup)

        # Extract links
        links = self._extract_links(soup, url)

        # Extract headings
        headings = self._extract_headings(soup)

        return {
            "url": url,
            "title": title,
            "description": description,
            "content": content,
            "links": links,
            "headings": headings,
            "html": html,
        }

    def _extract_main_content(self, soup: BeautifulSoup) -> str:
        """Extract main content from parsed HTML.

        Args:
            soup: BeautifulSoup object

        Returns:
            Extracted text content
        """
        # Try to find main content area
        main_content = soup.find(
            ["main", "article", "div"],
            class_=[
                "content",
                "main-content",
                "article-content",
                "post-content",
                "entry-content",
            ],
        )

        if main_content:
            return main_content.get_text(separator=" ", strip=True)

        # Fallback to body
        body = soup.find("body")
        if body:
            return body.get_text(separator=" ", strip=True)

        return soup.get_text(separator=" ", strip=True)

    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> List[dict]:
        """Extract links from parsed HTML.

        Args:
            soup: BeautifulSoup object
            base_url: Base URL for relative links

        Returns:
            List of link dictionaries
        """
        links = []

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text(strip=True)

            if href and text:
                links.append({"url": href, "text": text})

        return links[:10]  # Limit to 10 links

    def _extract_headings(self, soup: BeautifulSoup) -> List[dict]:
        """Extract headings from parsed HTML.

        Args:
            soup: BeautifulSoup object

        Returns:
            List of heading dictionaries
        """
        headings = []

        for level in range(1, 4):  # h1, h2, h3
            tag_name = f"h{level}"
            for heading in soup.find_all(tag_name):
                text = heading.get_text(strip=True)
                if text:
                    headings.append({"level": level, "text": text})

        return headings[:10]  # Limit to 10 headings

    async def extract_text_from_url(self, url: str) -> Optional[str]:
        """Extract plain text from URL.

        Args:
            url: URL to extract text from

        Returns:
            Extracted text or None if failed
        """
        parsed = await self.fetch_and_parse(url)
        if parsed:
            return parsed.get("content", "")
        return None

    async def health_check(self) -> bool:
        """Check if web search is available.

        Returns:
            True if available, False otherwise
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://www.google.com",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    return response.status == 200
        except Exception as e:
            logger.error(f"Web search health check failed: {e}")
            return False
