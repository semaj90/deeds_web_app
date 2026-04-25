"""Base retriever interface for multi-source topology."""

from abc import ABC, abstractmethod
from typing import List

from ..models import Result


class BaseRetriever(ABC):
    """Abstract base class for all retrievers."""

    @abstractmethod
    async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
        """Retrieve results for a query.

        Args:
            query: The query string
            top_k: Number of top results to return

        Returns:
            List of Result objects
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the retriever is healthy and available.

        Returns:
            True if healthy, False otherwise
        """
        pass
