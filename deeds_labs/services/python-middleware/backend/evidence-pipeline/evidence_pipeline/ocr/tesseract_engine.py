"""
Tesseract OCR engine for evidence processing pipeline.
Extracts text from scanned documents and images with legal document optimization.
"""

import logging
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
import pytesseract
from PIL import Image
import pdf2image
import numpy as np
import cv2

logger = logging.getLogger(__name__)


class OCRResult:
    """Result from OCR processing."""

    def __init__(
        self,
        text: str,
        confidence: float,
        page_number: int,
        layout: Dict[str, Any],
        metadata: Dict[str, Any] = None
    ):
        """Initialize OCR result."""
        self.text = text
        self.confidence = confidence
        self.page_number = page_number
        self.layout = layout
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'text': self.text,
            'confidence': self.confidence,
            'page_number': self.page_number,
            'layout': self.layout,
            'metadata': self.metadata
        }


class TesseractEngine:
    """Tesseract OCR engine for legal document processing."""

    def __init__(
        self,
        tesseract_path: str = 'tesseract',
        language: str = 'eng',
        config: str = '--psm 1 --oem 3'
    ):
        """
        Initialize Tesseract engine.

        Args:
            tesseract_path: Path to tesseract executable
            language: Language code (default: 'eng' for English)
            config: Tesseract configuration string
        """
        self.tesseract_path = tesseract_path
        self.language = language
        self.config = config
        self.confidence_threshold = 0.7

        # Set pytesseract path
        pytesseract.pytesseract.pytesseract_cmd = tesseract_path

        logger.info(f"Initialized Tesseract engine: {tesseract_path}")

    async def extract_text_from_image(
        self,
        image_path: str,
        page_number: int = 1
    ) -> OCRResult:
        """
        Extract text from image using Tesseract OCR.

        Args:
            image_path: Path to image file
            page_number: Page number for metadata

        Returns:
            OCRResult with extracted text and metadata
        """
        try:
            logger.info(f"Extracting text from image: {image_path}")

            # Load and preprocess image
            image = Image.open(image_path)
            preprocessed = await self._preprocess_image(image)

            # Extract text with confidence
            data = pytesseract.image_to_data(
                preprocessed,
                lang=self.language,
                config=self.config,
                output_type=pytesseract.Output.DICT
            )

            # Extract text and calculate confidence
            text = pytesseract.image_to_string(
                preprocessed,
                lang=self.language,
                config=self.config
            )

            # Calculate average confidence
            confidences = [int(conf) / 100.0 for conf in data['conf'] if int(conf) > 0]
            avg_confidence = np.mean(confidences) if confidences else 0.0

            # Extract layout information
            layout = await self._extract_layout(data, image.size)

            logger.info(
                f"Extracted {len(text)} characters with {avg_confidence:.2%} confidence"
            )

            return OCRResult(
                text=text,
                confidence=avg_confidence,
                page_number=page_number,
                layout=layout,
                metadata={
                    'image_path': str(image_path),
                    'image_size': image.size,
                    'word_count': len(text.split()),
                    'character_count': len(text)
                }
            )

        except Exception as e:
            logger.error(f"Failed to extract text from image: {e}")
            raise

    async def extract_text_from_pdf(
        self,
        pdf_path: str,
        start_page: int = 1,
        end_page: Optional[int] = None
    ) -> List[OCRResult]:
        """
        Extract text from PDF using Tesseract OCR.

        Args:
            pdf_path: Path to PDF file
            start_page: Starting page number (1-indexed)
            end_page: Ending page number (inclusive, None for all pages)

        Returns:
            List of OCRResult objects, one per page
        """
        try:
            logger.info(f"Extracting text from PDF: {pdf_path}")

            # Convert PDF to images
            images = pdf2image.convert_from_path(pdf_path)

            if end_page is None:
                end_page = len(images)

            # Validate page range
            start_page = max(1, start_page)
            end_page = min(len(images), end_page)

            logger.info(f"Processing pages {start_page} to {end_page}")

            results = []
            for page_idx in range(start_page - 1, end_page):
                image = images[page_idx]
                page_number = page_idx + 1

                try:
                    result = await self.extract_text_from_image(
                        image_path=None,  # We'll pass PIL Image directly
                        page_number=page_number
                    )
                    results.append(result)
                except Exception as e:
                    logger.warning(f"Failed to extract page {page_number}: {e}")
                    # Continue with next page
                    continue

            logger.info(f"Extracted text from {len(results)} pages")
            return results

        except Exception as e:
            logger.error(f"Failed to extract text from PDF: {e}")
            raise

    async def extract_text_from_pil_image(
        self,
        image: Image.Image,
        page_number: int = 1
    ) -> OCRResult:
        """
        Extract text from PIL Image object.

        Args:
            image: PIL Image object
            page_number: Page number for metadata

        Returns:
            OCRResult with extracted text and metadata
        """
        try:
            logger.info(f"Extracting text from PIL image (page {page_number})")

            # Preprocess image
            preprocessed = await self._preprocess_image(image)

            # Extract text with confidence
            data = pytesseract.image_to_data(
                preprocessed,
                lang=self.language,
                config=self.config,
                output_type=pytesseract.Output.DICT
            )

            # Extract text
            text = pytesseract.image_to_string(
                preprocessed,
                lang=self.language,
                config=self.config
            )

            # Calculate average confidence
            confidences = [int(conf) / 100.0 for conf in data['conf'] if int(conf) > 0]
            avg_confidence = np.mean(confidences) if confidences else 0.0

            # Extract layout information
            layout = await self._extract_layout(data, image.size)

            logger.info(
                f"Extracted {len(text)} characters with {avg_confidence:.2%} confidence"
            )

            return OCRResult(
                text=text,
                confidence=avg_confidence,
                page_number=page_number,
                layout=layout,
                metadata={
                    'image_size': image.size,
                    'word_count': len(text.split()),
                    'character_count': len(text)
                }
            )

        except Exception as e:
            logger.error(f"Failed to extract text from PIL image: {e}")
            raise

    async def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess image for better OCR accuracy.

        Applies:
        - Deskewing
        - Denoising
        - Contrast enhancement
        - Thresholding

        Args:
            image: PIL Image object

        Returns:
            Preprocessed PIL Image
        """
        try:
            # Convert to numpy array
            img_array = np.array(image)

            # Convert to grayscale if needed
            if len(img_array.shape) == 3:
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

            # Denoise
            img_array = cv2.fastNlMeansDenoising(img_array, h=10)

            # Enhance contrast using CLAHE
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            img_array = clahe.apply(img_array)

            # Deskew
            img_array = await self._deskew_image(img_array)

            # Threshold
            _, img_array = cv2.threshold(img_array, 150, 255, cv2.THRESH_BINARY)

            # Convert back to PIL Image
            return Image.fromarray(img_array)

        except Exception as e:
            logger.warning(f"Image preprocessing failed, using original: {e}")
            return image

    async def _deskew_image(self, image_array: np.ndarray) -> np.ndarray:
        """
        Deskew image using Hough transform.

        Args:
            image_array: Numpy array of image

        Returns:
            Deskewed image array
        """
        try:
            # Detect lines using Hough transform
            edges = cv2.Canny(image_array, 50, 150)
            lines = cv2.HoughLines(edges, 1, np.pi / 180, 100)

            if lines is None or len(lines) == 0:
                return image_array

            # Calculate average angle
            angles = []
            for line in lines:
                rho, theta = line[0]
                angle = np.degrees(theta) - 90
                angles.append(angle)

            avg_angle = np.median(angles)

            # Rotate image
            h, w = image_array.shape
            center = (w // 2, h // 2)
            rotation_matrix = cv2.getRotationMatrix2D(center, avg_angle, 1.0)
            rotated = cv2.warpAffine(
                image_array,
                rotation_matrix,
                (w, h),
                borderMode=cv2.BORDER_REPLICATE
            )

            return rotated

        except Exception as e:
            logger.warning(f"Deskewing failed: {e}")
            return image_array

    async def _extract_layout(
        self,
        data: Dict[str, Any],
        image_size: tuple
    ) -> Dict[str, Any]:
        """
        Extract layout information from OCR data.

        Args:
            data: Pytesseract output data
            image_size: Image size (width, height)

        Returns:
            Layout information dictionary
        """
        try:
            # Extract bounding boxes
            boxes = []
            for i in range(len(data['text'])):
                if int(data['conf'][i]) > 0:
                    box = {
                        'x': data['left'][i],
                        'y': data['top'][i],
                        'width': data['width'][i],
                        'height': data['height'][i],
                        'text': data['text'][i],
                        'confidence': int(data['conf'][i]) / 100.0
                    }
                    boxes.append(box)

            return {
                'image_size': image_size,
                'bounding_boxes': boxes,
                'box_count': len(boxes)
            }

        except Exception as e:
            logger.warning(f"Layout extraction failed: {e}")
            return {
                'image_size': image_size,
                'bounding_boxes': [],
                'box_count': 0
            }

    def get_confidence_level(self, confidence: float) -> str:
        """
        Get confidence level description.

        Args:
            confidence: Confidence score (0-1)

        Returns:
            Confidence level string
        """
        if confidence >= 0.95:
            return "excellent"
        elif confidence >= 0.85:
            return "good"
        elif confidence >= 0.70:
            return "acceptable"
        elif confidence >= 0.50:
            return "poor"
        else:
            return "very_poor"

    def should_flag_for_review(self, confidence: float) -> bool:
        """
        Determine if result should be flagged for manual review.

        Args:
            confidence: Confidence score (0-1)

        Returns:
            True if should be flagged for review
        """
        return confidence < self.confidence_threshold
