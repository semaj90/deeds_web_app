"""
Phase 79 RAG/KAG Client
========================

Client for connecting Granite-Docling worker to Phase 79 RAG/KAG middleware.
Enables ACE contextual engineering integration via knowledge graph updates.

Usage:
    client = Phase79RAGClient()
    await client.upload_document(doc_id, chunks, metadata)
    await client.build_knowledge_graph(doc_id)
"""

import httpx
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RAGUploadResult:
    """Result from RAG document upload"""
    success: bool
    doc_id: str
    chunks_indexed: int
    collection: str
    error: Optional[str] = None


class Phase79RAGClient:
    """
    Client for Phase 79 RAG/KAG Middleware.

    Connects granite-docling-worker output to knowledge graph for ACE synthesis.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8765",
        timeout: float = 30.0
    ):
        """
        Initialize Phase 79 RAG client.

        Args:
            base_url: Base URL of RAG middleware (default: http://localhost:8765)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.logger = logging.getLogger(__name__)

    async def health_check(self) -> bool:
        """Check if RAG middleware is available"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/health",
                    timeout=self.timeout
                )
                return response.status_code == 200
        except Exception as e:
            self.logger.warning(f"RAG middleware health check failed: {e}")
            return False

    async def upload_document(
        self,
        doc_id: str,
        chunks: List[Dict],
        metadata: Optional[Dict] = None
    ) -> RAGUploadResult:
        """
        Upload document chunks to RAG middleware.

        Args:
            doc_id: Document identifier
            chunks: List of chunk dictionaries with 'text', 'tokens', 'metadata'
            metadata: Optional document metadata

        Returns:
            RAGUploadResult with success status and details
        """
        try:
            # Prepare payload
            payload = {
                "doc_id": doc_id,
                "chunks": [
                    {
                        "text": chunk.text if hasattr(chunk, 'text') else str(chunk),
                        "tokens": chunk.tokens if hasattr(chunk, 'tokens') else len(str(chunk).split()),
                        "metadata": chunk.metadata.to_dict() if hasattr(chunk, 'metadata') else {}
                    }
                    for chunk in chunks
                ],
                "metadata": metadata or {}
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/rag/upload",
                    json=payload,
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    self.logger.info(f"✅ Uploaded {len(chunks)} chunks for doc {doc_id}")
                    return RAGUploadResult(
                        success=True,
                        doc_id=doc_id,
                        chunks_indexed=len(chunks),
                        collection=data.get("collection", "phase79_rag_vectors")
                    )
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text}"
                    self.logger.error(f"RAG upload failed: {error_msg}")
                    return RAGUploadResult(
                        success=False,
                        doc_id=doc_id,
                        chunks_indexed=0,
                        collection="",
                        error=error_msg
                    )

        except Exception as e:
            self.logger.error(f"RAG upload exception: {e}")
            return RAGUploadResult(
                success=False,
                doc_id=doc_id,
                chunks_indexed=0,
                collection="",
                error=str(e)
            )

    async def build_knowledge_graph(
        self,
        doc_id: str,
        enable_ace_synthesis: bool = True
    ) -> bool:
        """
        Build knowledge graph from document chunks.

        Args:
            doc_id: Document identifier
            enable_ace_synthesis: Trigger ACE contextual engineering update

        Returns:
            True if successful, False otherwise
        """
        try:
            payload = {
                "doc_id": doc_id,
                "enable_ace_synthesis": enable_ace_synthesis
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/rag/kag/build-graph",
                    json=payload,
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    data = response.json()
                    self.logger.info(f"✅ Built knowledge graph for doc {doc_id}")
                    if enable_ace_synthesis:
                        self.logger.info(f"   → ACE synthesis triggered")
                    return True
                else:
                    self.logger.error(f"Knowledge graph build failed: HTTP {response.status_code}")
                    return False

        except Exception as e:
            self.logger.error(f"Knowledge graph build exception: {e}")
            return False

    async def query(
        self,
        query_text: str,
        limit: int = 5,
        use_kag: bool = True
    ) -> Optional[Dict]:
        """
        Query RAG/KAG system.

        Args:
            query_text: Query string
            limit: Maximum results
            use_kag: Use knowledge graph augmentation

        Returns:
            Query results or None if failed
        """
        try:
            params = {
                "query": query_text,
                "limit": limit,
                "use_kag": "true" if use_kag else "false"
            }

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/rag/search",
                    params=params,
                    timeout=self.timeout
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    self.logger.error(f"RAG query failed: HTTP {response.status_code}")
                    return None

        except Exception as e:
            self.logger.error(f"RAG query exception: {e}")
            return None
