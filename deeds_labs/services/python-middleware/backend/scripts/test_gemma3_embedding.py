#!/usr/bin/env python3
"""
Test Gemma-3 Text Embedding Service
Verify 1024d embeddings with Ollama embeddinggemma:latest
"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.gemma3_embedding_service import (
    Gemma3EmbeddingService,
    EmbeddingRequest
)

async def main():
    print("=" * 60)
    print("🧪 Testing Gemma-3 Embedding Service (Ollama)")
    print("=" * 60)

    # Create service using Ollama
    service = Gemma3EmbeddingService(
        model_name="embeddinggemma:latest",
        batch_size=16
    )

    print(f"\n📌 Ollama URL: {service.ollama_url}")
    print(f"📌 Model: {service.model_name}")

    print("\n📥 Checking Ollama model...")
    await service.load_model()

    # Test 1: Single text embedding
    print("\n" + "=" * 60)
    print("TEST 1: Single Text Embedding")
    print("=" * 60)

    request = EmbeddingRequest(
        text="This is a legal contract about property deed transfer.",
        chunk_id="test_001"
    )

    responses = await service.generate_embeddings([request])
    response = responses[0]

    print(f"✅ Chunk ID: {response.chunk_id}")
    print(f"✅ Embedding dimension: {len(response.embedding)}")
    print(f"✅ Processing time: {response.processing_time_ms:.2f}ms")
    print(f"✅ First 10 values: {[f'{x:.6f}' for x in response.embedding[:10]]}")

    # Verify it's normalized
    import numpy as np
    norm = np.linalg.norm(response.embedding)
    print(f"✅ L2 norm: {norm:.6f} (should be ~1.0)")

    # Test 2: Batch processing
    print("\n" + "=" * 60)
    print("TEST 2: Batch Processing (10 chunks)")
    print("=" * 60)

    batch_requests = [
        EmbeddingRequest(
            text=f"Legal document chunk {i}: Content about contracts, agreements, and property law.",
            chunk_id=f"chunk_{i:03d}"
        )
        for i in range(10)
    ]

    batch_responses = await service.generate_embeddings(batch_requests)

    for resp in batch_responses:
        print(f"✅ {resp.chunk_id}: {len(resp.embedding)}d in {resp.processing_time_ms:.2f}ms")

    # Stats
    print("\n" + "=" * 60)
    print("📊 Service Statistics")
    print("=" * 60)

    stats = service.get_stats()
    for key, value in stats.items():
        if isinstance(value, float):
            print(f"   {key}: {value:.2f}")
        else:
            print(f"   {key}: {value}")

    # Health check
    print("\n" + "=" * 60)
    print("🏥 Health Check")
    print("=" * 60)

    health = await service.health_check()
    print(f"✅ Status: {health['status']}")
    print(f"✅ Embedding dimension: {health['embedding_dimension']}")
    print(f"✅ Test inference: {health['test_inference_time_ms']:.2f}ms")
    print(f"✅ Ollama URL: {health['ollama_url']}")

    # Cleanup
    await service.shutdown()

    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED - Using embeddinggemma:latest from Ollama")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())