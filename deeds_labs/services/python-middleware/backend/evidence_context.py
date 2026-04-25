"""
Evidence Context Injection: Integrate evidence search into chat context

Provides:
- Evidence search integration
- Top-3 result injection
- Evidence metadata inclusion
- Evidence reference tracking
"""

import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class ContextInjector:
    """Inject evidence context into chat prompts"""

    def __init__(self, search_service_url: str = "http://localhost:8000"):
        self.search_service_url = search_service_url
        logger.info(f"✅ Context Injector initialized")
        logger.info(f"   Search Service: {search_service_url}")

    async def search_evidence(
        self,
        query: str,
        top_k: int = 3,
    ) -> List[Dict]:
        """Search for evidence using search service"""
        try:
            import httpx

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.search_service_url}/api/search/evidence",
                    json={
                        "query": query,
                        "top_k": top_k,
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    logger.info(f"✅ Found {len(results)} evidence results")
                    return results
                else:
                    logger.warning(f"Search failed: {response.status_code}")
                    return []

        except Exception as e:
            logger.error(f"Error searching evidence: {e}")
            return []

    async def inject_evidence_context(
        self,
        query: str,
        top_k: int = 3,
    ) -> str:
        """Inject evidence context into prompt"""
        try:
            # Search for evidence
            results = await self.search_evidence(query, top_k)

            if not results:
                logger.info("No evidence found for context injection")
                return ""

            # Format evidence context
            context_lines = ["RELEVANT EVIDENCE:"]

            for i, result in enumerate(results, 1):
                chunk_id = result.get("chunk_id", "unknown")
                doc_id = result.get("doc_id", "unknown")
                text = result.get("text", "")[:200]  # Truncate to 200 chars
                score = result.get("relevance_score", 0)

                context_lines.append(f"\n[Evidence {i}] (Score: {score:.2f})")
                context_lines.append(f"Document: {doc_id}")
                context_lines.append(f"Chunk: {chunk_id}")
                context_lines.append(f"Text: {text}...")

            context = "\n".join(context_lines)
            logger.info(f"✅ Injected evidence context ({len(results)} results)")

            return context

        except Exception as e:
            logger.error(f"Error injecting evidence context: {e}")
            return ""

    async def format_prompt_with_evidence(
        self,
        query: str,
        context_window: str,
        evidence_context: str,
    ) -> str:
        """Format complete prompt with evidence"""
        try:
            prompt_parts = [
                "You are a legal assistant helping analyze evidence and statutes.",
                "Provide analysis based on the evidence and legal context provided.",
                "Always cite sources and verify conclusions.",
                "",
                "CONVERSATION HISTORY:",
                context_window,
                "",
            ]

            if evidence_context:
                prompt_parts.append(evidence_context)
                prompt_parts.append("")

            prompt_parts.append("USER QUERY:")
            prompt_parts.append(query)

            prompt = "\n".join(prompt_parts)
            logger.info(f"✅ Formatted prompt with evidence ({len(prompt)} chars)")

            return prompt

        except Exception as e:
            logger.error(f"Error formatting prompt: {e}")
            return query

    async def track_evidence_reference(
        self,
        case_id: str,
        chunk_id: str,
        doc_id: str,
        relevance_score: float,
    ) -> None:
        """Track evidence reference in chat"""
        try:
            # This would typically update evidence memory
            logger.info(
                f"Tracked evidence reference: {chunk_id} from {doc_id} (score: {relevance_score:.2f})"
            )

        except Exception as e:
            logger.error(f"Error tracking evidence reference: {e}")

    async def get_evidence_context_for_query(
        self,
        query: str,
        context_window: str,
        top_k: int = 3,
    ) -> Tuple[str, List[Dict]]:
        """Get complete evidence context for query"""
        try:
            # Search for evidence
            results = await self.search_evidence(query, top_k)

            # Inject into prompt
            evidence_context = await self.inject_evidence_context(query, top_k)

            # Format complete prompt
            prompt = await self.format_prompt_with_evidence(
                query,
                context_window,
                evidence_context,
            )

            return prompt, results

        except Exception as e:
            logger.error(f"Error getting evidence context: {e}")
            return query, []


# Global context injector instance
context_injector: Optional[ContextInjector] = None


async def get_context_injector() -> ContextInjector:
    """Get or create context injector instance"""
    global context_injector

    if context_injector is None:
        context_injector = ContextInjector()

    return context_injector


# Import Tuple for type hints
from typing import Tuple
