"""
Hybrid Document Chunker for Granite-Docling DocTags

Converts structured DocTags output into semantic chunks with layout awareness.
Implements hybrid chunking: layout-first preservation + semantic merging of small blocks.
"""

import json
import uuid
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class SemanticType(str, Enum):
    """Semantic types for chunks based on DocTags structure"""
    TEXT = "text"
    TABLE = "table"
    CAPTION = "caption"
    FOOTNOTE = "footnote"
    HEADING = "heading"
    LIST = "list"
    CODE = "code"


@dataclass
class BoundingBox:
    """Bounding box coordinates for layout preservation"""
    x: float
    y: float
    width: float
    height: float
    text: Optional[str] = None
    entity_type: Optional[str] = None

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class Chunk:
    """Semantic chunk with metadata"""
    id: str
    doc_id: str
    text: str
    tokens: int
    semantic_type: SemanticType
    page: int
    bounding_boxes: List[BoundingBox] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)
    embedding: Optional[List[float]] = None
    parent_chunk_id: Optional[str] = None  # For split chunks
    overlap_marker: Optional[str] = None  # For overlapping chunks

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "text": self.text,
            "tokens": self.tokens,
            "semantic_type": self.semantic_type.value,
            "page": self.page,
            "bounding_boxes": [bb.to_dict() for bb in self.bounding_boxes],
            "metadata": self.metadata,
            "embedding": self.embedding,
            "parent_chunk_id": self.parent_chunk_id,
            "overlap_marker": self.overlap_marker,
        }


class HybridChunker:
    """
    Hybrid document chunker that:
    1. Preserves layout structure (tables, captions, footnotes)
    2. Merges small text blocks (<200 tokens)
    3. Splits large blocks (>512 tokens) with overlap
    4. Maintains bounding box coordinates
    """

    # Configuration
    MIN_MERGE_TOKENS = 200  # Merge blocks smaller than this
    MAX_CHUNK_TOKENS = 512  # Split blocks larger than this
    OVERLAP_TOKENS = 50    # Overlap when splitting
    TOKENS_PER_WORD = 1.3  # Rough estimate for token counting

    def __init__(self, doc_id: Optional[str] = None, chunk_size: int = 512, overlap: int = 50):
        self.doc_id = doc_id or f"doc_{uuid.uuid4().hex[:8]}"
        self.MAX_CHUNK_TOKENS = chunk_size
        self.OVERLAP_TOKENS = overlap
        self.chunks: List[Chunk] = []
        self.chunk_counter = 0

    def process_doctags(self, doctags: Dict) -> List[Chunk]:
        """
        Process Granite-Docling DocTags into semantic chunks.

        Args:
            doctags: DocTags JSON from Granite-Docling

        Returns:
            List of Chunk objects
        """
        self.chunks = []
        self.chunk_counter = 0

        # Extract pages from DocTags
        pages = doctags.get("pages", [])

        for page_num, page in enumerate(pages, 1):
            self._process_page(page, page_num)

        # Post-process: merge small chunks
        self.chunks = self._merge_small_chunks(self.chunks)

        # Sort by page and position
        self.chunks.sort(key=lambda c: (c.page, c.metadata.get("position", 0)))

        logger.info(f"Processed {len(self.chunks)} chunks from {len(pages)} pages")
        return self.chunks

    def _process_page(self, page: Dict, page_num: int) -> None:
        """Process a single page from DocTags"""
        blocks = page.get("blocks", [])

        for block_idx, block in enumerate(blocks):
            block_type = block.get("type", "text")

            if block_type == "table":
                self._process_table(block, page_num, block_idx)
            elif block_type == "caption":
                self._process_caption(block, page_num, block_idx)
            elif block_type == "footnote":
                self._process_footnote(block, page_num, block_idx)
            elif block_type == "heading":
                self._process_heading(block, page_num, block_idx)
            elif block_type == "list":
                self._process_list(block, page_num, block_idx)
            else:  # text
                self._process_text_block(block, page_num, block_idx)

    def _process_text_block(self, block: Dict, page_num: int, block_idx: int) -> None:
        """Process a text block"""
        text = block.get("text", "").strip()
        if not text:
            return

        tokens = self._estimate_tokens(text)
        bbox = self._extract_bbox(block)

        # If block is too large, split it
        if tokens > self.MAX_CHUNK_TOKENS:
            self._split_and_add_chunks(text, page_num, block_idx, bbox, SemanticType.TEXT)
        else:
            chunk = self._create_chunk(
                text=text,
                tokens=tokens,
                semantic_type=SemanticType.TEXT,
                page=page_num,
                bounding_boxes=[bbox] if bbox else [],
                metadata={"position": block_idx, "block_type": "text"},
            )
            self.chunks.append(chunk)

    def _process_table(self, block: Dict, page_num: int, block_idx: int) -> None:
        """Process a table as a single chunk"""
        rows = block.get("rows", [])
        if not rows:
            return

        # Reconstruct table text
        table_text = self._reconstruct_table(rows)
        tokens = self._estimate_tokens(table_text)
        bbox = self._extract_bbox(block)

        chunk = self._create_chunk(
            text=table_text,
            tokens=tokens,
            semantic_type=SemanticType.TABLE,
            page=page_num,
            bounding_boxes=[bbox] if bbox else [],
            metadata={
                "position": block_idx,
                "block_type": "table",
                "row_count": len(rows),
                "col_count": len(rows[0]) if rows else 0,
            },
        )
        self.chunks.append(chunk)

    def _process_caption(self, block: Dict, page_num: int, block_idx: int) -> None:
        """Process a caption"""
        text = block.get("text", "").strip()
        if not text:
            return

        tokens = self._estimate_tokens(text)
        bbox = self._extract_bbox(block)

        chunk = self._create_chunk(
            text=text,
            tokens=tokens,
            semantic_type=SemanticType.CAPTION,
            page=page_num,
            bounding_boxes=[bbox] if bbox else [],
            metadata={"position": block_idx, "block_type": "caption"},
        )
        self.chunks.append(chunk)

    def _process_footnote(self, block: Dict, page_num: int, block_idx: int) -> None:
        """Process a footnote"""
        text = block.get("text", "").strip()
        if not text:
            return

        tokens = self._estimate_tokens(text)
        bbox = self._extract_bbox(block)

        chunk = self._create_chunk(
            text=text,
            tokens=tokens,
            semantic_type=SemanticType.FOOTNOTE,
            page=page_num,
            bounding_boxes=[bbox] if bbox else [],
            metadata={"position": block_idx, "block_type": "footnote"},
        )
        self.chunks.append(chunk)

    def _process_heading(self, block: Dict, page_num: int, block_idx: int) -> None:
        """Process a heading"""
        text = block.get("text", "").strip()
        if not text:
            return

        tokens = self._estimate_tokens(text)
        bbox = self._extract_bbox(block)

        chunk = self._create_chunk(
            text=text,
            tokens=tokens,
            semantic_type=SemanticType.HEADING,
            page=page_num,
            bounding_boxes=[bbox] if bbox else [],
            metadata={
                "position": block_idx,
                "block_type": "heading",
                "level": block.get("level", 1),
            },
        )
        self.chunks.append(chunk)

    def _process_list(self, block: Dict, page_num: int, block_idx: int) -> None:
        """Process a list"""
        items = block.get("items", [])
        if not items:
            return

        list_text = "\n".join(f"• {item}" for item in items)
        tokens = self._estimate_tokens(list_text)
        bbox = self._extract_bbox(block)

        chunk = self._create_chunk(
            text=list_text,
            tokens=tokens,
            semantic_type=SemanticType.LIST,
            page=page_num,
            bounding_boxes=[bbox] if bbox else [],
            metadata={
                "position": block_idx,
                "block_type": "list",
                "item_count": len(items),
            },
        )
        self.chunks.append(chunk)

    def _split_and_add_chunks(
        self,
        text: str,
        page_num: int,
        block_idx: int,
        bbox: Optional[BoundingBox],
        semantic_type: SemanticType,
    ) -> None:
        """Split large text into overlapping chunks"""
        sentences = text.split(". ")
        current_chunk = ""
        current_tokens = 0
        parent_id = str(uuid.uuid4())

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            sentence_tokens = self._estimate_tokens(sentence)

            # If adding this sentence exceeds limit, save current chunk
            if current_tokens + sentence_tokens > self.MAX_CHUNK_TOKENS and current_chunk:
                chunk = self._create_chunk(
                    text=current_chunk.strip(),
                    tokens=current_tokens,
                    semantic_type=semantic_type,
                    page=page_num,
                    bounding_boxes=[bbox] if bbox else [],
                    metadata={
                        "position": block_idx,
                        "split": True,
                        "parent_id": parent_id,
                    },
                )
                self.chunks.append(chunk)

                # Start new chunk with overlap
                overlap_sentences = self._get_overlap_sentences(current_chunk)
                current_chunk = overlap_sentences + sentence + ". "
                current_tokens = self._estimate_tokens(current_chunk)
            else:
                current_chunk += sentence + ". "
                current_tokens += sentence_tokens

        # Add final chunk
        if current_chunk.strip():
            chunk = self._create_chunk(
                text=current_chunk.strip(),
                tokens=current_tokens,
                semantic_type=semantic_type,
                page=page_num,
                bounding_boxes=[bbox] if bbox else [],
                metadata={
                    "position": block_idx,
                    "split": True,
                    "parent_id": parent_id,
                },
            )
            self.chunks.append(chunk)

    def _merge_small_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """Merge consecutive small chunks"""
        if not chunks:
            return chunks

        merged = []
        i = 0

        while i < len(chunks):
            current = chunks[i]

            # If current chunk is small and next exists, try to merge
            if (
                current.tokens < self.MIN_MERGE_TOKENS
                and i + 1 < len(chunks)
                and current.semantic_type == SemanticType.TEXT
            ):
                next_chunk = chunks[i + 1]

                # Only merge if next is also text and on same page
                if (
                    next_chunk.semantic_type == SemanticType.TEXT
                    and next_chunk.page == current.page
                ):
                    merged_text = current.text + " " + next_chunk.text
                    merged_tokens = current.tokens + next_chunk.tokens
                    merged_bboxes = current.bounding_boxes + next_chunk.bounding_boxes

                    merged_chunk = self._create_chunk(
                        text=merged_text,
                        tokens=merged_tokens,
                        semantic_type=SemanticType.TEXT,
                        page=current.page,
                        bounding_boxes=merged_bboxes,
                        metadata={
                            "position": current.metadata.get("position", 0),
                            "merged": True,
                            "merged_from": [current.id, next_chunk.id],
                        },
                    )
                    merged.append(merged_chunk)
                    i += 2
                    continue

            merged.append(current)
            i += 1

        return merged

    def _create_chunk(
        self,
        text: str,
        tokens: int,
        semantic_type: SemanticType,
        page: int,
        bounding_boxes: List[BoundingBox],
        metadata: Dict,
    ) -> Chunk:
        """Create a new chunk"""
        self.chunk_counter += 1
        chunk_id = f"chunk_{self.doc_id}_{self.chunk_counter:04d}"

        return Chunk(
            id=chunk_id,
            doc_id=self.doc_id,
            text=text,
            tokens=tokens,
            semantic_type=semantic_type,
            page=page,
            bounding_boxes=bounding_boxes,
            metadata=metadata,
        )

    def _estimate_tokens(self, text: str) -> int:
        """Estimate token count (rough approximation)"""
        words = len(text.split())
        return int(words * self.TOKENS_PER_WORD)

    def _extract_bbox(self, block: Dict) -> Optional[BoundingBox]:
        """Extract bounding box from block"""
        bbox_data = block.get("bbox")
        if not bbox_data:
            return None

        return BoundingBox(
            x=bbox_data.get("x", 0),
            y=bbox_data.get("y", 0),
            width=bbox_data.get("width", 0),
            height=bbox_data.get("height", 0),
            text=block.get("text", "")[:50],  # First 50 chars
        )

    def _reconstruct_table(self, rows: List[List[str]]) -> str:
        """Reconstruct table as readable text"""
        lines = []
        for row in rows:
            lines.append(" | ".join(str(cell) for cell in row))
        return "\n".join(lines)

    def _get_overlap_sentences(self, text: str, num_sentences: int = 2) -> str:
        """Get last N sentences for overlap"""
        sentences = text.split(". ")
        overlap = sentences[-num_sentences:] if len(sentences) > num_sentences else sentences
        return ". ".join(overlap) + ". "

    def to_json(self) -> str:
        """Serialize chunks to JSON"""
        return json.dumps([chunk.to_dict() for chunk in self.chunks], indent=2)

    def save_chunks(self, filepath: str) -> None:
        """Save chunks to JSON file"""
        with open(filepath, "w") as f:
            f.write(self.to_json())
        logger.info(f"Saved {len(self.chunks)} chunks to {filepath}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Mock DocTags for testing
    mock_doctags = {
        "pages": [
            {
                "blocks": [
                    {
                        "type": "heading",
                        "text": "Contract Agreement",
                        "level": 1,
                        "bbox": {"x": 10, "y": 10, "width": 200, "height": 20},
                    },
                    {
                        "type": "text",
                        "text": "This is a sample contract. It contains important terms and conditions. "
                        "The parties agree to the following. This is a longer text block that should be processed. "
                        * 10,  # Make it large enough to split
                        "bbox": {"x": 10, "y": 40, "width": 400, "height": 100},
                    },
                    {
                        "type": "table",
                        "rows": [
                            ["Item", "Quantity", "Price"],
                            ["Widget A", "10", "$100"],
                            ["Widget B", "5", "$50"],
                        ],
                        "bbox": {"x": 10, "y": 150, "width": 300, "height": 80},
                    },
                ]
            }
        ]
    }

    chunker = HybridChunker("doc_test_001")
    chunks = chunker.process_doctags(mock_doctags)

    print(f"\nGenerated {len(chunks)} chunks:")
    for chunk in chunks:
        print(f"  - {chunk.id}: {chunk.semantic_type.value} ({chunk.tokens} tokens)")

    chunker.save_chunks("chunks_output.json")
