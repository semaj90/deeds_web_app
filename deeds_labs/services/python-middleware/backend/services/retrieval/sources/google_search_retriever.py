"""Google Search retriever with citation extraction."""

import logging
import os
from typing import List, Optional

import aiohttp

from ..models import Citation, Result, ResultWithCitations

logger = logging.getLogger(__name__)


class GoogleSearchRetriever:
    """Retrieves results from Google Custom Search API with citation extraction."""

    def __init__(self, api_key: str, engine_id: str):
        """Initialize GoogleSearchRetriever.

        Args:
            api_key: Google Custom Search API key
            engine_id: Google Custom Search Engine ID
        """
        self.api_key = api_key
        self.engine_id = engine_id
        self.base_url = "https://www.googleapis.com/customsearch/v1"

    async def retrieve(self, query: str, top_k: int = 10) -> List[ResultWithCitations]:
        """Retrieve results from Google Search with citations.

        Args:
            query: The query string
            top_k: Number of top results to return

        Returns:
            List of ResultWithCitations objects
        """
        try:
            results = await self._search_google(query, top_k)
            return results
        except Exception as e:
            logger.error(f"Error retrieving from Google Search: {e}")
            return []

    async def _search_google(
        self, query: str, top_k: int
    ) -> List[ResultWithCitations]:
        """Search Google Custom Search API.

        Args:
            query: The query string
            top_k: Number of results to return

        Returns:
            List of ResultWithCitations objects
        """
        params = {
            "q": query,
            "key": self.api_key,
            "cx": self.engine_id,
            "num": min(top_k, 10),  # Google API max is 10 per request
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(self.base_url, params=params) as response:
                if response.status != 200:
                    logger.error(f"Google Search API error: {response.status}")
                    return []

                data = await response.json()
                return self._parse_results(data, query)

    def _parse_results(
        self, data: dict, query: str
    ) -> List[ResultWithCitations]:
        """Parse Google Search API response.

        Args:
            data: API response data
            query: Original query

        Returns:
            List of ResultWithCitations objects
        """
        results = []

        items = data.get("items", [])
        for idx, item in enumerate(items):
            title = item.get("title", "")
            link = item.get("link", "")
            snippet = item.get("snippet", "")

            # Extract citations from snippet
            citations = self._extract_citations(snippet, link, title)

            result = ResultWithCitations(
                id=f"google_{idx}",
                content=snippet,
                source="google_search",
                relevance_score=1.0 - (idx * 0.1),  # Decrease by 0.1 for each result
                confidence_score=0.85,
                recency_score=0.9,
                credibility_score=0.8,
                timestamp=__import__("datetime").datetime.now(),
                metadata={
                    "title": title,
                    "url": link,
                    "position": idx + 1,
                },
                citations=citations,
                highlighted_content=self._highlight_citations(snippet, citations),
                citation_count=len(citations),
                citation_confidence=sum(c.confidence for c in citations) / len(citations)
                if citations
                else 0.0,
            )
            results.append(result)

        return results

    def _extract_citations(
        self, snippet: str, url: str, title: str
    ) -> List[Citation]:
        """Extract citations from search snippet.

        Args:
            snippet: The search result snippet
            url: The source URL
            title: The source title

        Returns:
            List of Citation objects
        """
        citations = []

        # Simple citation extraction - look for quoted passages
        import re

        # Find quoted passages
        quoted_pattern = r'"([^"]+)"'
        matches = re.finditer(quoted_pattern, snippet)

        for match in matches:
            quoted_text = match.group(1)
            start_pos = match.start()
            end_pos = match.end()

            # Get context before and after
            context_before = snippet[max(0, start_pos - 50) : start_pos]
            context_after = snippet[end_pos : min(len(snippet), end_pos + 50)]

            citation = Citation(
                id=f"citation_{len(citations)}",
                text=quoted_text,
                source_url=url,
                source_title=title,
                context_before=context_before.strip(),
                context_after=context_after.strip(),
                confidence=0.9,
                timestamp=__import__("datetime").datetime.now(),
                highlighted=True,
            )
            citations.append(citation)

        return citations

    def _highlight_citations(self, content: str, citations: List[Citation]) -> str:
        """Highlight citations in content.

        Args:
            content: The original content
            citations: List of citations

        Returns:
            HTML content with highlighted citations
        """
        highlighted = content

        for citation in citations:
            # Wrap citation text in HTML mark tag
            highlighted = highlighted.replace(
                f'"{citation.text}"',
                f'<mark class="citation" data-id="{citation.id}">"{citation.text}"</mark>',
            )

        return highlighted

    async def health_check(self) -> bool:
        """Check if Google Search API is accessible.

        Returns:
            True if accessible, False otherwise
        """
        try:
            params = {
                "q": "test",
                "key": self.api_key,
                "cx": self.engine_id,
                "num": 1,
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.base_url, params=params, timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    return response.status == 200
        except Exception as e:
            logger.error(f"Google Search health check failed: {e}")
            return False
