"""
Text chunking module for semantic document segmentation.

Provides semantic and fallback chunking strategies for legal documents.
"""

from .semantic_chunker import SemanticChunker
from .chunk_models import Chunk, ChunkMetadata

__all__ = ["SemanticChunker", "Chunk", "ChunkMetadata"]
