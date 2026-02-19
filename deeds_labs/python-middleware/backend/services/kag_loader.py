"""
Neo4j KAG (Knowledge-Action Graph) Loader

Loads runes into Neo4j as a knowledge-action graph for reasoning.
Creates RUNE nodes, assigns cluster IDs, and establishes edges.

Usage:
    loader = KAGLoader()
    loader.load_kag(rune_bank)
    results = loader.expand_kag(node_id, depth=2)
"""

import logging
from typing import List, Dict, Optional, Tuple
import os

try:
    from neo4j import GraphDatabase, Session
except ImportError:
    GraphDatabase = None
    Session = None

logger = logging.getLogger(__name__)


class KAGLoader:
    """Neo4j Knowledge-Action Graph loader"""

    def __init__(
        self,
        uri: str = "bolt://localhost:7687",
        user: str = "neo4j",
        password: str = "password",
    ):
        """
        Initialize KAG loader.

        Args:
            uri: Neo4j connection URI
            user: Neo4j username
            password: Neo4j password
        """
        self.uri = uri
        self.user = user
        self.password = password
        self.driver = None
        self.session = None

        self._connect()

    def _connect(self) -> None:
        """Connect to Neo4j."""
        if GraphDatabase is None:
            logger.warning("neo4j driver not installed, KAG disabled")
            return

        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            # Test connection
            with self.driver.session() as session:
                session.run("RETURN 1")
            logger.info(f"Connected to Neo4j at {self.uri}")
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            self.driver = None

    def load_kag(self, rune_bank: List[Dict]) -> bool:
        """
        Load runes into Neo4j as KAG nodes.

        Args:
            rune_bank: List of rune entries

        Returns:
            True if successful, False otherwise
        """
        if self.driver is None:
            logger.warning("Neo4j not connected")
            return False

        try:
            with self.driver.session() as session:
                # Clear existing runes
                session.run("MATCH (n:RUNE) DETACH DELETE n")

                # Create rune nodes
                for idx, rune in enumerate(rune_bank):
                    cluster_id = idx % 4  # 4 clusters

                    session.run(
                        """
                        CREATE (n:RUNE {
                            symbol: $symbol,
                            rune_id: $rune_id,
                            tensor_uuid: $tensor_uuid,
                            cluster_id: $cluster_id,
                            tile_index: $tile_index
                        })
                        """,
                        symbol=rune.get("rune"),
                        rune_id=idx,
                        tensor_uuid=rune.get("tensor_uuid"),
                        cluster_id=cluster_id,
                        tile_index=rune.get("tile_index"),
                    )

                # Create edges based on semantic similarity
                self._create_edges(session, rune_bank)

                logger.info(f"Loaded {len(rune_bank)} runes into Neo4j")
                return True

        except Exception as e:
            logger.error(f"Failed to load KAG: {e}")
            return False

    def _create_edges(self, session: Session, rune_bank: List[Dict]) -> None:
        """
        Create edges between runes based on semantic similarity.

        Args:
            session: Neo4j session
            rune_bank: List of rune entries
        """
        try:
            # Create edges between runes in same cluster
            for idx, rune in enumerate(rune_bank):
                cluster_id = idx % 4

                # Find other runes in same cluster
                for other_idx, other_rune in enumerate(rune_bank):
                    if other_idx <= idx:
                        continue

                    other_cluster_id = other_idx % 4

                    if cluster_id == other_cluster_id:
                        # Create edge
                        session.run(
                            """
                            MATCH (a:RUNE {rune_id: $a_id}), (b:RUNE {rune_id: $b_id})
                            CREATE (a)-[r:RELATED {
                                type: 'semantic',
                                weight: $weight
                            }]->(b)
                            """,
                            a_id=idx,
                            b_id=other_idx,
                            weight=0.8,  # Default weight
                        )

            logger.info("Created KAG edges")

        except Exception as e:
            logger.error(f"Failed to create edges: {e}")

    def expand_kag(self, node_id: str, depth: int = 2) -> List[Dict]:
        """
        Expand KAG from a node.

        Args:
            node_id: Starting node ID
            depth: Expansion depth

        Returns:
            List of reachable nodes
        """
        if self.driver is None:
            logger.warning("Neo4j not connected")
            return []

        try:
            with self.driver.session() as session:
                # Query for reachable nodes
                query = f"""
                MATCH (start:RUNE {{rune_id: $node_id}})
                MATCH (start)-[r*1..{depth}]-(end:RUNE)
                RETURN DISTINCT end.rune_id as id, end.symbol as symbol,
                       end.cluster_id as cluster, end.tensor_uuid as uuid
                """

                results = session.run(query, node_id=int(node_id))

                nodes = []
                for record in results:
                    nodes.append(
                        {
                            "id": record["id"],
                            "symbol": record["symbol"],
                            "cluster": record["cluster"],
                            "uuid": record["uuid"],
                        }
                    )

                logger.info(f"Expanded KAG from node {node_id}: {len(nodes)} nodes")
                return nodes

        except Exception as e:
            logger.error(f"Failed to expand KAG: {e}")
            return []

    def get_kag_edges(self, node_id: str) -> List[Dict]:
        """
        Get edges from a node.

        Args:
            node_id: Node ID

        Returns:
            List of edges
        """
        if self.driver is None:
            logger.warning("Neo4j not connected")
            return []

        try:
            with self.driver.session() as session:
                query = """
                MATCH (start:RUNE {rune_id: $node_id})-[r]->(end:RUNE)
                RETURN start.rune_id as from_id, end.rune_id as to_id,
                       r.type as type, r.weight as weight
                """

                results = session.run(query, node_id=int(node_id))

                edges = []
                for record in results:
                    edges.append(
                        {
                            "from": record["from_id"],
                            "to": record["to_id"],
                            "type": record["type"],
                            "weight": record["weight"],
                        }
                    )

                return edges

        except Exception as e:
            logger.error(f"Failed to get KAG edges: {e}")
            return []

    def get_cluster_nodes(self, cluster_id: int) -> List[Dict]:
        """
        Get all nodes in a cluster.

        Args:
            cluster_id: Cluster ID

        Returns:
            List of nodes
        """
        if self.driver is None:
            logger.warning("Neo4j not connected")
            return []

        try:
            with self.driver.session() as session:
                query = """
                MATCH (n:RUNE {cluster_id: $cluster_id})
                RETURN n.rune_id as id, n.symbol as symbol, n.tensor_uuid as uuid
                """

                results = session.run(query, cluster_id=cluster_id)

                nodes = []
                for record in results:
                    nodes.append(
                        {
                            "id": record["id"],
                            "symbol": record["symbol"],
                            "uuid": record["uuid"],
                        }
                    )

                return nodes

        except Exception as e:
            logger.error(f"Failed to get cluster nodes: {e}")
            return []

    def verify_kag_integrity(self) -> Tuple[bool, List[str]]:
        """
        Verify KAG integrity.

        Returns:
            Tuple of (is_valid, errors)
        """
        if self.driver is None:
            return False, ["Neo4j not connected"]

        errors = []

        try:
            with self.driver.session() as session:
                # Check node count
                result = session.run("MATCH (n:RUNE) RETURN count(n) as count")
                node_count = result.single()["count"]

                if node_count != 26:
                    errors.append(f"Expected 26 nodes, got {node_count}")

                # Check for isolated nodes
                result = session.run(
                    "MATCH (n:RUNE) WHERE NOT (n)-[]-() RETURN count(n) as count"
                )
                isolated = result.single()["count"]

                if isolated > 0:
                    errors.append(f"Found {isolated} isolated nodes")

                # Check edge count
                result = session.run("MATCH ()-[r:RELATED]->() RETURN count(r) as count")
                edge_count = result.single()["count"]

                if edge_count == 0:
                    errors.append("No edges found")

                return len(errors) == 0, errors

        except Exception as e:
            return False, [f"Verification failed: {e}"]

    def close(self) -> None:
        """Close Neo4j connection."""
        if self.driver:
            self.driver.close()
            logger.info("Closed Neo4j connection")


# Convenience functions

def load_kag(rune_bank: List[Dict]) -> bool:
    """Load KAG (convenience function)."""
    loader = KAGLoader()
    result = loader.load_kag(rune_bank)
    loader.close()
    return result


def expand_kag(node_id: str, depth: int = 2) -> List[Dict]:
    """Expand KAG (convenience function)."""
    loader = KAGLoader()
    results = loader.expand_kag(node_id, depth)
    loader.close()
    return results


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    # Create sample rune bank
    rune_bank = [
        {
            "rune": "𓂀",
            "tensor_uuid": "uuid-0",
            "tile_index": 0,
        }
        for _ in range(26)
    ]

    loader = KAGLoader()

    # Load KAG
    success = loader.load_kag(rune_bank)
    print(f"Load KAG: {success}")

    # Verify integrity
    is_valid, errors = loader.verify_kag_integrity()
    print(f"KAG valid: {is_valid}")
    if errors:
        for error in errors:
            print(f"  - {error}")

    # Expand from node 0
    nodes = loader.expand_kag("0", depth=2)
    print(f"Expanded nodes: {len(nodes)}")

    loader.close()
