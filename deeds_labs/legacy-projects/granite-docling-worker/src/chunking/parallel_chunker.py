"""
Parallel chunking processor for high-throughput document processing.

Processes multiple documents concurrently using thread pool.
Target: 1000+ chunks/second throughput.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass

from .semantic_chunker import SemanticChunker
from .chunk_models import Chunk, ChunkMetadata

logger = logging.getLogger(__name__)


@dataclass
class ChunkingJob:
    """A chunking job for parallel processing."""

    document_id: str
    text: str
    page_number: Optional[int] = None
    metadata: Optional[ChunkMetadata] = None
    callback: Optional[Callable[[str, List[Chunk]], None]] = None


@dataclass
class ChunkingStats:
    """Statistics from parallel chunking."""

    total_documents: int
    total_chunks: int
    total_tokens: int
    total_time_seconds: float
    chunks_per_second: float
    tokens_per_second: float
    failed_documents: int
    errors: List[str]


class ParallelChunker:
    """
    Parallel document chunking processor.

    Uses thread pool to process multiple documents concurrently.
    """

    def __init__(
        self,
        num_workers: Optional[int] = None,
        min_tokens: int = 256,
        max_tokens: int = 512,
    ):
        """
        Initialize parallel chunker.

        Args:
            num_workers: Number of worker threads (default: 1 per 2 cores)
            min_tokens: Minimum tokens per chunk
            max_tokens: Maximum tokens per chunk
        """
        import os

        if num_workers is None:
            # 1 worker per 2 cores
            num_workers = max(1, os.cpu_count() // 2)

        self.num_workers = num_workers
        self.chunker = SemanticChunker(
            min_tokens=min_tokens,
            max_tokens=max_tokens,
        )

        logger.info(f"Initialized ParallelChunker with {num_workers} workers")

    def chunk_documents(
        self,
        jobs: List[ChunkingJob],
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> Tuple[List[Chunk], ChunkingStats]:
        """
        Process multiple documents in parallel.

        Args:
            jobs: List of chunking jobs
            progress_callback: Optional callback for progress updates (completed, total)

        Returns:
            Tuple of (all_chunks, statistics)
        """
        start_time = time.time()
        all_chunks = []
        failed_documents = []
        errors = []

        logger.info(f"Starting parallel chunking of {len(jobs)} documents")

        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            # Submit all jobs
            future_to_job = {
                executor.submit(self._process_job, job): job
                for job in jobs
            }

            # Process completed jobs
            completed = 0
            for future in as_completed(future_to_job):
                job = future_to_job[future]

                try:
                    chunks = future.result()
                    all_chunks.extend(chunks)

                    # Call job callback if provided
                    if job.callback:
                        job.callback(job.document_id, chunks)

                except Exception as e:
                    error_msg = f"Error chunking {job.document_id}: {str(e)}"
                    logger.error(error_msg)
                    failed_documents.append(job.document_id)
                    errors.append(error_msg)

                completed += 1
                if progress_callback:
                    progress_callback(completed, len(jobs))

        elapsed_time = time.time() - start_time

        # Calculate statistics
        stats = ChunkingStats(
            total_documents=len(jobs),
            total_chunks=len(all_chunks),
            total_tokens=sum(c.token_count for c in all_chunks),
            total_time_seconds=elapsed_time,
            chunks_per_second=len(all_chunks) / elapsed_time if elapsed_time > 0 else 0,
            tokens_per_second=sum(c.token_count for c in all_chunks) / elapsed_time if elapsed_time > 0 else 0,
            failed_documents=len(failed_documents),
            errors=errors,
        )

        logger.info(
            f"Parallel chunking complete: {stats.total_chunks} chunks "
            f"({stats.chunks_per_second:.0f} chunks/sec, "
            f"{stats.tokens_per_second:.0f} tokens/sec)"
        )

        return all_chunks, stats

    def _process_job(self, job: ChunkingJob) -> List[Chunk]:
        """Process a single chunking job."""
        return self.chunker.chunk(
            text=job.text,
            document_id=job.document_id,
            page_number=job.page_number,
            metadata=job.metadata,
        )

    def chunk_batch(
        self,
        documents: Dict[str, str],
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> Tuple[Dict[str, List[Chunk]], ChunkingStats]:
        """
        Chunk a batch of documents.

        Args:
            documents: Dict of {document_id: text}
            progress_callback: Optional progress callback

        Returns:
            Tuple of (chunks_by_doc, statistics)
        """
        jobs = [
            ChunkingJob(document_id=doc_id, text=text)
            for doc_id, text in documents.items()
        ]

        all_chunks, stats = self.chunk_documents(jobs, progress_callback)

        # Group chunks by document
        chunks_by_doc = {}
        for chunk in all_chunks:
            doc_id = chunk.metadata.source_document_id
            if doc_id not in chunks_by_doc:
                chunks_by_doc[doc_id] = []
            chunks_by_doc[doc_id].append(chunk)

        return chunks_by_doc, stats


# Type hint for return value
from typing import Tuple
