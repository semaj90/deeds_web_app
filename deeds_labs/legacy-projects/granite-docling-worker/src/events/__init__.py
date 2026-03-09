"""
Event emission system for real-time processing status updates.

Provides SSE streaming and event publishing for pipeline stages.
"""

from .event_models import ProcessingEvent, EventType, ProcessingStage, Metrics
from .event_emitter import EventEmitter
from .metrics_collector import MetricsCollector

__all__ = [
    "ProcessingEvent",
    "EventType",
    "ProcessingStage",
    "Metrics",
    "EventEmitter",
    "MetricsCollector",
]
