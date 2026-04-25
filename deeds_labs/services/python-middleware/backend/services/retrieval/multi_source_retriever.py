"""Multi-source retriever orchestrating multiple sources."""

import asyncio
import logging
from typing import Dict, List

from .models import Result, RoutingStrategy
from .sources.base_retriever import BaseRetriever

logger = logging.getLogger(__name__)


class MultiSourceRetriever:
    """Orchestrates retrieval from multiple sources."""

    def __init__(self, retrievers: Dict[str, BaseRetriever]):
        """Initialize MultiSourceRetriever.

        Args:
            retrievers: Dictionary mapping source names to retriever instances
        """
        self.retrievers = retrievers
        self.available_sources = set(retrievers.keys())

    async def retrieve_multi_source(
        self,
        query: str,
        sources: List[str],
        parallel: bool = True,
        timeout: int = 30,
    ) -> Dict[str, List[Result]]:
        """Retrieve from multiple sources.

        Args:
            query: The query string
            sources: List of source names to query
            parallel: Whether to execute in parallel
            timeout: Timeout per source in seconds

        Returns:
            Dictionary mapping source names to result lists
        """
        results = {}

        # Filter to available sources
        available = [s for s in sources if s in self.available_sources]

        if not available:
            logger.warning(f"No available sources for query: {query}")
            return results

        if parallel:
            results = await self._retrieve_parallel(available, query, timeout)
        else:
            results = await self._retrieve_sequential(available, query, timeout)

        return results

    async def _retrieve_parallel(
        self, sources: List[str], query: str, timeout: int
    ) -> Dict[str, List[Result]]:
        """Retrieve from sources in parallel.

        Args:
            sources: List of source names
            query: The query string
            timeout: Timeout per source

        Returns:
            Dictionary mapping source names to result lists
        """
        tasks = {}
        for source in sources:
            if source in self.retrievers:
                tasks[source] = asyncio.create_task(
                    self._retrieve_with_timeout(source, query, timeout)
                )

        results = {}
        for source, task in tasks.items():
            try:
                results[source] = await task
            except asyncio.TimeoutError:
                logger.warning(f"Timeout retrieving from {source}")
                results[source] = []
            except Exception as e:
                logger.error(f"Error retrieving from {source}: {e}")
                results[source] = []

        return results

    async def _retrieve_sequential(
        self, sources: List[str], query: str, timeout: int
    ) -> Dict[str, List[Result]]:
        """Retrieve from sources sequentially.

        Args:
            sources: List of source names
            query: The query string
            timeout: Timeout per source

        Returns:
            Dictionary mapping source names to result lists
        """
        results = {}
        for source in sources:
            try:
                results[source] = await self._retrieve_with_timeout(
                    source, query, timeout
                )
            except asyncio.TimeoutError:
                logger.warning(f"Timeout retrieving from {source}")
                results[source] = []
            except Exception as e:
                logger.error(f"Error retrieving from {source}: {e}")
                results[source] = []

        return results

    async def _retrieve_with_timeout(
        self, source: str, query: str, timeout: int
    ) -> List[Result]:
        """Retrieve from a source with timeout.

        Args:
            source: Source name
            query: The query string
            timeout: Timeout in seconds

        Returns:
            List of results
        """
        if source not in self.retrievers:
            return []

        retriever = self.retrievers[source]
        try:
            results = await asyncio.wait_for(
                retriever.retrieve(query), timeout=timeout
            )
            return results
        except asyncio.TimeoutError:
            logger.warning(f"Timeout retrieving from {source}")
            raise
        except Exception as e:
            logger.error(f"Error retrieving from {source}: {e}")
            raise

    async def health_check(self) -> Dict[str, bool]:
        """Check health of all retrievers.

        Returns:
            Dictionary mapping source names to health status
        """
        health_status = {}

        tasks = {
            source: asyncio.create_task(retriever.health_check())
            for source, retriever in self.retrievers.items()
        }

        for source, task in tasks.items():
            try:
                health_status[source] = await task
            except Exception as e:
                logger.error(f"Health check failed for {source}: {e}")
                health_status[source] = False

        return health_status

    def register_retriever(self, name: str, retriever: BaseRetriever) -> None:
        """Register a new retriever.

        Args:
            name: Name of the retriever
            retriever: Retriever instance
        """
        self.retrievers[name] = retriever
        self.available_sources.add(name)
        logger.info(f"Registered retriever: {name}")

    def unregister_retriever(self, name: str) -> None:
        """Unregister a retriever.

        Args:
            name: Name of the retriever
        """
        if name in self.retrievers:
            del self.retrievers[name]
            self.available_sources.discard(name)
            logger.info(f"Unregistered retriever: {name}")
