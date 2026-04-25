#!/usr/bin/env python3
"""
Phase 90 - Smart Incremental Embedder with Checkpointing
Uses CUDA with smaller batches + saves progress every 1000 errors
"""

import os
import sys
import json
import time
import torch
import argparse
from pathlib import Path
from typing import List, Dict
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from phase90_unified_diagnostics import DiagnosticCard, DiagnosticParser

from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from tqdm import tqdm

class SmartCUDAEmbedder:
    """Incremental CUDA embedder with checkpointing"""

    def __init__(self, batch_size: int = 16, checkpoint_every: int = 1000):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        print(f"🚀 Initializing Smart CUDA Embedder...")
        print(f"   ✅ Device: {self.device}")

        if self.device == "cuda":
            print(f"   ✅ GPU: {torch.cuda.get_device_name(0)}")
            print(f"   ✅ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")

        # Load model with lower precision for speed
        print(f"   📦 Loading sentence-transformers (batch={batch_size})...")
        self.model = SentenceTransformer(
            'sentence-transformers/all-mpnet-base-v2',
            device=self.device
        )
        self.model.max_seq_length = 384  # Reduce from 512 for speed

        self.batch_size = batch_size
        self.checkpoint_every = checkpoint_every
        self.dim = 768

        print(f"   ✅ Model loaded on {self.device}")
        print(f"   ✅ Batch size: {batch_size}")
        print(f"   ✅ Checkpoint every: {checkpoint_every} errors")

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Embed single batch on GPU"""
        # Truncate to max length
        texts = [t[:3000] for t in texts]  # Lower than 8000 for speed

        # Encode on GPU
        embeddings = self.model.encode(
            texts,
            batch_size=self.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            device=self.device,
            normalize_embeddings=True  # L2 normalization for better search
        )

        return embeddings.tolist()

    def process_incrementally(
        self,
        cards: List[DiagnosticCard],
        qdrant: QdrantClient,
        collection_name: str,
        start_idx: int = 0
    ) -> int:
        """Process errors incrementally with checkpointing"""
        total = len(cards)
        processed = start_idx

        print(f"\n📊 Starting from index {start_idx}/{total}")

        while processed < total:
            # Process checkpoint chunk
            chunk_end = min(processed + self.checkpoint_every, total)
            chunk = cards[processed:chunk_end]

            print(f"\n🔄 Processing {processed}-{chunk_end} ({chunk_end - processed} errors)...")

            # Generate signatures
            signatures = []
            for card in tqdm(chunk, desc="Signatures"):
                sig = (
                    f"ERROR: {card.errorCode}\n"
                    f"File: {card.filePath}\n"
                    f"Line: {card.line}:{card.col}\n"
                    f"Message: {card.message}"
                )
                signatures.append(sig)

            # Embed in batches
            all_embeddings = []
            start_time = time.time()

            for i in tqdm(range(0, len(signatures), self.batch_size), desc="GPU Batches"):
                batch = signatures[i:i + self.batch_size]
                embeddings = self.embed_batch(batch)
                all_embeddings.extend(embeddings)

            elapsed = time.time() - start_time
            speed = len(signatures) / elapsed if elapsed > 0 else 0

            print(f"   ⚡ Embedded {len(signatures)} errors in {elapsed:.1f}s ({speed:.1f}/sec)")

            # Store in Qdrant
            points = []
            for idx, (card, emb) in enumerate(zip(chunk, all_embeddings)):
                points.append(PointStruct(
                    id=processed + idx,
                    vector=emb,
                    payload={
                        "errorCode": card.errorCode,
                        "filePath": card.filePath,
                        "line": card.line,
                        "col": card.col,
                        "message": card.message,
                        "severity": card.severity.value,
                        "source": card.source,
                        "tool": card.tool,
                        "surface": card.surface,
                        "tech": card.tech
                    }
                ))

            qdrant.upsert(collection_name=collection_name, points=points)
            print(f"   💾 Stored {len(points)} points in Qdrant")

            processed = chunk_end

            # Save checkpoint
            checkpoint_file = Path(__file__).parent / f"phase90_checkpoint_{processed}.txt"
            checkpoint_file.write_text(str(processed))
            print(f"   ✅ Checkpoint saved: {processed}/{total}")

        return processed

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=16, help="GPU batch size (lower = more stable)")
    parser.add_argument("--checkpoint-every", type=int, default=1000, help="Save progress every N errors")
    parser.add_argument("--resume", action="store_true", help="Resume from last checkpoint")
    args = parser.parse_args()

    print("=" * 80)
    print("Phase 90: Smart Incremental CUDA Embedding")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Check for checkpoint
    start_idx = 0
    if args.resume:
        checkpoint_files = sorted(Path(__file__).parent.glob("phase90_checkpoint_*.txt"))
        if checkpoint_files:
            last_checkpoint = checkpoint_files[-1]
            start_idx = int(last_checkpoint.read_text().strip())
            print(f"🔄 Resuming from checkpoint: {start_idx} errors processed")

    # Parse diagnostics
    input_path = Path(__file__).parent / "phase90_unified_diagnostics.txt"

    if not input_path.exists():
        print(f"❌ Error: {input_path} not found")
        return 1

    print(f"[1/4] Parsing diagnostics from {input_path.name}...")
    parser_obj = DiagnosticParser()

    with open(input_path, 'r', encoding='utf-8') as f:
        output_text = f.read()

    cards = parser_obj.parse(output_text, tool="svelte-check", run_id="smart_cuda")
    print(f"   ✅ Parsed: {len(cards)} diagnostics")

    if start_idx >= len(cards):
        print(f"✅ Already complete! ({start_idx} >= {len(cards)})")
        return 0

    # Initialize embedder
    print(f"\n[2/4] Initializing CUDA embedder...")
    embedder = SmartCUDAEmbedder(
        batch_size=args.batch_size,
        checkpoint_every=args.checkpoint_every
    )

    # Setup Qdrant
    print(f"\n[3/4] Setting up Qdrant...")
    qdrant = QdrantClient(host="localhost", port=6333)
    collection_name = "phase90_smart_embeddings"

    # Create collection if needed
    try:
        qdrant.get_collection(collection_name)
        print(f"   ✅ Collection '{collection_name}' exists")
    except:
        qdrant.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )
        print(f"   ✅ Created collection '{collection_name}'")

    # Process incrementally
    print(f"\n[4/4] Processing {len(cards)} errors...")
    total_time_start = time.time()

    final_count = embedder.process_incrementally(
        cards=cards,
        qdrant=qdrant,
        collection_name=collection_name,
        start_idx=start_idx
    )

    total_elapsed = time.time() - total_time_start
    avg_speed = (final_count - start_idx) / total_elapsed if total_elapsed > 0 else 0

    print("\n" + "=" * 80)
    print("📊 PIPELINE COMPLETE")
    print("=" * 80)
    print(f"✅ Processed: {final_count} errors")
    print(f"⚡ Average speed: {avg_speed:.1f} embeddings/sec")
    print(f"⏱️  Total time: {total_elapsed / 60:.1f} minutes")
    print(f"💾 Collection: {collection_name} ({final_count} vectors)")
    print()

    # Clean up checkpoints
    for checkpoint_file in Path(__file__).parent.glob("phase90_checkpoint_*.txt"):
        checkpoint_file.unlink()
    print(f"🧹 Cleaned up checkpoint files")

    return 0

if __name__ == "__main__":
    sys.exit(main())
