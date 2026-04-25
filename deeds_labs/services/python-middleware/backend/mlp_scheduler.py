"""
MLP Scheduler: Multi-process Worker Pool with Redis Streams

Orchestrates GPU workers for:
- Document OCR (DocLing)
- Embedding generation (EmbeddingGemma)
- Reranking (MiniLM)
- Citation extraction
- Statute classification

Uses asyncio + Redis Streams for task queue (zero external dependencies).
Runs under supervisord with multiple worker processes.
"""

import asyncio
import logging
import json
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
import multiprocessing

import redis.asyncio as aioredis
import asyncpg

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class TaskType(str, Enum):
    """Task types for MLP workers"""
    RERANK = "rerank"
    CITATION_EXTRACT = "citation_extract"
    STATUTE_CLASSIFY = "statute_classify"
    EMBEDDING_NORMALIZE = "embedding_normalize"
    METADATA_LINK = "metadata_link"


class TaskStatus(str, Enum):
    """Task status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class MLPTask:
    """Task for MLP workers"""
    task_id: str
    task_type: TaskType
    status: TaskStatus
    payload: Dict[str, Any]
    result: Optional[Dict] = None
    error: Optional[str] = None
    created_at: str = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()

    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type.value,
            "status": self.status.value,
            "payload": self.payload,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


class MLPScheduler:
    """
    Schedules and manages MLP tasks via Redis Streams.

    Architecture:
    - Redis Stream: mlp:tasks (task queue)
    - Redis Stream: mlp:results (result queue)
    - Redis Hash: mlp:task:{task_id} (task state)
    """

    STREAM_TASKS = "mlp:tasks"
    STREAM_RESULTS = "mlp:results"
    CONSUMER_GROUP = "mlp-workers"
    BATCH_SIZE = 32

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        postgres_url: str = "postgresql://user:password@localhost/legal_db",
        worker_id: str = None,
    ):
        self.redis_url = redis_url
        self.postgres_url = postgres_url
        self.worker_id = worker_id or f"worker_{uuid.uuid4().hex[:8]}"

        self.redis_client: Optional[aioredis.Redis] = None
        self.postgres_pool: Optional[asyncpg.Pool] = None

    async def initialize(self) -> None:
        """Initialize connections"""
        # Redis
        self.redis_client = await aioredis.from_url(
            self.redis_url,
            encoding="utf8",
            decode_responses=False,
        )
        await self.redis_client.ping()
        logger.info(f"✅ Redis connected (worker: {self.worker_id})")

        # Postgres
        self.postgres_pool = await asyncpg.create_pool(
            self.postgres_url,
            min_size=2,
            max_size=10,
        )
        logger.info("✅ Postgres connected")

        # Ensure consumer group exists
        try:
            await self.redis_client.xgroup_create(
                self.STREAM_TASKS,
                self.CONSUMER_GROUP,
                id="0",
                mkstream=True,
            )
        except Exception:
            pass  # Group already exists

    async def submit_task(
        self,
        task_type: TaskType,
        payload: Dict[str, Any],
    ) -> str:
        """Submit a task to the queue"""
        task_id = str(uuid.uuid4())
        task = MLPTask(
            task_id=task_id,
            task_type=task_type,
            status=TaskStatus.PENDING,
            payload=payload,
        )

        # Add to stream
        await self.redis_client.xadd(
            self.STREAM_TASKS,
            {"data": json.dumps(task.to_dict())},
        )

        # Store task state
        await self.redis_client.hset(
            f"mlp:task:{task_id}",
            mapping=task.to_dict(),
        )
        await self.redis_client.expire(f"mlp:task:{task_id}", 86400)  # 24 hours

        logger.info(f"📝 Submitted task: {task_id} ({task_type.value})")
        return task_id

    async def start_worker_loop(self) -> None:
        """Start worker loop (runs in separate process)"""
        logger.info(f"🔄 Starting worker loop: {self.worker_id}")

        while True:
            try:
                # Read from stream
                messages = await self.redis_client.xreadgroup(
                    {self.STREAM_TASKS: ">"},
                    self.CONSUMER_GROUP,
                    self.worker_id,
                    count=1,
                    block=1000,
                )

                if not messages:
                    continue

                for stream, stream_messages in messages:
                    for message_id, data in stream_messages:
                        try:
                            task_data = json.loads(data[b"data"])
                            task = MLPTask(**task_data)

                            # Process task
                            result = await self._process_task(task)

                            # Store result
                            await self._store_result(task.task_id, result)

                            # Acknowledge
                            await self.redis_client.xack(
                                self.STREAM_TASKS,
                                self.CONSUMER_GROUP,
                                message_id,
                            )

                            logger.info(f"✅ Completed task: {task.task_id}")

                        except Exception as e:
                            logger.error(f"❌ Error processing task: {e}")

            except Exception as e:
                logger.error(f"Error in worker loop: {e}")
                await asyncio.sleep(1)

    async def _process_task(self, task: MLPTask) -> Dict:
        """Process a task based on type"""
        task.status = TaskStatus.PROCESSING
        task.started_at = datetime.now().isoformat()

        try:
            if task.task_type == TaskType.RERANK:
                result = await self._rerank(task.payload)
            elif task.task_type == TaskType.CITATION_EXTRACT:
                result = await self._extract_citations(task.payload)
            elif task.task_type == TaskType.STATUTE_CLASSIFY:
                result = await self._classify_statute(task.payload)
            elif task.task_type == TaskType.EMBEDDING_NORMALIZE:
                result = await self._normalize_embedding(task.payload)
            elif task.task_type == TaskType.METADATA_LINK:
                result = await self._link_metadata(task.payload)
            else:
                raise ValueError(f"Unknown task type: {task.task_type}")

            task.status = TaskStatus.COMPLETED
            task.result = result
            return result

        except Exception as e:
            logger.error(f"Error processing task {task.task_id}: {e}")
            task.status = TaskStatus.FAILED
            task.error = str(e)
            raise

        finally:
            task.completed_at = datetime.now().isoformat()

    async def _rerank(self, payload: Dict) -> Dict:
        """Rerank top-K results to top-5"""
        # Mock implementation (would use MiniLM in production)
        top_k_results = payload.get("results", [])
        reranked = top_k_results[:5]  # Simple truncation for now

        return {
            "reranked_results": reranked,
            "count": len(reranked),
        }

    async def _extract_citations(self, payload: Dict) -> Dict:
        """Extract statute citations from text"""
        text = payload.get("text", "")
        chunk_id = payload.get("chunk_id", "")

        # Mock implementation (would use NER + statute matcher in production)
        citations = []
        if "statute" in text.lower() or "code" in text.lower():
            citations.append({
                "statute_code": "PC 245",
                "statute_title": "Assault",
                "confidence": 0.8,
            })

        return {
            "chunk_id": chunk_id,
            "citations": citations,
            "count": len(citations),
        }

    async def _classify_statute(self, payload: Dict) -> Dict:
        """Classify statute by legal domain"""
        statute_code = payload.get("statute_code", "")
        text = payload.get("text", "")

        # Mock implementation (would use classifier in production)
        domain = "criminal"
        if "contract" in text.lower():
            domain = "contract"
        elif "employment" in text.lower():
            domain = "employment"

        return {
            "statute_code": statute_code,
            "legal_domain": domain,
            "confidence": 0.85,
        }

    async def _normalize_embedding(self, payload: Dict) -> Dict:
        """Normalize embedding for cosine distance"""
        embedding = payload.get("embedding", [])
        chunk_id = payload.get("chunk_id", "")

        # Mock implementation (would use numpy in production)
        import math
        norm = math.sqrt(sum(x**2 for x in embedding))
        if norm > 0:
            normalized = [x / norm for x in embedding]
        else:
            normalized = embedding

        return {
            "chunk_id": chunk_id,
            "normalized_embedding": normalized,
            "norm": norm,
        }

    async def _link_metadata(self, payload: Dict) -> Dict:
        """Link embedding to case/statute metadata"""
        embedding_id = payload.get("embedding_id", "")
        case_id = payload.get("case_id")
        statute_code = payload.get("statute_code")

        # Mock implementation (would query Postgres in production)
        links = []
        if case_id:
            links.append({"type": "case", "id": case_id})
        if statute_code:
            links.append({"type": "statute", "id": statute_code})

        return {
            "embedding_id": embedding_id,
            "links": links,
            "count": len(links),
        }

    async def _store_result(self, task_id: str, result: Dict) -> None:
        """Store task result in Redis"""
        await self.redis_client.xadd(
            self.STREAM_RESULTS,
            {"task_id": task_id, "result": json.dumps(result)},
        )

        # Update task state
        await self.redis_client.hset(
            f"mlp:task:{task_id}",
            "result",
            json.dumps(result),
        )

    async def get_task_status(self, task_id: str) -> Optional[Dict]:
        """Get task status"""
        data = await self.redis_client.hgetall(f"mlp:task:{task_id}")
        if data:
            return {k.decode(): v.decode() if isinstance(v, bytes) else v for k, v in data.items()}
        return None

    async def close(self) -> None:
        """Close connections"""
        if self.redis_client:
            await self.redis_client.close()
        if self.postgres_pool:
            await self.postgres_pool.close()


async def worker_main():
    """Main entry point for worker process"""
    scheduler = MLPScheduler(
        redis_url="redis://localhost:6379/0",
        postgres_url="postgresql://postgres:password@localhost/legal_db",
    )

    try:
        await scheduler.initialize()
        await scheduler.start_worker_loop()
    except KeyboardInterrupt:
        logger.info("Shutting down worker...")
    finally:
        await scheduler.close()


if __name__ == "__main__":
    asyncio.run(worker_main())
