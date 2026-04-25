"""Progress event management and SSE streaming."""

import asyncio
import json
import structlog
from typing import AsyncGenerator, Dict, Any, Optional, Set
from datetime import datetime
from dataclasses import dataclass, asdict
from enum import Enum
import uuid

logger = structlog.get_logger(__name__)


class ProcessingStage(str, Enum):
    """Processing pipeline stages."""
    CLASSIFICATION = "classification"
    OCR = "ocr"
    PARSING = "parsing"
    CHUNKING = "chunking"
    ANALYSIS = "analysis"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    COMPLETED = "completed"
    FAILED = "failed"


class EventType(str, Enum):
    """Event types for progress tracking."""
    STAGE_START = "stage_start"
    STAGE_PROGRESS = "stage_progress"
    STAGE_COMPLETE = "stage_complete"
    METRICS_UPDATE = "metrics_update"
    ERROR = "error"
    WARNING = "warning"
    COMPLETION = "completion"


@dataclass
class ProcessingEvent:
    """Represents a processing event."""
    event_id: str
    job_id: str
    event_type: EventType
    stage: ProcessingStage
    timestamp: str
    percentage: int
    eta_seconds: Optional[int] = None
    details: str = ""
    metrics: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    recoverable: bool = True

    def to_sse_format(self) -> str:
        """Convert event to SSE format."""
        data = asdict(self)
        # Convert enums to strings
        data['event_type'] = self.event_type.value
        data['stage'] = self.stage.value
        return f"data: {json.dumps(data)}\n\n"


class ProgressEventManager:
    """Manages progress events and SSE subscriptions."""

    def __init__(self):
        """Initialize event manager."""
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._job_progress: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, job_id: str) -> asyncio.Queue:
        """Subscribe to progress events for a job."""
        async with self._lock:
            if job_id not in self._subscribers:
                self._subscribers[job_id] = set()

            queue: asyncio.Queue = asyncio.Queue()
            self._subscribers[job_id].add(queue)

            logger.info(f"Subscriber added for job {job_id}")
            return queue

    async def unsubscribe(self, job_id: str, queue: asyncio.Queue) -> None:
        """Unsubscribe from progress events."""
        async with self._lock:
            if job_id in self._subscribers:
                self._subscribers[job_id].discard(queue)
                if not self._subscribers[job_id]:
                    del self._subscribers[job_id]

                logger.info(f"Subscriber removed for job {job_id}")

    async def emit_event(self, event: ProcessingEvent) -> None:
        """Emit a progress event to all subscribers."""
        async with self._lock:
            if event.job_id not in self._subscribers:
                logger.debug(f"No subscribers for job {event.job_id}")
                return

            # Update job progress
            if event.job_id not in self._job_progress:
                self._job_progress[event.job_id] = {}

            self._job_progress[event.job_id].update({
                'stage': event.stage.value,
                'percentage': event.percentage,
                'eta_seconds': event.eta_seconds,
                'last_update': event.timestamp,
            })

            # Send to all subscribers
            for queue in self._subscribers[event.job_id]:
                try:
                    await queue.put(event)
                except Exception as e:
                    logger.error(f"Failed to emit event to subscriber", error=str(e))

    async def stream_events(self, job_id: str) -> AsyncGenerator[str, None]:
        """Stream events as SSE for a job."""
        queue = await self.subscribe(job_id)

        try:
            while True:
                try:
                    # Wait for event with timeout
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)

                    # Yield SSE formatted event
                    yield event.to_sse_format()

                except asyncio.TimeoutError:
                    # Send heartbeat
                    yield ": heartbeat\n\n"
                except Exception as e:
                    logger.error(f"Error streaming events", error=str(e))
                    break
        finally:
            await self.unsubscribe(job_id, queue)

    async def get_job_progress(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get current progress for a job."""
        async with self._lock:
            return self._job_progress.get(job_id)

    async def clear_job_progress(self, job_id: str) -> None:
        """Clear progress data for a job."""
        async with self._lock:
            if job_id in self._job_progress:
                del self._job_progress[job_id]
            if job_id in self._subscribers:
                del self._subscribers[job_id]

            logger.info(f"Progress cleared for job {job_id}")


# Global event manager instance
_event_manager: Optional[ProgressEventManager] = None


async def get_event_manager() -> ProgressEventManager:
    """Get or create the global event manager."""
    global _event_manager
    if _event_manager is None:
        _event_manager = ProgressEventManager()
    return _event_manager


async def emit_stage_start(
    job_id: str,
    stage: ProcessingStage,
    details: str = "",
) -> None:
    """Emit a stage start event."""
    manager = await get_event_manager()
    event = ProcessingEvent(
        event_id=str(uuid.uuid4()),
        job_id=job_id,
        event_type=EventType.STAGE_START,
        stage=stage,
        timestamp=datetime.utcnow().isoformat(),
        percentage=0,
        details=details,
    )
    await manager.emit_event(event)


async def emit_stage_progress(
    job_id: str,
    stage: ProcessingStage,
    percentage: int,
    eta_seconds: Optional[int] = None,
    details: str = "",
    metrics: Optional[Dict[str, Any]] = None,
) -> None:
    """Emit a stage progress event."""
    manager = await get_event_manager()
    event = ProcessingEvent(
        event_id=str(uuid.uuid4()),
        job_id=job_id,
        event_type=EventType.STAGE_PROGRESS,
        stage=stage,
        timestamp=datetime.utcnow().isoformat(),
        percentage=percentage,
        eta_seconds=eta_seconds,
        details=details,
        metrics=metrics,
    )
    await manager.emit_event(event)


async def emit_stage_complete(
    job_id: str,
    stage: ProcessingStage,
    details: str = "",
    metrics: Optional[Dict[str, Any]] = None,
) -> None:
    """Emit a stage completion event."""
    manager = await get_event_manager()
    event = ProcessingEvent(
        event_id=str(uuid.uuid4()),
        job_id=job_id,
        event_type=EventType.STAGE_COMPLETE,
        stage=stage,
        timestamp=datetime.utcnow().isoformat(),
        percentage=100,
        details=details,
        metrics=metrics,
    )
    await manager.emit_event(event)


async def emit_error(
    job_id: str,
    stage: ProcessingStage,
    error_message: str,
    recoverable: bool = True,
) -> None:
    """Emit an error event."""
    manager = await get_event_manager()
    event = ProcessingEvent(
        event_id=str(uuid.uuid4()),
        job_id=job_id,
        event_type=EventType.ERROR,
        stage=stage,
        timestamp=datetime.utcnow().isoformat(),
        percentage=0,
        error_message=error_message,
        recoverable=recoverable,
    )
    await manager.emit_event(event)


async def emit_warning(
    job_id: str,
    stage: ProcessingStage,
    details: str,
) -> None:
    """Emit a warning event."""
    manager = await get_event_manager()
    event = ProcessingEvent(
        event_id=str(uuid.uuid4()),
        job_id=job_id,
        event_type=EventType.WARNING,
        stage=stage,
        timestamp=datetime.utcnow().isoformat(),
        percentage=0,
        details=details,
    )
    await manager.emit_event(event)


async def emit_completion(
    job_id: str,
    details: str = "",
    metrics: Optional[Dict[str, Any]] = None,
) -> None:
    """Emit a completion event."""
    manager = await get_event_manager()
    event = ProcessingEvent(
        event_id=str(uuid.uuid4()),
        job_id=job_id,
        event_type=EventType.COMPLETION,
        stage=ProcessingStage.COMPLETED,
        timestamp=datetime.utcnow().isoformat(),
        percentage=100,
        details=details,
        metrics=metrics,
    )
    await manager.emit_event(event)
