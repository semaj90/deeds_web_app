#!/usr/bin/env python3
"""
Docling Analysis Script
Wraps docling-parse for OCR + layout-aware text extraction
"""

import sys
import json
import traceback
from pathlib import Path

try:
    from docling_parse.pdf_parser import DoclingPdfParser
except ImportError as e:
    print(f"Error: docling-parse not installed. {e}", file=sys.stderr)
    sys.exit(1)


def analyze_document(input_path: str, output_path: str, mime_type: str) -> dict:
    """
    Analyze document using docling-parse

    Args:
        input_path: Path to input document
        output_path: Path to write JSON output
        mime_type: MIME type of document (e.g., 'application/pdf', 'image/png')

    Returns:
        Dictionary with fullText and blocks
    """
    try:
        # Check if file is a PDF (docling-parse only supports PDFs)
        if mime_type != 'application/pdf':
            # For non-PDF files, return basic text extraction
            print(f"File type {mime_type} not supported by docling-parse, using basic text extraction", file=sys.stderr)
            with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
                text_content = f.read()

            result = {
                "fullText": text_content,
                "blocks": [{
                    "type": "paragraph",
                    "text": text_content,
                    "page": 1,
                    "bbox": None
                }],
                "pageCount": 1,
            }

            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            print(f"✅ Basic text extraction complete: 1 block, 1 page", file=sys.stderr)
            return result

        # Initialize parser for PDFs
        print(f"Loading docling-parse parser...", file=sys.stderr)
        parser = DoclingPdfParser(loglevel='error')

        # Load document
        print(f"Loading {input_path}...", file=sys.stderr)
        doc = parser.load(input_path)

        # Extract text and structure
        blocks = []
        full_text_parts = []

        for page_idx, page in enumerate(doc.pages):
            # Get text from the page
            page_text = page.get_text()
            if page_text.strip():
                full_text_parts.append(page_text)

                # Create a block for the entire page
                blocks.append({
                    "type": "paragraph",
                    "text": page_text.strip(),
                    "page": page_idx + 1,
                    "bbox": None,  # docling-parse doesn't provide bbox by default
                })

        # Build result
        result = {
            "fullText": "\n\n".join(full_text_parts),
            "blocks": blocks,
            "pageCount": len(doc.pages),
        }

        # Write output
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"✅ Analysis complete: {len(blocks)} blocks, {len(doc.pages)} pages", file=sys.stderr)
        return result

    except Exception as e:
        print(f"❌ Error analyzing document: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise


def main():
    """Main entry point"""
    if len(sys.argv) < 4:
        print("Usage: docling_analyze.py input_path output_path mime_type", file=sys.stderr)
        sys.exit(1)

    input_path, output_path, mime_type = sys.argv[1:4]

    # Validate input file exists
    if not Path(input_path).exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        analyze_document(input_path, output_path, mime_type)
        sys.exit(0)
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
