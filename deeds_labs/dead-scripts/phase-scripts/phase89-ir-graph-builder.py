#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 89: Unified IR Graph Builder
Combines AST nodes from all languages into a single knowledge graph
Language-agnostic representation for cross-language analysis
"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
import psycopg2
from typing import Dict, List, Set
from datetime import datetime
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import hashlib

class IRGraphBuilder:
    """Build unified Intermediate Representation graph"""

    NODE_TYPES = {
        'Function', 'Class', 'Component', 'Route', 'Endpoint',
        'DBTable', 'ConfigKey', 'Import', 'Export'
    }

    EDGE_TYPES = {
        'imports', 'calls', 'extends', 'implements',
        'renders', 'queries', 'depends_on', 'deprecated_by'
    }

    def __init__(self):
        self.qdrant = QdrantClient(url="http://localhost:6333")
        self.conn = psycopg2.connect(
            dbname="legal",
            user="user",
            password="pass",
            host="localhost",
            port="5434"
        )

        self.nodes: Dict[str, dict] = {}
        self.edges: List[dict] = []

    async def initialize(self):
        """Create collections if needed"""
        try:
            await self.qdrant.get_collection('phase89_ir_graph')
            print("✅ Collection phase89_ir_graph exists")
        except:
            print("📦 Creating phase89_ir_graph collection...")
            await self.qdrant.create_collection('phase89_ir_graph', {
                vectors: VectorParams(
                    size=768,
                    distance=Distance.COSINE
                )
            })

    def add_node(
        self,
        node_id: str,
        node_type: str,
        name: str,
        source_language: str,
        file_path: str,
        metadata: dict = None
    ):
        """Add a node to the IR graph"""
        if node_type not in self.NODE_TYPES:
            print(f"⚠️  Unknown node type: {node_type}")

        self.nodes[node_id] = {
            'id': node_id,
            'type': node_type,
            'name': name,
            'source_language': source_language,
            'file_path': file_path,
            'metadata': metadata or {},
            'added_at': datetime.now().isoformat()
        }

    def add_edge(
        self,
        from_id: str,
        to_id: str,
        relation: str,
        metadata: dict = None
    ):
        """Add an edge to the IR graph"""
        if relation not in self.EDGE_TYPES:
            print(f"⚠️  Unknown edge type: {relation}")

        self.edges.append({
            'from': from_id,
            'to': to_id,
            'relation': relation,
            'metadata': metadata or {}
        })

    def import_from_ast_nodes(self, collection_name: str):
        """Import nodes from AST collection"""
        print(f"📥 Importing from {collection_name}...")

        try:
            # Query all points from collection
            scroll_result = self.qdrant.scroll(
                collection_name=collection_name,
                limit=1000,
                with_payload=True
            )

            points = scroll_result[0]
            print(f"   Found {len(points)} AST nodes")

            # Convert AST nodes to IR nodes
            for point in points:
                payload = point.payload

                # Determine IR node type
                ast_type = payload.get('type', 'unknown')
                ir_type = self.map_ast_to_ir_type(ast_type)

                # Extract source language from file extension
                file_path = payload.get('file_path', '')
                source_lang = self.detect_language(file_path)

                node_id = str(point.id)
                self.add_node(
                    node_id=node_id,
                    node_type=ir_type,
                    name=payload.get('name', 'unknown'),
                    source_language=source_lang,
                    file_path=file_path,
                    metadata={
                        'original_ast_type': ast_type,
                        'line_start': payload.get('line_start'),
                        'line_end': payload.get('line_end'),
                        **payload.get('metadata', {})
                    }
                )

                # Import edges
                for edge_out in payload.get('edges_out', []):
                    self.add_edge(
                        from_id=node_id,
                        to_id=edge_out['to'],
                        relation=edge_out['relation']
                    )

        except Exception as e:
            print(f"   ❌ Error importing from {collection_name}: {e}")

    def map_ast_to_ir_type(self, ast_type: str) -> str:
        """Map language-specific AST type to IR type"""
        mapping = {
            'function': 'Function',
            'class': 'Class',
            'component': 'Component',
            'rune': 'Component',  # Svelte runes are component features
            'import': 'Import',
            'export': 'Export',
            'route': 'Route',
        }
        return mapping.get(ast_type.lower(), 'Function')

    def detect_language(self, file_path: str) -> str:
        """Detect source language from file extension"""
        ext_map = {
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript',
            '.svelte': 'Svelte',
            '.go': 'Go',
            '.py': 'Python',
        }

        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang

        return 'Unknown'

    def calculate_node_metrics(self):
        """Calculate graph metrics for each node"""
        print("\n📊 Calculating node metrics...")

        # Build adjacency lists
        outgoing = {}
        incoming = {}

        for edge in self.edges:
            from_id, to_id = edge['from'], edge['to']

            if from_id not in outgoing:
                outgoing[from_id] = []
            outgoing[from_id].append(to_id)

            if to_id not in incoming:
                incoming[to_id] = []
            incoming[to_id].append(from_id)

        # Calculate metrics
        for node_id, node in self.nodes.items():
            node['metrics'] = {
                'out_degree': len(outgoing.get(node_id, [])),
                'in_degree': len(incoming.get(node_id, [])),
                'total_connections': len(outgoing.get(node_id, [])) + len(incoming.get(node_id, [])),
            }

    def find_critical_nodes(self, top_k: int = 10) -> List[dict]:
        """Find most connected nodes (hubs)"""
        nodes_with_metrics = [
            (nid, n, n['metrics']['total_connections'])
            for nid, n in self.nodes.items()
            if 'metrics' in n
        ]

        # Sort by total connections
        nodes_with_metrics.sort(key=lambda x: x[2], reverse=True)

        return [
            {
                'id': nid,
                'name': n['name'],
                'type': n['type'],
                'file_path': n['file_path'],
                'connections': connections
            }
            for nid, n, connections in nodes_with_metrics[:top_k]
        ]

    def export_to_json(self, output_path: str = 'ace_runs/ir_graph_unified.json'):
        """Export IR graph to JSON"""
        print(f"\n💾 Exporting to {output_path}...")

        graph_data = {
            'nodes': list(self.nodes.values()),
            'edges': self.edges,
            'metadata': {
                'total_nodes': len(self.nodes),
                'total_edges': len(self.edges),
                'node_types': list(self.NODE_TYPES),
                'edge_types': list(self.EDGE_TYPES),
                'generated_at': datetime.now().isoformat()
            }
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(graph_data, f, indent=2)

        print(f"   ✅ Saved {len(self.nodes)} nodes, {len(self.edges)} edges")

    def print_stats(self):
        """Print IR graph statistics"""
        print("\n" + "=" * 70)
        print("📊 Unified IR Graph Statistics")
        print("=" * 70)

        # Count by type
        type_counts = {}
        lang_counts = {}

        for node in self.nodes.values():
            node_type = node['type']
            lang = node['source_language']

            type_counts[node_type] = type_counts.get(node_type, 0) + 1
            lang_counts[lang] = lang_counts.get(lang, 0) + 1

        print("\nNodes by type:")
        for node_type, count in sorted(type_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"   {node_type.ljust(20)} {count}")

        print("\nNodes by language:")
        for lang, count in sorted(lang_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"   {lang.ljust(20)} {count}")

        # Edge stats
        relation_counts = {}
        for edge in self.edges:
            rel = edge['relation']
            relation_counts[rel] = relation_counts.get(rel, 0) + 1

        print("\nEdges by relation:")
        for rel, count in sorted(relation_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"   {rel.ljust(20)} {count}")

        print(f"\nTotal nodes: {len(self.nodes)}")
        print(f"Total edges: {len(self.edges)}")
        print("=" * 70)

    def close(self):
        self.conn.close()


def main():
    print("🚀 Phase 89: Unified IR Graph Builder")
    print("=" * 70)
    print()

    builder = IRGraphBuilder()

    # Import from AST collections
    builder.import_from_ast_nodes('phase89_ast_nodes')
    builder.import_from_ast_nodes('phase89_svelte_components')

    # Calculate metrics
    builder.calculate_node_metrics()

    # Print statistics
    builder.print_stats()

    # Find critical nodes
    print("\n🎯 Top 10 Most Connected Nodes (Hubs):")
    critical = builder.find_critical_nodes(10)
    for i, node in enumerate(critical, 1):
        print(f"   {i}. {node['name']} ({node['type']})")
        print(f"      File: {node['file_path']}")
        print(f"      Connections: {node['connections']}")
        print()

    # Export
    builder.export_to_json()

    builder.close()
    print("\n✅ IR graph building complete!")


if __name__ == "__main__":
    main()
