"""
Structure preservation for document chunks.

Maintains document hierarchy, page numbers, and section relationships.
"""

import logging
import re
from typing import List, Optional, Dict, Any
from dataclasses import replace

from .chunk_models import Chunk, ChunkMetadata

logger = logging.getLogger(__name__)


class StructurePreserver:
    """Preserves document structure in chunks."""

    # Heading patterns (Markdown-style)
    HEADING_PATTERNS = {
        1: re.compile(r'^#\s+(.+)$', re.MULTILINE),
        2: re.compile(r'^##\s+(.+)$', re.MULTILINE),
        3: re.compile(r'^###\s+(.+)$', re.MULTILINE),
        4: re.compile(r'^####\s+(.+)$', re.MULTILINE),
    }

    # Legal document section patterns
    LEGAL_SECTION_PATTERNS = {
        'section': re.compile(r'^§\s+(\d+(?:\.\d+)*)\s*(.+)$', re.MULTILINE),
        'article': re.compile(r'^ARTICLE\s+([IVX]+|[0-9]+)\s*(.+)$', re.MULTILINE | re.IGNORECASE),
        'chapter': re.compile(r'^CHAPTER\s+([0-9]+)\s*(.+)$', re.MULTILINE | re.IGNORECASE),
        'part': re.compile(r'^PART\s+([IVX]+|[0-9]+)\s*(.+)$', re.MULTILINE | re.IGNORECASE),
    }

    def __init__(self):
        """Initialize structure preserver."""
        pass

    def preserve_structure(
        self,
        chunks: List[Chunk],
        original_text: str,
    ) -> List[Chunk]:
        """
        Enhance chunks with structure information.

        Args:
            chunks: List of chunks to enhance
            original_text: Original document text

        Returns:
            Enhanced chunks with structure metadata
        """
        # Extract document structure
        structure = self._extract_structure(original_text)

        # Enhance each chunk with structure info
        enhanced_chunks = []
        for chunk in chunks:
            enhanced_chunk = self._enhance_chunk_with_structure(
                chunk,
                structure,
                original_text,
            )
            enhanced_chunks.append(enhanced_chunk)

        return enhanced_chunks

    def _extract_structure(self, text: str) -> Dict[str, Any]:
        """Extract document structure."""
        structure = {
            'headings': [],
            'sections': [],
            'page_breaks': [],
            'hierarchy': [],
        }

        # Extract headings
        for level, pattern in self.HEADING_PATTERNS.items():
            for match in pattern.finditer(text):
                structure['headings'].append({
                    'level': level,
                    'title': match.group(1),
                    'position': match.start(),
                })

        # Extract legal sections
        for section_type, pattern in self.LEGAL_SECTION_PATTERNS.items():
            for match in pattern.finditer(text):
                structure['sections'].append({
                    'type': section_type,
                    'number': match.group(1),
                    'title': match.group(2) if len(match.groups()) > 1 else '',
                    'position': match.start(),
                })

        # Extract page breaks (form feed characters)
        for match in re.finditer(r'\f', text):
            structure['page_breaks'].append(match.start())

        return structure

    def _enhance_chunk_with_structure(
        self,
        chunk: Chunk,
        structure: Dict[str, Any],
        original_text: str,
    ) -> Chunk:
        """Enhance a chunk with structure information."""
        # Find chunk position in original text
        chunk_pos = original_text.find(chunk.content)
        if chunk_pos == -1:
            return chunk

        # Find nearest heading
        nearest_heading = self._find_nearest_heading(
            chunk_pos,
            structure['headings'],
        )

        # Find nearest section
        nearest_section = self._find_nearest_section(
            chunk_pos,
            structure['sections'],
        )

        # Count page breaks before chunk
        page_number = 1
        for page_break_pos in structure['page_breaks']:
            if page_break_pos < chunk_pos:
                page_number += 1

        # Update metadata
        metadata = chunk.metadata
        if nearest_heading:
            metadata = replace(
                metadata,
                section_title=nearest_heading['title'],
                section_level=nearest_heading['level'],
            )

        if nearest_section:
            section_title = f"{nearest_section['type'].upper()} {nearest_section['number']}"
            if nearest_section['title']:
                section_title += f": {nearest_section['title']}"
            metadata = replace(
                metadata,
                section_title=section_title,
            )

        if metadata.page_number is None:
            metadata = replace(metadata, page_number=page_number)

        return replace(chunk, metadata=metadata)

    def _find_nearest_heading(
        self,
        position: int,
        headings: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Find nearest heading before position."""
        nearest = None
        for heading in headings:
            if heading['position'] <= position:
                if nearest is None or heading['position'] > nearest['position']:
                    nearest = heading
        return nearest

    def _find_nearest_section(
        self,
        position: int,
        sections: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Find nearest section before position."""
        nearest = None
        for section in sections:
            if section['position'] <= position:
                if nearest is None or section['position'] > nearest['position']:
                    nearest = section
        return nearest

    def build_hierarchy(
        self,
        chunks: List[Chunk],
    ) -> Dict[str, List[Chunk]]:
        """
        Build hierarchical structure from chunks.

        Returns:
            Dict mapping section titles to chunks
        """
        hierarchy = {}

        for chunk in chunks:
            section = chunk.metadata.section_title or "Untitled"
            if section not in hierarchy:
                hierarchy[section] = []
            hierarchy[section].append(chunk)

        return hierarchy

    def get_chunk_context(
        self,
        chunk: Chunk,
        all_chunks: List[Chunk],
        context_chunks: int = 2,
    ) -> Dict[str, Any]:
        """
        Get context for a chunk (surrounding chunks).

        Args:
            chunk: Target chunk
            all_chunks: All chunks in document
            context_chunks: Number of surrounding chunks to include

        Returns:
            Dict with previous, current, and next chunks
        """
        chunk_index = chunk.metadata.chunk_index

        previous_chunks = []
        next_chunks = []

        # Get previous chunks
        for i in range(max(0, chunk_index - context_chunks), chunk_index):
            if i < len(all_chunks):
                previous_chunks.append(all_chunks[i])

        # Get next chunks
        for i in range(chunk_index + 1, min(len(all_chunks), chunk_index + context_chunks + 1)):
            if i < len(all_chunks):
                next_chunks.append(all_chunks[i])

        return {
            'previous': previous_chunks,
            'current': chunk,
            'next': next_chunks,
            'section': chunk.metadata.section_title,
            'page': chunk.metadata.page_number,
        }
