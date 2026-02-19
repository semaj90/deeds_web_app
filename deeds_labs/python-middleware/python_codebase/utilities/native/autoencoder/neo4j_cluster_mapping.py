#!/usr/bin/env python3
"""
neo4j_cluster_mapping.py

Small helper to push cluster <-> adapter mappings into Neo4j and query adapter-per-cluster.
This scaffold assumes a running Neo4j instance with basic auth.
"""
import os
from neo4j import GraphDatabase

NEO4J_URI = os.environ.get('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = os.environ.get('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.environ.get('NEO4J_PASSWORD', 'password')

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


def upsert_cluster_adapter(cluster_id: str, adapter_id: str, metadata: dict = None):
    if metadata is None:
        metadata = {}
    with driver.session() as session:
        session.run(
            "MERGE (c:Cluster {id: $cluster_id})\n"
            "MERGE (a:Adapter {id: $adapter_id})\n"
            "MERGE (c)-[r:USES]->(a)\n"
            "SET r += $metadata",
            cluster_id=cluster_id,
            adapter_id=adapter_id,
            metadata=metadata,
        )


def get_adapter_for_cluster(cluster_id: str):
    with driver.session() as session:
        res = session.run(
            "MATCH (c:Cluster {id:$cluster_id})-[:USES]->(a:Adapter) RETURN a.id as adapter_id LIMIT 1",
            cluster_id=cluster_id,
        )
        rec = res.single()
        return rec['adapter_id'] if rec else None


if __name__ == '__main__':
    # quick test harness
    upsert_cluster_adapter('cluster_1', 'adapter_legal_qlora_v1', {'notes': 'demo'})
    print('Adapter for cluster_1 ->', get_adapter_for_cluster('cluster_1'))
