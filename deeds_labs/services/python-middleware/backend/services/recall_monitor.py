"""
Semantic Recall Monitor

Monitors semantic recall from Qdrant results and triggers SOM fallback
when recall drops below threshold.

Usage:
    monitor = RecallMonitor(threshold=0.5)
    should_fallback = monitor.check_recall(qdrant_results)
    fallback_results = monitor.get_fallback_results(query_embedding)
"""

import logging
import numpy as np
from typing import List, Dict, Optional, Tuple
import time
from dataclasses import dataclass

try:
    from backend.services.som_engine import get_som_engine
except ImportError:
    get_som_engine = None

logger = logging.getLogger(__name__)


@dataclass
class RecallMetrics:
    """Recall metrics for monitoring"""

    recall_score: float
    num_results: int
    avg_score: float
    max_score: float
    min_score: float
    fallback_triggered: bool
    timestamp: float


class RecallMonitor:
    """Monitor semantic recall and trigger fallback"""

    def __init__(self, threshold: float = 0.5, min_results: int = 5):
        """
        Initialize recall monitor.

        Args:
            threshold: Recall threshold for fallback activation
            min_results: Minimum number of results required
        """
        self.threshold = threshold
        self.min_results = min_results
        self.som_engine = get_som_engine() if get_som_engine else None

        # Metrics history
        self.metrics_history: List[RecallMetrics] = []
        self.max_history = 1000

        logger.info(f"RecallMonitor initialized (threshold={threshold}, min_results={min_results})")

    def check_recall(self, qdrant_results: List[Dict]) -> Tuple[bool, RecallMetrics]:
        """
        Check semantic recall and determine if fallback is needed.

        Args:
            qdrant_results: Results from Qdrant search

        Returns:
            Tuple of (should_fallback, metrics)
        """
        try:
            # Extract scores
            scores = [float(r.get("score", 0.0)) for r in qdrant_results]

            if not scores:
                # No results - definitely fallback
                metrics = RecallMetrics(
                    recall_score=0.0,
                    num_results=0,
                    avg_score=0.0,
                    max_score=0.0,
                    min_score=0.0,
                    fallback_triggered=True,
                    timestamp=time.time(),
                )
                self._record_metrics(metrics)
                return True, metrics

            # Compute recall metrics
            avg_score = np.mean(scores)
            max_score = np.max(scores)
            min_score = np.min(scores)

            # Recall score: combination of average score and result count
            # Higher average score and more results = higher recall
            result_factor = min(len(scores) / self.min_results, 1.0)
            recall_score = (avg_score + result_factor) / 2.0

            # Determine if fallback is needed
            should_fallback = recall_score < self.threshold

            metrics = RecallMetrics(
                recall_score=recall_score,
                num_results=len(scores),
                avg_score=avg_score,
                max_score=max_score,
                min_score=min_score,
                fallback_triggered=should_fallback,
                timestamp=time.time(),
            )

            self._record_metrics(metrics)

            if should_fallback:
                logger.warning(
                    f"Low semantic recall ({recall_score:.2f} < {self.threshold}), "
                    f"triggering SOM fallback"
                )
            else:
                logger.debug(f"Semantic recall OK ({recall_score:.2f})")

            return should_fallback, metrics

        except Exception as e:
            logger.error(f"Recall check failed: {e}")
            metrics = RecallMetrics(
                recall_score=0.0,
                num_results=0,
                avg_score=0.0,
                max_score=0.0,
                min_score=0.0,
                fallback_triggered=True,
                timestamp=time.time(),
            )
            return True, metrics

    def get_fallback_results(
        self, query_embedding: np.ndarray, top_k: int = 10
    ) -> List[Dict]:
        """
        Get fallback results from SOM clustering.

        Args:
            query_embedding: Query embedding vector
            top_k: Number of results to return

        Returns:
            List of fallback results
        """
        try:
            if self.som_engine is None:
                logger.warning("SOM engine not available for fallback")
                return []

            # Get cluster neighbors from SOM
            neighbors = self.som_engine.get_cluster_neighbors(query_embedding, k=top_k)

            # Convert to result format
            results = [
                {
                    "id": str(n["node_id"]),
                    "text": f"SOM Cluster Node {n['node_id']}",
                    "score": 1.0 - (n["distance"] / 10.0),  # Normalize distance to score
                    "source": "som_fallback",
                    "distance": n["distance"],
                    "activation_count": n["activation_count"],
                }
                for n in neighbors
            ]

            logger.debug(f"Generated {len(results)} fallback results from SOM")
            return results

        except Exception as e:
            logger.error(f"Fallback result generation failed: {e}")
            return []

    def blend_results(
        self,
        semantic_results: List[Dict],
        fallback_results: List[Dict],
        semantic_weight: float = 0.7,
    ) -> List[Dict]:
        """
        Blend semantic and fallback results.

        Args:
            semantic_results: Results from semantic search
            fallback_results: Results from SOM fallback
            semantic_weight: Weight for semantic results (0-1)

        Returns:
            Blended results
        """
        try:
            blended = {}

            # Add semantic results
            for result in semantic_results:
                result_id = str(result.get("id", ""))
                score = float(result.get("score", 0.0))
                blended[result_id] = {
                    "id": result_id,
                    "text": result.get("text", ""),
                    "semantic_score": score,
                    "fallback_score": 0.0,
                    "source": "semantic",
                }

            # Add fallback results
            for result in fallback_results:
                result_id = str(result.get("id", ""))
                score = float(result.get("score", 0.0))

                if result_id in blended:
                    # Blend with existing semantic result
                    blended[result_id]["fallback_score"] = score
                    blended[result_id]["source"] = "blended"
                else:
                    # New result from fallback
                    blended[result_id] = {
                        "id": result_id,
                        "text": result.get("text", ""),
                        "semantic_score": 0.0,
                        "fallback_score": score,
                        "source": "fallback",
                    }

            # Compute final scores
            final_results = []
            for result in blended.values():
                final_score = (
                    semantic_weight * result["semantic_score"]
                    + (1.0 - semantic_weight) * result["fallback_score"]
                )
                result["final_score"] = final_score
                final_results.append(result)

            # Sort by final score
            final_results.sort(key=lambda x: x["final_score"], reverse=True)

            logger.debug(f"Blended {len(semantic_results)} semantic + {len(fallback_results)} fallback")
            return final_results

        except Exception as e:
            logger.error(f"Result blending failed: {e}")
            return semantic_results

    def _record_metrics(self, metrics: RecallMetrics) -> None:
        """Record metrics for monitoring"""
        self.metrics_history.append(metrics)

        # Keep history size bounded
        if len(self.metrics_history) > self.max_history:
            self.metrics_history = self.metrics_history[-self.max_history :]

    def get_metrics_summary(self) -> Dict:
        """Get summary of recent metrics"""
        if not self.metrics_history:
            return {
                "avg_recall": 0.0,
                "fallback_rate": 0.0,
                "num_samples": 0,
            }

        recalls = [m.recall_score for m in self.metrics_history]
        fallbacks = [m.fallback_triggered for m in self.metrics_history]

        return {
            "avg_recall": float(np.mean(recalls)),
            "max_recall": float(np.max(recalls)),
            "min_recall": float(np.min(recalls)),
            "fallback_rate": float(np.mean(fallbacks)),
            "num_samples": len(self.metrics_history),
        }

    def clear_history(self) -> None:
        """Clear metrics history"""
        self.metrics_history.clear()
        logger.info("Cleared recall metrics history")


# Singleton instance
_recall_monitor = None


def get_recall_monitor() -> RecallMonitor:
    """Get or create singleton recall monitor"""
    global _recall_monitor
    if _recall_monitor is None:
        _recall_monitor = RecallMonitor()
    return _recall_monitor
