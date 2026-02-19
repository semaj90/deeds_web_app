import os
import couchdb
from typing import List, Dict, Any

class GraphStoreService:
    def __init__(self):
        self.couch_url = os.getenv("COUCHDB_URL", "http://admin:password@localhost:5984")
        self.couch_server = couchdb.Server(self.couch_url)

        if "knowledge_graph" not in self.couch_server:
            self.couch_server.create("knowledge_graph")
        self.db_graph = self.couch_server["knowledge_graph"]

    async def get_subgraph(self, entity_id: str, depth: int = 1, relation_types: List[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieve a subgraph centered around an entity.
        This is a simplified implementation. In a real graph DB, this would be a traversal query.
        In CouchDB, we might use views or mango queries.
        """
        nodes = []
        edges = []

        # Fetch the central node
        if entity_id in self.db_graph:
            nodes.append(self.db_graph[entity_id])

        # Find connected edges (assuming edges are stored as documents or inside node docs)
        # Strategy: Use a Mango query to find documents where 'source' or 'target' is entity_id
        selector = {
            "$or": [
                {"source": entity_id},
                {"target": entity_id}
            ],
            "type": "relationship"
        }

        if relation_types:
            selector["relation_type"] = {"$in": relation_types}

        docs = self.db_graph.find(selector)

        for doc in docs:
            edges.append(doc)
            # Add the other node to the nodes list if not already present
            other_id = doc['target'] if doc['source'] == entity_id else doc['source']
            if other_id not in [n['_id'] for n in nodes] and other_id in self.db_graph:
                nodes.append(self.db_graph[other_id])

        return {"nodes": nodes, "edges": edges}
