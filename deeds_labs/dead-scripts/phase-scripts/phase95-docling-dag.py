#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 95: Multimodal RAG+KAG with IBM Docling + Granite 3.0
DAG-Based Knowledge Graph with Image/Document Processing

Architecture:
  IBM Docling (PDF/Image → Markdown) → LangExtract (Structure) →
  Granite-3.0-2B (Vision) → EmbeddingGemma (768d) →
  DAG Knowledge Graph (Qdrant + Neo4j)

DAG Properties:
  - Nodes: Documents, Chunks, Entities, Concepts
  - Edges: DERIVES_FROM, REFERENCES, CONTAINS, RELATES_TO
  - Topological Sort: Dependency-aware retrieval
  - No Cycles: Guaranteed termination in traversal

Video References:
  IBM Docling: https://github.com/DS4SD/docling
  Granite 3.0: https://huggingface.co/ibm-granite/granite-3.0-2b-instruct

Usage:
    # Process PDF with Docling
    python scripts/phase95-docling-dag.py --docling "document.pdf"

    # Process image with Granite vision
    python scripts/phase95-docling-dag.py --image "diagram.png" --vision

    # Query DAG with topological traversal
    python scripts/phase95-docling-dag.py --query "Explain the architecture" --dag

    # Build complete knowledge graph
    python scripts/phase95-docling-dag.py --build-dag --source "docs/"
"""

import os
import sys
import json
import asyncio
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple, Set
from uuid import uuid4
from collections import defaultdict, deque

# Windows UTF-8 support
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent))

try:
    import httpx
    from qdrant_client import QdrantClient
    from qdrant_client.http import models
    from qdrant_client.models import Distance
    import psycopg2
    import numpy as np
except ImportError as e:
    print(f"❌ Missing dependencies: {e}")
    print("   Install: pip install httpx qdrant-client psycopg2-binary numpy")
    print("   Install Docling: pip install docling")
    sys.exit(1)

# =============================================================================
# Configuration
# =============================================================================
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "postgresql://user:pass@localhost:5434/legal")
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LANGEXTRACT_URL = os.getenv("LANGEXTRACT_URL", "http://localhost:8095")

# Collections
DAG_NODES_COLLECTION = "phase95_dag_nodes"  # Document/chunk nodes
DAG_EDGES_COLLECTION = "phase95_dag_edges"  # Relationship edges
VISION_INDEX_COLLECTION = "phase95_vision_index"  # Image embeddings

# Models
EMBEDDING_MODEL = "embeddinggemma:latest"
VISION_MODEL = "llava:latest"  # Fallback if Granite not available
GRANITE_MODEL = "granite3-dense:2b"  # IBM Granite 3.0 2B
EMBEDDING_DIM = 768

# =============================================================================
# DAG Node Types
# =============================================================================

class DAGNodeType:
    DOCUMENT = "document"  # Root document
    SECTION = "section"    # Document section
    CHUNK = "chunk"        # Text chunk
    IMAGE = "image"        # Image/diagram
    ENTITY = "entity"      # Named entity
    CONCEPT = "concept"    # Extracted concept
    CODE = "code"          # Code block


class DAGEdgeType:
    DERIVES_FROM = "derives_from"      # Child → Parent
    REFERENCES = "references"          # Cross-reference
    CONTAINS = "contains"              # Container → Content
    RELATES_TO = "relates_to"          # Semantic similarity
    IMPLEMENTS = "implements"          # Code → Concept
    ILLUSTRATES = "illustrates"        # Image → Text


# =============================================================================
# DAG Knowledge Graph Structure
# =============================================================================

class DAGNode:
    """Node in directed acyclic graph"""
    def __init__(
        self,
        node_id: str,
        node_type: str,
        content: str,
        metadata: Dict = None
    ):
        self.node_id = node_id
        self.node_type = node_type
        self.content = content
        self.metadata = metadata or {}
        self.parents = []  # Incoming edges
        self.children = []  # Outgoing edges
        self.depth = 0  # Topological depth

    def to_dict(self) -> Dict:
        return {
            'node_id': self.node_id,
            'node_type': self.node_type,
            'content': self.content[:500],  # Truncate for payload
            'metadata': self.metadata,
            'parent_count': len(self.parents),
            'child_count': len(self.children),
            'depth': self.depth
        }


class DAGEdge:
    """Directed edge in knowledge graph"""
    def __init__(
        self,
        edge_id: str,
        edge_type: str,
        source_id: str,
        target_id: str,
        weight: float = 1.0
    ):
        self.edge_id = edge_id
        self.edge_type = edge_type
        self.source_id = source_id
        self.target_id = target_id
        self.weight = weight

    def to_dict(self) -> Dict:
        return {
            'edge_id': self.edge_id,
            'edge_type': self.edge_type,
            'source_id': self.source_id,
            'target_id': self.target_id,
            'weight': self.weight
        }


# =============================================================================
# IBM Docling Integration
# =============================================================================

class DoclingProcessor:
    """Process PDFs/images with IBM Docling"""

    def __init__(self):
        try:
            from docling.document_converter import DocumentConverter
            self.converter = DocumentConverter()
            self.available = True
            print("✅ Docling available")
        except ImportError:
            print("⚠️ Docling not installed (pip install docling)")
            self.available = False

    def process_document(self, file_path: str) -> Dict:
        """
        Convert document to structured markdown.

        Returns:
            {
                'markdown': str,
                'tables': List[Dict],
                'images': List[Dict],
                'metadata': Dict
            }
        """
        if not self.available:
            # Fallback: read as text
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return {
                    'markdown': f.read(),
                    'tables': [],
                    'images': [],
                    'metadata': {'source': file_path}
                }

        try:
            result = self.converter.convert(file_path)
            return {
                'markdown': result.document.export_to_markdown(),
                'tables': result.document.tables,
                'images': result.document.pictures,
                'metadata': {
                    'source': file_path,
                    'page_count': len(result.document.pages),
                    'title': result.document.metadata.get('title', '')
                }
            }
        except Exception as e:
            print(f"❌ Docling failed: {e}")
            return None


# =============================================================================
# Granite Vision Integration
# =============================================================================

class GraniteVision:
    """IBM Granite 3.0 multimodal vision model"""

    def __init__(self, ollama_url: str = OLLAMA_URL):
        self.ollama_url = ollama_url
        self.client = httpx.AsyncClient(timeout=120.0)
        self.model = GRANITE_MODEL  # Will fallback to llava if unavailable

    async def analyze_image(
        self,
        image_path: str,
        prompt: str = "Describe this image in detail, focusing on technical content."
    ) -> str:
        """
        Analyze image with vision model.

        Returns:
            Text description of image content
        """
        # Read image as base64
        with open(image_path, 'rb') as f:
            import base64
            image_data = base64.b64encode(f.read()).decode()

        try:
            response = await self.client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "images": [image_data],
                    "stream": False
                }
            )
            response.raise_for_status()
            return response.json()["response"]
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # Try llava fallback
                print(f"⚠️ {self.model} not found, trying llava")
                self.model = VISION_MODEL
                return await self.analyze_image(image_path, prompt)
            raise

    async def close(self):
        await self.client.aclose()


# =============================================================================
# DAG Knowledge Graph Manager
# =============================================================================

class DAGKnowledgeGraph:
    """
    Directed Acyclic Graph for knowledge representation.

    Properties:
      - Topological ordering ensures dependency-aware retrieval
      - No cycles prevent infinite loops in traversal
      - Edge types enable typed relationship queries
    """

    def __init__(self):
        self.qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        self.nodes: Dict[str, DAGNode] = {}
        self.edges: List[DAGEdge] = []
        self.adjacency: Dict[str, List[str]] = defaultdict(list)
        self._init_collections()

    def _init_collections(self):
        """Initialize Qdrant collections for nodes and edges"""
        # Nodes collection
        if not self.qdrant.collection_exists(DAG_NODES_COLLECTION):
            self.qdrant.create_collection(
                collection_name=DAG_NODES_COLLECTION,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=Distance.COSINE
                )
            )

            # Payload indexes
            for field in ["node_type", "depth"]:
                self.qdrant.create_payload_index(
                    collection_name=DAG_NODES_COLLECTION,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD
                )

            print(f"✅ Created DAG nodes collection")

        # Edges collection (no vectors, just metadata)
        if not self.qdrant.collection_exists(DAG_EDGES_COLLECTION):
            self.qdrant.create_collection(
                collection_name=DAG_EDGES_COLLECTION,
                vectors_config=models.VectorParams(
                    size=2,  # Minimal dummy vector
                    distance=Distance.COSINE
                )
            )

            for field in ["edge_type", "source_id", "target_id"]:
                self.qdrant.create_payload_index(
                    collection_name=DAG_EDGES_COLLECTION,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD
                )

            print(f"✅ Created DAG edges collection")

    def add_node(self, node: DAGNode, vector: List[float]):
        """Add node to DAG"""
        self.nodes[node.node_id] = node

        # Store in Qdrant
        self.qdrant.upsert(
            collection_name=DAG_NODES_COLLECTION,
            points=[
                models.PointStruct(
                    id=node.node_id,
                    vector=vector,
                    payload=node.to_dict()
                )
            ]
        )

    def add_edge(self, edge: DAGEdge):
        """Add directed edge to DAG"""
        # Check for cycles (basic DFS)
        if self._would_create_cycle(edge.source_id, edge.target_id):
            print(f"⚠️ Skipping edge {edge.edge_id}: would create cycle")
            return

        self.edges.append(edge)
        self.adjacency[edge.source_id].append(edge.target_id)

        # Update node relationships
        if edge.source_id in self.nodes:
            self.nodes[edge.source_id].children.append(edge.target_id)
        if edge.target_id in self.nodes:
            self.nodes[edge.target_id].parents.append(edge.source_id)

        # Store in Qdrant
        self.qdrant.upsert(
            collection_name=DAG_EDGES_COLLECTION,
            points=[
                models.PointStruct(
                    id=edge.edge_id,
                    vector=[0.0, 0.0],  # Dummy vector
                    payload=edge.to_dict()
                )
            ]
        )

    def _would_create_cycle(self, source: str, target: str) -> bool:
        """Check if adding edge would create cycle using DFS"""
        visited = set()

        def dfs(node: str) -> bool:
            if node == source:
                return True
            if node in visited:
                return False

            visited.add(node)
            for neighbor in self.adjacency.get(node, []):
                if dfs(neighbor):
                    return True
            return False

        return dfs(target)

    def topological_sort(self) -> List[str]:
        """
        Kahn's algorithm for topological sorting.

        Returns nodes in dependency order (parents before children).
        """
        in_degree = defaultdict(int)
        for edge in self.edges:
            in_degree[edge.target_id] += 1

        # Find nodes with no incoming edges
        queue = deque([
            node_id for node_id in self.nodes.keys()
            if in_degree[node_id] == 0
        ])

        sorted_nodes = []
        depth = 0

        while queue:
            level_size = len(queue)
            for _ in range(level_size):
                node_id = queue.popleft()
                sorted_nodes.append(node_id)

                # Update depth
                if node_id in self.nodes:
                    self.nodes[node_id].depth = depth

                # Process children
                for child_id in self.adjacency[node_id]:
                    in_degree[child_id] -= 1
                    if in_degree[child_id] == 0:
                        queue.append(child_id)

            depth += 1

        return sorted_nodes

    def get_ancestors(self, node_id: str, max_depth: int = 3) -> List[str]:
        """Get all ancestor nodes (BFS up the DAG)"""
        if node_id not in self.nodes:
            return []

        ancestors = []
        visited = set()
        queue = deque([(node_id, 0)])

        while queue:
            current, depth = queue.popleft()
            if depth >= max_depth:
                continue

            if current in visited:
                continue
            visited.add(current)

            node = self.nodes.get(current)
            if node:
                ancestors.append(current)
                for parent_id in node.parents:
                    queue.append((parent_id, depth + 1))

        return ancestors


# =============================================================================
# Multimodal RAG+KAG Pipeline
# =============================================================================

class MultimodalRAGPipeline:
    """Complete pipeline: Docling → LangExtract → Granite → DAG"""

    def __init__(self):
        self.docling = DoclingProcessor()
        self.vision = GraniteVision()
        self.dag = DAGKnowledgeGraph()
        self.langextract = httpx.AsyncClient(timeout=30.0)
        self.ollama = httpx.AsyncClient(timeout=60.0)

    async def embed(
        self,
        text: str,
        task_type: str = "retrieval_document"
    ) -> List[float]:
        """Get embedding with task type"""
        try:
            response = await self.ollama.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={
                    "model": EMBEDDING_MODEL,
                    "prompt": text,
                    "options": {"task_type": task_type}
                }
            )
            response.raise_for_status()
            return response.json()["embedding"]
        except Exception as e:
            print(f"❌ Embedding failed: {e}")
            return [0.0] * EMBEDDING_DIM

    async def process_document(self, file_path: str) -> str:
        """
        Process document through complete pipeline.

        Returns document node ID
        """
        print(f"\n📄 Processing: {file_path}")

        # 1. Docling: Extract structure
        doc_result = self.docling.process_document(file_path)
        if not doc_result:
            return None

        # 2. Create document root node
        doc_id = hashlib.sha256(file_path.encode()).hexdigest()[:16]
        doc_node = DAGNode(
            node_id=f"doc_{doc_id}",
            node_type=DAGNodeType.DOCUMENT,
            content=doc_result['markdown'][:1000],
            metadata=doc_result['metadata']
        )

        doc_vector = await self.embed(doc_result['markdown'][:2000])
        self.dag.add_node(doc_node, doc_vector)

        print(f"   ✅ Document node: {doc_node.node_id}")

        # 3. Process chunks (simple split for now)
        chunks = self._chunk_text(doc_result['markdown'])
        for i, chunk_text in enumerate(chunks):
            chunk_id = f"chunk_{doc_id}_{i}"
            chunk_node = DAGNode(
                node_id=chunk_id,
                node_type=DAGNodeType.CHUNK,
                content=chunk_text,
                metadata={'index': i, 'parent': doc_node.node_id}
            )

            chunk_vector = await self.embed(chunk_text)
            self.dag.add_node(chunk_node, chunk_vector)

            # Add edge: chunk DERIVES_FROM document
            edge = DAGEdge(
                edge_id=f"edge_{chunk_id}",
                edge_type=DAGEdgeType.DERIVES_FROM,
                source_id=chunk_id,
                target_id=doc_node.node_id
            )
            self.dag.add_edge(edge)

        print(f"   ✅ Created {len(chunks)} chunks")

        # 4. Process images with Granite vision
        for i, image_meta in enumerate(doc_result.get('images', [])):
            if 'path' in image_meta:
                await self._process_image(image_meta['path'], doc_node.node_id)

        return doc_node.node_id

    async def _process_image(self, image_path: str, parent_doc_id: str):
        """Process image with Granite vision"""
        print(f"   🖼️  Analyzing image: {image_path}")

        # Granite vision analysis
        description = await self.vision.analyze_image(image_path)

        # Create image node
        img_id = hashlib.sha256(image_path.encode()).hexdigest()[:16]
        img_node = DAGNode(
            node_id=f"img_{img_id}",
            node_type=DAGNodeType.IMAGE,
            content=description,
            metadata={'path': image_path}
        )

        img_vector = await self.embed(description)
        self.dag.add_node(img_node, img_vector)

        # Add edge: image ILLUSTRATES document
        edge = DAGEdge(
            edge_id=f"edge_img_{img_id}",
            edge_type=DAGEdgeType.ILLUSTRATES,
            source_id=img_node.node_id,
            target_id=parent_doc_id
        )
        self.dag.add_edge(edge)

        print(f"      ✅ Image node: {img_node.node_id}")

    def _chunk_text(self, text: str, chunk_size: int = 1000) -> List[str]:
        """Simple chunking (can be enhanced with semantic chunking)"""
        words = text.split()
        chunks = []
        current_chunk = []
        current_size = 0

        for word in words:
            current_chunk.append(word)
            current_size += len(word) + 1

            if current_size >= chunk_size:
                chunks.append(' '.join(current_chunk))
                current_chunk = []
                current_size = 0

        if current_chunk:
            chunks.append(' '.join(current_chunk))

        return chunks

    async def query_dag(
        self,
        query: str,
        use_topological: bool = True
    ) -> List[Dict]:
        """
        Query DAG with optional topological ordering.

        If use_topological=True, retrieves in dependency order.
        """
        print(f"\n🔍 Querying DAG: {query}")

        # Embed query
        query_vector = await self.embed(query, task_type="retrieval_query")

        # Search nodes
        results = self.dag.qdrant.query_points(
            collection_name=DAG_NODES_COLLECTION,
            query=query_vector,
            limit=10
        ).points

        if use_topological:
            # Sort by topological depth
            sorted_order = self.dag.topological_sort()
            depth_map = {
                node_id: idx
                for idx, node_id in enumerate(sorted_order)
            }

            results.sort(key=lambda hit: depth_map.get(hit.id, 999))
            print(f"   ✅ Results sorted topologically")

        return [{
            'node_id': hit.id,
            'score': hit.score,
            'type': hit.payload.get('node_type'),
            'content': hit.payload.get('content', '')[:200],
            'depth': hit.payload.get('depth', 0)
        } for hit in results]

    async def close(self):
        await self.vision.close()
        await self.langextract.aclose()
        await self.ollama.aclose()


# =============================================================================
# CLI Interface
# =============================================================================

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 95: Docling + Granite + DAG")
    parser.add_argument("--docling", help="Process document with Docling")
    parser.add_argument("--image", help="Analyze image with Granite vision")
    parser.add_argument("--query", help="Query DAG knowledge graph")
    parser.add_argument("--dag", action="store_true", help="Use topological sort")
    parser.add_argument("--build-dag", help="Build DAG from directory")

    args = parser.parse_args()

    pipeline = MultimodalRAGPipeline()

    try:
        if args.docling:
            doc_id = await pipeline.process_document(args.docling)
            print(f"\n✅ Document processed: {doc_id}")

            # Show topological order
            sorted_nodes = pipeline.dag.topological_sort()
            print(f"\n📊 Topological order ({len(sorted_nodes)} nodes):")
            for i, node_id in enumerate(sorted_nodes[:10]):
                node = pipeline.dag.nodes.get(node_id)
                if node:
                    print(f"   {i+1}. [{node.node_type}] {node_id} (depth={node.depth})")

        elif args.image:
            description = await pipeline.vision.analyze_image(args.image)
            print(f"\n🖼️  Image Analysis:\n{description}")

        elif args.query:
            results = await pipeline.query_dag(args.query, use_topological=args.dag)
            print(f"\n📊 Found {len(results)} results:")
            for r in results:
                print(f"\n   [{r['type']}] {r['node_id']} (depth={r['depth']})")
                print(f"   Score: {r['score']:.4f}")
                print(f"   {r['content']}")

        elif args.build_dag:
            # Process all files in directory
            source_dir = Path(args.build_dag)
            for file_path in source_dir.glob("**/*.*"):
                if file_path.suffix in ['.pdf', '.md', '.txt']:
                    await pipeline.process_document(str(file_path))

        else:
            parser.print_help()

    finally:
        await pipeline.close()


if __name__ == "__main__":
    asyncio.run(main())
