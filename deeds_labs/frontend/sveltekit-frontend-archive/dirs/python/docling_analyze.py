#!/usr/bin/env python3
"""
Docling Analysis Script for SvelteKit Frontend
Processes documents using docling-parse for OCR + layout extraction
"""

import sys
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional
import tempfile
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    from docling_parse.pdf_parser import DoclingPdfParser
    DOCLING_AVAILABLE = True
except ImportError:
    DOCLING_AVAILABLE = False
    logger.warning("docling-parse not installed. Install with: pip install docling-parse")

def analyze_document(input_path: str, output_path: str, mime_type: str) -> Dict:
    """
    Analyze document using docling-parse
    Returns structured JSON with text blocks, layout info, and metadata
    """

    if not DOCLING_AVAILABLE:
        # Fallback mock processing
        logger.warning("Using mock Docling processing (library not available)")
        return {
            "fullText": "Mock processing - Docling not available",
            "blocks": [{
                "type": "paragraph",
                "text": "Mock processing - Docling not available",
                "page": 1
            }],
            "pageCount": 1,
            "processingTimeMs": 100
        }

    try:
        # Check if it's a PDF
        if mime_type != 'application/pdf':
            logger.info(f"Unsupported mime type: {mime_type}, using basic text extraction")
            try:
                with open(input_path, 'r', encoding='utf-8') as f:
                    text = f.read()
                return {
                    "fullText": text,
                    "blocks": [{
                        "type": "paragraph",
                        "text": text,
                        "page": 1
                    }],
                    "pageCount": 1,
                    "processingTimeMs": 100
                }
            except:
                return {
                    "fullText": f"Unsupported file type: {mime_type}",
                    "blocks": [{
                        "type": "paragraph",
                        "text": f"Unsupported file type: {mime_type}",
                        "page": 1
                    }],
                    "pageCount": 1,
                    "processingTimeMs": 100
                }

        # Initialize parser
        parser = DoclingPdfParser()

        # Load document
        logger.info(f"Loading PDF document: {input_path}")
        pdf_doc = parser.load(input_path)

        # Parse all pages
        pdf_doc.load_all_pages()

        # Extract structured data
        blocks = []
        full_text = ""
        page_count = pdf_doc.number_of_pages()

        # Process pages
        for page_idx in range(page_count):
            page_no = page_idx + 1
            page = pdf_doc.get_page(page_idx)

            # Extract text from page
            if hasattr(page, 'text') and page.text:
                page_text = page.text
                full_text += page_text + "\n"

                # Create text block
                block = {
                    "type": "paragraph",
                    "text": page_text,
                    "page": page_no
                }

                # Add bounding box if available
                if hasattr(page, 'bbox'):
                    try:
                        bbox = page.bbox
                        if bbox:
                            block["bbox"] = [bbox[0], bbox[1], bbox[2], bbox[3]]
                    except:
                        pass

                blocks.append(block)

            # Extract tables if available
            # Note: Table extraction might need different API
            # For now, we'll focus on text extraction

        # Create result structure
        docling_result = {
            "fullText": full_text.strip(),
            "blocks": blocks,
            "pageCount": page_count,
            "processingTimeMs": 0  # Will be set by caller
        }

        logger.info(f"Successfully processed {page_count} pages with {len(blocks)} blocks")
        return docling_result

    except Exception as e:
        logger.error(f"Error processing document: {e}")
        return {
            "fullText": f"Error processing document: {str(e)}",
            "blocks": [{
                "type": "paragraph",
                "text": f"Error processing document: {str(e)}",
                "page": 1
            }],
            "pageCount": 1,
            "processingTimeMs": 100
        }

def main():
    if len(sys.argv) != 4:
        print("Usage: python docling_analyze.py <input_file> <output_json> <mime_type>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    mime_type = sys.argv[3]

    try:
        # Validate input file exists
        if not Path(input_path).exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        # Process document
        result = analyze_document(input_path, output_path, mime_type)

        # Write result to output file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        logger.info(f"Results written to: {output_path}")

    except Exception as e:
        logger.error(f"Processing failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()