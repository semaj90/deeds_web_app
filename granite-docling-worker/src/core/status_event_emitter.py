"""
Status Event Emitter
====================

SSE (Server-Sent Events) streaming for real-time processing status.

Standardized event schema for dashboard integration:
- classification
- gpu_processing
- cpu_fallback
- chunking
- embedding
- complete

Usage:
    emitter = StatusEventEmitter()

    # Register SSE client
    queue = await emitter.register_client()

    # Emit events during processing
    await emitter.emit(ProcessingEvent(...))

    # Stream to client (FastAPI)
    return StreamingResponse(emitter.stream_to_client(queue))
"""

import asyncio
import json
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Literal, Dict, Optional, List
from enum import Enum

# Event types
EventStep = Literal[
    "classification",
    "gpu_processing",
    "cpu_fallback",
    "chunking",
    "embedding",
    "rag_indexing",
    "complete",
    "error"
]

EventStatus = Literal["started", "in_progress", "completed", "failed"]

@dataclass
class ProcessingEvent:
    """
    Standardized processing event.

    Attributes:
        doc_id: Unique document identifier
        step: Processing step name
        status: Current status (started, in_progress, completed, failed)
        duration_ms: Time elapsed in milliseconds
        metadata: Additional step-specific data
        timestamp: ISO 8601 timestamp (auto-generated)
    """
    doc_id: str
    step: EventStep
    status: EventStatus
    duration_ms: int
    metadata: Dict
    timestamp: Optional[str] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow().isoformat() + "Z"

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

    def to_sse(self) -> str:
        """Convert to SSE format"""
        return f"data: {json.dumps(self.to_dict())}\n\n"


class StatusEventEmitter:
    """
    SSE event emitter for real-time processing status.

    Manages multiple client connections and broadcasts events.
    """

    def __init__(self, max_clients: int = 100):
        """
        Initialize event emitter.

        Args:
            max_clients: Maximum concurrent SSE clients
        """
        self.clients: List[asyncio.Queue] = []
        self.max_clients = max_clients
        self.stats = {
            "total_events": 0,
            "active_clients": 0,
            "events_by_step": {},
        }

    async def register_client(self) -> asyncio.Queue:
        """
        Register new SSE client.

        Returns:
            Queue for receiving events
        """
        if len(self.clients) >= self.max_clients:
            raise RuntimeError(f"Maximum clients ({self.max_clients}) reached")

        queue = asyncio.Queue(maxsize=100)
        self.clients.append(queue)
        self.stats["active_clients"] = len(self.clients)

        return queue

    def unregister_client(self, queue: asyncio.Queue):
        """Unregister SSE client"""
        if queue in self.clients:
            self.clients.remove(queue)
            self.stats["active_clients"] = len(self.clients)

    async def emit(self, event: ProcessingEvent):
        """
        Broadcast event to all connected clients.

        Args:
            event: ProcessingEvent to broadcast
        """
        # Update stats
        self.stats["total_events"] += 1
        self.stats["events_by_step"][event.step] = \
            self.stats["events_by_step"].get(event.step, 0) + 1

        # Broadcast to all clients
        dead_clients = []
        for client_queue in self.clients:
            try:
                # Non-blocking put
                client_queue.put_nowait(event)
            except asyncio.QueueFull:
                # Client queue full → mark for removal
                dead_clients.append(client_queue)

        # Remove dead clients
        for client in dead_clients:
            self.unregister_client(client)

    async def stream_to_client(self, client_queue: asyncio.Queue):
        """
        SSE stream generator for FastAPI.

        Args:
            client_queue: Client's event queue

        Yields:
            SSE formatted event strings
        """
        try:
            while True:
                # Wait for event
                event = await client_queue.get()

                # Yield SSE formatted event
                yield event.to_sse()

        except asyncio.CancelledError:
            # Client disconnected
            self.unregister_client(client_queue)

    def get_stats(self) -> Dict:
        """Get emitter statistics"""
        return self.stats.copy()


# Helper functions for common events

def create_classification_event(
    doc_id: str,
    status: EventStatus,
    category: Optional[str] = None,
    confidence: Optional[float] = None,
    duration_ms: int = 0
) -> ProcessingEvent:
    """Create page classification event"""
    metadata = {}
    if category:
        metadata["category"] = category
    if confidence:
        metadata["confidence"] = confidence

    return ProcessingEvent(
        doc_id=doc_id,
        step="classification",
        status=status,
        duration_ms=duration_ms,
        metadata=metadata
    )


def create_processing_event(
    doc_id: str,
    status: EventStatus,
    processor: Literal["granite", "tesseract"],
    page_num: int,
    confidence: Optional[float] = None,
    duration_ms: int = 0
) -> ProcessingEvent:
    """Create GPU/CPU processing event"""
    step = "gpu_processing" if processor == "granite" else "cpu_fallback"

    metadata = {
        "processor": processor,
        "page_num": page_num,
    }
    if confidence:
        metadata["confidence"] = confidence

    return ProcessingEvent(
        doc_id=doc_id,
        step=step,
        status=status,
        duration_ms=duration_ms,
        metadata=metadata
    )


def create_chunking_event(
    doc_id: str,
    status: EventStatus,
    chunk_count: Optional[int] = None,
    avg_chunk_size: Optional[int] = None,
    duration_ms: int = 0
) -> ProcessingEvent:
    """Create chunking event"""
    metadata = {}
    if chunk_count:
        metadata["chunk_count"] = chunk_count
    if avg_chunk_size:
        metadata["avg_chunk_size"] = avg_chunk_size

    return ProcessingEvent(
        doc_id=doc_id,
        step="chunking",
        status=status,
        duration_ms=duration_ms,
        metadata=metadata
    )


def create_embedding_event(
    doc_id: str,
    status: EventStatus,
    model: Optional[str] = None,
    vector_dim: Optional[int] = None,
    duration_ms: int = 0
) -> ProcessingEvent:
    """Create embedding generation event"""
    metadata = {}
    if model:
        metadata["model"] = model
    if vector_dim:
        metadata["vector_dim"] = vector_dim

    return ProcessingEvent(
        doc_id=doc_id,
        step="embedding",
        status=status,
        duration_ms=duration_ms,
        metadata=metadata
    )


def create_rag_event(
    doc_id: str,
    status: EventStatus,
    collection: Optional[str] = None,
    points_indexed: Optional[int] = None,
    duration_ms: int = 0
) -> ProcessingEvent:
    """Create RAG indexing event"""
    metadata = {}
    if collection:
        metadata["collection"] = collection
    if points_indexed:
        metadata["points_indexed"] = points_indexed

    return ProcessingEvent(
        doc_id=doc_id,
        step="rag_indexing",
        status=status,
        duration_ms=duration_ms,
        metadata=metadata
    )


def create_complete_event(
    doc_id: str,
    total_duration_ms: int,
    total_pages: int,
    gpu_pages: int,
    cpu_pages: int
) -> ProcessingEvent:
    """Create pipeline complete event"""
    return ProcessingEvent(
        doc_id=doc_id,
        step="complete",
        status="completed",
        duration_ms=total_duration_ms,
        metadata={
            "total_pages": total_pages,
            "gpu_pages": gpu_pages,
            "cpu_pages": cpu_pages,
        }
    )


def create_error_event(
    doc_id: str,
    error_message: str,
    step: EventStep = "error",
    duration_ms: int = 0
) -> ProcessingEvent:
    """Create error event"""
    return ProcessingEvent(
        doc_id=doc_id,
        step=step,
        status="failed",
        duration_ms=duration_ms,
        metadata={
            "error": error_message,
        }
    )


# Example usage with FastAPI
"""
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()
emitter = StatusEventEmitter()

@app.get("/events/{doc_id}")
async def stream_events(doc_id: str):
    '''SSE endpoint for document processing events'''
    client_queue = await emitter.register_client()

    return StreamingResponse(
        emitter.stream_to_client(client_queue),
        media_type="text/event-stream"
    )

# In processing worker:
async def process_document(doc_id: str):
    # Emit classification start
    await emitter.emit(create_classification_event(
        doc_id, "started"
    ))

    # ... classify page ...

    # Emit classification complete
    await emitter.emit(create_classification_event(
        doc_id, "completed", category="table", confidence=0.95, duration_ms=23
    ))

    # Emit GPU processing
    await emitter.emit(create_processing_event(
        doc_id, "in_progress", processor="granite", page_num=1
    ))
"""

# CLI test
if __name__ == "__main__":
    import asyncio

    async def test_emitter():
        emitter = StatusEventEmitter()

        # Simulate client
        client = await emitter.register_client()

        # Simulate processing events
        events = [
            create_classification_event("doc123", "started"),
            create_classification_event("doc123", "completed", category="table", confidence=0.95, duration_ms=23),
            create_processing_event("doc123", "in_progress", processor="granite", page_num=1),
            create_processing_event("doc123", "completed", processor="granite", page_num=1, confidence=0.92, duration_ms=450),
            create_chunking_event("doc123", "completed", chunk_count=15, avg_chunk_size=384, duration_ms=120),
            create_embedding_event("doc123", "completed", model="embeddinggemma", vector_dim=768, duration_ms=890),
            create_rag_event("doc123", "completed", collection="legal_docs", points_indexed=15, duration_ms=230),
            create_complete_event("doc123", total_duration_ms=1713, total_pages=1, gpu_pages=1, cpu_pages=0),
        ]

        # Emit events
        for event in events:
            await emitter.emit(event)
            print(event.to_sse())
            await asyncio.sleep(0.5)

        # Print stats
        print(f"\n{'='*60}")
        print("Emitter Statistics")
        print(f"{'='*60}")
        stats = emitter.get_stats()
        print(f"Total events:    {stats['total_events']}")
        print(f"Active clients:  {stats['active_clients']}")
        print(f"\nEvents by step:")
        for step, count in stats['events_by_step'].items():
            print(f"  {step:20s} {count}")
        print(f"{'='*60}\n")

    asyncio.run(test_emitter())
