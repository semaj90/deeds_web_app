"""
Tests for Processing Events System
Tests ProcessingEvent, EventEmitter, and event lifecycle.
"""

import pytest
import time
from src.core.processing_events import (
    ProcessingEvent,
    ProcessingStage,
    EventSeverity,
    EventEmitter,
    EventMetrics,
    get_event_emitter,
    create_event,
)


class TestProcessingEvent:
    """Test ProcessingEvent dataclass"""

    def test_event_creation(self):
        """Test basic event creation"""
        event = ProcessingEvent(
            document_id="test-doc-123",
            stage=ProcessingStage.CLASSIFICATION,
            message="Test message"
        )

        assert event.document_id == "test-doc-123"
        assert event.stage == ProcessingStage.CLASSIFICATION
        assert event.message == "Test message"
        assert event.event_id is not None
        assert event.timestamp is not None

    def test_event_to_dict(self):
        """Test event serialization"""
        event = ProcessingEvent(
            document_id="test-doc",
            stage=ProcessingStage.GPU_PROCESSING,
            severity=EventSeverity.INFO,
            page_number=5,
            confidence=0.95
        )

        data = event.to_dict()

        assert data["document_id"] == "test-doc"
        assert data["stage"] == "gpu_processing"
        assert data["severity"] == "info"
        assert data["page_number"] == 5
        assert data["confidence"] == 0.95

    def test_event_to_json(self):
        """Test JSON serialization"""
        event = ProcessingEvent(
            document_id="test-doc",
            stage=ProcessingStage.CPU_PROCESSING,
            message="Processing complete"
        )

        json_str = event.to_json()

        assert isinstance(json_str, str)
        assert "test-doc" in json_str
        assert "cpu_processing" in json_str

    def test_is_error_property(self):
        """Test error detection"""
        error_event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.ERROR,
            severity=EventSeverity.ERROR
        )

        warning_event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.CLASSIFICATION,
            severity=EventSeverity.WARNING
        )

        info_event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.UPLOAD,
            severity=EventSeverity.INFO
        )

        assert error_event.is_error is True
        assert warning_event.is_error is False
        assert info_event.is_error is False

    def test_is_complete_property(self):
        """Test completion detection"""
        complete = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.COMPLETE,
            status="complete"
        )

        in_progress = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.GPU_PROCESSING,
            status="in_progress"
        )

        assert complete.is_complete is True
        assert in_progress.is_complete is False


class TestEventMetrics:
    """Test EventMetrics aggregation"""

    def test_metrics_initialization(self):
        """Test metrics start at zero"""
        metrics = EventMetrics()

        assert metrics.total_events == 0
        assert metrics.total_errors == 0
        assert metrics.pages_classified == 0
        assert metrics.pages_gpu_processed == 0

    def test_metrics_update_from_event(self):
        """Test metrics update correctly"""
        metrics = EventMetrics()

        event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.CLASSIFICATION,
            status="complete",
            duration_ms=100
        )

        metrics.update_from_event(event)

        assert metrics.total_events == 1
        assert metrics.pages_classified == 1
        assert metrics.total_duration_ms == 100
        assert metrics.avg_duration_ms == 100

    def test_metrics_error_counting(self):
        """Test error counting"""
        metrics = EventMetrics()

        error_event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.ERROR,
            severity=EventSeverity.ERROR
        )

        warning_event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.GPU_PROCESSING,
            severity=EventSeverity.WARNING
        )

        metrics.update_from_event(error_event)
        metrics.update_from_event(warning_event)

        assert metrics.total_errors == 1
        assert metrics.total_warnings == 1
        assert metrics.total_events == 2

    def test_metrics_gpu_processing(self):
        """Test GPU processing metrics"""
        metrics = EventMetrics()

        event = ProcessingEvent(
            document_id="test",
            stage=ProcessingStage.GPU_PROCESSING,
            status="complete",
            gpu_memory_mb=1500
        )

        metrics.update_from_event(event)

        assert metrics.pages_gpu_processed == 1
        assert metrics.peak_gpu_memory_mb == 1500


class TestEventEmitter:
    """Test EventEmitter class"""

    def test_emitter_initialization(self):
        """Test emitter starts fresh"""
        emitter = EventEmitter()

        assert len(emitter.event_history) == 0
        assert emitter.metrics.total_events == 0

    def test_emit_event(self):
        """Test event emission"""
        emitter = EventEmitter()

        event = ProcessingEvent(
            document_id="test-doc",
            stage=ProcessingStage.UPLOAD,
            message="Test upload"
        )

        emitter.emit(event)

        assert len(emitter.event_history) == 1
        assert emitter.metrics.total_events == 1
        assert emitter.event_history[0] == event

    def test_emit_stage_convenience(self):
        """Test emit_stage convenience method"""
        emitter = EventEmitter()

        event = emitter.emit_stage(
            document_id="test-doc",
            stage=ProcessingStage.CLASSIFICATION,
            status="in_progress",
            message="Classifying pages",
            page_number=1
        )

        assert event.document_id == "test-doc"
        assert event.stage == ProcessingStage.CLASSIFICATION
        assert event.page_number == 1
        assert len(emitter.event_history) == 1

    def test_subscribe_callback(self):
        """Test stage subscription"""
        emitter = EventEmitter()

        received_events = []

        def callback(event):
            received_events.append(event)

        emitter.subscribe(ProcessingStage.GPU_PROCESSING, callback)

        # Emit GPU event
        emitter.emit_stage(
            document_id="test",
            stage=ProcessingStage.GPU_PROCESSING,
            message="GPU processing"
        )

        # Emit CPU event (should not trigger callback)
        emitter.emit_stage(
            document_id="test",
            stage=ProcessingStage.CPU_PROCESSING,
            message="CPU processing"
        )

        assert len(received_events) == 1
        assert received_events[0].stage == ProcessingStage.GPU_PROCESSING

    def test_subscribe_document_sse(self):
        """Test document-specific SSE subscription"""
        emitter = EventEmitter()

        doc1_events = []
        doc2_events = []

        emitter.subscribe_document("doc1", lambda e: doc1_events.append(e))
        emitter.subscribe_document("doc2", lambda e: doc2_events.append(e))

        emitter.emit_stage(document_id="doc1", stage=ProcessingStage.UPLOAD, message="Test")
        emitter.emit_stage(document_id="doc2", stage=ProcessingStage.UPLOAD, message="Test")
        emitter.emit_stage(document_id="doc1", stage=ProcessingStage.CLASSIFICATION, message="Test")

        assert len(doc1_events) == 2
        assert len(doc2_events) == 1

    def test_get_history(self):
        """Test event history retrieval"""
        emitter = EventEmitter()

        for i in range(10):
            emitter.emit_stage(
                document_id="test-doc",
                stage=ProcessingStage.UPLOAD,
                message=f"Event {i}"
            )

        history = emitter.get_history(limit=5)

        assert len(history) == 5
        assert history[-1].message == "Event 9"

    def test_get_history_filtered(self):
        """Test filtered history by document_id"""
        emitter = EventEmitter()

        emitter.emit_stage(document_id="doc1", stage=ProcessingStage.UPLOAD, message="Doc1")
        emitter.emit_stage(document_id="doc2", stage=ProcessingStage.UPLOAD, message="Doc2")
        emitter.emit_stage(document_id="doc1", stage=ProcessingStage.CLASSIFICATION, message="Doc1")

        doc1_history = emitter.get_history(document_id="doc1")

        assert len(doc1_history) == 2
        assert all(e.document_id == "doc1" for e in doc1_history)

    def test_get_document_status(self):
        """Test document status retrieval"""
        emitter = EventEmitter()

        emitter.emit_stage(document_id="test-doc", stage=ProcessingStage.UPLOAD, status="complete", message="Uploaded")
        emitter.emit_stage(document_id="test-doc", stage=ProcessingStage.CLASSIFICATION, status="in_progress", message="Classifying")

        status = emitter.get_document_status("test-doc")

        assert status["document_id"] == "test-doc"
        assert status["current_stage"] == "classification"
        assert status["status"] == "in_progress"
        assert status["total_events"] == 2
        assert status["errors"] == 0

    def test_reset_metrics(self):
        """Test metrics reset"""
        emitter = EventEmitter()

        emitter.emit_stage(document_id="test", stage=ProcessingStage.UPLOAD, message="Test")

        assert emitter.metrics.total_events == 1

        emitter.reset_metrics()

        assert emitter.metrics.total_events == 0


class TestGlobalEmitter:
    """Test global emitter singleton"""

    def test_get_global_emitter(self):
        """Test global emitter is singleton"""
        emitter1 = get_event_emitter()
        emitter2 = get_event_emitter()

        assert emitter1 is emitter2

    def test_create_event_convenience(self):
        """Test create_event convenience function"""
        emitter = get_event_emitter()
        emitter.reset_metrics()

        event = create_event(
            document_id="test-doc",
            stage=ProcessingStage.CLASSIFICATION,
            message="Test classification",
            status="complete",
            page_number=1
        )

        assert event.document_id == "test-doc"
        assert emitter.metrics.total_events == 1
