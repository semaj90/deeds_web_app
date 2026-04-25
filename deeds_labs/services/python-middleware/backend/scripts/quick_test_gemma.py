#!/usr/bin/env python3
"""Quick test of Gemma-3 VLM embedding service"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import directly from the file
import importlib.util
spec = importlib.util.spec_from_file_location(
    "gemma_service",
    os.path.join(os.path.dirname(__file__), '..', 'services', 'gemma_vlm_embedding_service.py')
)
gemma_service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gemma_service)

GemmaVLMEmbeddingService = gemma_service.GemmaVLMEmbeddingService
EmbeddingRequest = gemma_service.EmbeddingRequest

async def main():
    print("=" * 60)
    print("🧪 Testing Gemma-3 VLM Embedding Service")
    print("=" * 60)

    # Create service
    service = GemmaVLMEmbeddingService(
        model_name="google/gemma-3-2b-it-v",
        device="cuda",
        batch_size=2
    )

    print("\n📥 Loading model...")
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
    print(f"✅ Modality: {response.modality}")
    print(f"✅ Embedding dimension: {len(response.embedding)}")
    print(f"✅ Processing time: {response.processing_time_ms:.2f}ms")
    print(f"✅ First 10 values: {response.embedding[:10]}")

    # Test 2: Batch processing
    print("\n" + "=" * 60)
    print("TEST 2: Batch Processing (5 chunks)")
    print("=" * 60)

    batch_requests = [
        EmbeddingRequest(
            text=f"Legal document chunk {i}: Content about contracts and agreements.",
            chunk_id=f"chunk_{i:03d}"
        )
        for i in range(5)
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

    # Cleanup
    await service.shutdown()

    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
