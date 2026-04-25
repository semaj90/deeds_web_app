"""
Data models for document chunks.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime


@dataclass
class ChunkMetadata:
    """Metadata for a document chunk."""

    page_number: Optional[int] = None
    section_title: Optional[str] = None
    section_level: int = 0  # 0=document, 1=chapter, 2=section, etc.
    chunk_index: int = 0
    total_chunks: int = 0
    is_table: bool = False
    is_code: bool = False
    confidence_score: float = 1.0
    source_document_id: Optional[str] = None
    custom_metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Chunk:
    """A semantic chunk of text from a document."""

    id: str
    content: str
    token_count: int
    metadata: ChunkMetadata
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """Convert chunk to dictionary."""
        return {
            "id": self.id,
            "content": self.content,
            "token_count": self.token_count,
            "metadata": {
                "page_number": self.metadata.page_number,
                "section_title": self.metadata.section_title,
                "section_level": self.metadata.section_level,
                "chunk_index": self.metadata.chunk_index,
                "total_chunks": self.metadata.total_chunks,
                "is_table": self.metadata.is_table,
                "is_code": self.metadata.is_code,
                "confidence_score": self.metadata.confidence_score,
                "source_document_id": self.metadata.source_document_id,
                "custom_metadata": self.metadata.custom_metadata,
            },
            "created_at": self.created_at.isoformat(),
        }
