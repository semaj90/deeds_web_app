"""Pipeline manager for GPU/CPU hybrid processing"""

import logging
import asyncio
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from queue import Queue
import numpy as np

from .page_classifier import PageClassifier, PageClassification
from .gpu_processor import GPUProcessor
from .cpu_processor import CPUProcessor

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """Pipeline configuration"""
    gpu_batch_size: int = 32
    cpu_batch_size: int = 16
    gpu_timeout_ms: int = 500
    cpu_fallback_delay_ms: int = 500
    heavy_roi_confidence_threshold: float = 0.7


class PipelineManager:
    """Manages GPU/CPU hybrid processing pipeline"""

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.classifier = PageClassifier()
        self.gpu_processor = GPUProcessor(batch_size=config.gpu_batch_size)
        self.cpu_processor = CPUProcessor(threads=4)

        self.gpu_queue = Queue()
        self.cpu_queue = Queue()
        self.results = {}

        logger.info("PipelineManager initialized")

    def process_document(self, pages: List[np.ndarray], document_id: str) -> Dict[str, Any]:
        """Process entire document through pipeline"""
        try:
            logger.info(f"Processing document {document_id} with {len(pages)} pages")

            results = []
            for page_num, page in enumerate(pages, 1):
                # Classify page
                classification = self.classifier.classify_page(page)

                # Route to appropriate processor
                if classification.recommended_route == "gpu":
                    result = self.gpu_processor.process_page(page, page_num)
                elif classification.recommended_route == "cpu":
                    result = self.cpu_processor.process_page(page, page_num)
                else:  # ensemble
                    result = self._process_with_ensemble(page, page_num)

                if result:
                    result.metadata["classification"] = {
                        "category": classification.category,
                        "confidence": classification.confidence,
                        "route": classification.recommended_route,
                    }
                    results.append(result)

            logger.info(f"Completed processing {len(results)}/{len(pages)} pages")
            return {
                "document_id": document_id,
                "total_pages": len(pages),
                "processed_pages": len(results),
                "results": results,
            }
        except Exception as e:
            logger.error(f"Pipeline processing failed: {e}")
            return {"error": str(e)}

    def _process_with_ensemble(self, page: np.ndarray, page_num: int):
        """Process page with ensemble (GPU + CPU comparison)"""
        try:
            # Try GPU first
            gpu_result = self.gpu_processor.process_page(page, page_num)

            if gpu_result and gpu_result.confidence >= self.config.heavy_roi_confidence_threshold:
                return gpu_result

            # Fall back to CPU
            logger.info(f"GPU confidence low, falling back to CPU for page {page_num}")
            cpu_result = self.cpu_processor.process_page(page, page_num)

            if cpu_result:
                cpu_result.metadata["fallback_reason"] = "low_gpu_confidence"
                return cpu_result

            return gpu_result  # Return GPU result if CPU also fails
        except Exception as e:
            logger.error(f"Ensemble processing failed: {e}")
            return None

    def get_pipeline_status(self) -> Dict[str, Any]:
        """Get current pipeline status"""
        gpu_memory = self.gpu_processor.get_memory_usage()
        cpu_usage = self.cpu_processor.get_cpu_usage()

        return {
            "gpu_memory": gpu_memory,
            "cpu_usage": cpu_usage,
            "gpu_queue_size": self.gpu_queue.qsize(),
            "cpu_queue_size": self.cpu_queue.qsize(),
            "simd_enabled": self.cpu_processor.check_simd_support(),
        }

    def cleanup(self):
        """Clean up resources"""
        try:
            self.gpu_processor.cleanup()
            logger.info("Pipeline cleanup complete")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
