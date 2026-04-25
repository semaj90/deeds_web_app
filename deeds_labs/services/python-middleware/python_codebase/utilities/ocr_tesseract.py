#!/usr/bin/env python3
"""
Phase 66 OCR Service
Uses pytorch/ollama for vision models with TensorRT-LLM fallback
Supports PDF and image OCR with legal document optimization
"""

import sys
import os
import tempfile
import base64
from pathlib import Path
import requests
import json
from typing import Optional, Dict, Any

class OCRService:
    def __init__(self):
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        self.tensorrt_url = os.getenv('TENSORRT_LLM_URL', 'http://localhost:8099')
        self.embedding_model = os.getenv('EMBEDDING_MODEL', 'embeddinggemma:latest')

    def extract_text_ollama(self, image_path: str) -> Optional[str]:
        """Extract text using Ollama vision model"""
        try:
            # Read image file
            with open(image_path, 'rb') as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')

            # Prepare request for vision model
            payload = {
                "model": "llava:latest",  # or gemma3-legal:latest if vision-capable
                "prompt": "Extract all text from this legal document image. Preserve formatting and structure. Include headers, footers, and any legal terminology.",
                "images": [image_data],
                "stream": False
            }

            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json=payload,
                timeout=60
            )

            if response.status_code == 200:
                result = response.json()
                return result.get('response', '').strip()

        except Exception as e:
            print(f"Ollama OCR failed: {e}", file=sys.stderr)

        return None

    def extract_text_tensorrt(self, image_path: str) -> Optional[str]:
        """Extract text using TensorRT-LLM vision model"""
        try:
            # Read image file
            with open(image_path, 'rb') as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')

            # Prepare request for TensorRT vision endpoint
            payload = {
                "image": image_data,
                "prompt": "Extract all text from this legal document. Include all visible text, headers, and legal terminology.",
                "max_tokens": 2048
            }

            response = requests.post(
                f"{self.tensorrt_url}/v1/vision/ocr",
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                return result.get('text', '').strip()

        except Exception as e:
            print(f"TensorRT OCR failed: {e}", file=sys.stderr)

        return None

    def extract_text_fallback(self, image_path: str) -> str:
        """Fallback OCR using pytesseract if available"""
        try:
            import pytesseract
            from PIL import Image
            import fitz  # PyMuPDF for PDF support

            file_ext = Path(image_path).suffix.lower()

            if file_ext == '.pdf':
                # Extract text from PDF
                doc = fitz.open(image_path)
                text = ""
                for page in doc:
                    text += page.get_text()
                doc.close()
                return text.strip()
            else:
                # OCR image
                image = Image.open(image_path)
                text = pytesseract.image_to_string(image)
                return text.strip()

        except ImportError:
            print("pytesseract or PIL not available, OCR fallback disabled", file=sys.stderr)
            return ""
        except Exception as e:
            print(f"Fallback OCR failed: {e}", file=sys.stderr)
            return ""

    def process_file(self, file_path: str) -> str:
        """Process file and extract text using best available method"""
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}", file=sys.stderr)
            return ""

        file_ext = Path(file_path).suffix.lower()

        # For text files, just read directly
        if file_ext == '.txt':
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return f.read().strip()
            except Exception as e:
                print(f"Failed to read text file: {e}", file=sys.stderr)
                return ""

        # For PDFs and images, try OCR methods in order of preference
        if file_ext in ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp']:

            # Try Ollama vision first
            text = self.extract_text_ollama(file_path)
            if text:
                print("OCR completed using Ollama", file=sys.stderr)
                return text

            # Try TensorRT-LLM vision
            text = self.extract_text_tensorrt(file_path)
            if text:
                print("OCR completed using TensorRT-LLM", file=sys.stderr)
                return text

            # Fallback to pytesseract/PyMuPDF
            text = self.extract_text_fallback(file_path)
            if text:
                print("OCR completed using fallback method", file=sys.stderr)
                return text

        print(f"No suitable OCR method found for {file_ext}", file=sys.stderr)
        return ""

def main():
    if len(sys.argv) != 2:
        print("Usage: python ocr_tesseract.py <file_path>", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]

    # Initialize OCR service
    ocr = OCRService()

    # Process file
    extracted_text = ocr.process_file(file_path)

    # Output extracted text
    print(extracted_text)

if __name__ == "__main__":
    main()