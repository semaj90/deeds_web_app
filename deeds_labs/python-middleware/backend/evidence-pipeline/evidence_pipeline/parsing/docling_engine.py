"""
IBM Docling document parser for evidence processing pipeline.
Extracts structured content from PDFs and documents with semantic understanding.
"""

import logging
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import json

logger = logging.getLogger(__name__)


@dataclass
class ParsedElement:
    """Represents a parsed element from a document."""
    type: str  # paragraph, table, heading, list, image, etc.
    content: str
    page_number: int
    section_title: Optional[str] = None
    metadata: Dict[str, Any] = None
    children: List['ParsedElement'] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        if self.children is None:
            self.children = []

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'type': self.type,
            'content': self.content,
            'page_number': self.page_number,
            'section_title': self.section_title,
            'metadata': self.metadata,
            'children': [child.to_dict() for child in self.children]
        }


@dataclass
class DocumentMetadata:
    """Document metadata extracted during parsing."""
    title: Optional[str] = None
    author: Optional[str] = None
    creation_date: Optional[str] = None
    modification_date: Optional[str] = None
    page_count: int = 0
    language: Optional[str] = None
    subject: Optional[str] = None
    keywords: List[str] = None
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.keywords is None:
            self.keywords = []
        if self.metadata is None:
            self.metadata = {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'title': self.title,
            'author': self.author,
            'creation_date': self.creation_date,
            'modification_date': self.modification_date,
            'page_count': self.page_count,
            'language': self.language,
            'subject': self.subject,
            'keywords': self.keywords,
            'metadata': self.metadata
        }


class DoclingEngine:
    """IBM Docling document parser for legal documents."""

    def __init__(self, model_name: str = "docling-base"):
        """
        Initialize Docling engine.

        Args:
            model_name: Docling model to use
        """
        self.model_name = model_name
        self.converter = None
        self._initialize_converter()

        logger.info(f"Initialized Docling engine: {model_name}")

    def _initialize_converter(self):
        """Initialize Docling converter."""
        try:
            from docling.document_converter import DocumentConverter

            self.converter = DocumentConverter(model_name=self.model_name)
            logger.info("Docling converter initialized successfully")

        except ImportError:
            logger.error("Docling not installed. Install with: pip install docling")
            raise
        except Exception as e:
            logger.error(f"Failed to initialize Docling converter: {e}")
            raise

    async def parse_document(
        self,
        file_path: str
    ) -> tuple[List[ParsedElement], DocumentMetadata]:
        """
        Parse document using Docling.

        Args:
            file_path: Path to document file

        Returns:
            Tuple of (parsed elements, document metadata)
        """
        try:
            logger.info(f"Parsing document: {file_path}")

            # Convert document
            result = self.converter.convert(file_path)

            # Extract elements
            elements = await self._extract_elements(result)

            # Extract metadata
            metadata = await self._extract_metadata(result)

            logger.info(f"Parsed document: {len(elements)} elements, {metadata.page_count} pages")

            return elements, metadata

        except Exception as e:
            logger.error(f"Failed to parse document: {e}")
            raise

    async def _extract_elements(self, result) -> List[ParsedElement]:
        """
        Extract parsed elements from Docling result.

        Args:
            result: Docling conversion result

        Returns:
            List of ParsedElement objects
        """
        try:
            elements = []

            # Iterate through document structure
            for page_num, page in enumerate(result.pages, 1):
                current_section = None

                for block in page.blocks:
                    element = await self._convert_block_to_element(
                        block,
                        page_num,
                        current_section
                    )

                    if element:
                        elements.append(element)

                        # Track section titles
                        if element.type == 'heading':
                            current_section = element.content

            return elements

        except Exception as e:
            logger.error(f"Failed to extract elements: {e}")
            return []

    async def _convert_block_to_element(
        self,
        block,
        page_number: int,
        section_title: Optional[str]
    ) -> Optional[ParsedElement]:
        """
        Convert Docling block to ParsedElement.

        Args:
            block: Docling block object
            page_number: Page number
            section_title: Current section title

        Returns:
            ParsedElement or None
        """
        try:
            block_type = block.__class__.__name__

            if block_type == 'ParagraphBlock':
                return ParsedElement(
                    type='paragraph',
                    content=block.text,
                    page_number=page_number,
                    section_title=section_title,
                    metadata={
                        'block_id': str(block.id),
                        'confidence': getattr(block, 'confidence', 1.0)
                    }
                )

            elif block_type == 'HeadingBlock':
                return ParsedElement(
                    type='heading',
                    content=block.text,
                    page_number=page_number,
                    section_title=section_title,
                    metadata={
                        'block_id': str(block.id),
                        'level': getattr(block, 'level', 1)
                    }
                )

            elif block_type == 'TableBlock':
                table_data = await self._extract_table(block)
                return ParsedElement(
                    type='table',
                    content=json.dumps(table_data),
                    page_number=page_number,
                    section_title=section_title,
                    metadata={
                        'block_id': str(block.id),
                        'rows': len(table_data),
                        'columns': len(table_data[0]) if table_data else 0
                    }
                )

            elif block_type == 'ListBlock':
                list_items = await self._extract_list(block)
                return ParsedElement(
                    type='list',
                    content='\n'.join(list_items),
                    page_number=page_number,
                    section_title=section_title,
                    metadata={
                        'block_id': str(block.id),
                        'item_count': len(list_items)
                    }
                )

            elif block_type == 'ImageBlock':
                return ParsedElement(
                    type='image',
                    content=getattr(block, 'image_path', ''),
                    page_number=page_number,
                    section_title=section_title,
                    metadata={
                        'block_id': str(block.id),
                        'caption': getattr(block, 'caption', '')
                    }
                )

            else:
                # Generic block
                return ParsedElement(
                    type=block_type.lower(),
                    content=getattr(block, 'text', ''),
                    page_number=page_number,
                    section_title=section_title,
                    metadata={
                        'block_id': str(block.id)
                    }
                )

        except Exception as e:
            logger.warning(f"Failed to convert block: {e}")
            return None

    async def _extract_table(self, table_block) -> List[List[str]]:
        """
        Extract table structure from TableBlock.

        Args:
            table_block: Docling TableBlock object

        Returns:
            List of rows, each containing cell values
        """
        try:
            table_data = []

            # Extract table structure
            if hasattr(table_block, 'table'):
                table = table_block.table
                for row in table.rows:
                    row_data = []
                    for cell in row.cells:
                        cell_text = cell.text if hasattr(cell, 'text') else str(cell)
                        row_data.append(cell_text)
                    table_data.append(row_data)

            return table_data

        except Exception as e:
            logger.warning(f"Failed to extract table: {e}")
            return []

    async def _extract_list(self, list_block) -> List[str]:
        """
        Extract list items from ListBlock.

        Args:
            list_block: Docling ListBlock object

        Returns:
            List of item strings
        """
        try:
            items = []

            if hasattr(list_block, 'items'):
                for item in list_block.items:
                    item_text = item.text if hasattr(item, 'text') else str(item)
                    items.append(item_text)

            return items

        except Exception as e:
            logger.warning(f"Failed to extract list: {e}")
            return []

    async def _extract_metadata(self, result) -> DocumentMetadata:
        """
        Extract document metadata from Docling result.

        Args:
            result: Docling conversion result

        Returns:
            DocumentMetadata object
        """
        try:
            metadata = DocumentMetadata()

            # Extract from document properties
            if hasattr(result, 'document'):
                doc = result.document
                metadata.title = getattr(doc, 'title', None)
                metadata.author = getattr(doc, 'author', None)
                metadata.subject = getattr(doc, 'subject', None)

            # Extract page count
            if hasattr(result, 'pages'):
                metadata.page_count = len(result.pages)

            # Extract language
            if hasattr(result, 'language'):
                metadata.language = result.language

            # Extract creation date
            if hasattr(result, 'creation_date'):
                metadata.creation_date = str(result.creation_date)

            # Extract modification date
            if hasattr(result, 'modification_date'):
                metadata.modification_date = str(result.modification_date)

            return metadata

        except Exception as e:
            logger.warning(f"Failed to extract metadata: {e}")
            return DocumentMetadata()

    async def extract_text_only(self, file_path: str) -> str:
        """
        Extract plain text from document.

        Args:
            file_path: Path to document file

        Returns:
            Plain text content
        """
        try:
            elements, _ = await self.parse_document(file_path)

            # Combine all text elements
            text_parts = []
            for element in elements:
                if element.type in ['paragraph', 'heading', 'list']:
                    text_parts.append(element.content)

            return '\n\n'.join(text_parts)

        except Exception as e:
            logger.error(f"Failed to extract text: {e}")
            raise

    async def extract_tables(self, file_path: str) -> List[Dict[str, Any]]:
        """
        Extract all tables from document.

        Args:
            file_path: Path to document file

        Returns:
            List of table data dictionaries
        """
        try:
            elements, _ = await self.parse_document(file_path)

            tables = []
            for element in elements:
                if element.type == 'table':
                    table_data = json.loads(element.content)
                    tables.append({
                        'page_number': element.page_number,
                        'section_title': element.section_title,
                        'data': table_data,
                        'metadata': element.metadata
                    })

            return tables

        except Exception as e:
            logger.error(f"Failed to extract tables: {e}")
            raise

    async def extract_headings(self, file_path: str) -> List[Dict[str, Any]]:
        """
        Extract all headings from document.

        Args:
            file_path: Path to document file

        Returns:
            List of heading dictionaries
        """
        try:
            elements, _ = await self.parse_document(file_path)

            headings = []
            for element in elements:
                if element.type == 'heading':
                    headings.append({
                        'page_number': element.page_number,
                        'level': element.metadata.get('level', 1),
                        'text': element.content
                    })

            return headings

        except Exception as e:
            logger.error(f"Failed to extract headings: {e}")
            raise

    def get_element_type_distribution(
        self,
        elements: List[ParsedElement]
    ) -> Dict[str, int]:
        """
        Get distribution of element types.

        Args:
            elements: List of ParsedElement objects

        Returns:
            Dictionary with element type counts
        """
        distribution = {}
        for element in elements:
            distribution[element.type] = distribution.get(element.type, 0) + 1
        return distribution

    def get_page_distribution(
        self,
        elements: List[ParsedElement]
    ) -> Dict[int, int]:
        """
        Get distribution of elements by page.

        Args:
            elements: List of ParsedElement objects

        Returns:
            Dictionary with page number to element count mapping
        """
        distribution = {}
        for element in elements:
            page = element.page_number
            distribution[page] = distribution.get(page, 0) + 1
        return distribution
