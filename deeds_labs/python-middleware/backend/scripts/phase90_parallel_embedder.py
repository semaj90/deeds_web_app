#!/usr/bin/env python3
"""
Phase 90 - Parallel Embedding Worker
Processes a chunk of errors with optimized batching
"""

import os
import sys
import json
import asyncio
import argparse
from pathlib import Path
from typing import List, Dict
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from phase90_unified_diagnostics import DiagnosticCard, DiagnosticParser

import aiohttp
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

class FastEmbedder:
    """Optimized batch embedder for Ollama"""

    def __init__(self, port: int = 11434, batch_size: int = 100):
        self.base_url = f"http://localhost:{port}"
        self.model = "embeddinggemma:latest"
        self.batch_size = batch_size
        self.timeout = aiohttp.ClientTimeout(total=30)

    async def embed_one(self, session: aiohttp.ClientSession, text: str) -> List[float]:
        """Single embedding with retry"""
        for attempt in range(3):
            try:
                payload = {"model": self.model, "prompt": text[:8000]}  # Truncate
                async with session.post(
                    f"{self.base_url}/api/embeddings",
                    json=payload,
                    timeout=self.timeout
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        emb = data.get("embedding", [])
                        if len(emb) == 768:
                            return emb
            except Exception as e:
                if attempt == 2:
                    print(f"[WARN]  Failed after 3 attempts: {str(e)[:50]}")
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
        return []

    async def embed_batch(
        self,
        texts: List[str],
        start_idx: int = 0
    ) -> List[Dict]:
        """Batch embed with parallel processing"""
        results = []

        async with aiohttp.ClientSession() as session:
            for i in range(0, len(texts), self.batch_size):
                batch_texts = texts[i:i + self.batch_size]

                # Process batch in parallel
                tasks = [self.embed_one(session, text) for text in batch_texts]
                embeddings = await asyncio.gather(*tasks)

                # Store successful embeddings
                for j, emb in enumerate(embeddings):
                    if len(emb) == 768:
                        results.append({
                            "index": start_idx + i + j,
                            "embedding": emb
                        })

                # Progress update
                total_done = i + len(batch_texts)
                success_rate = len(results) / total_done * 100 if total_done > 0 else 0
                print(f"   [{start_idx + total_done}/{start_idx + len(texts)}] "
                      f"Success: {success_rate:.1f}%")

        return results


async def process_chunk(
    input_file: str,
    start_idx: int,
    end_idx: int,
    worker_id: int,
    ollama_port: int,
    batch_size: int
):
    """Process a chunk of diagnostics"""

    print(f"\n[ROCKET] Worker {worker_id} starting...")
    print(f"   Range: {start_idx} - {end_idx}")
    print(f"   Ollama: localhost:{ollama_port}")
    print(f"   Batch size: {batch_size}\n")

    # 1. Parse diagnostics
    parser = DiagnosticParser()
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    all_cards = parser.parse(content, tool="svelte-check", run_id=f"parallel_worker_{worker_id}")
    chunk_cards = all_cards[start_idx:end_idx]

    print(f"[CHART] Parsed {len(chunk_cards)} diagnostics")

    # 2. Generate signatures
    signatures = []
    for card in chunk_cards:
        sig = f"{card.errorCode}|{card.filePath}|{card.message[:100]}"
        signatures.append(sig)

    # 3. Embed with batching
    print(f"[BRAIN] Embedding {len(signatures)} signatures...")
    embedder = FastEmbedder(port=ollama_port, batch_size=batch_size)
    results = await embedder.embed_batch(signatures, start_idx=start_idx)

    print(f"[CHECK] Embedded {len(results)} / {len(signatures)} successfully")

    # 4. Store in Qdrant
    print(f"[DISK] Storing in Qdrant...")
    qdrant = QdrantClient(url="http://localhost:6333")

    points = []
    for result in results:
        idx = result["index"]
        local_idx = idx - start_idx
        if local_idx >= len(chunk_cards):
            continue

        card = chunk_cards[local_idx]

        point = PointStruct(
            id=idx,  # Integer ID for Qdrant
            vector=result["embedding"],
            payload={
                "errorCode": card.errorCode,
                "filePath": card.filePath,
                "line": card.line,
                "col": card.col,
                "message": card.message[:500],
                "surface": card.surface,
                "tech": card.tech,
                "severity": card.severity,
                "indexed_at": datetime.utcnow().isoformat(),
                "worker_id": worker_id
            }
        )
        points.append(point)

    # Upsert in batches
    for i in range(0, len(points), 100):
        batch = points[i:i + 100]
        qdrant.upsert(
            collection_name="phase90_error_cards",
            points=batch
        )

    print(f"[CHECK] Worker {worker_id} complete! Stored {len(points)} error cards\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input diagnostics file")
    parser.add_argument("--start", type=int, required=True, help="Start index")
    parser.add_argument("--end", type=int, required=True, help="End index")
    parser.add_argument("--worker-id", type=int, required=True, help="Worker ID")
    parser.add_argument("--ollama-port", type=int, default=11434, help="Ollama port")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size")

    args = parser.parse_args()

    asyncio.run(process_chunk(
        input_file=args.input,
        start_idx=args.start,
        end_idx=args.end,
        worker_id=args.worker_id,
        ollama_port=args.ollama_port,
        batch_size=args.batch_size
    ))


if __name__ == "__main__":
    main()

