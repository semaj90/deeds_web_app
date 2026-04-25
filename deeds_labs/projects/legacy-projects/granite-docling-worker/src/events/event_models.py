"""
Event data models for processing status updates.
"""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import json


class EventType(str, Enum):
    """Event types."""

    STARTED = "started"
    STAGE_CHANGE = "stage_change"
    PROGRESS = "progress"
    METRICS = "metrics"
    ERROR = "error"
    COMPLETED = "completed"


class ProcessingStage(str, Enum):
    """Processing pipeline stages."""

    UPLOAD = "upload"
    CLASSIFICATION = "classification"
    GPU_PROCESSING = "gpu_processing"
    CPU_PROCESSING = "cpu_processing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    COMPLETED = "completed"


@dataclass
class Metrics:
    """Processing metrics."""

    gpu_utilization: float = 0.0  # 0-100%
    cpu_utilization: float = 0.0  # 0-100%
    memory_usage_mb: float = 0.0
    processing_time_ms: float = 0.0
    chunks_processed: int = 0
    tokens_processed: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)


@dataclass
class ProcessingEvent:
    """Processing status event."""

    event_id: str
    event_type: EventType
    evidence_id: str
    stage: ProcessingStage
    percentage: int  # 0-100
    eta_seconds: Optional[int] = None
    details: str = ""
    metrics: Optional[Metrics] = None
    error: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "evidence_id": self.evidence_id,
            "stage": self.stage.value,
            "percentage": self.percentage,
            "eta_seconds": self.eta_seconds,
            "details": self.details,
            "metrics": self.metrics.to_dict() if self.metrics else None,
            "error": self.error,
            "timestamp": self.timestamp.isoformat(),
        }

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())

    def to_sse_format(self) -> str:
        """Convert to SSE format."""
        return f"data: {self.to_json()}\n\n"
