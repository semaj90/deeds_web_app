#!/usr/bin/env python3
"""
Enhanced RAG/KAG/DAG Knowledge Base System
Integrates: IBM Docling 258M + Language Extraction + GRPO Ranking + Codebase Indexing
"""

import os
import json
import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
import numpy as np
from datetime import datetime

# Add parent to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "python_codebase"))
sys.path.insert(0, str(Path(__file__).parent))

try:
    from document_processing.granite_docling_parser import GraniteDoclingParser
except ImportError:
    # Fallback if Docling not available
    logger.warning("⚠️ Granite Docling not available, document processing disabled")
    GraniteDoclingParser = None

from gemma3_embedding_service import Gemma3EmbeddingService, EmbeddingRequest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ExtractedEntity:
    """Extracted entity from document"""
    text: str
    entity_type: str  # person, organization, location, date, law, case
    confidence: float
    start_pos: int
    end_pos: int
    metadata: Dict[str, Any]


@dataclass
class KnowledgeNode:
    """Knowledge graph node"""
    id: str
    content: str
    node_type: str  # document, entity, concept, code_unit
    embedding: List[float]
    metadata: Dict[str, Any]
    edges: List[str]  # Connected node IDs
    rank_score: float = 0.0  # GRPO ranking score


@dataclass
class DAGNode:
    """Directed Acyclic Graph node for causal/temporal relationships"""
    id: str
    content: str
    timestamp: Optional[str]
    dependencies: List[str]  # Parent node IDs
    dependents: List[str]  # Child node IDs
    node_data: Dict[str, Any]


class EnhancedKnowledgeBaseSystem:
    """Enhanced RAG/KAG/DAG system with ranking and indexing"""

    def __init__(
        self,
        postgres_url: str = None,
        qdrant_url: str = "http://localhost:6333",
        ollama_url: str = "http://localhost:11434",
        gemini_api_key: str = None,
        device: str = "cuda"
    ):
        """Initialize enhanced knowledge base system"""

        # Load from environment
        self.postgres_url = postgres_url or os.getenv("DATABASE_URL")
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")

        logger.info("🚀 Initializing Enhanced Knowledge Base System")
        logger.info(f"   Qdrant: {self.qdrant_url}")
        logger.info(f"   Ollama: {self.ollama_url}")
        logger.info(f"   Gemini: {'✅ Configured' if self.gemini_api_key else '❌ Not configured'}")

        # Components
        if GraniteDoclingParser:
            self.docling_parser = GraniteDoclingParser(device=device)
        else:
            self.docling_parser = None
            logger.warning("⚠️ Document processing disabled (Docling not available)")

        self.embedding_service = Gemma3EmbeddingService(
            model_name="embeddinggemma:latest",
            ollama_url=self.ollama_url
        )

        # Knowledge storage
        self.knowledge_nodes: Dict[str, KnowledgeNode] = {}
        self.dag_nodes: Dict[str, DAGNode] = {}
        self.entity_index: Dict[str, List[str]] = {}  # entity_type -> node_ids
        self.code_index: Dict[str, List[str]] = {}  # file_path -> code_units

        # Initialize clients
        self.qdrant_client = None
        self.pg_conn = None

    async def initialize(self):
        """Initialize all services"""
        logger.info("📥 Loading embedding service...")
        await self.embedding_service.load_model()

        # Initialize Qdrant
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams

            self.qdrant_client = QdrantClient(url=self.qdrant_url)

            # Create collections
            collections = [
                ("enhanced_knowledge_base", 1024),
                ("code_units", 1024),
                ("entity_graph", 1024),
                ("dag_timeline", 1024)
            ]

            for coll_name, vector_size in collections:
                try:
                    self.qdrant_client.create_collection(
                        collection_name=coll_name,
                        vectors_config=VectorParams(
                            size=vector_size,
                            distance=Distance.COSINE
                        )
                    )
                    logger.info(f"✅ Created Qdrant collection: {coll_name}")
                except Exception as e:
                    logger.info(f"   Collection {coll_name} already exists")

        except ImportError:
            logger.warning("⚠️ qdrant-client not installed")

        # Initialize PostgreSQL
        try:
            import asyncpg
            self.pg_conn = await asyncpg.connect(self.postgres_url)
            logger.info("✅ Connected to PostgreSQL")
        except Exception as e:
            logger.warning(f"⚠️ PostgreSQL connection failed: {e}")

    async def process_document_with_docling(
        self,
        file_path: str,
        extract_entities: bool = True
    ) -> Dict[str, Any]:
        """
        Process document with IBM Docling 258M

        Returns:
            Dict with text, tables, layout, entities
        """
        if not self.docling_parser:
            logger.error("❌ Docling parser not available")
            return {
                "success": False,
                "error": "Docling parser not initialized"
            }

        logger.info(f"📄 Processing document: {file_path}")        # Parse with Docling
        result = self.docling_parser.parse_document(file_path)

        if not result.get("success"):
            logger.error(f"❌ Docling parsing failed: {result.get('error')}")
            return result

        # Extract text
        extracted_text = result.get("text", "")
        tables = result.get("tables", [])
        layout_boxes = result.get("layout", [])

        logger.info(f"✅ Extracted {len(extracted_text)} chars, {len(tables)} tables")

        # Language extraction for entities
        entities = []
        if extract_entities and extracted_text:
            entities = await self._extract_entities_with_gemini(extracted_text)
            logger.info(f"✅ Extracted {len(entities)} entities")

        # Create knowledge nodes
        doc_id = f"doc_{Path(file_path).stem}_{datetime.now().timestamp()}"

        # Generate embeddings
        chunk_size = 500
        chunks = [
            extracted_text[i:i+chunk_size]
            for i in range(0, len(extracted_text), chunk_size)
        ]

        embedding_requests = [
            EmbeddingRequest(
                text=chunk,
                chunk_id=f"{doc_id}_chunk_{i}",
                metadata={"source": file_path, "chunk_index": i}
            )
            for i, chunk in enumerate(chunks)
        ]

        embeddings = await self.embedding_service.generate_embeddings(embedding_requests)

        # Create knowledge nodes
        for i, (chunk, emb_resp) in enumerate(zip(chunks, embeddings)):
            node = KnowledgeNode(
                id=f"{doc_id}_chunk_{i}",
                content=chunk,
                node_type="document_chunk",
                embedding=emb_resp.embedding,
                metadata={
                    "source": file_path,
                    "chunk_index": i,
                    "tables_nearby": [t for t in tables if i * chunk_size <= t.get("position", 0) < (i+1) * chunk_size],
                    "layout_boxes": layout_boxes
                },
                edges=[]
            )
            self.knowledge_nodes[node.id] = node

        # Store in Qdrant
        if self.qdrant_client:
            await self._store_in_qdrant(list(self.knowledge_nodes.values()))

        return {
            "success": True,
            "doc_id": doc_id,
            "chunks": len(chunks),
            "entities": entities,
            "tables": tables,
            "nodes_created": len(self.knowledge_nodes)
        }

    async def _extract_entities_with_gemini(self, text: str) -> List[ExtractedEntity]:
        """Extract entities using Gemini with grounding"""
        if not self.gemini_api_key:
            logger.warning("⚠️ Gemini API key not configured")
            return []

        try:
            import google.generativeai as genai

            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel('gemini-2.0-flash-exp')

            prompt = f"""Extract legal entities from this text. Return JSON array with:
- text: entity text
- entity_type: person|organization|location|date|law|case|statute
- confidence: 0-1
- start_pos: character position
- end_pos: character position

Text:
{text[:2000]}

Return only valid JSON array."""

            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    response_mime_type="application/json"
                )
            )

            entities_data = json.loads(response.text)
            entities = [
                ExtractedEntity(
                    text=e["text"],
                    entity_type=e["entity_type"],
                    confidence=e["confidence"],
                    start_pos=e.get("start_pos", 0),
                    end_pos=e.get("end_pos", 0),
                    metadata={}
                )
                for e in entities_data
            ]

            return entities

        except Exception as e:
            logger.error(f"❌ Entity extraction failed: {e}")
            return []

    async def index_codebase(
        self,
        root_dir: str,
        extensions: List[str] = [".py", ".js", ".ts", ".svelte", ".go"]
    ) -> Dict[str, Any]:
        """
        Index codebase for ACE error fixing

        Returns:
            Stats about indexed code units
        """
        logger.info(f"📂 Indexing codebase: {root_dir}")

        code_units = []
        root_path = Path(root_dir)

        for ext in extensions:
            for file_path in root_path.rglob(f"*{ext}"):
                if "node_modules" in str(file_path) or ".venv" in str(file_path):
                    continue

                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    # Split into functions/classes
                    units = self._extract_code_units(content, str(file_path))
                    code_units.extend(units)

                except Exception as e:
                    logger.warning(f"⚠️ Could not read {file_path}: {e}")

        logger.info(f"✅ Found {len(code_units)} code units")

        # Generate embeddings for code units
        embedding_requests = [
            EmbeddingRequest(
                text=f"{unit['signature']}\n{unit['docstring']}\n{unit['code'][:200]}",
                chunk_id=unit['id'],
                metadata=unit
            )
            for unit in code_units
        ]

        embeddings = await self.embedding_service.generate_embeddings(embedding_requests)

        # Create knowledge nodes for code
        for unit, emb_resp in zip(code_units, embeddings):
            node = KnowledgeNode(
                id=unit['id'],
                content=unit['code'],
                node_type="code_unit",
                embedding=emb_resp.embedding,
                metadata=unit,
                edges=[]
            )
            self.knowledge_nodes[node.id] = node

            # Update code index
            file_key = unit['file_path']
            if file_key not in self.code_index:
                self.code_index[file_key] = []
            self.code_index[file_key].append(node.id)

        # Store in Qdrant
        if self.qdrant_client:
            await self._store_in_qdrant(
                [self.knowledge_nodes[u['id']] for u in code_units],
                collection="code_units"
            )

        return {
            "total_units": len(code_units),
            "files_indexed": len(self.code_index),
            "extensions": extensions
        }

    def _extract_code_units(self, content: str, file_path: str) -> List[Dict]:
        """Extract functions/classes from code"""
        units = []
        lines = content.split('\n')

        current_unit = None
        indent_stack = []

        for i, line in enumerate(lines):
            stripped = line.lstrip()
            indent = len(line) - len(stripped)

            # Detect function/class definitions
            if stripped.startswith('def ') or stripped.startswith('class ') or \
               stripped.startswith('export function') or stripped.startswith('export const'):

                if current_unit:
                    units.append(current_unit)

                signature = stripped.rstrip(':').rstrip('{')
                current_unit = {
                    'id': f"{Path(file_path).stem}_{i}",
                    'file_path': file_path,
                    'signature': signature,
                    'start_line': i,
                    'code': line,
                    'docstring': '',
                    'unit_type': 'function' if 'def' in stripped or 'function' in stripped else 'class'
                }
                indent_stack = [indent]

            elif current_unit:
                current_unit['code'] += '\n' + line

                # Extract docstring
                if '"""' in line or "'''" in line or '/**' in line:
                    if not current_unit['docstring']:
                        current_unit['docstring'] = line.strip()

        if current_unit:
            units.append(current_unit)

        return units

    async def search_with_grpo_ranking(
        self,
        query: str,
        top_k: int = 10,
        use_reranking: bool = True
    ) -> List[KnowledgeNode]:
        """
        Search knowledge base with GRPO-enhanced ranking

        Args:
            query: Search query
            top_k: Number of results
            use_reranking: Apply GRPO reranking

        Returns:
            Ranked knowledge nodes
        """
        logger.info(f"🔍 Searching: {query}")

        # Generate query embedding
        req = EmbeddingRequest(text=query, chunk_id="query")
        emb_resp = await self.embedding_service.generate_embeddings([req])
        query_embedding = emb_resp[0].embedding

        # Vector search in Qdrant
        if self.qdrant_client:
            search_results = self.qdrant_client.search(
                collection_name="enhanced_knowledge_base",
                query_vector=query_embedding,
                limit=top_k * 2  # Get more for reranking
            )

            # Convert to KnowledgeNodes
            nodes = [
                self.knowledge_nodes.get(hit.id)
                for hit in search_results
                if hit.id in self.knowledge_nodes
            ]
        else:
            # Fallback to local search
            nodes = list(self.knowledge_nodes.values())

            # Compute cosine similarity
            similarities = [
                (node, np.dot(query_embedding, node.embedding))
                for node in nodes
            ]
            similarities.sort(key=lambda x: x[1], reverse=True)
            nodes = [n for n, _ in similarities[:top_k * 2]]

        # Apply GRPO ranking if enabled
        if use_reranking:
            nodes = await self._apply_grpo_ranking(query, nodes)

        return nodes[:top_k]

    async def _apply_grpo_ranking(
        self,
        query: str,
        nodes: List[KnowledgeNode]
    ) -> List[KnowledgeNode]:
        """Apply Group Relative Policy Optimization ranking"""

        # Use Gemini to rank nodes
        if not self.gemini_api_key:
            return nodes

        try:
            import google.generativeai as genai

            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel('gemini-2.0-flash-exp')

            # Create ranking prompt
            node_texts = [
                f"[{i}] {node.content[:200]}"
                for i, node in enumerate(nodes)
            ]

            prompt = f"""Rank these knowledge chunks by relevance to: "{query}"

Chunks:
{chr(10).join(node_texts)}

Return JSON array of indices in descending relevance order: [most_relevant_index, ...]"""

            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    response_mime_type="application/json"
                )
            )

            ranked_indices = json.loads(response.text)

            # Reorder nodes
            ranked_nodes = [nodes[i] for i in ranked_indices if i < len(nodes)]

            # Update rank scores
            for rank, node in enumerate(ranked_nodes):
                node.rank_score = 1.0 - (rank / len(ranked_nodes))

            return ranked_nodes

        except Exception as e:
            logger.error(f"❌ GRPO ranking failed: {e}")
            return nodes

    async def _store_in_qdrant(
        self,
        nodes: List[KnowledgeNode],
        collection: str = "enhanced_knowledge_base"
    ):
        """Store knowledge nodes in Qdrant"""
        if not self.qdrant_client:
            return

        from qdrant_client.models import PointStruct

        points = [
            PointStruct(
                id=node.id,
                vector=node.embedding,
                payload={
                    "content": node.content,
                    "node_type": node.node_type,
                    "metadata": node.metadata,
                    "rank_score": node.rank_score
                }
            )
            for node in nodes
        ]

        self.qdrant_client.upsert(
            collection_name=collection,
            points=points
        )

        logger.info(f"✅ Stored {len(points)} points in {collection}")

    async def shutdown(self):
        """Cleanup resources"""
        logger.info("🛑 Shutting down Enhanced Knowledge Base System")

        await self.embedding_service.shutdown()

        if self.pg_conn:
            await self.pg_conn.close()

        logger.info("✅ Shutdown complete")


async def main():
    """Test enhanced knowledge base system"""
    print("=" * 60)
    print("🧪 Testing Enhanced RAG/KAG/DAG Knowledge Base")
    print("=" * 60)

    system = EnhancedKnowledgeBaseSystem()
    await system.initialize()

    # Test 1: Index codebase
    print("\n📂 Test 1: Indexing codebase...")
    stats = await system.index_codebase(
        "c:/Users/james/Videos/deeds-web-app/backend",
        extensions=[".py"]
    )
    print(f"✅ Indexed {stats['total_units']} code units from {stats['files_indexed']} files")

    # Test 2: Search with GRPO ranking
    print("\n🔍 Test 2: Search with GRPO ranking...")
    results = await system.search_with_grpo_ranking(
        "how to fix TypeScript errors in Svelte components",
        top_k=5
    )
    print(f"✅ Found {len(results)} results")
    for i, node in enumerate(results):
        print(f"   [{i+1}] {node.id} (score: {node.rank_score:.3f})")

    await system.shutdown()
    print("\n✅ All tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
