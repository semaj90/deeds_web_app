"""
Async Processing & Streaming

Implements async/await for I/O operations and streaming responses.

Usage:
    processor = AsyncProcessor()
    async for chunk in processor.stream_search_results(query):
        yield chunk
"""

import logging
import asyncio
from typing import AsyncGenerator, List, Dict, Optional
import json
import time

logger = logging.getLogger(__name__)


class AsyncProcessor:
    """Async processing for I/O operations"""

    def __init__(self, max_queue_size: int = 1000):
        """
        Initialize async processor.

        Args:
            max_queue_size: Maximum request queue size
        """
        self.max_queue_size = max_queue_size
        self.request_queue = asyncio.Queue(maxsize=max_queue_size)
        self.active_requests = 0

        logger.info(f"AsyncProcessor initialized (queue_size={max_queue_size})")

    async def stream_search_results(
        self, query: str, retriever_func, chunk_size: int = 5
    ) -> AsyncGenerator[str, None]:
        """
        Stream search results as they become available.

        Args:
            query: Search query
            retriever_func: Async retriever function
            chunk_size: Results per chunk

        Returns:
            Async generator yielding JSON chunks
        """
        try:
            logger.info(f"Starting stream for query: {query[:50]}...")

            # Get results
            results = await retriever_func(query)

            # Stream in chunks
            for i in range(0, len(results), chunk_size):
                chunk = results[i : i + chunk_size]

                # Yield chunk as JSON
                chunk_data = {
                    "type": "results",
                    "chunk_index": i // chunk_size,
                    "results": chunk,
                    "total": len(results),
                }

                yield json.dumps(chunk_data) + "\n"

                # Allow other tasks to run
                await asyncio.sleep(0.01)

            # Send completion
            completion = {"type": "complete", "total_results": len(results)}
            yield json.dumps(completion) + "\n"

            logger.info(f"Stream completed: {len(results)} results")

        except Exception as e:
            logger.error(f"Stream failed: {e}")
            error_msg = {"type": "error", "error": str(e)}
            yield json.dumps(error_msg) + "\n"

    async def process_batch(
        self, items: List[Dict], processor_func, batch_size: int = 10
    ) -> List[Dict]:
        """
        Process items in batches asynchronously.

        Args:
            items: Items to process
            processor_func: Async processor function
            batch_size: Batch size

        Returns:
            Processed items
        """
        try:
            logger.info(f"Processing batch: {len(items)} items")

            results = []

            for i in range(0, len(items), batch_size):
                batch = items[i : i + batch_size]

                # Process batch concurrently
                batch_results = await asyncio.gather(
                    *[processor_func(item) for item in batch]
                )

                results.extend(batch_results)

                # Allow other tasks to run
                await asyncio.sleep(0.01)

            logger.info(f"Batch processing completed: {len(results)} items")
            return results

        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            return []

    async def enqueue_request(self, request: Dict) -> bool:
        """
        Enqueue request for processing.

        Args:
            request: Request to enqueue

        Returns:
            True if enqueued, False if queue full
        """
        try:
            if self.request_queue.full():
                logger.warning("Request queue full")
                return False

            await self.request_queue.put(request)
            self.active_requests += 1

            logger.debug(f"Request enqueued (active={self.active_requests})")
            return True

        except Exception as e:
            logger.error(f"Enqueue failed: {e}")
            return False

    async def dequeue_request(self, timeout: Optional[float] = None) -> Optional[Dict]:
        """
        Dequeue request for processing.

        Args:
            timeout: Timeout in seconds

        Returns:
            Request or None if timeout
        """
        try:
            request = await asyncio.wait_for(
                self.request_queue.get(), timeout=timeout
            )
            self.active_requests -= 1

            logger.debug(f"Request dequeued (active={self.active_requests})")
            return request

        except asyncio.TimeoutError:
            logger.debug("Dequeue timeout")
            return None

        except Exception as e:
            logger.error(f"Dequeue failed: {e}")
            return None

    def get_queue_stats(self) -> Dict:
        """Get queue statistics"""
        return {
            "queue_size": self.request_queue.qsize(),
            "max_queue_size": self.max_queue_size,
            "active_requests": self.active_requests,
            "queue_full": self.request_queue.full(),
        }

    async def wait_for_completion(self, timeout: Optional[float] = None) -> bool:
        """
        Wait for all requests to complete.

        Args:
            timeout: Timeout in seconds

        Returns:
            True if completed, False if timeout
        """
        try:
            start_time = time.time()

            while self.active_requests > 0:
                if timeout and (time.time() - start_time) > timeout:
                    logger.warning("Completion timeout")
                    return False

                await asyncio.sleep(0.1)

            logger.info("All requests completed")
            return True

        except Exception as e:
            logger.error(f"Completion wait failed: {e}")
            return False


# Singleton instance
_async_processor = None


def get_async_processor() -> AsyncProcessor:
    """Get or create singleton async processor"""
    global _async_processor
    if _async_processor is None:
        _async_processor = AsyncProcessor()
    return _async_processor
