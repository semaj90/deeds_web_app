"""
Event emitter for publishing processing status updates.

Supports multiple backends (SSE, RabbitMQ, Redis, etc.).
"""

import logging
import uuid
from typing import List, Callable, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from abc import ABC, abstractmethod

from .event_models import ProcessingEvent, EventType, ProcessingStage, Metrics

logger = logging.getLogger(__name__)


class EventBackend(ABC):
    """Abstract base class for event backends."""

    @abstractmethod
    def publish(self, event: ProcessingEvent) -> None:
        """Publish an event."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Close the backend."""
        pass


class InMemoryBackend(EventBackend):
    """In-memory event backend for testing."""

    def __init__(self):
        """Initialize in-memory backend."""
        self.events: List[ProcessingEvent] = []

    def publish(self, event: ProcessingEvent) -> None:
        """Store event in memory."""
        self.events.append(event)

    def close(self) -> None:
        """Close backend."""
        pass


class RabbitMQBackend(EventBackend):
    """RabbitMQ event backend."""

    def __init__(self, url: str = "amqp://guest:guest@localhost/"):
        """
        Initialize RabbitMQ backend.

        Args:
            url: RabbitMQ connection URL
        """
        self.url = url
        self.connection = None
        self.channel = None
        self._connect()

    def _connect(self) -> None:
        """Connect to RabbitMQ."""
        try:
            import pika

            self.connection = pika.BlockingConnection(
                pika.URLParameters(self.url)
            )
            self.channel = self.connection.channel()
            self.channel.exchange_declare(
                exchange="processing_events",
                exchange_type="topic",
                durable=True,
            )
            logger.info("Connected to RabbitMQ")
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            self.connection = None
            self.channel = None

    def publish(self, event: ProcessingEvent) -> None:
        """Publish event to RabbitMQ."""
        if not self.channel:
            logger.warning("RabbitMQ channel not available")
            return

        try:
            routing_key = f"processing.{event.evidence_id}.{event.stage.value}"
            self.channel.basic_publish(
                exchange="processing_events",
                routing_key=routing_key,
                body=event.to_json(),
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,  # Persistent
                ),
            )
        except Exception as e:
            logger.error(f"Failed to publish event: {e}")

    def close(self) -> None:
        """Close RabbitMQ connection."""
        if self.connection:
            self.connection.close()


class EventEmitter:
    """
    Event emitter for publishing processing status updates.

    Supports multiple backends and filtering.
    """

    def __init__(
        self,
        backend: Optional[EventBackend] = None,
        enable_logging: bool = True,
    ):
        """
        Initialize event emitter.

        Args:
            backend: Event backend (default: in-memory)
            enable_logging: Whether to log events
        """
        self.backend = backend or InMemoryBackend()
        self.enable_logging = enable_logging
        self.subscribers: Dict[str, List[Callable]] = {}
        self.start_times: Dict[str, datetime] = {}

        logger.info(f"Initialized EventEmitter with {type(self.backend).__name__}")

    def emit_started(
        self,
        evidence_id: str,
        details: str = "",
    ) -> ProcessingEvent:
        """
        Emit processing started event.

        Args:
            evidence_id: Evidence ID
            details: Event details

        Returns:
            Emitted event
        """
        self.start_times[evidence_id] = datetime.now(timezone.utc)

        event = ProcessingEvent(
            event_id=str(uuid.uuid4()),
            event_type=EventType.STARTED,
            evidence_id=evidence_id,
            stage=ProcessingStage.UPLOAD,
            percentage=0,
            details=details,
        )

        self._publish(event)
        return event

    def emit_stage_change(
        self,
        evidence_id: str,
        stage: ProcessingStage,
        percentage: int,
        details: str = "",
        metrics: Optional[Metrics] = None,
    ) -> ProcessingEvent:
        """
        Emit stage change event.

        Args:
            evidence_id: Evidence ID
            stage: New processing stage
            percentage: Progress percentage (0-100)
            details: Event details
            metrics: Processing metrics

        Returns:
            Emitted event
        """
        eta_seconds = self._calculate_eta(evidence_id, percentage)

        event = ProcessingEvent(
            event_id=str(uuid.uuid4()),
            event_type=EventType.STAGE_CHANGE,
            evidence_id=evidence_id,
            stage=stage,
            percentage=percentage,
            eta_seconds=eta_seconds,
            details=details,
            metrics=metrics,
        )

        self._publish(event)
        return event

    def emit_progress(
        self,
        evidence_id: str,
        stage: ProcessingStage,
        percentage: int,
        details: str = "",
        metrics: Optional[Metrics] = None,
    ) -> ProcessingEvent:
        """
        Emit progress update event.

        Args:
            evidence_id: Evidence ID
            stage: Current processing stage
            percentage: Progress percentage (0-100)
            details: Event details
            metrics: Processing metrics

        Returns:
            Emitted event
        """
        eta_seconds = self._calculate_eta(evidence_id, percentage)

        event = ProcessingEvent(
            event_id=str(uuid.uuid4()),
            event_type=EventType.PROGRESS,
            evidence_id=evidence_id,
            stage=stage,
            percentage=percentage,
            eta_seconds=eta_seconds,
            details=details,
            metrics=metrics,
        )

        self._publish(event)
        return event

    def emit_metrics(
        self,
        evidence_id: str,
        stage: ProcessingStage,
        metrics: Metrics,
    ) -> ProcessingEvent:
        """
        Emit metrics update event.

        Args:
            evidence_id: Evidence ID
            stage: Current processing stage
            metrics: Processing metrics

        Returns:
            Emitted event
        """
        event = ProcessingEvent(
            event_id=str(uuid.uuid4()),
            event_type=EventType.METRICS,
            evidence_id=evidence_id,
            stage=stage,
            percentage=0,
            metrics=metrics,
        )

        self._publish(event)
        return event

    def emit_error(
        self,
        evidence_id: str,
        stage: ProcessingStage,
        error: str,
        details: str = "",
    ) -> ProcessingEvent:
        """
        Emit error event.

        Args:
            evidence_id: Evidence ID
            stage: Stage where error occurred
            error: Error message
            details: Additional details

        Returns:
            Emitted event
        """
        event = ProcessingEvent(
            event_id=str(uuid.uuid4()),
            event_type=EventType.ERROR,
            evidence_id=evidence_id,
            stage=stage,
            percentage=0,
            details=details,
            error=error,
        )

        self._publish(event)
        return event

    def emit_completed(
        self,
        evidence_id: str,
        details: str = "",
        metrics: Optional[Metrics] = None,
    ) -> ProcessingEvent:
        """
        Emit processing completed event.

        Args:
            evidence_id: Evidence ID
            details: Event details
            metrics: Final metrics

        Returns:
            Emitted event
        """
        event = ProcessingEvent(
            event_id=str(uuid.uuid4()),
            event_type=EventType.COMPLETED,
            evidence_id=evidence_id,
            stage=ProcessingStage.COMPLETED,
            percentage=100,
            details=details,
            metrics=metrics,
        )

        self._publish(event)
        return event

    def _publish(self, event: ProcessingEvent) -> None:
        """
        Publish event to backend and subscribers.

        Args:
            event: Event to publish
        """
        # Publish to backend
        self.backend.publish(event)

        # Log event
        if self.enable_logging:
            logger.info(
                f"Event: {event.event_type.value} - "
                f"{event.evidence_id} - {event.stage.value} - {event.percentage}%"
            )

        # Notify subscribers
        self._notify_subscribers(event)

    def subscribe(
        self,
        evidence_id: str,
        callback: Callable[[ProcessingEvent], None],
    ) -> None:
        """
        Subscribe to events for an evidence ID.

        Args:
            evidence_id: Evidence ID to subscribe to
            callback: Callback function
        """
        if evidence_id not in self.subscribers:
            self.subscribers[evidence_id] = []
        self.subscribers[evidence_id].append(callback)

    def _notify_subscribers(self, event: ProcessingEvent) -> None:
        """Notify subscribers of event."""
        if event.evidence_id in self.subscribers:
            for callback in self.subscribers[event.evidence_id]:
                try:
                    callback(event)
                except Exception as e:
                    logger.error(f"Error in subscriber callback: {e}")

    def _calculate_eta(
        self,
        evidence_id: str,
        current_percentage: int,
    ) -> Optional[int]:
        """
        Calculate ETA in seconds.

        Args:
            evidence_id: Evidence ID
            current_percentage: Current progress percentage

        Returns:
            ETA in seconds, or None if not calculable
        """
        if evidence_id not in self.start_times or current_percentage <= 0:
            return None

        elapsed = (datetime.now(timezone.utc) - self.start_times[evidence_id]).total_seconds()
        if elapsed <= 0:
            return None

        # Estimate total time based on current progress
        estimated_total = elapsed * 100 / current_percentage
        remaining = estimated_total - elapsed

        return max(0, int(remaining))

    def close(self) -> None:
        """Close event emitter."""
        self.backend.close()
