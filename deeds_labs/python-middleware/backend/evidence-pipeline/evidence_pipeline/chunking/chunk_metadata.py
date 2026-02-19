"""Chunk metadata extraction and enrichment."""

from typing import Optional, Dict, Any, List
import structlog
from evidence_pipeline.chunking.semantic_chunker import Chunk

logger = structlog.get_logger(__name__)


def extract_chunk_metadata(
    chunk: Chunk,
    document_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Extract and enrich chunk metadata.

    Args:
        chunk: Chunk object
        document_metadata: Document-level metadata

    Returns:
        Dictionary of chunk metadata
    """
    metadata = {
        "chunk_index": chunk.index,
        "page_number": chunk.page_number,
        "section_title": chunk.section_title,
        "position_in_document": chunk.position_in_document,
        "text_length": len(chunk.text),
        "word_count": len(chunk.text.split()),
    }

    # Add document metadata if provided
    if document_metadata:
        metadata["document_title"] = document_metadata.get("title")
        metadata["document_author"] = document_metadata.get("author")
        metadata["document_page_count"] = document_metadata.get("page_count")

    return metadata


def extract_sections_from_parsed_document(
    parsed_document: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Extract section information from parsed document.

    Args:
        parsed_document: Parsed document from Docling

    Returns:
        List of section dictionaries with hierarchy
    """
    sections = []

    if "sections" not in parsed_document:
        logger.warning("No sections found in parsed document")
        return sections

    for section in parsed_document.get("sections", []):
        section_info = {
            "level": section.get("level", 1),
            "title": section.get("title", ""),
            "content": section.get("content", []),
            "subsections": section.get("subsections", []),
        }
        sections.append(section_info)

    logger.info("Extracted sections from document", section_count=len(sections))
    return sections


def extract_text_from_parsed_document(
    parsed_document: Dict[str, Any],
) -> str:
    """
    Extract full text from parsed document.

    Combines all text content while preserving structure.

    Args:
        parsed_document: Parsed document from Docling

    Returns:
        Full text content
    """
    text_parts = []

    # Add main text if available
    if "text" in parsed_document:
        text_parts.append(parsed_document["text"])

    # Add section content if available
    if "sections" in parsed_document:
        for section in parsed_document["sections"]:
            if "title" in section:
                text_parts.append(f"\n## {section['title']}\n")

            if "content" in section:
                for content in section["content"]:
                    text_parts.append(content)

    full_text = "\n".join(text_parts)
    logger.info("Extracted text from document", text_length=len(full_text))

    return full_text


def extract_page_metadata(
    parsed_document: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Extract page-level metadata from parsed document.

    Args:
        parsed_document: Parsed document from Docling

    Returns:
        Dictionary of page metadata
    """
    metadata = {
        "page_count": parsed_document.get("page_count", 0),
        "title": parsed_document.get("metadata", {}).get("title"),
        "author": parsed_document.get("metadata", {}).get("author"),
        "creation_date": parsed_document.get("metadata", {}).get("creation_date"),
    }

    logger.info("Extracted page metadata", metadata=metadata)
    return metadata


def build_chunk_with_context(
    chunk: Chunk,
    document_metadata: Dict[str, Any],
    previous_chunk: Optional[Chunk] = None,
    next_chunk: Optional[Chunk] = None,
) -> Dict[str, Any]:
    """
    Build chunk with full context information.

    Args:
        chunk: Current chunk
        document_metadata: Document metadata
        previous_chunk: Previous chunk for context
        next_chunk: Next chunk for context

    Returns:
        Dictionary with chunk and context
    """
    chunk_data = {
        "chunk": {
            "index": chunk.index,
            "text": chunk.text,
            "page_number": chunk.page_number,
            "section_title": chunk.section_title,
            "position_in_document": chunk.position_in_document,
        },
        "metadata": extract_chunk_metadata(chunk, document_metadata),
        "context": {
            "document_title": document_metadata.get("title"),
            "document_author": document_metadata.get("author"),
            "document_page_count": document_metadata.get("page_count"),
        },
    }

    # Add previous chunk reference if available
    if previous_chunk:
        chunk_data["context"]["previous_chunk_index"] = previous_chunk.index
        chunk_data["context"]["previous_chunk_preview"] = previous_chunk.text[:100]

    # Add next chunk reference if available
    if next_chunk:
        chunk_data["context"]["next_chunk_index"] = next_chunk.index
        chunk_data["context"]["next_chunk_preview"] = next_chunk.text[:100]

    return chunk_data
