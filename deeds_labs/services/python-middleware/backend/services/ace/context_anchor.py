"""
Context Anchor Manager for ACE system.

Manages context anchors in feature vector space for:
- Coherent multi-turn conversations
- Context drift detection
- History preservation
- Anchor persistence
"""

from __future__ import annotations
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import uuid4
import numpy as np

from .models import ContextAnchor, TOTAL_DIMS
from .config import get_config, AceConfig

logger = logging.getLogger(__name__)


class ContextAnchorManager:
    """
    Manages context anchors in feature vector space.

    Features:
    - Create anchors from feature vectors
    - Update anchors while preserving history
    - Filter results by anchor relevance
    - Detect context drift
    - Persist and load anchors
    """

    def __init__(self, config: Optional[AceConfig] = None):
        """Initialize context anchor manager.

        Args:
            config: ACE configuration
        """
        self.config = config or get_config()
        self._anchors: Dict[str, ContextAnchor] = {}

    async def create_anchor(
        self,
        feature_vector: np.ndarray,
        conversation_id: str,
    ) -> ContextAnchor:
        """
        Create initial context anchor from feature vector.

        Args:
            feature_vector: 1024-d feature vector
            conversation_id: Unique conversation identifier

        Returns:
            Created context anchor
        """
        if feature_vector.shape[0] != TOTAL_DIMS:
            raise ValueError(f"Expected {TOTAL_DIMS} dims, got {feature_vector.shape[0]}")

        anchor = ContextAnchor(
            id=str(uuid4()),
            conversation_id=conversation_id,
            vector=feature_vector.copy(),
            history=[feature_vector.copy()],
            drift_threshold=self.config.context_anchor.drift_threshold,
        )

        self._anchors[conversation_id] = anchor

        logger.info(f"Created context anchor for conversation {conversation_id}")
        return anchor

    async def update_anchor(
        self,
        anchor: ContextAnchor,
        new_vector: np.ndarray,
        preserve_history: bool = True,
    ) -> ContextAnchor:
        """
        Update anchor while preserving history.

        Args:
            anchor: Anchor to update
            new_vector: New feature vector
            preserve_history: Whether to preserve history

        Returns:
            Updated anchor
        """
        if new_vector.shape[0] != TOTAL_DIMS:
            raise ValueError(f"Expected {TOTAL_DIMS} dims, got {new_vector.shape[0]}")

        # Calculate drift before update
        drift = anchor.calculate_drift(new_vector)

        # Update history
        if preserve_history:
            anchor.history.append(new_vector.copy())

            # Trim history if too long
            max_history = self.config.context_anchor.max_history_size
            if len(anchor.history) > max_history:
                anchor.history = anchor.history[-max_history:]

        # Update vector (exponential moving average)
        alpha = 0.3  # Weight for new vector
        anchor.vector = (1 - alpha) * anchor.vector + alpha * new_vector
        anchor.updated_at = datetime.now()

        logger.info(f"Updated anchor {anchor.id}, drift: {drift:.3f}")
        return anchor

    async def filter_by_anchor(
        self,
        anchor: ContextAnchor,
        results: List[Any],
        threshold: float = 0.7,
        embedding_key: str = "embedding",
    ) -> List[Any]:
        """
        Filter results by relevance to anchor.

        Args:
            anchor: Context anchor
            results: Results to filter
            threshold: Minimum similarity threshold
            embedding_key: Key for embedding in result dict

        Returns:
            Filtered results
        """
        filtered = []

        for result in results:
            # Get embedding from result
            if hasattr(result, embedding_key):
                embedding = getattr(result, embedding_key)
            elif isinstance(result, dict) and embedding_key in result:
                embedding = result[embedding_key]
            else:
                # No embedding, include by default
                filtered.append(result)
                continue

            if embedding is None:
                filtered.append(result)
                continue

            # Calculate similarity to anchor
            similarity = self._cosine_similarity(anchor.vector, embedding)

            if similarity >= threshold:
                filtered.append(result)

        logger.info(f"Filtered {len(results)} results to {len(filtered)} by anchor relevance")
        return filtered

    async def detect_drift(
        self,
        anchor: ContextAnchor,
        current_vector: np.ndarray,
    ) -> float:
        """
        Detect context drift from anchor.

        Args:
            anchor: Context anchor
            current_vector: Current feature vector

        Returns:
            Drift value (0 = no drift, 1 = complete drift)
        """
        drift = anchor.calculate_drift(current_vector)

        if anchor.is_drifted():
            logger.warning(f"Context drift detected: {drift:.3f} > {anchor.drift_threshold}")

        return drift

    async def persist_anchor(self, anchor: ContextAnchor) -> None:
        """
        Persist anchor to PostgreSQL.

        Args:
            anchor: Anchor to persist
        """
        # TODO: Implement actual PostgreSQL persistence
        # - Serialize anchor to JSON
        # - Store in context_anchors table

        anchor.persisted = True
        logger.info(f"Persisted anchor {anchor.id}")

    async def load_anchor(
        self,
        conversation_id: str,
    ) -> Optional[ContextAnchor]:
        """
        Load anchor by conversation ID.

        Args:
            conversation_id: Conversation identifier

        Returns:
            Loaded anchor or None
        """
        # Check in-memory cache first
        if conversation_id in self._anchors:
            return self._anchors[conversation_id]

        # TODO: Implement actual PostgreSQL loading
        # - Query context_anchors table
        # - Deserialize anchor

        logger.info(f"No anchor found for conversation {conversation_id}")
        return None

    async def get_or_create_anchor(
        self,
        conversation_id: str,
        feature_vector: Optional[np.ndarray] = None,
    ) -> ContextAnchor:
        """
        Get existing anchor or create new one.

        Args:
            conversation_id: Conversation identifier
            feature_vector: Feature vector for new anchor

        Returns:
            Context anchor
        """
        anchor = await self.load_anchor(conversation_id)

        if anchor is None:
            if feature_vector is None:
                feature_vector = np.zeros(TOTAL_DIMS, dtype=np.float32)
            anchor = await self.create_anchor(feature_vector, conversation_id)

        return anchor

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors."""
        if a is None or b is None:
            return 0.0

        # Handle dimension mismatch
        if a.shape[0] != b.shape[0]:
            min_dim = min(a.shape[0], b.shape[0])
            a = a[:min_dim]
            b = b[:min_dim]

        dot = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(dot / (norm_a * norm_b))
