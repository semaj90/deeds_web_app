"""
Enhanced Pipeline Manager for GPU/CPU Hybrid Processing
Implements intelligent routing based on PageClassifier results,
VRAM monitoring, ensemble voting, and priority queuing.

Features:
- PageClassifier-based routing (GPU/CPU/Ensemble)
- VRAM monitoring with automatic fallback
- Priority queuing (signatures/stamps processed first)
- Ensemble voting for uncertain classifications
- Metrics and telemetry
- Event emission for real-time monitoring
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from queue import PriorityQueue
from concurrent.futures import ThreadPoolExecutor
import numpy as np

from .page_classifier import PageClassifier, PageClassification, PageFeatures
from .gpu_processor import GPUProcessor, ProcessingResult
from .cpu_processor import CPUProcessor
from ..core.processing_events import (
    ProcessingEvent,
    ProcessingStage,
    EventSeverity,
    get_event_emitter,
)

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """Pipeline configuration with sensible defaults for legal documents"""
    # Batch sizes
    gpu_batch_size: int = 32
    cpu_batch_size: int = 16

    # Timeouts
    gpu_timeout_ms: int = 700  # Fallback to CPU if GPU takes >700ms
    cpu_fallback_delay_ms: int = 100

    # Thresholds
    heavy_roi_confidence_threshold: float = 0.8  # Signatures, stamps need high confidence
    ensemble_confidence_threshold: float = 0.6  # Below this, use ensemble
    vram_threshold_percent: float = 80.0  # Fallback when VRAM > 80%

    # Priority weights (higher = process first on GPU)
    priority_signature: float = 1.0
    priority_handwritten: float = 0.95
    priority_table: float = 0.85
    priority_image: float = 0.7
    priority_text: float = 0.3
    priority_mixed: float = 0.5


@dataclass(order=True)
class PriorityPage:
    """Page with priority for queue ordering (min-heap, so negate priority)"""
    priority: float
    page_num: int = field(compare=False)
    image: np.ndarray = field(compare=False)
    classification: PageClassification = field(compare=False)


class EnhancedPipelineManager:
    """
    Enhanced Pipeline Manager with intelligent GPU/CPU routing.

    Workflow:
    1. Classify all pages using PageClassifier (ML + heuristics)
    2. Route to GPU/CPU/Ensemble based on category and confidence
    3. Priority queue ensures signatures/stamps processed first
    4. VRAM monitoring triggers automatic CPU fallback
    5. Ensemble voting compares GPU vs CPU for uncertain pages
    """

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        self.classifier = PageClassifier(confidence_threshold=self.config.heavy_roi_confidence_threshold)
        self.gpu_processor = GPUProcessor(batch_size=self.config.gpu_batch_size)
        self.cpu_processor = CPUProcessor(threads=4)

        # Event emitter
        self.event_emitter = get_event_emitter()

        # Priority queues (negated priority for max-heap behavior in min-heap)
        self.gpu_queue: PriorityQueue = PriorityQueue()
        self.cpu_queue: PriorityQueue = PriorityQueue()
        self.ensemble_queue: PriorityQueue = PriorityQueue()

        # Metrics tracking
        self.metrics = {
            "gpu_processed": 0,
            "cpu_processed": 0,
            "ensemble_processed": 0,
            "gpu_fallbacks": 0,
            "gpu_timeouts": 0,
            "vram_fallbacks": 0,
            "total_pages": 0,
            "total_time_ms": 0,
        }

        # Thread pool for parallel processing
        self.executor = ThreadPoolExecutor(max_workers=4)

        logger.info(f"EnhancedPipelineManager initialized (GPU batch: {self.config.gpu_batch_size})")


    def process_document(self, pages: List[np.ndarray], document_id: str) -> Dict[str, Any]:
        """
        Process entire document through intelligent pipeline.

        Args:
            pages: List of page images as numpy arrays
            document_id: Unique identifier for the document

        Returns:
            Dict with results, metrics, and routing summary
        """
        start_time = time.time()
        self.metrics["total_pages"] += len(pages)

        # Emit start event
        self.event_emitter.emit_stage(
            document_id=document_id,
            stage=ProcessingStage.UPLOAD,
            message=f"Starting processing of {len(pages)} pages",
            status="in_progress",
            metadata={"total_pages": len(pages)}
        )

        try:
            logger.info(f"Processing document {document_id} with {len(pages)} pages")

            # Step 1: Classify all pages
            classifications = self._classify_all_pages(pages, document_id)

            # Step 2: Route pages to queues based on classification
            self._route_pages(pages, classifications)

            # Step 3: Process all queues (GPU first, then CPU, then ensemble)
            results = self._process_all_queues(document_id)

            # Step 4: Sort results by page number
            sorted_results = sorted(results, key=lambda r: r.metadata.get("page_number", 0))

            total_time = (time.time() - start_time) * 1000
            self.metrics["total_time_ms"] += total_time

            # Build response
            routing_summary = self._get_routing_summary(classifications)

            # Emit completion event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.COMPLETE,
                message=f"Processing complete: {len(sorted_results)}/{len(pages)} pages",
                status="complete",
                duration_ms=total_time,
                metadata={
                    "total_pages": len(pages),
                    "processed_pages": len(sorted_results),
                    "routing_summary": routing_summary
                }
            )

            logger.info(f"Completed document {document_id}: {len(sorted_results)}/{len(pages)} pages "
                       f"in {total_time:.0f}ms (GPU: {routing_summary['gpu']}, "
                       f"CPU: {routing_summary['cpu']}, Ensemble: {routing_summary['ensemble']})")

            return {
                "document_id": document_id,
                "total_pages": len(pages),
                "processed_pages": len(sorted_results),
                "results": sorted_results,
                "metrics": {
                    **self.metrics,
                    "pages_per_second": len(pages) / (total_time / 1000) if total_time > 0 else 0,
                    "avg_ms_per_page": total_time / len(pages) if pages else 0,
                },
                "routing_summary": routing_summary,
            }

        except Exception as e:
            logger.error(f"Pipeline processing failed for {document_id}: {e}")

            # Emit error event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.ERROR,
                message=f"Pipeline processing failed",
                status="failed",
                severity=EventSeverity.ERROR,
                error_message=str(e)
            )

            return {
                "error": str(e),
                "document_id": document_id,
                "total_pages": len(pages),
                "processed_pages": 0,
            }

    def _classify_all_pages(self, pages: List[np.ndarray], document_id: str) -> List[PageClassification]:
        """Classify all pages using the PageClassifier"""
        classifications = []

        # Emit classification start event
        self.event_emitter.emit_stage(
            document_id=document_id,
            stage=ProcessingStage.CLASSIFICATION,
            message=f"Classifying {len(pages)} pages",
            status="in_progress",
            metadata={"total_pages": len(pages)}
        )

        for i, page in enumerate(pages):
            try:
                classification = self.classifier.classify_page(page)
                classifications.append(classification)

                # Emit per-page classification event
                self.event_emitter.emit_stage(
                    document_id=document_id,
                    stage=ProcessingStage.CLASSIFICATION,
                    message=f"Classified page {i+1}: {classification.category}",
                    status="complete",
                    page_number=i+1,
                    category=classification.category,
                    confidence=classification.confidence,
                    route=classification.recommended_route
                )

                logger.debug(f"Page {i+1}: {classification.category} "
                           f"(conf: {classification.confidence:.2f}) -> {classification.recommended_route}")
            except Exception as e:
                logger.warning(f"Classification failed for page {i+1}: {e}")

                # Emit error event for classification
                self.event_emitter.emit_stage(
                    document_id=document_id,
                    stage=ProcessingStage.CLASSIFICATION,
                    message=f"Classification failed for page {i+1}",
                    status="failed",
                    page_number=i+1,
                    severity=EventSeverity.WARNING,
                    error_message=str(e)
                )

                # Default to ensemble for safety
                classifications.append(PageClassification(
                    category="mixed",
                    confidence=0.5,
                    features=PageFeatures(),
                    recommended_route="ensemble",
                    routing_reason="Classification error - defaulting to ensemble",
                ))
        return classifications

    def _get_priority(self, classification: PageClassification) -> float:
        """
        Calculate processing priority based on classification.
        Higher priority = processed earlier (signatures first).
        Returns negated value for min-heap (PriorityQueue).
        """
        priority_map = {
            "signature": self.config.priority_signature,
            "handwritten": self.config.priority_handwritten,
            "table": self.config.priority_table,
            "image": self.config.priority_image,
            "text": self.config.priority_text,
            "mixed": self.config.priority_mixed,
        }
        base_priority = priority_map.get(classification.category, 0.5)

        # Boost priority for low-confidence (needs more careful processing)
        if classification.confidence < 0.6:
            base_priority = max(base_priority, 0.7)

        # Negate for min-heap behavior (highest priority = lowest value)
        return -base_priority

    def _route_pages(self, pages: List[np.ndarray], classifications: List[PageClassification]):
        """Route pages to appropriate processing queues based on classification"""
        for page_num, (page, classification) in enumerate(zip(pages, classifications), 1):
            priority = self._get_priority(classification)
            priority_page = PriorityPage(
                priority=priority,
                page_num=page_num,
                image=page,
                classification=classification,
            )

            route = classification.recommended_route

            # Check VRAM before routing to GPU
            if route == "gpu" and self._is_vram_critical():
                logger.warning(f"VRAM critical ({self._get_vram_percent():.0f}%), "
                             f"routing page {page_num} to CPU")
                route = "cpu"
                self.metrics["vram_fallbacks"] += 1

            # Route to appropriate queue
            if route == "gpu":
                self.gpu_queue.put(priority_page)
            elif route == "cpu":
                self.cpu_queue.put(priority_page)
            else:  # ensemble
                self.ensemble_queue.put(priority_page)

    def _is_vram_critical(self) -> bool:
        """Check if GPU VRAM usage is above threshold"""
        return self._get_vram_percent() >= self.config.vram_threshold_percent

    def _get_vram_percent(self) -> float:
        """Get current VRAM usage percentage"""
        try:
            memory = self.gpu_processor.get_memory_usage()
            if memory["available_mb"] > 0:
                total = memory["allocated_mb"] + memory["available_mb"]
                return (memory["allocated_mb"] / total) * 100
        except Exception:
            pass
        return 0.0

    def _process_all_queues(self, document_id: str) -> List[ProcessingResult]:
        """Process all queues in priority order"""
        results = []

        # Process GPU queue first (highest priority content)
        while not self.gpu_queue.empty():
            priority_page = self.gpu_queue.get()
            result = self._process_gpu_page(priority_page, document_id)
            if result:
                results.append(result)
                self.metrics["gpu_processed"] += 1

        # Process CPU queue
        while not self.cpu_queue.empty():
            priority_page = self.cpu_queue.get()
            result = self._process_cpu_page(priority_page, document_id)
            if result:
                results.append(result)
                self.metrics["cpu_processed"] += 1

        # Process ensemble queue (uncertain pages)
        while not self.ensemble_queue.empty():
            priority_page = self.ensemble_queue.get()
            result = self._process_ensemble_page(priority_page, document_id)
            if result:
                results.append(result)
                self.metrics["ensemble_processed"] += 1

        return results

    def _process_gpu_page(self, priority_page: PriorityPage, document_id: str) -> Optional[ProcessingResult]:
        """Process a single page with GPU (Granite-Docling)"""
        try:
            start = time.time()

            # Emit GPU processing start event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.GPU_PROCESSING,
                message=f"Processing page {priority_page.page_num} on GPU",
                status="in_progress",
                page_number=priority_page.page_num,
                category=priority_page.classification.category
            )

            result = self.gpu_processor.process_page(priority_page.image, priority_page.page_num)
            elapsed_ms = (time.time() - start) * 1000

            # Timeout check - fallback to CPU if too slow
            if elapsed_ms > self.config.gpu_timeout_ms:
                logger.warning(f"GPU timeout ({elapsed_ms:.0f}ms > {self.config.gpu_timeout_ms}ms) "
                             f"for page {priority_page.page_num}")

                # Emit timeout event
                self.event_emitter.emit_stage(
                    document_id=document_id,
                    stage=ProcessingStage.GPU_PROCESSING,
                    message=f"GPU timeout, falling back to CPU",
                    status="failed",
                    page_number=priority_page.page_num,
                    severity=EventSeverity.WARNING,
                    processing_time_ms=elapsed_ms
                )

                self.metrics["gpu_timeouts"] += 1
                self.metrics["gpu_fallbacks"] += 1
                return self._process_cpu_page(priority_page, document_id)

            if result:
                result.metadata["classification"] = {
                    "category": priority_page.classification.category,
                    "confidence": priority_page.classification.confidence,
                    "route": "gpu",
                    "processing_time_ms": elapsed_ms,
                }

                # Emit GPU success event
                self.event_emitter.emit_stage(
                    document_id=result.metadata.get("document_id", "unknown"),
                    stage=ProcessingStage.GPU_PROCESSING,
                    message=f"GPU processing complete",
                    status="complete",
                    page_number=priority_page.page_num,
                    processing_time_ms=elapsed_ms
                )

            return result

        except Exception as e:
            logger.error(f"GPU processing failed for page {priority_page.page_num}: {e}")
            self.metrics["gpu_fallbacks"] += 1
            return self._process_cpu_page(priority_page)

    def _process_cpu_page(self, priority_page: PriorityPage, document_id: str = "") -> Optional[ProcessingResult]:
        """Process a single page with CPU (Tesseract)"""
        try:
            start = time.time()

            # Emit CPU processing start event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.CPU_PROCESSING,
                message=f"Processing page {priority_page.page_num} on CPU",
                status="in_progress",
                page_number=priority_page.page_num,
                category=priority_page.classification.category
            )

            result = self.cpu_processor.process_page(priority_page.image, priority_page.page_num)
            elapsed_ms = (time.time() - start) * 1000

            if result:
                result.metadata["classification"] = {
                    "category": priority_page.classification.category,
                    "confidence": priority_page.classification.confidence,
                    "route": "cpu",
                    "processing_time_ms": elapsed_ms,
                }

                # Emit CPU success event
                self.event_emitter.emit_stage(
                    document_id=document_id,
                    stage=ProcessingStage.CPU_PROCESSING,
                    message=f"CPU processing complete",
                    status="complete",
                    page_number=priority_page.page_num,
                    processing_time_ms=elapsed_ms
                )

            return result

        except Exception as e:
            logger.error(f"CPU processing failed for page {priority_page.page_num}: {e}")

            # Emit error event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.CPU_PROCESSING,
                message=f"CPU processing failed",
                status="failed",
                page_number=priority_page.page_num,
                severity=EventSeverity.ERROR,
                error_message=str(e)
            )

            return None

    def _process_ensemble_page(self, priority_page: PriorityPage, document_id: str = "") -> Optional[ProcessingResult]:
        """
        Process page with ensemble voting (GPU + CPU comparison).

        Both processors run on the page, and the result with
        higher confidence wins. This ensures accuracy for
        uncertain pages in legal documents.
        """
        try:
            # Emit ensemble start event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.ENSEMBLE_PROCESSING,
                message=f"Processing page {priority_page.page_num} with ensemble (GPU+CPU)",
                status="in_progress",
                page_number=priority_page.page_num,
                category=priority_page.classification.category
            )

            # Run GPU
            gpu_start = time.time()
            gpu_result = self.gpu_processor.process_page(priority_page.image, priority_page.page_num)
            gpu_time = (time.time() - gpu_start) * 1000

            # Run CPU
            cpu_start = time.time()
            cpu_result = self.cpu_processor.process_page(priority_page.image, priority_page.page_num)
            cpu_time = (time.time() - cpu_start) * 1000

            # Compare confidences and pick winner
            gpu_conf = gpu_result.confidence if gpu_result else 0
            cpu_conf = cpu_result.confidence if cpu_result else 0

            if gpu_conf >= cpu_conf and gpu_result:
                winner = gpu_result
                winner_route = "ensemble-gpu"
            elif cpu_result:
                winner = cpu_result
                winner_route = "ensemble-cpu"
            else:
                logger.warning(f"Both processors failed for page {priority_page.page_num}")

                # Emit error event
                self.event_emitter.emit_stage(
                    document_id=document_id,
                    stage=ProcessingStage.ENSEMBLE_PROCESSING,
                    message=f"Both GPU and CPU processing failed",
                    status="failed",
                    page_number=priority_page.page_num,
                    severity=EventSeverity.ERROR
                )

                return None

            # Add comprehensive ensemble metadata
            winner.metadata["classification"] = {
                "category": priority_page.classification.category,
                "confidence": priority_page.classification.confidence,
                "route": winner_route,
                "ensemble": {
                    "gpu_confidence": gpu_conf,
                    "cpu_confidence": cpu_conf,
                    "gpu_time_ms": gpu_time,
                    "cpu_time_ms": cpu_time,
                    "winner": "gpu" if gpu_conf >= cpu_conf else "cpu",
                    "confidence_delta": abs(gpu_conf - cpu_conf),
                },
            }

            # Emit ensemble success event
            self.event_emitter.emit_stage(
                document_id=document_id,
                stage=ProcessingStage.ENSEMBLE_PROCESSING,
                message=f"Ensemble complete: {winner_route}",
                status="complete",
                page_number=priority_page.page_num,
                processing_time_ms=gpu_time + cpu_time,
                metadata={
                    "gpu_time_ms": gpu_time,
                    "cpu_time_ms": cpu_time,
                    "gpu_confidence": gpu_conf,
                    "cpu_confidence": cpu_conf,
                    "winner": "gpu" if gpu_conf >= cpu_conf else "cpu"
                }
            )

            logger.debug(f"Ensemble for page {priority_page.page_num}: "
                        f"GPU={gpu_conf:.2f} ({gpu_time:.0f}ms), "
                        f"CPU={cpu_conf:.2f} ({cpu_time:.0f}ms) -> {winner_route}")

            return winner

        except Exception as e:
            logger.error(f"Ensemble processing failed for page {priority_page.page_num}: {e}")
            return None

    def _get_routing_summary(self, classifications: List[PageClassification]) -> Dict[str, int]:
        """Summarize routing decisions"""
        summary = {"gpu": 0, "cpu": 0, "ensemble": 0, "by_category": {}}
        for c in classifications:
            route = c.recommended_route
            if route in summary:
                summary[route] += 1

            # Track by category
            cat = c.category
            if cat not in summary["by_category"]:
                summary["by_category"][cat] = 0
            summary["by_category"][cat] += 1

        return summary

    def get_pipeline_status(self) -> Dict[str, Any]:
        """Get current pipeline status for monitoring"""
        gpu_memory = self.gpu_processor.get_memory_usage()
        cpu_usage = self.cpu_processor.get_cpu_usage()

        return {
            "gpu": {
                "memory": gpu_memory,
                "vram_percent": self._get_vram_percent(),
                "vram_critical": self._is_vram_critical(),
                "queue_size": self.gpu_queue.qsize(),
            },
            "cpu": {
                "usage": cpu_usage,
                "queue_size": self.cpu_queue.qsize(),
                "simd_enabled": self.cpu_processor.check_simd_support(),
            },
            "ensemble": {
                "queue_size": self.ensemble_queue.qsize(),
            },
            "metrics": self.metrics,
            "config": {
                "gpu_timeout_ms": self.config.gpu_timeout_ms,
                "vram_threshold": self.config.vram_threshold_percent,
                "ensemble_threshold": self.config.ensemble_confidence_threshold,
            },
        }

    def reset_metrics(self):
        """Reset processing metrics"""
        self.metrics = {
            "gpu_processed": 0,
            "cpu_processed": 0,
            "ensemble_processed": 0,
            "gpu_fallbacks": 0,
            "gpu_timeouts": 0,
            "vram_fallbacks": 0,
            "total_pages": 0,
            "total_time_ms": 0,
        }

    def cleanup(self):
        """Clean up resources"""
        try:
            self.gpu_processor.cleanup()
            self.executor.shutdown(wait=False)
            logger.info("EnhancedPipelineManager cleanup complete")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")


# Alias for backwards compatibility
PipelineManager = EnhancedPipelineManager
