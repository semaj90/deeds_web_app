"""
Complete RAG preparation service.

Orchestrates chunking, indexing, embedding, and ranking.
"""

import logging
import time
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass

from .bm25_indexer import BM25Indexer
from .embedding_generator import EmbeddingGenerator
from .ranking_engine import RankingEngine, RankedResult

logger = logging.getLogger(__name__)


@dataclass
class RAGPrepareResult:
    """Result of RAG preparation."""

    document_id: str
    total_chunks: int
    indexed_chunks: int
    embedded_chunks: int
    processing_time_seconds: float
    chunks_per_second: float


class RAGService:
    """
    Complete RAG preparation service.

    Handles chunking, indexing, embedding, and ranking.
    """

    def __init__(
        self,
        embedding_model: str = "nlpaueb/legal-bert-base-uncased",
        device: str = "cpu",
    ):
        """
        Initialize RAG service.

        Args:
            embedding_model: HuggingFace model name
            device: Device to use ('cpu' or 'cuda')
        """
        self.bm25_indexer = BM25Indexer()
        self.embedding_generator = EmbeddingGenerator(
            model_name=embedding_model,
            device=device,
        )
        self.ranking_engine = RankingEngine()

        # Storage
        self.chunks: Dict[str, str] = {}  # chunk_id -> content
        self.embeddings: Dict[str, any] = {}  # chunk_id -> embedding

        logger.info("Initialized RAGService")

    def prepare_chunks(
        self,
        chunks: List[Dict],
        show_progress: bool = False,
    ) -> RAGPrepareResult:
        """
        Prepare chunks for RAG (index + embed).

        Args:
            chunks: List of chunk dicts with 'id' and 'content'
            show_progress: Whether to show progress

        Returns:
            Preparation result
        """
        start_time = time.time()

        document_id = chunks[0].get('document_id', 'unknown') if chunks else 'unknown'

        logger.info(f"Preparing {len(chunks)} chunks for RAG")

        # Index chunks (BM25)
        self.bm25_indexer.index_chunks(chunks)
        indexed_count = len(chunks)

        if show_progress:
            logger.info(f"Indexed {indexed_count} chunks")

        # Generate embeddings
        chunk_embeddings = self.embedding_generator.embed_chunks(
            chunks,
            show_progress=show_progress,
        )
        embedded_count = len(chunk_embeddings)

        # Store embeddings
        for chunk_id, embedding in chunk_embeddings:
            self.embeddings[chunk_id] = embedding
            self.chunks[chunk_id] = next(
                (c['content'] for c in chunks if c['id'] == chunk_id),
                ""
            )

        elapsed_time = time.time() - start_time
        chunks_per_second = len(chunks) / elapsed_time if elapsed_time > 0 else 0

        result = RAGPrepareResult(
            document_id=document_id,
            total_chunks=len(chunks),
            indexed_chunks=indexed_count,
            embedded_chunks=embedded_count,
            processing_time_seconds=elapsed_time,
            chunks_per_second=chunks_per_second,
        )

        logger.info(
            f"RAG preparation complete: {result.total_chunks} chunks, "
            f"{chunks_per_second:.0f} chunks/sec"
        )

        return result

    def search(
        self,
        query: str,
        top_k: int = 10,
        use_r2_only: bool = False,
        use_r3_only: bool = False,
    ) -> List[RankedResult]:
        """
        Search for relevant chunks.

        Args:
            query: Search query
            top_k: Number of results
            use_r2_only: Use only BM25 ranking
            use_r3_only: Use only semantic ranking

        Returns:
            List of ranked results
        """
        logger.info(f"Searching for: {query}")

        # R2: BM25 search
        r2_results = self.bm25_indexer.search(query, top_k=top_k * 2)

        if use_r2_only:
            return self.ranking_engine.rank_r2_only(r2_results, self.chunks, top_k)

        # R3: Semantic search
        query_embedding = self.embedding_generator.embed_chunk(query)
        r3_results = self.embedding_generator.find_similar(
            query_embedding,
            [(cid, emb) for cid, emb in self.embeddings.items()],
            top_k=top_k * 2,
        )

        if use_r3_only:
            return self.ranking_engine.rank_r3_only(r3_results, self.chunks, top_k)

        # Combined ranking
        ranked = self.ranking_engine.rank_results(
            r2_results,
            r3_results,
            self.chunks,
            top_k=top_k,
        )

        logger.info(f"Found {len(ranked)} results")

        return ranked

    def get_statistics(self) -> Dict:
        """Get service statistics."""
        return {
            'total_chunks': len(self.chunks),
            'indexed_chunks': self.bm25_indexer.total_docs,
            'embedded_chunks': len(self.embeddings),
            'bm25_stats': self.bm25_indexer.get_statistics(),
            'embedding_model': self.embedding_generator.get_model_info(),
            'ranking_weights': self.ranking_engine.get_weights(),
        }

    def set_ranking_weights(self, r2_weight: float, r3_weight: float) -> None:
        """
        Set ranking weights.

        Args:
            r2_weight: BM25 weight
            r3_weight: Semantic weight
        """
        self.ranking_engine.adjust_weights(r2_weight, r3_weight)
