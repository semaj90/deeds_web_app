"""
KAG Expansion Engine

Wraps Neo4j KAG loader for depth-2 graph traversal and expansion.
Returns all reachable nodes and edges from a starting node.

Usage:
    expander = KAGExpander()
    nodes = expander.expand(node_id="0", depth=2)
    edges = expander.get_edges(node_id="0")
"""

import logging
from typing import List, Dict, Optional, Tuple
import time

try:
    from backend.services.kag_loader import KAGLoader
except ImportError:
    KAGLoader = None

logger = logging.getLogger(__name__)


class KAGExpander:
    """KAG expansion engine for Neo4j graph traversal"""

    def __init__(self, max_depth: int = 2, cache_size: int = 100):
        """
        Initialize KAG expander.

        Args:
            max_depth: Maximum expansion depth
            cache_size: Maximum number of cached expansions
        """
        self.kag_loader = KAGLoader() if KAGLoader else None
        self.max_depth = max_depth
        self.cache_size = cache_size
        self.expansion_cache: Dict[str, List[Dict]] = {}
        self.edge_cache: Dict[str, List[Dict]] = {}

        if self.kag_loader:
            logger.info(f"KAGExpander initialized (max_depth={max_depth})")
        else:
            logger.warning("KAGLoader not available")

    def _get_cache_key(self, node_id: str, depth: int) -> str:
        """Generate cache key for expansion"""
        return f"{node_id}:{depth}"

    def expand(self, node_id: str, depth: Optional[int] = None) -> List[Dict]:
        """
        Expand KAG from a node.

        Args:
            node_id: Starting node ID
            depth: Expansion depth (default: max_depth)

        Returns:
            List of reachable nodes with metadata
        """
        if not self.kag_loader:
            logger.warning("KAGLoader not available")
            return []

        if depth is None:
            depth = self.max_depth

        if depth > self.max_depth:
            logger.warning(f"Depth {depth} exceeds max_depth {self.max_depth}, clamping")
            depth = self.max_depth

        # Check cache
        cache_key = self._get_cache_key(node_id, depth)
        if cache_key in self.expansion_cache:
            logger.debug(f"Cache hit for expansion: {node_id} (depth={depth})")
            return self.expansion_cache[cache_key]

        try:
            start_time = time.time()

            # Expand from node
            nodes = self.kag_loader.expand_kag(node_id, depth)

            # Add metadata
            expanded_nodes = []
            for node in nodes:
                expanded_nodes.append(
                    {
                        "id": node.get("id"),
                        "symbol": node.get("symbol"),
                        "cluster": node.get("cluster"),
                        "uuid": node.get("uuid"),
                        "depth": depth,
                    }
                )

            # Cache
            if len(self.expansion_cache) >= self.cache_size:
                self.expansion_cache.pop(next(iter(self.expansion_cache)))

            self.expansion_cache[cache_key] = expanded_nodes

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(
                f"Expanded node {node_id} (depth={depth}): {len(expanded_nodes)} nodes in {elapsed_ms}ms"
            )

            return expanded_nodes

        except Exception as e:
            logger.error(f"Failed to expand KAG: {e}")
            return []

    def expand_multi(self, node_ids: List[str], depth: Optional[int] = None) -> Dict[str, List[Dict]]:
        """
        Expand KAG from multiple nodes.

        Args:
            node_ids: List of starting node IDs
            depth: Expansion depth

        Returns:
            Dictionary mapping node_id to expanded nodes
        """
        results = {}
        for node_id in node_ids:
            results[node_id] = self.expand(node_id, depth)
        return results

    def get_edges(self, node_id: str) -> List[Dict]:
        """
        Get edges from a node.

        Args:
            node_id: Node ID

        Returns:
            List of edges with metadata
        """
        if not self.kag_loader:
            logger.warning("KAGLoader not available")
            return []

        # Check cache
        if node_id in self.edge_cache:
            logger.debug(f"Cache hit for edges: {node_id}")
            return self.edge_cache[node_id]

        try:
            start_time = time.time()

            # Get edges
            edges = self.kag_loader.get_kag_edges(node_id)

            # Add metadata
            edge_list = []
            for edge in edges:
                edge_list.append(
                    {
                        "from": edge.get("from"),
                        "to": edge.get("to"),
                        "type": edge.get("type", "unknown"),
                        "weight": edge.get("weight", 0.0),
                    }
                )

            # Cache
            if len(self.edge_cache) >= self.cache_size:
                self.edge_cache.pop(next(iter(self.edge_cache)))

            self.edge_cache[node_id] = edge_list

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Got edges for node {node_id}: {len(edge_list)} edges in {elapsed_ms}ms")

            return edge_list

        except Exception as e:
            logger.error(f"Failed to get edges: {e}")
            return []

    def get_cluster_nodes(self, cluster_id: int) -> List[Dict]:
        """
        Get all nodes in a cluster.

        Args:
            cluster_id: Cluster ID

        Returns:
            List of nodes in cluster
        """
        if not self.kag_loader:
            logger.warning("KAGLoader not available")
            return []

        try:
            nodes = self.kag_loader.get_cluster_nodes(cluster_id)

            cluster_nodes = []
            for node in nodes:
                cluster_nodes.append(
                    {
                        "id": node.get("id"),
                        "symbol": node.get("symbol"),
                        "uuid": node.get("uuid"),
                        "cluster": cluster_id,
                    }
                )

            logger.debug(f"Got cluster {cluster_id}: {len(cluster_nodes)} nodes")
            return cluster_nodes

        except Exception as e:
            logger.error(f"Failed to get cluster nodes: {e}")
            return []

    def verify_kag(self) -> Tuple[bool, List[str]]:
        """
        Verify KAG integrity.

        Returns:
            Tuple of (is_valid, errors)
        """
        if not self.kag_loader:
            return False, ["KAGLoader not available"]

        try:
            is_valid, errors = self.kag_loader.verify_kag_integrity()
            return is_valid, errors
        except Exception as e:
            return False, [f"Verification failed: {e}"]

    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        return {
            "expansion_cache_size": len(self.expansion_cache),
            "edge_cache_size": len(self.edge_cache),
            "max_cache_size": self.cache_size,
            "max_depth": self.max_depth,
        }

    def clear_cache(self) -> None:
        """Clear all caches"""
        self.expansion_cache.clear()
        self.edge_cache.clear()
        logger.info("Cleared KAG expansion caches")

    def close(self) -> None:
        """Close KAG loader connection"""
        if self.kag_loader:
            self.kag_loader.close()
            logger.info("Closed KAG loader")


# Singleton instance
_kag_expander = None


def get_kag_expander() -> KAGExpander:
    """Get or create singleton KAG expander"""
    global _kag_expander
    if _kag_expander is None:
        _kag_expander = KAGExpander()
    return _kag_expander
