#!/usr/bin/env python3
"""
OCR Pipeline for Legal Document Processing
Supports multiple OCR engines and document formats
"""

import cv2
import numpy as np
import pytesseract
from PIL import Image
import pdf2image
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import torch
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class OCRResult:
    text: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    engine: str
    language: str = "eng"

@dataclass
class DocumentRegion:
    bbox: Tuple[int, int, int, int]
    text: str
    confidence: float
    region_type: str  # "paragraph", "heading", "table", "signature"

class OCRPipeline:
    def __init__(self, use_gpu: bool = True):
        self.use_gpu = use_gpu and torch.cuda.is_available()
        self.device = torch.device("cuda" if self.use_gpu else "cpu")

        # Initialize Tesseract
        self.tesseract_config = '--oem 3 --psm 6'

        # Initialize TrOCR (Microsoft's transformer-based OCR)
        if self.use_gpu:
            try:
                self.trocr_processor = TrOCRProcessor.from_pretrained('microsoft/trocr-base-printed')
                self.trocr_model = VisionEncoderDecoderModel.from_pretrained('microsoft/trocr-base-printed')
                self.trocr_model.to(self.device)
                logger.info("TrOCR model loaded on GPU")
            except Exception as e:
                logger.warning(f"Failed to load TrOCR: {e}")
                self.trocr_processor = None
                self.trocr_model = None
        else:
            self.trocr_processor = None
            self.trocr_model = None

    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """Preprocess image for better OCR accuracy"""
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        # Apply bilateral filter to reduce noise while keeping edges sharp
        filtered = cv2.bilateralFilter(gray, 11, 17, 17)

        # Enhance contrast using CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(filtered)

        # Apply morphological operations to clean up
        kernel = np.ones((1, 1), np.uint8)
        cleaned = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, kernel)

        return cleaned

    def extract_text_tesseract(self, image: np.ndarray) -> List[OCRResult]:
        """Extract text using Tesseract OCR"""
        preprocessed = self.preprocess_image(image)

        # Get detailed OCR data
        data = pytesseract.image_to_data(
            preprocessed,
            config=self.tesseract_config,
            output_type=pytesseract.Output.DICT
        )

        results = []
        n_boxes = len(data['text'])

        for i in range(n_boxes):
            if int(data['conf'][i]) > 0:  # Only confident detections
                text = data['text'][i].strip()
                if text:
                    bbox = (
                        data['left'][i],
                        data['top'][i],
                        data['width'][i],
                        data['height'][i]
                    )
                    results.append(OCRResult(
                        text=text,
                        confidence=data['conf'][i] / 100.0,
                        bbox=bbox,
                        engine="tesseract"
                    ))

        return results

    def extract_text_trocr(self, image: np.ndarray) -> Optional[OCRResult]:
        """Extract text using TrOCR (transformer-based)"""
        if not self.trocr_processor or not self.trocr_model:
            return None

        try:
            # Convert to PIL Image
            pil_image = Image.fromarray(image)

            # Process image
            pixel_values = self.trocr_processor(pil_image, return_tensors="pt").pixel_values
            pixel_values = pixel_values.to(self.device)

            # Generate text
            with torch.no_grad():
                generated_ids = self.trocr_model.generate(
                    pixel_values,
                    max_length=128,
                    num_beams=4,
                    early_stopping=True
                )

            generated_text = self.trocr_processor.batch_decode(
                generated_ids, skip_special_tokens=True
            )[0]

            # Calculate confidence (simplified)
            confidence = 0.8  # TODO: Implement proper confidence calculation

            return OCRResult(
                text=generated_text.strip(),
                confidence=confidence,
                bbox=(0, 0, image.shape[1], image.shape[0]),
                engine="trocr"
            )

        except Exception as e:
            logger.error(f"TrOCR extraction failed: {e}")
            return None

    def detect_document_regions(self, image: np.ndarray) -> List[DocumentRegion]:
        """Detect different regions in the document (paragraphs, headings, tables, etc.)"""
        regions = []

        # Use Tesseract to get region information
        preprocessed = self.preprocess_image(image)
        data = pytesseract.image_to_data(
            preprocessed,
            config='--oem 3 --psm 6',
            output_type=pytesseract.Output.DICT
        )

        n_boxes = len(data['text'])

        for i in range(n_boxes):
            if int(data['conf'][i]) > 30:  # Minimum confidence
                text = data['text'][i].strip()
                if text:
                    # Determine region type based on text characteristics
                    region_type = self._classify_region_type(text, data, i)

                    bbox = (
                        data['left'][i],
                        data['top'][i],
                        data['width'][i],
                        data['height'][i]
                    )

                    regions.append(DocumentRegion(
                        bbox=bbox,
                        text=text,
                        confidence=data['conf'][i] / 100.0,
                        region_type=region_type
                    ))

        return regions

    def _classify_region_type(self, text: str, data: Dict, index: int) -> str:
        """Classify the type of document region"""
        height = data['height'][index]

        # Simple heuristics for region classification
        if height > 30:  # Large text = heading
            return "heading"
        elif any(char.isdigit() for char in text) and len(text.split()) < 10:
            return "table"
        elif text.isupper() and len(text) < 50:
            return "heading"
        elif "signature" in text.lower() or "signed" in text.lower():
            return "signature"
        else:
            return "paragraph"

    def process_document(self, image_path: str) -> Dict[str, Any]:
        """Process a complete document and return structured results"""
        # Load image
        if image_path.lower().endswith('.pdf'):
            # Convert PDF to images
            images = pdf2image.convert_from_path(image_path)
            image = np.array(images[0])
        else:
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not load image: {image_path}")

        # Extract text with multiple engines
        tesseract_results = self.extract_text_tesseract(image)
        trocr_result = self.extract_text_trocr(image)

        # Combine results
        all_results = tesseract_results.copy()
        if trocr_result:
            all_results.append(trocr_result)

        # Detect document regions
        regions = self.detect_document_regions(image)

        # Aggregate text
        full_text = " ".join([result.text for result in all_results if result.confidence > 0.5])

        return {
            "full_text": full_text,
            "ocr_results": [result.__dict__ for result in all_results],
            "document_regions": [region.__dict__ for region in regions],
            "image_shape": image.shape,
            "processing_engine": "hybrid_tesseract_trocr"
        }

    def process_batch(self, image_paths: List[str]) -> List[Dict[str, Any]]:
        """Process multiple documents in batch"""
        results = []
        for path in image_paths:
            try:
                result = self.process_document(path)
                result["document_path"] = path
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to process {path}: {e}")
                results.append({
                    "document_path": path,
                    "error": str(e),
                    "full_text": "",
                    "ocr_results": [],
                    "document_regions": []
                })

        return results

if __name__ == "__main__":
    # Example usage
    pipeline = OCRPipeline(use_gpu=True)

    # Process a single document
    result = pipeline.process_document("sample_legal_doc.jpg")
    print(f"Extracted text: {result['full_text'][:200]}...")

    # Process batch
    batch_results = pipeline.process_batch([
        "contract1.pdf",
        "deed2.jpg",
        "agreement3.png"
    ])

    for result in batch_results:
        print(f"Processed {result['document_path']}: {len(result['full_text'])} chars")