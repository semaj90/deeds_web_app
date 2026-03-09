"""
Standardized Processing Events for Document Pipeline
Implements unified event schema for all processing stages,
SSE streaming, and metrics collection.
"""

import logging
import json
import time
import uuid
from dataclasses import dataclass, asdict, field
from typing import Optional, Dict, Any, List, Callable
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class ProcessingStage(Enum):
    """Processing pipeline stages"""
    UPLOAD = "upload"
    CLASSIFICATION = "classification"
    GPU_PROCESSING = "gpu_processing"
    CPU_PROCESSING = "cpu_processing"
    ENSEMBLE_PROCESSING = "ensemble_processing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    RAG_INDEXING = "rag_indexing"
    KAG_GRAPH_BUILD = "kag_graph_build"
    ACE_SYNTHESIS = "ace_synthesis"
    COMPLETE = "complete"
    ERROR = "error"


class EventSeverity(Enum):
    """Event severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ProcessingEvent:
    """
    Standardized event for all processing stages.
    Used for SSE streaming, logging, and metrics.
    """
    # Core fields
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    stage: ProcessingStage = ProcessingStage.UPLOAD
    severity: EventSeverity = EventSeverity.INFO

    # Document info
    document_id: str = ""
    page_number: Optional[int] = None

    # Processing details
    message: str = ""
    status: str = "in_progress"  # in_progress, complete, failed

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Performance metrics
    duration_ms: Optional[float] = None
    processing_time_ms: Optional[float] = None
    memory_usage_mb: Optional[float] = None
    gpu_memory_mb: Optional[float] = None

    # Classification/Routing
    category: Optional[str] = None  # text, table, image, mixed, etc.
    confidence: Optional[float] = None
    route: Optional[str] = None  # gpu, cpu, ensemble

    # Results
    text_extracted: Optional[str] = None
    tables_found: Optional[int] = None
    chunks_created: Optional[int] = None

    # Error handling
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    stack_trace: Optional[str] = None

    # RAG/KAG
    embeddings_generated: Optional[int] = None
    graph_nodes_created: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        # Convert enums to strings
        data["stage"] = self.stage.value
        data["severity"] = self.severity.value
        return data

    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict())

    @property
    def is_error(self) -> bool:
        """Check if event represents an error"""
        return self.severity in (EventSeverity.ERROR, EventSeverity.CRITICAL)

    @property
    def is_complete(self) -> bool:
        """Check if processing is complete"""
        return self.status == "complete"


@dataclass
class EventMetrics:
    """Aggregated metrics from events"""
    total_events: int = 0
    total_errors: int = 0
    total_warnings: int = 0
    total_duration_ms: float = 0.0
    avg_duration_ms: float = 0.0

    # Stage-specific counts
    pages_classified: int = 0
    pages_gpu_processed: int = 0
    pages_cpu_processed: int = 0
    pages_ensemble_processed: int = 0

    chunks_created: int = 0
    embeddings_generated: int = 0
    graph_nodes_created: int = 0

    # Resource usage
    peak_gpu_memory_mb: float = 0.0
    avg_memory_mb: float = 0.0

    def update_from_event(self, event: ProcessingEvent):
        """Update metrics from a processing event"""
        self.total_events += 1

        if event.is_error:
            self.total_errors += 1
        elif event.severity == EventSeverity.WARNING:
            self.total_warnings += 1

        if event.duration_ms:
            self.total_duration_ms += event.duration_ms
            self.avg_duration_ms = self.total_duration_ms / self.total_events

        # Update stage-specific metrics
        if event.stage == ProcessingStage.CLASSIFICATION:
            self.pages_classified += 1
        elif event.stage == ProcessingStage.GPU_PROCESSING and event.status == "complete":
            self.pages_gpu_processed += 1
        elif event.stage == ProcessingStage.CPU_PROCESSING and event.status == "complete":
            self.pages_cpu_processed += 1
        elif event.stage == ProcessingStage.ENSEMBLE_PROCESSING and event.status == "complete":
            self.pages_ensemble_processed += 1

        if event.chunks_created:
            self.chunks_created += event.chunks_created
        if event.embeddings_generated:
            self.embeddings_generated += event.embeddings_generated
        if event.graph_nodes_created:
            self.graph_nodes_created += event.graph_nodes_created

        if event.gpu_memory_mb:
            self.peak_gpu_memory_mb = max(self.peak_gpu_memory_mb, event.gpu_memory_mb)
        if event.memory_usage_mb:
            self.avg_memory_mb = (self.avg_memory_mb + event.memory_usage_mb) / 2


class EventEmitter:
    """
    Central event emitter for all processing stages.
    Supports SSE streaming, logging, and metrics collection.
    """

    def __init__(self):
        self.event_handlers: Dict[ProcessingStage, List[Callable]] = {}
        self.event_history: List[ProcessingEvent] = []
        self.metrics = EventMetrics()
        self.max_history = 1000  # Keep last 1000 events

        # SSE subscribers (for real-time dashboard)
        self.sse_subscribers: Dict[str, List[Callable]] = {}  # doc_id -> callbacks

        logger.info("EventEmitter initialized")

    def subscribe(self, stage: Optional[ProcessingStage] = None, callback: Optional[Callable] = None):
        """Subscribe to events from a specific stage"""
        if stage is None:
            return  # Must specify stage

        if stage not in self.event_handlers:
            self.event_handlers[stage] = []

        if callback:
            self.event_handlers[stage].append(callback)
            logger.debug(f"Subscribed to {stage.value} events")

    def subscribe_document(self, document_id: str, callback: Callable):
        """Subscribe to all events from a specific document (SSE)"""
        if document_id not in self.sse_subscribers:
            self.sse_subscribers[document_id] = []

        self.sse_subscribers[document_id].append(callback)
        logger.debug(f"Subscribed to document {document_id} events (SSE)")

    def emit(self, event: ProcessingEvent):
        """Emit an event to all subscribers"""
        try:
            # Update metrics
            self.metrics.update_from_event(event)

            # Store in history
            self.event_history.append(event)
            if len(self.event_history) > self.max_history:
                self.event_history.pop(0)

            # Call stage-specific handlers
            if event.stage in self.event_handlers:
                for callback in self.event_handlers[event.stage]:
                    try:
                        callback(event)
                    except Exception as e:
                        logger.error(f"Event handler error: {e}")

            # Call document-specific handlers (SSE)
            if event.document_id in self.sse_subscribers:
                for callback in self.sse_subscribers[event.document_id]:
                    try:
                        callback(event)
                    except Exception as e:
                        logger.error(f"SSE handler error: {e}")

            # Log event
            self._log_event(event)

        except Exception as e:
            logger.error(f"Event emission failed: {e}")

    def emit_stage(
        self,
        document_id: str,
        stage: ProcessingStage,
        status: str = "in_progress",
        **kwargs
    ) -> ProcessingEvent:
        """
        Convenience method to emit a stage event.

        Args:
            document_id: Document being processed
            stage: Processing stage
            status: in_progress, complete, or failed
            **kwargs: Additional fields (page_number, message, error_message, etc.)

        Returns:
            The emitted ProcessingEvent
        """
        event = ProcessingEvent(
            document_id=document_id,
            stage=stage,
            status=status,
            **kwargs
        )
        self.emit(event)
        return event

    def _log_event(self, event: ProcessingEvent):
        """Log event based on severity"""
        msg = f"[{event.stage.value}] {event.message}"

        if event.is_error:
            logger.error(f"{msg} - {event.error_message or ''}")
        elif event.severity == EventSeverity.WARNING:
            logger.warning(msg)
        else:
            logger.info(msg)

    def get_history(self, document_id: Optional[str] = None, limit: int = 100) -> List[ProcessingEvent]:
        """Get event history, optionally filtered by document"""
        history = self.event_history

        if document_id:
            history = [e for e in history if e.document_id == document_id]

        return history[-limit:]

    def get_metrics(self) -> EventMetrics:
        """Get aggregated metrics"""
        return self.metrics

    def reset_metrics(self):
        """Reset metrics"""
        self.metrics = EventMetrics()

    def get_document_status(self, document_id: str) -> Dict[str, Any]:
        """Get current status of a document"""
        doc_events = [e for e in self.event_history if e.document_id == document_id]

        if not doc_events:
            return {"status": "not_found"}

        latest = doc_events[-1]

        return {
            "document_id": document_id,
            "current_stage": latest.stage.value,
            "status": latest.status,
            "total_events": len(doc_events),
            "errors": len([e for e in doc_events if e.is_error]),
            "latest_event": latest.to_dict(),
            "events": [e.to_dict() for e in doc_events[-20:]],  # Last 20 events
        }


# Global event emitter instance
_global_emitter: Optional[EventEmitter] = None


def get_event_emitter() -> EventEmitter:
    """Get or create global event emitter"""
    global _global_emitter
    if _global_emitter is None:
        _global_emitter = EventEmitter()
    return _global_emitter


def create_event(
    document_id: str,
    stage: ProcessingStage,
    message: str = "",
    status: str = "in_progress",
    **kwargs
) -> ProcessingEvent:
    """Convenience function to create and emit an event"""
    event = ProcessingEvent(
        document_id=document_id,
        stage=stage,
        message=message,
        status=status,
        **kwargs
    )
    get_event_emitter().emit(event)
    return event
