"""
MCP Tool: Knowledge Base Ingestion
Writes documents/chunks to MinIO, embeddings to Qdrant/pgvector
"""
import os
import json
import hashlib
from typing import Dict, Any, List
from datetime import datetime
import httpx

class KBIngestTool:
    """Knowledge base ingestion with MinIO + Qdrant"""

    def __init__(self):
        self.minio_endpoint = os.getenv('MINIO_ENDPOINT', 'localhost:9000')
        self.qdrant_url = os.getenv('QDRANT_URL', 'http://localhost:6333')
        self.eg2_onnx_url = os.getenv('GEMMA2_ONNX_URL', 'http://127.0.0.1:8094').rstrip('/')
        self.ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        self.bucket = 'knowledge-base'

    async def ingest(
        self,
        documents: List[Dict[str, Any]],
        collection: str = 'default',
        chunk_size: int = 512,
        overlap: int = 50
    ) -> Dict[str, Any]:
        """
        Ingest documents into knowledge base

        Args:
            documents: List of {title, content, metadata}
            collection: Target collection name
            chunk_size: Characters per chunk
            overlap: Overlap between chunks

        Returns:
            {
                "documents_processed": 5,
                "chunks_created": 23,
                "vectors_stored": 23,
                "minio_objects": [...],
                "status": "success"
            }
        """
        results = {
            'documents_processed': 0,
            'chunks_created': 0,
            'vectors_stored': 0,
            'minio_objects': [],
            'status': 'pending'
        }

        try:
            for doc in documents:
                # 1. Chunk document
                chunks = self._chunk_document(
                    doc.get('content', ''),
                    chunk_size,
                    overlap
                )

                # 2. Generate embeddings
                embeddings = await self._generate_embeddings(chunks)

                # 3. Store in MinIO (raw document)
                minio_key = await self._store_in_minio(doc, collection)
                results['minio_objects'].append(minio_key)

                # 4. Store vectors in Qdrant
                vector_ids = await self._store_vectors(
                    chunks,
                    embeddings,
                    doc,
                    collection
                )

                results['documents_processed'] += 1
                results['chunks_created'] += len(chunks)
                results['vectors_stored'] += len(vector_ids)

            results['status'] = 'success'
            return results

        except Exception as e:
            results['status'] = 'error'
            results['error'] = str(e)
            return results

    def _chunk_document(
        self,
        content: str,
        chunk_size: int,
        overlap: int
    ) -> List[str]:
        """Split document into overlapping chunks"""
        chunks = []
        start = 0

        while start < len(content):
            end = min(start + chunk_size, len(content))
            chunks.append(content[start:end])
            start += (chunk_size - overlap)

        return chunks

    async def _generate_embeddings(self, chunks: List[str]) -> List[List[float]]:
        """Generate embeddings via :8094 EG2 ONNX first, falling back to Ollama."""
        if not chunks:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                eg2_resp = await client.post(
                    f"{self.eg2_onnx_url}/embed",
                    json={"texts": chunks, "dims": [768]}
                )
                if eg2_resp.status_code == 200:
                    vecs = eg2_resp.json().get("embeddings", {}).get("768", [])
                    if isinstance(vecs, list) and len(vecs) == len(chunks):
                        return vecs
            except Exception as e:
                print(f"⚠️ EG2 ONNX :8094 unavailable, falling back to Ollama: {e}")

            embeddings = []
            for chunk in chunks:
                try:
                    response = await client.post(
                        f"{self.ollama_url}/api/embeddings",
                        json={
                            "model": "nomic-embed-text:latest",
                            "prompt": chunk
                        }
                    )

                    if response.status_code == 200:
                        data = response.json()
                        embeddings.append(data.get('embedding', []))
                    else:
                        # Fallback: zero vector
                        embeddings.append([0.0] * 768)

                except Exception as e:
                    print(f"❌ Embedding error: {e}")
                    embeddings.append([0.0] * 768)

            return embeddings

    async def _store_in_minio(
        self,
        doc: Dict[str, Any],
        collection: str
    ) -> str:
        """Store raw document in MinIO"""
        # Generate unique key
        doc_id = hashlib.md5(
            doc.get('title', '').encode()
        ).hexdigest()[:8]

        key = f"{collection}/{doc_id}.jsonl"

        # Create JSONL entry
        jsonl_entry = json.dumps({
            'title': doc.get('title', ''),
            'content': doc.get('content', ''),
            'metadata': doc.get('metadata', {}),
            'ingested_at': datetime.now().isoformat()
        })

        # TODO: Actual MinIO upload via boto3/minio-py
        # For now, write to local file
        os.makedirs('data/minio-cache', exist_ok=True)
        with open(f'data/minio-cache/{doc_id}.jsonl', 'w') as f:
            f.write(jsonl_entry)

        return key

    async def _store_vectors(
        self,
        chunks: List[str],
        embeddings: List[List[float]],
        doc: Dict[str, Any],
        collection: str
    ) -> List[str]:
        """Store vectors in Qdrant"""
        vector_ids = []

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Ensure collection exists
                await client.put(
                    f"{self.qdrant_url}/collections/{collection}",
                    json={
                        "vectors": {
                            "size": 768,
                            "distance": "Cosine"
                        }
                    }
                )

                # Upsert points
                points = []
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    point_id = f"{doc.get('title', 'doc')}_{i}"
                    points.append({
                        "id": point_id,
                        "vector": embedding,
                        "payload": {
                            "chunk": chunk,
                            "title": doc.get('title', ''),
                            "chunk_index": i,
                            "metadata": doc.get('metadata', {})
                        }
                    })
                    vector_ids.append(point_id)

                await client.put(
                    f"{self.qdrant_url}/collections/{collection}/points",
                    json={"points": points}
                )

        except Exception as e:
            print(f"❌ Qdrant error: {e}")

        return vector_ids


# Export for FastMCP
async def kb_ingest(
    documents: List[Dict[str, Any]],
    collection: str = 'default',
    chunk_size: int = 512,
    overlap: int = 50
) -> Dict[str, Any]:
    """MCP tool wrapper for KB ingestion"""
    tool = KBIngestTool()
    return await tool.ingest(documents, collection, chunk_size, overlap)
