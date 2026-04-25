"""Text chunking and semantic segmentation."""

from evidence_pipeline.chunking.semantic_chunker import chunk_text, Chunk
from evidence_pipeline.chunking.chunk_metadata import extract_chunk_metadata

__all__ = [
    "chunk_text",
    "Chunk",
    "extract_chunk_metadata",
]
