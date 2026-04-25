"""
Test suite for event emission system.
"""

import pytest
import time
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.events import (
    EventEmitter,
    ProcessingEvent,
    EventType,
    ProcessingStage,
    Metrics,
    MetricsCollector,
)
from src.events.event_emitter import InMemoryBackend


class TestEventModels:
    """Test event data models."""

    def test_metrics_creation(self):
        """Test Metrics dataclass creation."""
        metrics = Metrics(
            gpu_utilization=75.0,
            cpu_utilization=45.0,
            memory_usage_mb=512.0,
            processing_time_ms=1000.0,
        )

        assert metrics.gpu_utilization == 75.0
        assert metrics.cpu_utilization == 45.0
        assert metrics.memory_usage_mb == 512.0
        assert metrics.processing_time_ms == 1000.0

    def test_metrics_to_dict(self):
        """Test Metrics to_dict conversion."""
        metrics = Metrics(gpu_utilization=75.0, cpu_utilization=45.0)
        metrics_dict = metrics.to_dict()

        assert isinstance(metrics_dict, dict)
        assert metrics_dict['gpu_utilization'] == 75.0
        assert metrics_dict['cpu_utilization'] == 45.0

    def test_processing_event_creation(self):
        """Test ProcessingEvent creation."""
        event = ProcessingEvent(
            event_id="test-123",
            event_type=EventType.STARTED,
            evidence_id="evidence-123",
            stage=ProcessingStage.UPLOAD,
            percentage=0,
            details="Starting processing",
        )

        assert event.event_id == "test-123"
        assert event.event_type == EventType.STARTED
        assert event.evidence_id == "evidence-123"
        assert event.stage == ProcessingStage.UPLOAD
        assert event.percentage == 0

    def test_processing_event_to_dict(self):
        """Test ProcessingEvent to_dict conversion."""
        event = ProcessingEvent(
            event_id="test-123",
            event_type=EventType.PROGRESS,
            evidence_id="evidence-123",
            stage=ProcessingStage.GPU_PROCESSING,
            percentage=50,
            details="Processing",
        )

        event_dict = event.to_dict()

        assert isinstance(event_dict, dict)
        assert event_dict['event_id'] == "test-123"
        assert event_dict['event_type'] == "progress"
        assert event_dict['stage'] == "gpu_processing"
        assert event_dict['percentage'] == 50

    def test_processing_event_to_json(self):
        """Test ProcessingEvent to_json conversion."""
        event = ProcessingEvent(
            event_id="test-123",
            event_type=EventType.COMPLETED,
            evidence_id="evidence-123",
            stage=ProcessingStage.COMPLETED,
            percentage=100,
        )

        json_str = event.to_json()

        assert isinstance(json_str, str)
        assert "test-123" in json_str
        assert "completed" in json_str

    def test_processing_event_to_sse_format(self):
        """Test ProcessingEvent SSE format."""
        event = ProcessingEvent(
            event_id="test-123",
            event_type=EventType.PROGRESS,
            evidence_id="evidence-123",
            stage=ProcessingStage.CHUNKING,
            percentage=75,
        )

        sse_str = event.to_sse_format()

        assert sse_str.startswith("data: ")
        assert sse_str.endswith("\n\n")
        assert "test-123" in sse_str


class TestEventEmitter:
    """Test event emitter."""

    def test_emitter_creation(self):
        """Test EventEmitter creation."""
        emitter = EventEmitter()

        assert emitter.backend is not None
        assert isinstance(emitter.backend, InMemoryBackend)
        assert emitter.enable_logging is True

    def test_emit_started(self):
        """Test emit_started event."""
        emitter = EventEmitter()

        event = emitter.emit_started("evidence-123", "Starting")

        assert event.event_type == EventType.STARTED
        assert event.evidence_id == "evidence-123"
        assert event.stage == ProcessingStage.UPLOAD
        assert event.percentage == 0

    def test_emit_stage_change(self):
        """Test emit_stage_change event."""
        emitter = EventEmitter()

        event = emitter.emit_stage_change(
            "evidence-123",
            ProcessingStage.GPU_PROCESSING,
            50,
            "Processing with GPU",
        )

        assert event.event_type == EventType.STAGE_CHANGE
        assert event.stage == ProcessingStage.GPU_PROCESSING
        assert event.percentage == 50
        assert event.details == "Processing with GPU"

    def test_emit_progress(self):
        """Test emit_progress event."""
        emitter = EventEmitter()

        metrics = Metrics(gpu_utilization=75.0, cpu_utilization=45.0)
        event = emitter.emit_progress(
            "evidence-123",
            ProcessingStage.CHUNKING,
            75,
            "Chunking document",
            metrics,
        )

        assert event.event_type == EventType.PROGRESS
        assert event.stage == ProcessingStage.CHUNKING
        assert event.percentage == 75
        assert event.metrics is not None
        assert event.metrics.gpu_utilization == 75.0

    def test_emit_metrics(self):
        """Test emit_metrics event."""
        emitter = EventEmitter()

        metrics = Metrics(
            gpu_utilization=80.0,
            cpu_utilization=50.0,
            memory_usage_mb=1024.0,
        )
        event = emitter.emit_metrics(
            "evidence-123",
            ProcessingStage.EMBEDDING,
            metrics,
        )

        assert event.event_type == EventType.METRICS
        assert event.metrics is not None
        assert event.metrics.gpu_utilization == 80.0

    def test_emit_error(self):
        """Test emit_error event."""
        emitter = EventEmitter()

        event = emitter.emit_error(
            "evidence-123",
            ProcessingStage.GPU_PROCESSING,
            "GPU out of memory",
            "Failed to allocate GPU memory",
        )

        assert event.event_type == EventType.ERROR
        assert event.error == "GPU out of memory"
        assert event.details == "Failed to allocate GPU memory"

    def test_emit_completed(self):
        """Test emit_completed event."""
        emitter = EventEmitter()

        metrics = Metrics(processing_time_ms=5000.0)
        event = emitter.emit_completed(
            "evidence-123",
            "Processing complete",
            metrics,
        )

        assert event.event_type == EventType.COMPLETED
        assert event.stage == ProcessingStage.COMPLETED
        assert event.percentage == 100
        assert event.metrics is not None

    def test_subscriber_callback(self):
        """Test subscriber callback."""
        emitter = EventEmitter()

        received_events = []

        def callback(event: ProcessingEvent):
            received_events.append(event)

        emitter.subscribe("evidence-123", callback)
        emitter.emit_started("evidence-123", "Starting")

        assert len(received_events) == 1
        assert received_events[0].event_type == EventType.STARTED

    def test_eta_calculation(self):
        """Test ETA calculation."""
        emitter = EventEmitter()

        emitter.emit_started("evidence-123")
        time.sleep(0.1)  # Simulate some processing time

        event = emitter.emit_progress(
            "evidence-123",
            ProcessingStage.GPU_PROCESSING,
            50,
        )

        # ETA should be calculated
        assert event.eta_seconds is not None
        assert event.eta_seconds >= 0

    def test_in_memory_backend(self):
        """Test in-memory backend."""
        backend = InMemoryBackend()
        emitter = EventEmitter(backend=backend)

        emitter.emit_started("evidence-123")
        emitter.emit_progress("evidence-123", ProcessingStage.CHUNKING, 50)
        emitter.emit_completed("evidence-123")

        assert len(backend.events) == 3
        assert backend.events[0].event_type == EventType.STARTED
        assert backend.events[1].event_type == EventType.PROGRESS
        assert backend.events[2].event_type == EventType.COMPLETED


class TestMetricsCollector:
    """Test metrics collector."""

    def test_collector_creation(self):
        """Test MetricsCollector creation."""
        collector = MetricsCollector()

        assert collector.sample_interval == 1.0
        assert collector.process is not None
        assert collector.monitoring is False

    def test_collect_metrics(self):
        """Test metrics collection."""
        collector = MetricsCollector()

        metrics = collector.get_current_metrics()

        assert isinstance(metrics, Metrics)
        assert metrics.cpu_utilization >= 0
        assert metrics.memory_usage_mb > 0

    def test_monitoring_start_stop(self):
        """Test monitoring start/stop."""
        collector = MetricsCollector()

        collector.start_monitoring()
        assert collector.monitoring is True

        time.sleep(0.5)

        collector.stop_monitoring()
        assert collector.monitoring is False

    def test_metrics_history(self):
        """Test metrics history collection."""
        collector = MetricsCollector(sample_interval=0.1)

        collector.start_monitoring()
        time.sleep(0.5)
        collector.stop_monitoring()

        assert len(collector.metrics_history) > 0

    def test_average_metrics(self):
        """Test average metrics calculation."""
        collector = MetricsCollector(sample_interval=0.1)

        collector.start_monitoring()
        time.sleep(0.3)
        collector.stop_monitoring()

        avg_metrics = collector.get_average_metrics()

        assert isinstance(avg_metrics, Metrics)
        assert avg_metrics.cpu_utilization >= 0

    def test_peak_metrics(self):
        """Test peak metrics calculation."""
        collector = MetricsCollector(sample_interval=0.1)

        collector.start_monitoring()
        time.sleep(0.3)
        collector.stop_monitoring()

        peak_metrics = collector.get_peak_metrics()

        assert isinstance(peak_metrics, Metrics)
        assert peak_metrics.cpu_utilization >= 0

    def test_statistics(self):
        """Test statistics generation."""
        collector = MetricsCollector(sample_interval=0.1)

        collector.start_monitoring()
        time.sleep(0.3)
        collector.stop_monitoring()

        stats = collector.get_statistics()

        assert 'current' in stats
        assert 'average' in stats
        assert 'peak' in stats
        assert 'samples' in stats
        assert 'gpu_available' in stats


class TestEventIntegration:
    """Integration tests for event system."""

    def test_full_processing_workflow(self):
        """Test full processing workflow with events."""
        emitter = EventEmitter()
        collector = MetricsCollector(sample_interval=0.1)

        events = []

        def callback(event: ProcessingEvent):
            events.append(event)

        emitter.subscribe("evidence-123", callback)

        # Start processing
        emitter.emit_started("evidence-123", "Starting document processing")
        assert len(events) == 1

        # Start monitoring
        collector.start_monitoring()

        # Simulate processing stages
        time.sleep(0.1)
        metrics = collector.get_current_metrics()
        emitter.emit_stage_change(
            "evidence-123",
            ProcessingStage.CLASSIFICATION,
            10,
            "Classifying document",
            metrics,
        )
        assert len(events) == 2

        time.sleep(0.1)
        metrics = collector.get_current_metrics()
        emitter.emit_progress(
            "evidence-123",
            ProcessingStage.GPU_PROCESSING,
            50,
            "Processing with GPU",
            metrics,
        )
        assert len(events) == 3

        time.sleep(0.1)
        metrics = collector.get_current_metrics()
        emitter.emit_stage_change(
            "evidence-123",
            ProcessingStage.CHUNKING,
            75,
            "Chunking document",
            metrics,
        )
        assert len(events) == 4

        time.sleep(0.1)
        metrics = collector.get_current_metrics()
        emitter.emit_stage_change(
            "evidence-123",
            ProcessingStage.EMBEDDING,
            90,
            "Generating embeddings",
            metrics,
        )
        assert len(events) == 5

        # Complete
        collector.stop_monitoring()
        final_metrics = collector.get_average_metrics()
        emitter.emit_completed(
            "evidence-123",
            "Processing complete",
            final_metrics,
        )
        assert len(events) == 6

        # Verify event sequence
        assert events[0].event_type == EventType.STARTED
        assert events[1].event_type == EventType.STAGE_CHANGE
        assert events[2].event_type == EventType.PROGRESS
        assert events[3].event_type == EventType.STAGE_CHANGE
        assert events[4].event_type == EventType.STAGE_CHANGE
        assert events[5].event_type == EventType.COMPLETED

        # Verify progress
        assert events[0].percentage == 0
        assert events[1].percentage == 10
        assert events[2].percentage == 50
        assert events[3].percentage == 75
        assert events[4].percentage == 90
        assert events[5].percentage == 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
