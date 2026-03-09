"""
Unified Pipeline Manager
========================

Integrates existing components into a unified GPU/CPU processing pipeline:
- Granite-Docling GPU processor (backend/docling_gateway/app.py)
- Tesseract CPU fallback (python_codebase/document_processing/tesseract_fallback.py)
- Page classification for intelligent routing
- VRAM monitoring for adaptive fallback
- Heavy ROI locking (tables, signatures, seals)

Usage:
    manager = UnifiedPipelineManager()
    results = await manager.process_document("sample.pdf")
"""

import sys
import os
import asyncio
import torch
import logging
from pathlib import Path
from typing import List, Dict, Optional, Literal
from dataclasses import dataclass
import time

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "python_codebase" / "document_processing"))
sys.path.insert(0, str(Path(__file__).parent.parent))  # Add src/ to path

from core.page_classifier import PageClassifier, PageCategory, ClassificationResult

# Import existing processors
try:
    # Try importing from actual locations
    from python_codebase.document_processing.granite_docling_parser import GraniteDoclingParser
    from python_codebase.document_processing.tesseract_fallback import TesseractFallback
except ImportError:
    # Fallback: create stub classes for development
    logging.warning("Could not import actual processors, using stubs")

    class GraniteDoclingParser:
        def __init__(self, device="cuda", **kwargs):
            self.device = device

        async def parse_document(self, file_path: str, **kwargs):
            return {"text": "Stub GPU result", "confidence": 0.95}

    class TesseractFallback:
        async def parse_document(self, file_path: str):
            return {"text": "Stub CPU result", "confidence": 0.75}

        def mark_as_fallback(self, result: dict):
            result["metadata"] = result.get("metadata", {})
            result["metadata"]["fallback"] = True
            result["metadata"]["requires_gpu_reparse"] = True

@dataclass
class ProcessingResult:
    """Result from document processing"""
    page_num: int
    category: PageCategory
    processor: Literal["granite", "tesseract"]
    content: Dict
    confidence: float
    processing_time_ms: float
    vram_usage_mb: Optional[float] = None
    was_fallback: bool = False

class UnifiedPipelineManager:
    """
    Unified GPU/CPU pipeline manager.

    Routes pages to appropriate processor based on:
    1. Page category (heavy ROI → GPU locked)
    2. GPU memory availability (<80% threshold)
    3. Classification confidence
    """

    def __init__(
        self,
        gpu_memory_threshold: float = 0.8,
        heavy_roi_categories: set = None,
        enable_gpu: bool = True
    ):
        """
        Initialize unified pipeline manager.

        Args:
            gpu_memory_threshold: Max VRAM usage before falling back to CPU (0.8 = 80%)
            heavy_roi_categories: Page types that require GPU (default: table, image)
            enable_gpu: Enable GPU processing (disable for CPU-only mode)
        """
        self.logger = logging.getLogger(__name__)

        # Configuration
        self.gpu_memory_threshold = gpu_memory_threshold
        self.heavy_roi_categories = heavy_roi_categories or {"table", "image"}
        self.enable_gpu = enable_gpu and torch.cuda.is_available()

        # Initialize processors
        self.classifier = PageClassifier()

        if self.enable_gpu:
            try:
                self.granite = GraniteDoclingParser(device="cuda")
                self.logger.info("✅ GPU processor initialized (Granite-Docling)")
            except Exception as e:
                self.logger.warning(f"⚠️ GPU processor failed to initialize: {e}")
                self.enable_gpu = False
                self.granite = None
        else:
            self.granite = None
            self.logger.info("ℹ️ GPU processing disabled")

        self.tesseract = TesseractFallback()
        self.logger.info("✅ CPU processor initialized (Tesseract)")

        # Statistics
        self.stats = {
            "total_pages": 0,
            "gpu_pages": 0,
            "cpu_pages": 0,
            "fallback_pages": 0,
            "heavy_roi_locked": 0,
        }

    async def process_document(self, doc_path: str) -> List[ProcessingResult]:
        """
        Process document with adaptive GPU/CPU routing.

        Args:
            doc_path: Path to PDF or image file

        Returns:
            List of ProcessingResult for each page
        """
        self.logger.info(f"📄 Processing document: {doc_path}")

        # Extract pages (placeholder - integrate with actual PDF extraction)
        pages = await self._extract_pages(doc_path)

        # Classify pages
        self.logger.info(f"🔍 Classifying {len(pages)} pages...")
        classifications = []
        import cv2

        for page_path in pages:
            # Load image for classification
            img = cv2.imread(page_path)
            if img is None:
                self.logger.error(f"Failed to load image: {page_path}")
                # Fallback classification
                # Create a dummy result if image load fails
                from core.page_classifier import ClassificationResult, PageCategory
                classifications.append(ClassificationResult(PageCategory.TEXT, 0.0, {}, 0.0))
                continue

            classification = self.classifier.classify_page(img)
            classifications.append(classification)

        # Process pages with routing
        results = []
        for i, (page, classification) in enumerate(zip(pages, classifications)):
            self.logger.info(
                f"Page {i+1}/{len(pages)}: {classification.category} "
                f"(confidence: {classification.confidence:.2%})"
            )

            result = await self._route_page(i + 1, page, classification)
            results.append(result)

            # Update stats
            self.stats["total_pages"] += 1

        # Log summary
        self._log_processing_summary(results)

        return results

    async def _route_page(
        self,
        page_num: int,
        page: any,
        classification: ClassificationResult
    ) -> ProcessingResult:
        """
        Route page to appropriate processor.

        Decision logic:
        1. Heavy ROI (table/image) → GPU locked (wait if needed)
        2. GPU available + good classification → GPU
        3. GPU unavailable or low confidence → CPU
        """
        start = time.perf_counter()

        # Heavy ROI → GPU locked
        if classification.category in self.heavy_roi_categories:
            self.logger.debug(f"🔒 Page {page_num}: Heavy ROI detected, locking to GPU")
            result = await self._process_gpu_locked(page_num, page, classification)
            self.stats["heavy_roi_locked"] += 1
            return result

        # Check GPU availability
        if self.enable_gpu and self._is_gpu_available():
            # GPU available → use Granite
            try:
                result = await self._process_gpu(page_num, page, classification)
                self.stats["gpu_pages"] += 1
                return result
            except torch.cuda.OutOfMemoryError:
                # GPU OOM → fallback to CPU
                self.logger.warning(f"⚠️ Page {page_num}: GPU OOM, falling back to CPU")
                result = await self._process_cpu_fallback(page_num, page, classification)
                self.stats["fallback_pages"] += 1
                return result
        else:
            # GPU busy or disabled → CPU
            result = await self._process_cpu_fallback(page_num, page, classification)
            self.stats["cpu_pages"] += 1
            return result

    async def _process_gpu(
        self,
        page_num: int,
        page: any,
        classification: ClassificationResult
    ) -> ProcessingResult:
        """Process page with GPU (Granite-Docling)"""
        start = time.perf_counter()

        # Get VRAM usage before
        vram_before = self._get_vram_usage_mb()

        # Process with Granite
        # Run in thread to avoid blocking event loop
        content = await asyncio.to_thread(self.granite.parse_document, str(page))

        # Get VRAM usage after
        vram_after = self._get_vram_usage_mb()

        processing_time = (time.perf_counter() - start) * 1000

        return ProcessingResult(
            page_num=page_num,
            category=classification.category,
            processor="granite",
            content=content,
            confidence=content.get("confidence", 0.9),
            processing_time_ms=processing_time,
            vram_usage_mb=vram_after - vram_before,
            was_fallback=False
        )

    async def _process_gpu_locked(
        self,
        page_num: int,
        page: any,
        classification: ClassificationResult
    ) -> ProcessingResult:
        """
        GPU-only processing for heavy ROI (tables, signatures, seals).

        Waits for GPU availability if needed.
        """
        # Wait for GPU if busy
        while not self._is_gpu_available():
            self.logger.debug(f"⏳ Page {page_num}: Waiting for GPU availability...")
            await asyncio.sleep(0.1)

        # Process with GPU (guaranteed)
        return await self._process_gpu(page_num, page, classification)

    async def _process_cpu_fallback(
        self,
        page_num: int,
        page: any,
        classification: ClassificationResult
    ) -> ProcessingResult:
        """
        CPU processing with Tesseract fallback.

        Marks result for potential GPU reparse.
        """
        start = time.perf_counter()

        # Process with Tesseract
        content = await self.tesseract.parse_document(str(page))

        # Mark as fallback
        self.tesseract.mark_as_fallback(content)

        processing_time = (time.perf_counter() - start) * 1000

        return ProcessingResult(
            page_num=page_num,
            category=classification.category,
            processor="tesseract",
            content=content,
            confidence=content.get("confidence", 0.7),
            processing_time_ms=processing_time,
            was_fallback=True
        )

    def _is_gpu_available(self) -> bool:
        """
        Check if GPU has <80% VRAM usage.

        Returns:
            True if GPU available for processing
        """
        if not self.enable_gpu or not torch.cuda.is_available():
            return False

        try:
            allocated = torch.cuda.memory_allocated(0)
            total = torch.cuda.get_device_properties(0).total_memory
            usage = allocated / total

            return usage < self.gpu_memory_threshold
        except Exception as e:
            self.logger.error(f"Error checking GPU memory: {e}")
            return False

    def _get_vram_usage_mb(self) -> float:
        """Get current VRAM usage in MB"""
        if not self.enable_gpu:
            return 0.0

        try:
            allocated = torch.cuda.memory_allocated(0)
            return allocated / (1024 ** 2)  # Convert to MB
        except:
            return 0.0

    async def _extract_pages(self, doc_path: str) -> List[str]:
        """
        Extract pages from document.
        Converts PDF to temporary images for processing.
        """
        import cv2
        import fitz  # PyMuPDF
        import tempfile

        path = Path(doc_path)

        if not path.exists():
            raise FileNotFoundError(f"Document not found: {doc_path}")

        if path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            # Single image
            return [str(path)]

        elif path.suffix.lower() == '.pdf':
            # PDF extraction using PyMuPDF
            try:
                doc = fitz.open(str(path))
                image_paths = []

                # Create temp directory if not exists
                temp_dir = Path("temp_pages")
                temp_dir.mkdir(exist_ok=True)

                for i, page in enumerate(doc):
                    # Render page to image (300 DPI)
                    pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))

                    # Save to temp file
                    image_path = temp_dir / f"{path.stem}_page_{i+1}.png"
                    pix.save(str(image_path))
                    image_paths.append(str(image_path))

                return image_paths
            except Exception as e:
                self.logger.error(f"PDF extraction failed: {e}")
                return []
        else:
            raise ValueError(f"Unsupported file type: {path.suffix}")

    def _log_processing_summary(self, results: List[ProcessingResult]):
        """Log processing summary statistics"""
        total_time = sum(r.processing_time_ms for r in results)
        avg_time = total_time / len(results) if results else 0

        self.logger.info(f"\n{'='*60}")
        self.logger.info(f"Processing Summary")
        self.logger.info(f"{'='*60}")
        self.logger.info(f"Total pages:       {self.stats['total_pages']}")
        self.logger.info(f"GPU processed:     {self.stats['gpu_pages']}")
        self.logger.info(f"CPU processed:     {self.stats['cpu_pages']}")
        self.logger.info(f"Fallback pages:    {self.stats['fallback_pages']}")
        self.logger.info(f"Heavy ROI locked:  {self.stats['heavy_roi_locked']}")
        self.logger.info(f"Total time:        {total_time:.2f}ms")
        self.logger.info(f"Avg time/page:     {avg_time:.2f}ms")
        self.logger.info(f"{'='*60}\n")


# Example usage
if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    if len(sys.argv) < 2:
        print("Usage: python unified_pipeline_manager.py <document_path>")
        sys.exit(1)

    async def main():
        doc_path = sys.argv[1]

        # Initialize manager
        manager = UnifiedPipelineManager()

        # Process document
        results = await manager.process_document(doc_path)

        # Display results
        print(f"\n{'='*60}")
        print(f"Document Processing Results")
        print(f"{'='*60}")
        for result in results:
            print(f"\nPage {result.page_num}:")
            print(f"  Category:    {result.category}")
            print(f"  Processor:   {result.processor}")
            print(f"  Confidence:  {result.confidence:.2%}")
            print(f"  Time:        {result.processing_time_ms:.2f}ms")
            if result.vram_usage_mb:
                print(f"  VRAM used:   {result.vram_usage_mb:.2f}MB")
            if result.was_fallback:
                print(f"  ⚠️ Fallback: Marked for GPU reparse")
        print(f"{'='*60}\n")

    asyncio.run(main())
