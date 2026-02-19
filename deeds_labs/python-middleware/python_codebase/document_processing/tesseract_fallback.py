#!/usr/bin/env python3
"""
Tesseract Fallback OCR
CPU-based OCR when GPU is busy
Used as fallback when Granite-Docling is unavailable
"""

import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TesseractFallback:
    """Tesseract-based fallback OCR"""

    def __init__(self):
        """Initialize Tesseract fallback"""
        try:
            import pytesseract

            self.pytesseract = pytesseract
            self.available = True
            logger.info("Tesseract available for fallback OCR")
        except ImportError:
            logger.warning("Tesseract not installed")
            self.available = False

    def parse_document(self, image_path: str) -> Dict:
        """
        Parse document with Tesseract

        Args:
            image_path: Path to document image

        Returns:
            Dictionary with parsed content
        """
        try:
            if not self.available:
                return {
                    "success": False,
                    "error": "Tesseract not available",
                    "metadata": {"parser": "tesseract", "fallback": True},
                }

            from PIL import Image

            # Load image
            image = Image.open(image_path)

            # Preprocess image
            processed_image = self._preprocess_image(image_path)

            # Extract text
            text = self.pytesseract.image_to_string(processed_image)

            # Extract text with confidence
            data = self.pytesseract.image_to_data(processed_image, output_type=self.pytesseract.Output.DICT)

            return {
                "success": True,
                "text": text,
                "data": data,
                "metadata": {
                    "parser": "tesseract",
                    "fallback": True,
                    "preprocessed": True,
                },
            }

        except Exception as e:
            logger.error(f"Failed to parse document with Tesseract: {e}")
            return {
                "success": False,
                "error": str(e),
                "metadata": {"parser": "tesseract", "fallback": True},
            }

    def parse_batch(self, image_paths: List[str]) -> List[Dict]:
        """
        Parse multiple documents

        Args:
            image_paths: List of image paths

        Returns:
            List of parsed documents
        """
        results = []
        for i, image_path in enumerate(image_paths):
            logger.info(f"Parsing document {i+1}/{len(image_paths)}: {image_path}")
            result = self.parse_document(image_path)
            results.append(result)

        return results

    def _preprocess_image(self, image_path: str) -> np.ndarray:
        """
        Preprocess image for better OCR

        Args:
            image_path: Path to image

        Returns:
            Preprocessed image
        """
        try:
            # Read image
            image = cv2.imread(str(image_path))
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return None

            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

            # Apply threshold
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)

            # Denoise
            denoised = cv2.fastNlMeansDenoising(binary, h=10)

            # Dilate to connect broken characters
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            dilated = cv2.dilate(denoised, kernel, iterations=1)

            # Erode to remove noise
            eroded = cv2.erode(dilated, kernel, iterations=1)

            return eroded

        except Exception as e:
            logger.error(f"Failed to preprocess image: {e}")
            return cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)

    def extract_text_with_confidence(self, image_path: str) -> List[Dict]:
        """
        Extract text with confidence scores

        Args:
            image_path: Path to image

        Returns:
            List of text items with confidence
        """
        try:
            if not self.available:
                return []

            processed_image = self._preprocess_image(image_path)

            # Get detailed data
            data = self.pytesseract.image_to_data(processed_image, output_type=self.pytesseract.Output.DICT)

            results = []
            for i in range(len(data["text"])):
                if int(data["conf"][i]) > 0:  # Only include detected text
                    results.append({
                        "text": data["text"][i],
                        "confidence": int(data["conf"][i]),
                        "bbox": {
                            "x": int(data["left"][i]),
                            "y": int(data["top"][i]),
                            "width": int(data["width"][i]),
                            "height": int(data["height"][i]),
                        },
                    })

            logger.info(f"Extracted {len(results)} text items with confidence")
            return results

        except Exception as e:
            logger.error(f"Failed to extract text with confidence: {e}")
            return []

    def detect_language(self, image_path: str) -> str:
        """
        Detect language in image

        Args:
            image_path: Path to image

        Returns:
            Detected language code
        """
        try:
            if not self.available:
                return "unknown"

            processed_image = self._preprocess_image(image_path)

            # Get language info
            lang_info = self.pytesseract.image_to_pdf_or_hocr(
                processed_image,
                extension="hocr",
            )

            # Parse language from hOCR
            if b'lang=' in lang_info:
                # Extract language code
                start = lang_info.find(b'lang="') + 6
                end = lang_info.find(b'"', start)
                language = lang_info[start:end].decode('utf-8')
                return language

            return "unknown"

        except Exception as e:
            logger.error(f"Failed to detect language: {e}")
            return "unknown"

    def get_available_languages(self) -> List[str]:
        """
        Get available languages for Tesseract

        Returns:
            List of available language codes
        """
        try:
            if not self.available:
                return []

            languages = self.pytesseract.get_languages()
            return languages

        except Exception as e:
            logger.error(f"Failed to get available languages: {e}")
            return []

    def mark_as_fallback(self, parsed_content: Dict) -> Dict:
        """
        Mark parsed content as fallback

        Args:
            parsed_content: Parsed content dictionary

        Returns:
            Updated dictionary with fallback marker
        """
        parsed_content["metadata"]["fallback"] = True
        parsed_content["metadata"]["requires_gpu_reparse"] = True
        return parsed_content

    def get_parser_info(self) -> Dict:
        """Get parser information"""
        return {
            "parser_name": "Tesseract",
            "type": "CPU-based OCR",
            "fallback": True,
            "available": self.available,
            "capabilities": [
                "Basic OCR",
                "Text extraction",
                "Language detection",
                "Confidence scoring",
            ],
            "limitations": [
                "No layout preservation",
                "No table structure recognition",
                "No math/code handling",
                "Lower accuracy than Granite-Docling",
            ],
        }


def main():
    """Test Tesseract fallback"""
    fallback = TesseractFallback()

    # Print parser info
    logger.info(f"Parser info: {fallback.get_parser_info()}")

    # Print available languages
    languages = fallback.get_available_languages()
    logger.info(f"Available languages: {languages}")

    # Test parsing
    test_image = "test_image.png"

    if os.path.exists(test_image):
        result = fallback.parse_document(test_image)
        logger.info(f"Parse result: {result}")

        if result.get("success"):
            # Extract text with confidence
            text_items = fallback.extract_text_with_confidence(test_image)
            logger.info(f"Extracted {len(text_items)} text items")

            # Detect language
            language = fallback.detect_language(test_image)
            logger.info(f"Detected language: {language}")
    else:
        logger.warning(f"Test image not found: {test_image}")


if __name__ == "__main__":
    main()
