#!/usr/bin/env python3
"""
FastMCP Server for gemma3-legal:latest - Agentic Function Calling

Exposes tools for:
- Web scraping (5 different implementations)
- Citation extraction (CA Constitution, Federal, State laws)
- Legal document analysis
- Citation graph analysis
- Document ingestion pipeline

Uses existing RabbitMQ containers for routing:
- legal-ai-rabbitmq (port 5672)
- rabbitmq-legal (port 5672)
"""

import os
import asyncio
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

# FastMCP
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp import types
    FASTMCP_AVAILABLE = True
except ImportError:
    print("⚠️  FastMCP not installed. Run: pip install mcp")
    FASTMCP_AVAILABLE = False

# RabbitMQ
try:
    import aio_pika
    RABBITMQ_AVAILABLE = True
except ImportError:
    print("⚠️  aio-pika not installed. Run: pip install aio-pika")
    RABBITMQ_AVAILABLE = False

# Web scraping
try:
    import aiohttp
    from bs4 import BeautifulSoup
    WEB_SCRAPING_AVAILABLE = True
except ImportError:
    print("⚠️  Web scraping libraries not installed. Run: pip install aiohttp beautifulsoup4")
    WEB_SCRAPING_AVAILABLE = False

# Ollama
try:
    import httpx
    OLLAMA_AVAILABLE = True
except ImportError:
    print("⚠️  httpx not installed. Run: pip install httpx")
    OLLAMA_AVAILABLE = False

# Citation extraction
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3-legal:latest")

# Legal citation patterns (from ca_const_ingest.py)
CITATION_PATTERNS = {
    "ca_const": r"(?:CA|California)\s+(?:Const|Constitution)\.?\s+(?:Art|Article)\s+([IVX]+)(?:,?\s+(?:§|Section)\s+(\d+(?:\.\d+)*))?",
    "ca_penal": r"(?:CA|California)\s+(?:Penal|PC)\s+(?:Code\s+)?§?\s*(\d+(?:\.\d+)*)",
    "ca_labor": r"(?:CA|California)\s+(?:Labor|LC)\s+(?:Code\s+)?§?\s*(\d+(?:\.\d+)*)",
    "ca_civil": r"(?:CA|California)\s+(?:Civil|CC)\s+(?:Code\s+)?§?\s*(\d+(?:\.\d+)*)",
    "ca_ccp": r"(?:CA|California)\s+(?:CCP|Code\s+Civ\.\s+Proc\.)\s+§?\s*(\d+(?:\.\d+)*)",
    "us_const": r"(?:US|United States)\s+(?:Const|Constitution)\.?\s+(?:Art|Article)\s+([IVX]+)(?:,?\s+(?:§|Section)\s+(\d+(?:\.\d+)*))?",
    "us_statute": r"(\d+)\s+U\.S\.C\.?\s+§?\s*(\d+(?:\.\d+)*)",
    "case_law": r"(\w+(?:\s+\w+)?)\s+v\.?\s+(\w+(?:\s+\w+)?),\s*(\d+)\s+([A-Z][a-z\.]+)\s+(\d+)\s+\((\d{4})\)",
    "federal_rule": r"Fed\.\s+R\.\s+(?:Civ|Crim)\.\s+P\.\s+(\d+(?:\.\d+)?)",
    "cfr": r"(\d+)\s+C\.F\.R\.?\s+§?\s*(\d+(?:\.\d+)*)",
}

AUTHORITY_WEIGHTS = {
    "ca_const": 1.0,
    "ca_penal": 0.95,
    "ca_labor": 0.90,
    "ca_civil": 0.90,
    "ca_ccp": 0.90,
    "us_const": 0.85,
    "us_statute": 0.80,
    "case_law": 0.75,
    "federal_rule": 0.70,
    "cfr": 0.65,
    "secondary": 0.50
}


class GemmaLegalMCPServer:
    """MCP Server for gemma3-legal:latest with agentic tools."""

    def __init__(self):
        self.server = Server("gemma3-legal-agentic")
        self.rabbitmq_connection = None
        self.rabbitmq_channel = None
        self.ollama_client = None

        # Register tools
        self._register_tools()

        logger.info("🚀 Gemma3-Legal MCP Server initialized")
        logger.info(f"   RabbitMQ: {RABBITMQ_URL}")
        logger.info(f"   Ollama: {OLLAMA_ENDPOINT}")
        logger.info(f"   Model: {OLLAMA_MODEL}")

    async def connect_rabbitmq(self):
        """Connect to existing RabbitMQ container."""
        if not RABBITMQ_AVAILABLE:
            logger.warning("⚠️  RabbitMQ not available - running without message routing")
            return

        try:
            # Try to connect to existing containers
            for url in [
                "amqp://guest:guest@localhost:5672/",
                "amqp://legal_admin:123456@localhost:5672/legal_ai",
                RABBITMQ_URL
            ]:
                try:
                    self.rabbitmq_connection = await aio_pika.connect_robust(url)
                    self.rabbitmq_channel = await self.rabbitmq_connection.channel()
                    logger.info(f"✅ Connected to RabbitMQ: {url}")
                    return
                except Exception as e:
                    logger.debug(f"Failed to connect to {url}: {e}")
                    continue

            logger.warning("⚠️  Could not connect to any RabbitMQ container")
        except Exception as e:
            logger.error(f"RabbitMQ connection error: {e}")

    async def publish_to_rabbitmq(self, queue: str, message: Dict[str, Any]):
        """Publish message to RabbitMQ queue."""
        if not self.rabbitmq_channel:
            logger.debug("RabbitMQ not connected - skipping publish")
            return

        try:
            queue_obj = await self.rabbitmq_channel.declare_queue(queue, durable=True)
            await self.rabbitmq_channel.default_exchange.publish(
                aio_pika.Message(body=json.dumps(message).encode()),
                routing_key=queue
            )
            logger.debug(f"📤 Published to queue '{queue}': {message.get('task_type', 'unknown')}")
        except Exception as e:
            logger.error(f"Failed to publish to RabbitMQ: {e}")

    def _register_tools(self):
        """Register all agentic tools."""

        # Tool 1: Web Scraping
        @self.server.call_tool()
        async def scrape_url(url: str, extract_citations: bool = False) -> List[types.TextContent]:
            """
            Scrape a webpage and extract content.

            Args:
                url: URL to scrape
                extract_citations: Whether to extract legal citations

            Returns:
                Scraped content with optional citations
            """
            if not WEB_SCRAPING_AVAILABLE:
                return [types.TextContent(
                    type="text",
                    text="Error: Web scraping libraries not available"
                )]

            try:
                async with aiohttp.ClientSession() as session:
                    headers = {
                        'User-Agent': 'gemma3-legal-mcp/1.0 (Legal AI Assistant)'
                    }
                    async with session.get(url, headers=headers, timeout=30) as response:
                        if response.status != 200:
                            return [types.TextContent(
                                type="text",
                                text=f"Error: HTTP {response.status}"
                            )]

                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')

                        # Remove script and style elements
                        for tag in soup(['script', 'style', 'noscript', 'svg']):
                            tag.decompose()

                        # Extract content
                        title = soup.title.string if soup.title else ""
                        text_content = soup.get_text(separator=' ', strip=True)

                        result = {
                            "url": url,
                            "title": title,
                            "content": text_content[:5000],  # Limit to 5000 chars
                            "word_count": len(text_content.split()),
                        }

                        # Extract citations if requested
                        if extract_citations:
                            citations = self._extract_citations(text_content)
                            result["citations"] = citations
                            result["citation_count"] = len(citations)

                        # Publish to RabbitMQ for processing
                        await self.publish_to_rabbitmq("web_scrape_results", {
                            "task_type": "web_scrape",
                            "url": url,
                            "timestamp": datetime.utcnow().isoformat(),
                            "result": result
                        })

                        return [types.TextContent(
                            type="text",
                            text=json.dumps(result, indent=2)
                        )]

            except Exception as e:
                logger.error(f"Scrape error: {e}")
                return [types.TextContent(
                    type="text",
                    text=f"Error: {str(e)}"
                )]

        # Tool 2: Citation Extraction
        @self.server.call_tool()
        async def extract_citations(text: str, include_authority_scores: bool = True) -> List[types.TextContent]:
            """
            Extract legal citations from text.

            Args:
                text: Text to analyze
                include_authority_scores: Whether to include authority scores

            Returns:
                List of citations with metadata
            """
            citations = self._extract_citations(text)

            if include_authority_scores:
                for citation in citations:
                    citation["authority_score"] = AUTHORITY_WEIGHTS.get(citation["type"], 0.5)

            result = {
                "total_citations": len(citations),
                "citations": citations,
                "citation_types": list(set(c["type"] for c in citations))
            }

            # Publish to RabbitMQ
            await self.publish_to_rabbitmq("citation_extraction", {
                "task_type": "citation_extraction",
                "timestamp": datetime.utcnow().isoformat(),
                "result": result
            })

            return [types.TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]

        # Tool 3: Ollama Integration
        @self.server.call_tool()
        async def analyze_with_gemma(prompt: str, system_prompt: Optional[str] = None) -> List[types.TextContent]:
            """
            Analyze text using gemma3-legal:latest.

            Args:
                prompt: User prompt
                system_prompt: Optional system prompt for context

            Returns:
                LLM response
            """
            if not OLLAMA_AVAILABLE:
                return [types.TextContent(
                    type="text",
                    text="Error: Ollama client not available"
                )]

            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    payload = {
                        "model": OLLAMA_MODEL,
                        "prompt": prompt,
                        "stream": False
                    }

                    if system_prompt:
                        payload["system"] = system_prompt

                    response = await client.post(
                        f"{OLLAMA_ENDPOINT}/api/generate",
                        json=payload
                    )
                    response.raise_for_status()

                    data = response.json()
                    result = {
                        "model": OLLAMA_MODEL,
                        "response": data.get("response", ""),
                        "total_duration": data.get("total_duration", 0) / 1e9,  # Convert to seconds
                        "prompt_eval_count": data.get("prompt_eval_count", 0),
                        "eval_count": data.get("eval_count", 0)
                    }

                    # Publish to RabbitMQ
                    await self.publish_to_rabbitmq("llm_analysis", {
                        "task_type": "llm_analysis",
                        "model": OLLAMA_MODEL,
                        "timestamp": datetime.utcnow().isoformat(),
                        "result": result
                    })

                    return [types.TextContent(
                        type="text",
                        text=result["response"]
                    )]

            except Exception as e:
                logger.error(f"Ollama error: {e}")
                return [types.TextContent(
                    type="text",
                    text=f"Error: {str(e)}"
                )]

        # Tool 4: Legal Document Classification
        @self.server.call_tool()
        async def classify_document(text: str) -> List[types.TextContent]:
            """
            Classify legal document type.

            Args:
                text: Document text

            Returns:
                Document classification
            """
            # Use citation patterns to infer document type
            citations = self._extract_citations(text)

            # Analyze citation types
            citation_types = [c["type"] for c in citations]

            # Simple classification logic
            doc_type = "unknown"
            confidence = 0.0

            if "case_law" in citation_types:
                doc_type = "legal_brief" if len(citations) > 5 else "case_summary"
                confidence = 0.8
            elif "ca_const" in citation_types or "us_const" in citation_types:
                doc_type = "constitutional_analysis"
                confidence = 0.85
            elif "us_statute" in citation_types or "cfr" in citation_types:
                doc_type = "statutory_analysis"
                confidence = 0.8
            elif len(citations) == 0:
                doc_type = "general_legal_document"
                confidence = 0.5

            result = {
                "document_type": doc_type,
                "confidence": confidence,
                "citation_count": len(citations),
                "primary_citation_types": list(set(citation_types[:10])),
                "word_count": len(text.split())
            }

            return [types.TextContent(
                type="text",
                text=json.dumps(result, indent=2)
            )]

        # Tool 5: Citation Graph Analysis
        @self.server.call_tool()
        async def analyze_citation_network(text: str, max_depth: int = 2) -> List[types.TextContent]:
            """
            Analyze citation network in document.

            Args:
                text: Document text
                max_depth: Maximum depth for graph analysis

            Returns:
                Citation network analysis
            """
            citations = self._extract_citations(text)

            # Simple citation network
            network = {
                "total_citations": len(citations),
                "unique_types": len(set(c["type"] for c in citations)),
                "highest_authority": max((c["type"], AUTHORITY_WEIGHTS.get(c["type"], 0.5)) for c in citations) if citations else ("none", 0.0),
                "citation_density": len(citations) / max(len(text.split()), 1) * 1000,  # Citations per 1000 words
                "top_citations": sorted(citations, key=lambda x: AUTHORITY_WEIGHTS.get(x["type"], 0.5), reverse=True)[:10]
            }

            return [types.TextContent(
                type="text",
                text=json.dumps(network, indent=2)
            )]

        # Tool 6: Health Check
        @self.server.call_tool()
        async def health_check() -> List[types.TextContent]:
            """
            Check health of all integrated services.

            Returns:
                Health status of all services
            """
            health = {
                "mcp_server": "healthy",
                "web_scraping": "available" if WEB_SCRAPING_AVAILABLE else "unavailable",
                "rabbitmq": "connected" if self.rabbitmq_channel else "disconnected",
                "ollama": "unknown",
                "timestamp": datetime.utcnow().isoformat()
            }

            # Check Ollama
            if OLLAMA_AVAILABLE:
                try:
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        response = await client.get(f"{OLLAMA_ENDPOINT}/api/tags")
                        if response.status_code == 200:
                            models = response.json().get("models", [])
                            gemma_available = any(m.get("name", "").startswith("gemma3-legal") for m in models)
                            health["ollama"] = "available" if gemma_available else "gemma3-legal not found"
                            health["available_models"] = [m.get("name") for m in models]
                except Exception as e:
                    health["ollama"] = f"error: {str(e)}"

            return [types.TextContent(
                type="text",
                text=json.dumps(health, indent=2)
            )]

        logger.info("✅ Registered 6 agentic tools")

    def _extract_citations(self, text: str) -> List[Dict[str, Any]]:
        """Extract legal citations from text using regex patterns."""
        citations = []

        for citation_type, pattern in CITATION_PATTERNS.items():
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                citation = {
                    "type": citation_type,
                    "text": match.group(0),
                    "position": match.start(),
                    "groups": match.groups()
                }
                citations.append(citation)

        # Sort by position
        citations.sort(key=lambda x: x["position"])

        return citations

    async def run(self):
        """Run the MCP server."""
        # Connect to RabbitMQ
        await self.connect_rabbitmq()

        # Run server
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options()
            )


async def main():
    """Main entry point."""
    if not FASTMCP_AVAILABLE:
        print("❌ FastMCP not installed. Install with: pip install mcp")
        return

    server = GemmaLegalMCPServer()
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
