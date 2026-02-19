"""
Semantic chunking module for evidence processing pipeline.
Splits documents into semantic units while preserving context.
"""

import logging
import uuid
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import re

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """Represents a semantic chunk of text."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    content: str = ""
    page_number: int = 0
    section_title: Optional[str] = None
    chunk_index: int = 0
    element_type: str = "paragraph"  # paragraph, table, heading, list, etc.
    metadata: Dict[str, Any] = field(default_factory=dict)
    source_elements: List[str] = field(default_factory=list)  # IDs of source elements

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'id': self.id,
            'content': self.content,
            'page_number': self.page_number,
            'section_title': self.section_title,
            'chunk_index': self.chunk_index,
            'element_type': self.element_type,
            'metadata': self.metadata,
            'source_elements': self.source_elements
        }


class SemanticChunker:
    """Chunks documents into semantic units."""

    def __init__(
        self,
        min_chunk_size: int = 100,
        max_chunk_size: int = 1000,
        overlap_size: int = 50
    ):
        """
        Initialize semantic chunker.

        Args:
            min_chunk_size: Minimum chunk size in characters
            max_chunk_size: Maximum chunk size in characters
            overlap_size: Overlap between chunks in characters
        """
        self.min_chunk_size = min_chunk_size
        self.max_chunk_size = max_chunk_size
        self.overlap_size = overlap_size

        logger.info(
            f"Initialized SemanticChunker: "
            f"min={min_chunk_size}, max={max_chunk_size}, overlap={overlap_size}"
        )

    async def chunk_elements(
        self,
        elements: List[Any],
        preserve_structure: bool = True
    ) -> List[Chunk]:
        """
        Chunk parsed elements into semantic units.

        Args:
            elements: List of ParsedElement objects
            preserve_structure: Whether to preserve document structure

        Returns:
            List of Chunk objects
        """
        try:
            logger.info(f"Chunking {len(elements)} elements")

            chunks = []
            chunk_index = 0
            current_section = None

            for element in elements:
                # Track section changes
                if element.type == 'heading':
                    current_section = element.content

                # Chunk based on element type
                if element.type == 'table':
                    # Tables are kept as single chunks
                    chunk = Chunk(
                        content=element.content,
                        page_number=element.page_number,
                        section_title=current_section,
                        chunk_index=chunk_index,
                        element_type='table',
                        metadata=element.metadata,
                        source_elements=[element.metadata.get('block_id', '')]
                    )
                    chunks.append(chunk)
                    chunk_index += 1

                elif element.type == 'heading':
                    # Headings are kept as single chunks
                    chunk = Chunk(
                        content=element.content,
                        page_number=element.page_number,
                        section_title=current_section,
                        chunk_index=chunk_index,
                        element_type='heading',
                        metadata=element.metadata,
                        source_elements=[element.metadata.get('block_id', '')]
                    )
                    chunks.append(chunk)
                    chunk_index += 1

                elif element.type == 'list':
                    # Lists are kept as single chunks
                    chunk = Chunk(
                        content=element.content,
                        page_number=element.page_number,
                        section_title=current_section,
                        chunk_index=chunk_index,
                        element_type='list',
                        metadata=element.metadata,
                        source_elements=[element.metadata.get('block_id', '')]
                    )
                    chunks.append(chunk)
                    chunk_index += 1

                else:
                    # Paragraphs and other text are chunked by size
                    text_chunks = await self._chunk_text(
                        element.content,
                        element.page_number,
                        current_section,
                        element.type,
                        element.metadata.get('block_id', '')
                    )

                    for text_chunk in text_chunks:
                        text_chunk.chunk_index = chunk_index
                        chunks.append(text_chunk)
                        chunk_index += 1

            # Merge small chunks
            chunks = await self._merge_small_chunks(chunks)

            logger.info(f"Created {len(chunks)} chunks")
            return chunks

        except Exception as e:
            logger.error(f"Failed to chunk elements: {e}")
            raise

    async def _chunk_text(
        self,
        text: str,
        page_number: int,
        section_title: Optional[str],
        element_type: str,
        block_id: str
    ) -> List[Chunk]:
        """
        Chunk text into semantic units.

        Args:
            text: Text to chunk
            page_number: Page number
            section_title: Section title
            element_type: Type of element
            block_id: Source block ID

        Returns:
            List of Chunk objects
        """
        try:
            chunks = []

            # Split by sentences
            sentences = await self._split_sentences(text)

            if not sentences:
                return chunks

            # Group sentences into chunks
            current_chunk = []
            current_size = 0

            for sentence in sentences:
                sentence_size = len(sentence)

                # Check if adding this sentence would exceed max size
                if current_size + sentence_size > self.max_chunk_size and current_chunk:
                    # Create chunk from current content
                    chunk_text = ' '.join(current_chunk)
                    chunk = Chunk(
                        content=chunk_text,
                        page_number=page_number,
                        section_title=section_title,
                        element_type=element_type,
                        metadata={
                            'sentence_count': len(current_chunk),
                            'source_block': block_id
                        },
                        source_elements=[block_id]
                    )
                    chunks.append(chunk)

                    # Start new chunk with overlap
                    current_chunk = []
                    current_size = 0

                current_chunk.append(sentence)
                current_size += sentence_size + 1  # +1 for space

            # Add remaining chunk
            if current_chunk:
                chunk_text = ' '.join(current_chunk)
                if len(chunk_text) >= self.min_chunk_size:
                    chunk = Chunk(
                        content=chunk_text,
                        page_number=page_number,
                        section_title=section_title,
                        element_type=element_type,
                        metadata={
                            'sentence_count': len(current_chunk),
                            'source_block': block_id
                        },
                        source_elements=[block_id]
                    )
                    chunks.append(chunk)

            return chunks

        except Exception as e:
            logger.warning(f"Failed to chunk text: {e}")
            return []

    async def _split_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences.

        Args:
            text: Text to split

        Returns:
            List of sentences
        """
        try:
            # Simple sentence splitting using regex
            # This is a basic implementation; consider using nltk or spacy for production
            sentences = re.split(r'(?<=[.!?])\s+', text.strip())
            return [s.strip() for s in sentences if s.strip()]

        except Exception as e:
            logger.warning(f"Failed to split sentences: {e}")
            return [text]

    async def _merge_small_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """
        Merge chunks that are smaller than minimum size.

        Args:
            chunks: List of chunks

        Returns:
            List of merged chunks
        """
        try:
            merged = []
            i = 0

            while i < len(chunks):
                chunk = chunks[i]

                # Check if chunk is too small
                if len(chunk.content) < self.min_chunk_size and i + 1 < len(chunks):
                    # Merge with next chunk
                    next_chunk = chunks[i + 1]

                    merged_content = f"{chunk.content} {next_chunk.content}"
                    merged_chunk = Chunk(
                        content=merged_content,
                        page_number=chunk.page_number,
                        section_title=chunk.section_title,
                        element_type=chunk.element_type,
                        metadata={
                            **chunk.metadata,
                            'merged': True,
                            'original_chunks': 2
                        },
                        source_elements=chunk.source_elements + next_chunk.source_elements
                    )

                    merged.append(merged_chunk)
                    i += 2  # Skip next chunk since we merged it
                else:
                    merged.append(chunk)
                    i += 1

            return merged

        except Exception as e:
            logger.warning(f"Failed to merge chunks: {e}")
            return chunks

    def get_chunk_statistics(self, chunks: List[Chunk]) -> Dict[str, Any]:
        """
        Get statistics about chunks.

        Args:
            chunks: List of chunks

        Returns:
            Statistics dictionary
        """
        try:
            if not chunks:
                return {
                    'total_chunks': 0,
                    'avg_chunk_size': 0,
                    'min_chunk_size': 0,
                    'max_chunk_size': 0,
                    'total_content_size': 0
                }

            sizes = [len(chunk.content) for chunk in chunks]
            total_size = sum(sizes)

            return {
                'total_chunks': len(chunks),
                'avg_chunk_size': total_size // len(chunks),
                'min_chunk_size': min(sizes),
                'max_chunk_size': max(sizes),
                'total_content_size': total_size,
                'element_type_distribution': self._get_element_type_distribution(chunks),
                'page_distribution': self._get_page_distribution(chunks)
            }

        except Exception as e:
            logger.warning(f"Failed to get chunk statistics: {e}")
            return {}

    def _get_element_type_distribution(self, chunks: List[Chunk]) -> Dict[str, int]:
        """Get distribution of element types."""
        distribution = {}
        for chunk in chunks:
            distribution[chunk.element_type] = distribution.get(chunk.element_type, 0) + 1
        return distribution

    def _get_page_distribution(self, chunks: List[Chunk]) -> Dict[int, int]:
        """Get distribution of chunks by page."""
        distribution = {}
        for chunk in chunks:
            page = chunk.page_number
            distribution[page] = distribution.get(page, 0) + 1
        return distribution

    async def chunk_by_section(
        self,
        elements: List[Any]
    ) -> Dict[str, List[Chunk]]:
        """
        Chunk elements grouped by section.

        Args:
            elements: List of ParsedElement objects

        Returns:
            Dictionary mapping section titles to chunks
        """
        try:
            sections = {}
            current_section = "Introduction"

            for element in elements:
                if element.type == 'heading':
                    current_section = element.content

                if current_section not in sections:
                    sections[current_section] = []

                # Create chunk for this element
                chunk = Chunk(
                    content=element.content,
                    page_number=element.page_number,
                    section_title=current_section,
                    element_type=element.type,
                    metadata=element.metadata,
                    source_elements=[element.metadata.get('block_id', '')]
                )

                sections[current_section].append(chunk)

            return sections

        except Exception as e:
            logger.error(f"Failed to chunk by section: {e}")
            raise
