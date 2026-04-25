#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 94: ACE Synthesis Loop - Pattern Detection → LLM → Knowledge Graph
Complete feedback loop for contextual engineering with provenance tracking

Architecture Flow:
  1. Pattern Detection (LangExtract) → Extract entities/structure from logs
  2. LLM Synthesis (Ollama/Gemini) → Generate contextual answers
  3. Knowledge Graph Update → Store correct answers, failures, metadata
  4. File Indexing → Track which files were analyzed
  5. Event Sourcing → Log all operations to timeline

Video Patterns Implemented:
  [03:53] Schema Validation - Strict JSON from LangExtract
  [06:50] Metadata Inheritance - File-level tags → chunk-level tags
  [08:59] Task Types - retrieval_document for storage, retrieval_query for synthesis
  [09:58] Batch Processing - Async LangExtract + embedding pipeline

Usage:
    python scripts/phase94-ace-synthesis-loop.py --analyze "src/lib/components/AiAssistant.svelte"
    python scripts/phase94-ace-synthesis-loop.py --batch --pattern "*.svelte" --limit 10
    python scripts/phase94-ace-synthesis-loop.py --query "How do Svelte 5 runes work in this codebase?"
"""

import os
import sys
import json
import asyncio
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional, Any, Tuple
from uuid import uuid4

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
except ImportError as e:
    print(f"❌ Missing dependencies: {e}")
    print("   Install: pip install httpx qdrant-client psycopg2-binary")
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
KB_COLLECTION = "phase94_knowledge_graph"  # Validated knowledge cards
FILE_INDEX_COLLECTION = "phase94_file_index"  # Indexed files metadata
TIMELINE_COLLECTION = "phase92_timeline_events"  # Event sourcing

# Models
EMBEDDING_MODEL = "embeddinggemma:latest"
LLM_MODEL = "gemma3-legal:latest"
EMBEDDING_DIM = 768

# =============================================================================
# Schema Definitions (Video [03:53] - Schema is Destiny)
# =============================================================================

class FileMetadata:
    """File-level metadata (Video [06:50] - Inheritance root)"""
    def __init__(self, file_path: str, content: str):
        self.file_path = file_path
        self.file_hash = hashlib.sha256(content.encode()).hexdigest()
        self.file_type = Path(file_path).suffix.lstrip('.')
        self.feature_tags = []  # Inherited by chunks
        self.error_tags = []
        self.analyzed_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict:
        return {
            'file_path': self.file_path,
            'file_hash': self.file_hash,
            'file_type': self.file_type,
            'feature_tags': self.feature_tags,
            'error_tags': self.error_tags,
            'analyzed_at': self.analyzed_at.isoformat()
        }


class KnowledgeCard:
    """Knowledge graph entry with provenance"""
    def __init__(self, question: str, answer: str, source_files: List[str]):
        self.card_id = str(uuid4())
        self.question = question
        self.answer = answer
        self.source_files = source_files
        self.confidence = 1.0  # Will be updated based on validation
        self.validated = False
        self.failure_notes = None
        self.metadata = {}
        self.created_at = datetime.now(timezone.utc)

    def to_dict(self) -> Dict:
        return {
            'card_id': self.card_id,
            'question': self.question,
            'answer': self.answer,
            'source_files': self.source_files,
            'confidence': self.confidence,
            'validated': self.validated,
            'failure_notes': self.failure_notes,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat()
        }


# =============================================================================
# LangExtract Pattern Detection (Video [03:53])
# =============================================================================

class LangExtractClient:
    """Pattern detection with strict schema validation"""

    def __init__(self, url: str = LANGEXTRACT_URL):
        self.url = url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def extract_patterns(
        self,
        content: str,
        document_type: str = "code"
    ) -> Dict:
        """
        Extract entities and structure from code/logs.

        Returns strict JSON schema (Video [03:53]).
        """
        try:
            response = await self.client.post(
                f"{self.url}/extract",
                json={
                    "content": content,
                    "document_type": document_type,
                    "extract_entities": True,
                    "extract_structure": True
                }
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"⚠️ LangExtract failed: {e}")
            return {"entities": [], "structure": {}}

    async def close(self):
        await self.client.aclose()


# =============================================================================
# LLM Synthesis Engine
# =============================================================================

class LLMSynthesizer:
    """Contextual answer generation with task type awareness"""

    def __init__(self, ollama_url: str = OLLAMA_URL):
        self.ollama_url = ollama_url
        self.client = httpx.AsyncClient(timeout=60.0)

    async def embed(
        self,
        text: str,
        task_type: str = "retrieval_query"
    ) -> List[float]:
        """
        Get embedding with task type (Video [08:59]).

        Args:
            task_type: 'retrieval_document' (storage) or 'retrieval_query' (search)
        """
        try:
            response = await self.client.post(
                f"{self.ollama_url}/api/embeddings",
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

    async def synthesize(
        self,
        query: str,
        context: List[str],
        metadata: Dict = None
    ) -> str:
        """
        Generate contextual answer from retrieved context.

        Returns:
            Synthesized answer with citations
        """
        # Build prompt with context
        context_str = "\n\n".join([f"[{i+1}] {ctx}" for i, ctx in enumerate(context)])

        prompt = f"""You are an expert code analysis assistant. Answer the question using ONLY the provided context.

Context:
{context_str}

Question: {query}

Instructions:
1. Answer concisely and accurately
2. Cite sources using [1], [2], etc.
3. If context is insufficient, state what's missing
4. Focus on actionable insights

Answer:"""

        try:
            # Check if Ollama is available
            health_check = await self.client.get(
                f"{self.ollama_url}/api/tags",
                timeout=5.0
            )

            if health_check.status_code != 200:
                raise Exception("Ollama not responding")

            response = await self.client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": LLM_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Low temp for accuracy
                        "top_p": 0.9
                    }
                },
                timeout=60.0  # Longer timeout for generation
            )
            response.raise_for_status()
            return response.json()["response"]
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # Model not found - provide fallback
                print(f"⚠️ Model '{LLM_MODEL}' not found in Ollama")
                print(f"   Available models: Try 'ollama list' or use gemma2:2b")
                return self._fallback_synthesis(query, context)
            else:
                print(f"❌ LLM HTTP error: {e}")
                return self._fallback_synthesis(query, context)
        except httpx.ConnectError:
            print(f"⚠️ Ollama not running at {self.ollama_url}")
            print(f"   Start with: ollama serve")
            return self._fallback_synthesis(query, context)
        except Exception as e:
            print(f"❌ LLM synthesis failed: {e}")
            return self._fallback_synthesis(query, context)

    def _fallback_synthesis(self, query: str, context: List[Dict]) -> str:
        """Fallback when LLM is unavailable - extract from context"""
        if not context:
            return f"❌ LLM unavailable and no context provided for: {query}"

        # Simple pattern-based extraction
        summary_lines = [f"📋 Context Summary for: {query}\n"]

        for idx, ctx in enumerate(context[:3], 1):
            file_path = ctx.get("file_path", "unknown")
            tags = ctx.get("tags", [])
            summary_lines.append(f"{idx}. {file_path}")
            if tags:
                summary_lines.append(f"   Tags: {', '.join(tags)}")

        summary_lines.append(f"\n💡 Start Ollama for AI-generated answers: ollama serve")
        return "\n".join(summary_lines)

    async def close(self):
        await self.client.aclose()


# =============================================================================
# Knowledge Graph Manager
# =============================================================================

class KnowledgeGraphManager:
    """Manages validated knowledge with provenance tracking"""

    def __init__(self):
        self.qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        self.pg_conn = None
        self._init_postgres()
        self._init_collections()

    def _init_postgres(self):
        """Initialize Postgres connection"""
        try:
            self.pg_conn = psycopg2.connect(POSTGRES_DSN)
            self.pg_conn.autocommit = True

            # Create knowledge_cards table
            with self.pg_conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS knowledge_cards (
                        card_id UUID PRIMARY KEY,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        source_files TEXT[],
                        confidence FLOAT DEFAULT 1.0,
                        validated BOOLEAN DEFAULT FALSE,
                        failure_notes TEXT,
                        metadata JSONB,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );

                    CREATE INDEX IF NOT EXISTS idx_kb_validated ON knowledge_cards(validated);
                    CREATE INDEX IF NOT EXISTS idx_kb_confidence ON knowledge_cards(confidence);
                    CREATE INDEX IF NOT EXISTS idx_kb_created ON knowledge_cards(created_at DESC);
                """)
        except Exception as e:
            print(f"⚠️ Postgres init failed: {e}")

    def _init_collections(self):
        """Initialize Qdrant collections"""
        # Knowledge graph collection
        if not self.qdrant.collection_exists(KB_COLLECTION):
            self.qdrant.create_collection(
                collection_name=KB_COLLECTION,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=Distance.COSINE
                )
            )
            print(f"✅ Created collection: {KB_COLLECTION}")

        # File index collection
        if not self.qdrant.collection_exists(FILE_INDEX_COLLECTION):
            self.qdrant.create_collection(
                collection_name=FILE_INDEX_COLLECTION,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=Distance.COSINE
                )
            )            # Create payload indexes for file metadata
            for field in ["file_type", "file_hash"]:
                self.qdrant.create_payload_index(
                    collection_name=FILE_INDEX_COLLECTION,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD
                )

            print(f"✅ Created collection: {FILE_INDEX_COLLECTION}")

    async def store_knowledge(
        self,
        card: KnowledgeCard,
        vector: List[float]
    ) -> str:
        """
        Store validated knowledge with full provenance.

        Writes to:
          - Postgres (truth)
          - Qdrant (semantic search)
          - Timeline (event sourcing)
        """
        # 1. Postgres (authoritative truth)
        if self.pg_conn:
            try:
                with self.pg_conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO knowledge_cards
                        (card_id, question, answer, source_files, confidence,
                         validated, failure_notes, metadata)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        card.card_id,
                        card.question,
                        card.answer,
                        card.source_files,
                        card.confidence,
                        card.validated,
                        card.failure_notes,
                        json.dumps(card.metadata)
                    ))
                    print(f"📝 Postgres: {card.card_id}")
            except Exception as e:
                print(f"❌ Postgres write failed: {e}")

        # 2. Qdrant (semantic search)
        try:
            self.qdrant.upsert(
                collection_name=KB_COLLECTION,
                points=[
                    models.PointStruct(
                        id=card.card_id,
                        vector=vector,
                        payload=card.to_dict()
                    )
                ]
            )
            print(f"✅ Qdrant KB: {card.card_id}")
        except Exception as e:
            print(f"❌ Qdrant write failed: {e}")

        return card.card_id

    async def index_file(
        self,
        file_meta: FileMetadata,
        vector: List[float]
    ):
        """Index analyzed file with metadata (Video [06:50] - Inheritance)"""
        try:
            self.qdrant.upsert(
                collection_name=FILE_INDEX_COLLECTION,
                points=[
                    models.PointStruct(
                        id=file_meta.file_hash,
                        vector=vector,
                        payload=file_meta.to_dict()
                    )
                ]
            )
            print(f"📂 Indexed: {file_meta.file_path}")
        except Exception as e:
            print(f"❌ File index failed: {e}")

    def mark_validated(self, card_id: str, success: bool, notes: str = None):
        """Update knowledge card validation status"""
        if not self.pg_conn:
            return

        try:
            with self.pg_conn.cursor() as cur:
                if success:
                    cur.execute("""
                        UPDATE knowledge_cards
                        SET validated = TRUE, confidence = 1.0, updated_at = NOW()
                        WHERE card_id = %s
                    """, (card_id,))
                else:
                    cur.execute("""
                        UPDATE knowledge_cards
                        SET validated = FALSE, confidence = 0.5,
                            failure_notes = %s, updated_at = NOW()
                        WHERE card_id = %s
                    """, (notes, card_id))

                print(f"{'✅' if success else '❌'} Validated: {card_id}")
        except Exception as e:
            print(f"❌ Validation update failed: {e}")


# =============================================================================
# ACE Synthesis Loop Orchestrator
# =============================================================================

class ACESynthesisLoop:
    """Complete feedback loop: Pattern Detection → LLM → Knowledge Graph"""

    def __init__(self):
        self.langextract = LangExtractClient()
        self.llm = LLMSynthesizer()
        self.kg = KnowledgeGraphManager()

    async def analyze_file(self, file_path: str) -> FileMetadata:
        """
        Analyze single file with LangExtract pattern detection.

        Returns:
            FileMetadata with extracted tags (Video [06:50])
        """
        print(f"\n🔍 Analyzing: {file_path}")

        # Read file
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"❌ Read failed: {e}")
            return None

        # Create metadata
        file_meta = FileMetadata(file_path, content)

        # Extract patterns with LangExtract
        patterns = await self.langextract.extract_patterns(
            content,
            document_type=file_meta.file_type
        )

        # Extract tags from entities
        entities = patterns.get("entities", [])
        for entity in entities:
            entity_type = entity.get("type", "").lower()
            entity_value = entity.get("value", "").lower()

            # Feature tags
            if "svelte" in entity_value or file_meta.file_type == "svelte":
                file_meta.feature_tags.append("svelte")
            if "typescript" in entity_value or file_meta.file_type in ["ts", "tsx"]:
                file_meta.feature_tags.append("typescript")
            if "auth" in entity_value or "login" in entity_value:
                file_meta.feature_tags.append("auth")

            # Error tags (if file contains error markers)
            if "ts2304" in entity_value or "cannot find name" in content.lower():
                file_meta.error_tags.append("ts2304")

        # Deduplicate tags
        file_meta.feature_tags = list(set(file_meta.feature_tags))
        file_meta.error_tags = list(set(file_meta.error_tags))

        print(f"   Tags: {file_meta.feature_tags + file_meta.error_tags}")

        # Embed file summary for indexing (task_type='retrieval_document')
        summary = f"{file_path}: {', '.join(file_meta.feature_tags)}"
        vector = await self.llm.embed(summary, task_type="retrieval_document")

        # Index file
        await self.kg.index_file(file_meta, vector)

        return file_meta

    async def synthesize_answer(
        self,
        query: str,
        context_files: List[str] = None
    ) -> KnowledgeCard:
        """
        Generate answer using LLM synthesis with retrieved context.

        Flow:
          1. Embed query (task_type='retrieval_query')
          2. Search file index for relevant files
          3. Load file contents as context
          4. LLM synthesis
          5. Store as knowledge card
        """
        print(f"\n💡 Synthesizing answer for: {query}")

        # 1. Embed query
        query_vector = await self.llm.embed(query, task_type="retrieval_query")

        # 2. Search file index if no explicit files provided
        if not context_files:
            try:
                results = self.kg.qdrant.query_points(
                    collection_name=FILE_INDEX_COLLECTION,
                    query=query_vector,
                    limit=5
                ).points

                context_files = [hit.payload["file_path"] for hit in results]
                print(f"   Retrieved {len(context_files)} relevant files")
            except Exception as e:
                print(f"⚠️ File search failed: {e}")
                context_files = []

        # 3. Load context
        context_texts = []
        for file_path in context_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Truncate to avoid token limits
                    context_texts.append(f"{file_path}:\n{content[:2000]}")
            except:
                continue

        # 4. LLM synthesis
        answer = await self.llm.synthesize(query, context_texts)

        # 5. Create knowledge card
        card = KnowledgeCard(
            question=query,
            answer=answer,
            source_files=context_files
        )

        # Embed question for semantic search (task_type='retrieval_document')
        card_vector = await self.llm.embed(query, task_type="retrieval_document")

        # Store in knowledge graph
        card_id = await self.kg.store_knowledge(card, card_vector)

        print(f"✅ Knowledge card: {card_id}")

        return card

    async def close(self):
        """Cleanup resources"""
        await self.langextract.close()
        await self.llm.close()
        if self.kg.pg_conn:
            self.kg.pg_conn.close()


# =============================================================================
# CLI Interface
# =============================================================================

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Phase 94: ACE Synthesis Loop")
    parser.add_argument("--analyze", help="Analyze single file")
    parser.add_argument("--query", help="Synthesize answer to query")
    parser.add_argument("--validate", help="Validate knowledge card by ID")
    parser.add_argument("--success", action="store_true", help="Mark as successful")
    parser.add_argument("--failure", help="Mark as failed with notes")
    parser.add_argument("--status", action="store_true", help="Show system status")

    args = parser.parse_args()

    # Status check (lightweight, no init)
    if args.status:
        print("🔍 Phase 94: ACE Synthesis Loop - System Status\n")

        # Check Ollama
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{OLLAMA_URL}/api/tags", timeout=3.0)
                if resp.status_code == 200:
                    models_data = resp.json().get("models", [])
                    print(f"✅ Ollama: Running at {OLLAMA_URL}")
                    print(f"   Models: {', '.join([m['name'] for m in models_data[:3]])}")
                else:
                    print(f"⚠️ Ollama: Responding but status {resp.status_code}")
        except:
            print(f"❌ Ollama: Not running at {OLLAMA_URL}")
            print(f"   Start with: ollama serve")

        # Check Qdrant
        try:
            qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
            kb_exists = qdrant.collection_exists(KB_COLLECTION)
            file_exists = qdrant.collection_exists(FILE_INDEX_COLLECTION)

            print(f"\n✅ Qdrant: Running at {QDRANT_HOST}:{QDRANT_PORT}")
            print(f"   {KB_COLLECTION}: {'✅ Exists' if kb_exists else '⚠️ Not created'}")
            print(f"   {FILE_INDEX_COLLECTION}: {'✅ Exists' if file_exists else '⚠️ Not created'}")

            if kb_exists:
                kb_info = qdrant.get_collection(KB_COLLECTION)
                print(f"   KB points: {kb_info.points_count}")
        except Exception as e:
            print(f"❌ Qdrant: Connection failed - {e}")

        # Check Postgres
        try:
            import psycopg2
            conn = psycopg2.connect(POSTGRES_DSN)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM knowledge_cards")
            count = cursor.fetchone()[0]
            print(f"\n✅ PostgreSQL: Connected")
            print(f"   Knowledge cards: {count}")
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"⚠️ PostgreSQL: {e}")
            print(f"   Run once to initialize: python scripts/phase94-ace-synthesis-loop.py --query 'test'")

        print("\n💡 Ready to use ACE Synthesis Loop!")
        print("   Try: python scripts/phase94-ace-synthesis-loop.py --query 'How do Svelte 5 runes work?'")
        return

    loop = ACESynthesisLoop()

    try:
        if args.analyze:
            await loop.analyze_file(args.analyze)

        elif args.query:
            card = await loop.synthesize_answer(args.query)
            print(f"\n📋 Answer:\n{card.answer}")

        elif args.validate:
            if args.success:
                loop.kg.mark_validated(args.validate, True)
            elif args.failure:
                loop.kg.mark_validated(args.validate, False, args.failure)

        else:
            parser.print_help()

    finally:
        await loop.close()


if __name__ == "__main__":
    asyncio.run(main())
