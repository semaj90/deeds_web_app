"""
Semantic text chunking engine for legal documents.

Implements intelligent chunking at sentence/paragraph boundaries
while preserving document structure and maintaining target token counts.
"""

import re
import uuid
import logging
from typing import List, Optional, Tuple
from dataclasses import replace

from .chunk_models import Chunk, ChunkMetadata

logger = logging.getLogger(__name__)


class SemanticChunker:
    """
    Semantic chunking engine for document text.

    Chunks text at sentence/paragraph boundaries while maintaining
    target token counts (256-512 tokens per chunk).
    """

    # Target chunk size in tokens
    MIN_CHUNK_TOKENS = 256
    MAX_CHUNK_TOKENS = 512

    # Approximate tokens per word (English)
    TOKENS_PER_WORD = 1.3

    # Sentence boundary patterns
    SENTENCE_PATTERN = re.compile(r'(?<=[.!?])\s+(?=[A-Z])')
    PARAGRAPH_PATTERN = re.compile(r'\n\n+')

    # Legal document markers
    SECTION_PATTERN = re.compile(
        r'^(§|SECTION|ARTICLE|CHAPTER|PART|TITLE|RULE|RULE\s+\d+|'
        r'RULE\s+\d+\.\d+|SUBSECTION|CLAUSE|PARAGRAPH)\s+',
        re.MULTILINE | re.IGNORECASE
    )

    def __init__(
        self,
        min_tokens: int = MIN_CHUNK_TOKENS,
        max_tokens: int = MAX_CHUNK_TOKENS,
        preserve_structure: bool = True,
    ):
        """
        Initialize semantic chunker.

        Args:
            min_tokens: Minimum tokens per chunk
            max_tokens: Maximum tokens per chunk
            preserve_structure: Whether to preserve document structure
        """
        self.min_tokens = min_tokens
        self.max_tokens = max_tokens
        self.preserve_structure = preserve_structure

    def chunk(
        self,
        text: str,
        document_id: str,
        page_number: Optional[int] = None,
        metadata: Optional[ChunkMetadata] = None,
    ) -> List[Chunk]:
        """
        Chunk text into semantic segments.

        Args:
            text: Text to chunk
            document_id: Source document ID
            page_number: Page number (if applicable)
            metadata: Base metadata for chunks

        Returns:
            List of Chunk objects
        """
        if not text or not text.strip():
            logger.warning(f"Empty text for document {document_id}")
            return []

        try:
            # Split into paragraphs
            paragraphs = self._split_paragraphs(text)

            # Process paragraphs into chunks
            chunks = []
            chunk_index = 0

            for para_idx, paragraph in enumerate(paragraphs):
                if not paragraph.strip():
                    continue

                # Extract section title if present
                section_title = self._extract_section_title(paragraph)

                # Split paragraph into sentences
                sentences = self._split_sentences(paragraph)

                # Group sentences into chunks
                para_chunks = self._group_sentences_into_chunks(
                    sentences,
                    document_id,
                    page_number,
                    section_title,
                    chunk_index,
                    metadata,
                )

                chunks.extend(para_chunks)
                chunk_index += len(para_chunks)

            # Update total chunk count
            total_chunks = len(chunks)
            chunks = [
                replace(chunk, metadata=replace(
                    chunk.metadata,
                    total_chunks=total_chunks,
                ))
                for chunk in chunks
            ]

            logger.info(
                f"Chunked document {document_id}: {len(chunks)} chunks "
                f"({sum(c.token_count for c in chunks)} tokens)"
            )

            return chunks

        except Exception as e:
            logger.error(f"Error chunking document {document_id}: {e}")
            # Fallback to fixed-size chunking
            return self._fallback_chunk(text, document_id, page_number, metadata)

    def _split_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs."""
        # Split on double newlines
        paragraphs = self.PARAGRAPH_PATTERN.split(text)
        return [p.strip() for p in paragraphs if p.strip()]

    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Use regex to split on sentence boundaries
        sentences = self.SENTENCE_PATTERN.split(text)

        # Rejoin sentences with their punctuation
        result = []
        for i, sentence in enumerate(sentences):
            if i > 0:
                # Add back the punctuation that was removed
                sentence = sentences[i-1][-1] + " " + sentence
            result.append(sentence.strip())

        # Simpler approach: split on common sentence endings
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    def _extract_section_title(self, text: str) -> Optional[str]:
        """Extract section title from text."""
        match = self.SECTION_PATTERN.search(text)
        if match:
            # Get the line containing the section marker
            lines = text.split('\n')
            for line in lines:
                if self.SECTION_PATTERN.search(line):
                    return line.strip()[:100]  # Limit to 100 chars
        return None

    def _group_sentences_into_chunks(
        self,
        sentences: List[str],
        document_id: str,
        page_number: Optional[int],
        section_title: Optional[str],
        start_chunk_index: int,
        base_metadata: Optional[ChunkMetadata],
    ) -> List[Chunk]:
        """Group sentences into chunks based on token count."""
        chunks = []
        current_chunk_sentences = []
        current_token_count = 0

        for sentence in sentences:
            sentence_tokens = self._estimate_tokens(sentence)

            # Check if adding this sentence would exceed max tokens
            if (current_token_count + sentence_tokens > self.max_tokens and
                current_chunk_sentences):
                # Create chunk from current sentences
                chunk = self._create_chunk(
                    current_chunk_sentences,
                    document_id,
                    page_number,
                    section_title,
                    start_chunk_index + len(chunks),
                    base_metadata,
                )
                chunks.append(chunk)
                current_chunk_sentences = []
                current_token_count = 0

            current_chunk_sentences.append(sentence)
            current_token_count += sentence_tokens

        # Create final chunk if there are remaining sentences
        if current_chunk_sentences:
            chunk = self._create_chunk(
                current_chunk_sentences,
                document_id,
                page_number,
                section_title,
                start_chunk_index + len(chunks),
                base_metadata,
            )
            chunks.append(chunk)

        return chunks

    def _create_chunk(
        self,
        sentences: List[str],
        document_id: str,
        page_number: Optional[int],
        section_title: Optional[str],
        chunk_index: int,
        base_metadata: Optional[ChunkMetadata],
    ) -> Chunk:
        """Create a chunk from sentences."""
        content = " ".join(sentences)
        token_count = self._estimate_tokens(content)

        # Create metadata
        if base_metadata:
            metadata = replace(
                base_metadata,
                page_number=page_number or base_metadata.page_number,
                section_title=section_title or base_metadata.section_title,
                chunk_index=chunk_index,
            )
        else:
            metadata = ChunkMetadata(
                page_number=page_number,
                section_title=section_title,
                chunk_index=chunk_index,
                source_document_id=document_id,
            )

        return Chunk(
            id=str(uuid.uuid4()),
            content=content,
            token_count=token_count,
            metadata=metadata,
        )

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count for text."""
        # Simple estimation: count words and multiply by tokens per word
        words = len(text.split())
        return max(1, int(words * self.TOKENS_PER_WORD))

    def _fallback_chunk(
        self,
        text: str,
        document_id: str,
        page_number: Optional[int],
        metadata: Optional[ChunkMetadata],
    ) -> List[Chunk]:
        """
        Fallback chunking using fixed-size token chunks.

        Used when semantic chunking fails.
        """
        logger.warning(f"Using fallback chunking for {document_id}")

        words = text.split()
        chunks = []
        chunk_index = 0

        # Target words per chunk (approximate)
        target_words = int(self.max_tokens / self.TOKENS_PER_WORD)

        for i in range(0, len(words), target_words):
            chunk_words = words[i:i + target_words]
            content = " ".join(chunk_words)
            token_count = self._estimate_tokens(content)

            if base_metadata := metadata:
                chunk_metadata = replace(
                    base_metadata,
                    page_number=page_number or base_metadata.page_number,
                    chunk_index=chunk_index,
                )
            else:
                chunk_metadata = ChunkMetadata(
                    page_number=page_number,
                    chunk_index=chunk_index,
                    source_document_id=document_id,
                )

            chunks.append(Chunk(
                id=str(uuid.uuid4()),
                content=content,
                token_count=token_count,
                metadata=chunk_metadata,
            ))

            chunk_index += 1

        logger.info(f"Fallback chunking created {len(chunks)} chunks")
        return chunks
