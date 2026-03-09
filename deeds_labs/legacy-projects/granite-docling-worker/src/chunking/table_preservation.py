"""
Table preservation for document chunks.

Maintains table structure in markdown or structured format.
"""

import logging
import re
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, replace

from .chunk_models import Chunk, ChunkMetadata

logger = logging.getLogger(__name__)


@dataclass
class Table:
    """Represents a table in a document."""

    id: str
    content: str  # Markdown or HTML format
    rows: int
    columns: int
    page_number: Optional[int] = None
    position: int = 0  # Position in document


class TablePreserver:
    """Preserves table structure in chunks."""

    # HTML table pattern
    HTML_TABLE_PATTERN = re.compile(
        r'<table[^>]*>.*?</table>',
        re.DOTALL | re.IGNORECASE
    )

    # Markdown table pattern
    MARKDOWN_TABLE_PATTERN = re.compile(
        r'^\|.+\|$\n^\|[\s\-|:]+\|$\n(^\|.+\|$\n?)+',
        re.MULTILINE
    )

    # CSV-like table pattern
    CSV_TABLE_PATTERN = re.compile(
        r'^[^\n]*,[^\n]*\n([^\n]*,[^\n]*\n)+',
        re.MULTILINE
    )

    def __init__(self):
        """Initialize table preserver."""
        pass

    def extract_tables(
        self,
        text: str,
        document_id: str,
    ) -> List[Table]:
        """
        Extract tables from text.

        Args:
            text: Document text
            document_id: Document ID

        Returns:
            List of extracted tables
        """
        tables = []

        # Extract HTML tables
        for match in self.HTML_TABLE_PATTERN.finditer(text):
            table = self._parse_html_table(
                match.group(0),
                document_id,
                match.start(),
            )
            if table:
                tables.append(table)

        # Extract Markdown tables
        for match in self.MARKDOWN_TABLE_PATTERN.finditer(text):
            table = self._parse_markdown_table(
                match.group(0),
                document_id,
                match.start(),
            )
            if table:
                tables.append(table)

        logger.info(f"Extracted {len(tables)} tables from {document_id}")
        return tables

    def preserve_tables_in_chunks(
        self,
        chunks: List[Chunk],
        text: str,
        document_id: str,
    ) -> List[Chunk]:
        """
        Preserve tables in chunks.

        Args:
            chunks: List of chunks
            text: Original text
            document_id: Document ID

        Returns:
            Enhanced chunks with table information
        """
        tables = self.extract_tables(text, document_id)

        enhanced_chunks = []
        for chunk in chunks:
            # Find tables in this chunk
            chunk_tables = self._find_tables_in_chunk(chunk, tables, text)

            # Update metadata if chunk contains tables
            if chunk_tables:
                metadata = replace(
                    chunk.metadata,
                    is_table=True,
                    custom_metadata={
                        **chunk.metadata.custom_metadata,
                        'tables': [t.id for t in chunk_tables],
                        'table_count': len(chunk_tables),
                    }
                )
                enhanced_chunks.append(replace(chunk, metadata=metadata))
            else:
                enhanced_chunks.append(chunk)

        return enhanced_chunks

    def _parse_html_table(
        self,
        html: str,
        document_id: str,
        position: int,
    ) -> Optional[Table]:
        """Parse HTML table."""
        try:
            # Count rows and columns
            rows = len(re.findall(r'<tr[^>]*>', html, re.IGNORECASE))
            cols = len(re.findall(r'<th[^>]*>|<td[^>]*>', html, re.IGNORECASE)) // max(1, rows)

            # Convert to markdown
            markdown = self._html_to_markdown(html)

            import uuid
            return Table(
                id=str(uuid.uuid4()),
                content=markdown,
                rows=rows,
                columns=cols,
                position=position,
            )
        except Exception as e:
            logger.error(f"Error parsing HTML table: {e}")
            return None

    def _parse_markdown_table(
        self,
        markdown: str,
        document_id: str,
        position: int,
    ) -> Optional[Table]:
        """Parse Markdown table."""
        try:
            lines = markdown.strip().split('\n')

            # Count rows and columns
            rows = len([l for l in lines if l.startswith('|')])
            if rows > 0:
                cols = len(lines[0].split('|')) - 2  # Exclude empty first/last
            else:
                cols = 0

            import uuid
            return Table(
                id=str(uuid.uuid4()),
                content=markdown,
                rows=rows,
                columns=cols,
                position=position,
            )
        except Exception as e:
            logger.error(f"Error parsing Markdown table: {e}")
            return None

    def _html_to_markdown(self, html: str) -> str:
        """Convert HTML table to Markdown."""
        try:
            # Simple HTML to Markdown conversion
            # Remove HTML tags
            markdown = re.sub(r'</?table[^>]*>', '', html, flags=re.IGNORECASE)
            markdown = re.sub(r'</?tbody[^>]*>', '', markdown, flags=re.IGNORECASE)
            markdown = re.sub(r'</?thead[^>]*>', '', markdown, flags=re.IGNORECASE)
            markdown = re.sub(r'</?tfoot[^>]*>', '', markdown, flags=re.IGNORECASE)

            # Convert rows
            rows = []
            for tr in re.finditer(r'<tr[^>]*>(.*?)</tr>', markdown, re.DOTALL | re.IGNORECASE):
                cells = []
                for td in re.finditer(r'<t[dh][^>]*>(.*?)</t[dh]>', tr.group(1), re.DOTALL | re.IGNORECASE):
                    cell_content = td.group(1)
                    # Remove nested HTML
                    cell_content = re.sub(r'<[^>]+>', '', cell_content)
                    cells.append(cell_content.strip())
                if cells:
                    rows.append('| ' + ' | '.join(cells) + ' |')

            # Add separator after header
            if len(rows) > 1:
                header_cells = len(rows[0].split('|')) - 2
                separator = '| ' + ' | '.join(['---'] * header_cells) + ' |'
                rows.insert(1, separator)

            return '\n'.join(rows)
        except Exception as e:
            logger.error(f"Error converting HTML to Markdown: {e}")
            return html

    def _find_tables_in_chunk(
        self,
        chunk: Chunk,
        tables: List[Table],
        text: str,
    ) -> List[Table]:
        """Find tables that appear in a chunk."""
        chunk_start = text.find(chunk.content)
        chunk_end = chunk_start + len(chunk.content)

        chunk_tables = []
        for table in tables:
            if chunk_start <= table.position < chunk_end:
                chunk_tables.append(table)

        return chunk_tables

    def format_table_for_embedding(self, table: Table) -> str:
        """
        Format table for embedding generation.

        Converts table to text format suitable for embeddings.
        """
        # Extract text from markdown table
        lines = table.content.split('\n')
        text_parts = []

        for line in lines:
            if line.startswith('|'):
                # Extract cell contents
                cells = [c.strip() for c in line.split('|')[1:-1]]
                text_parts.append(' '.join(cells))

        return ' '.join(text_parts)
